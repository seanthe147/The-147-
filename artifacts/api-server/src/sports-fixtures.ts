// Upcoming sports fixtures for the staff dashboard bar.
//
// Fetches from TheSportsDB (free, unauthenticated) for leagues relevant to a
// UK sports venue: Premier League, Championship, FA Cup, Champions League,
// Europa League, England internationals, Super League Rugby League, and the
// Rugby League Challenge Cup. Results are filtered to the next 48 hours,
// sorted by kickoff time, and capped at 3.
//
// Channel info comes from strTVStation in the API response when available;
// falls back to a league-based default based on current UK broadcast deals.
//
// Cache: 5 minutes (short enough that a finished game drops off within one poll).

export type Fixture = {
  id: string;
  sport: "football" | "rugby-league";
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffIso: string;
  kickoffMs: number;
  status: "upcoming" | "live" | "finished";
  channel: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

// TheSportsDB league IDs.
// Set `enabled: false` to hide a competition from the bar without deleting it.
// To add TNT Sports when you subscribe, flip Champions League and Europa League
// to `enabled: true` and change Premier League defaultChannel back to
// "Sky Sports / TNT Sports".
const LEAGUES: { id: number; name: string; sport: Fixture["sport"]; defaultChannel: string; enabled: boolean }[] = [
  // Football — domestic
  { id: 4328, name: "Premier League",   sport: "football",     defaultChannel: "Sky Sports",      enabled: true  },
  { id: 4329, name: "Championship",     sport: "football",     defaultChannel: "Sky Sports",      enabled: true  },
  { id: 4392, name: "FA Cup",           sport: "football",     defaultChannel: "BBC / ITV",       enabled: true  },
  // Football — European (TNT Sports only — enable when subscribed)
  { id: 4480, name: "Champions League", sport: "football",     defaultChannel: "TNT Sports",      enabled: false },
  { id: 4481, name: "Europa League",    sport: "football",     defaultChannel: "TNT Sports",      enabled: false },
  // Football — international
  { id: 4429, name: "England",          sport: "football",     defaultChannel: "ITV / Channel 4", enabled: true  },
  // Rugby League
  { id: 4325, name: "Super League",     sport: "rugby-league", defaultChannel: "Sky Sports",      enabled: true  },
  { id: 4330, name: "Challenge Cup",    sport: "rugby-league", defaultChannel: "BBC",             enabled: true  },
];

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const CACHE_TTL = 5 * 60_000; // 5 minutes — short enough that a finished game drops off the bar within one poll cycle

let cache: { at: number; data: Fixture[] } | null = null;

function sportsDbStatus(
  raw: string | null | undefined,
  homeScore: number | null,
  awayScore: number | null,
  kickoffMs: number,
): Fixture["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("match finished") || s.includes("full time") || s === "ft") return "finished";
  if (s.includes("not started") || s === "ns" || !s) {
    return kickoffMs > Date.now() ? "upcoming" : "finished";
  }
  if (homeScore != null && awayScore != null && kickoffMs < Date.now()) return "live";
  return kickoffMs > Date.now() ? "upcoming" : "finished";
}

// Normalise a channel string from TheSportsDB into a short, recognisable label.
function normaliseChannel(raw: string | null | undefined, defaultChannel: string): string {
  if (!raw || raw.trim() === "") return defaultChannel;
  const s = raw.trim();
  // Map common synonyms to canonical names
  if (/sky\s*sport/i.test(s)) return "Sky Sports";
  if (/tnt\s*sport|bt\s*sport/i.test(s)) return "TNT Sports";
  if (/bbc/i.test(s)) return "BBC";
  if (/itv/i.test(s)) return "ITV";
  if (/dazn/i.test(s)) return "DAZN";
  if (/amazon/i.test(s)) return "Amazon Prime";
  if (/channel\s*4/i.test(s)) return "Channel 4";
  // Return as-is if it's short enough; otherwise use league default
  return s.length <= 30 ? s : defaultChannel;
}

async function fetchLeagueFixtures(
  leagueId: number,
  name: string,
  sport: Fixture["sport"],
  defaultChannel: string,
): Promise<Fixture[]> {
  const url = `${SPORTSDB_BASE}/eventsnextleague.php?id=${leagueId}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TheSportsDB ${leagueId}: HTTP ${res.status}`);
  const json = await res.json();
  const events: any[] = Array.isArray(json?.events) ? json.events : [];

  const now = Date.now();

  const fixtures: Fixture[] = [];
  for (const ev of events) {
    const date: string | null = ev?.dateEvent ?? null;
    const time: string = ev?.strTime || "00:00:00";
    if (!date) continue;

    const timeStr = time.length === 5 ? `${time}:00` : time;
    // TheSportsDB times are UTC
    const iso = `${date}T${timeStr}Z`;
    const kickoffMs = Date.parse(iso);
    if (!kickoffMs || isNaN(kickoffMs)) continue;

    // Skip games already in the past — no upper cutoff so the bar always
    // has content even when the next game is days away.
    if (kickoffMs < now) continue;

    const homeScore =
      ev?.intHomeScore != null && ev.intHomeScore !== "" ? Number(ev.intHomeScore) : null;
    const awayScore =
      ev?.intAwayScore != null && ev.intAwayScore !== "" ? Number(ev.intAwayScore) : null;
    const status = sportsDbStatus(ev?.strStatus, homeScore, awayScore, kickoffMs);

    if (status === "finished") continue;

    fixtures.push({
      id: String(ev?.idEvent ?? `${leagueId}-${kickoffMs}`),
      sport,
      leagueName: name,
      homeTeam: ev?.strHomeTeam ?? "Home",
      awayTeam: ev?.strAwayTeam ?? "Away",
      homeLogo: ev?.strHomeTeamBadge ?? null,
      awayLogo: ev?.strAwayTeamBadge ?? null,
      kickoffIso: iso,
      kickoffMs,
      status,
      channel: normaliseChannel(ev?.strTVStation, defaultChannel),
      homeScore,
      awayScore,
    });
  }

  return fixtures;
}

export async function getUpcomingFixtures(limit = 3): Promise<Fixture[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL) {
    return cache.data.slice(0, limit);
  }

  // Fan out all enabled league requests in parallel; individual failures are
  // swallowed so one unavailable league doesn't blank the whole bar.
  const results = await Promise.allSettled(
    LEAGUES.filter((l) => l.enabled).map((l) => fetchLeagueFixtures(l.id, l.name, l.sport, l.defaultChannel)),
  );

  const all: Fixture[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.warn("[FIXTURES] League fetch failed:", r.reason?.message ?? r.reason);
  }

  // Sort by kickoff, earliest first, dedup by id
  const seen = new Set<string>();
  const sorted = all
    .filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  cache = { at: now, data: sorted };
  return sorted.slice(0, limit);
}

export function invalidateFixturesCache(): void {
  cache = null;
}
