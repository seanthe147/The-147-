// Lightweight World Cup live-score fetcher.
//
// Uses ESPN's public (unauthenticated) scoreboard feed. No API key required.
// We cache aggressively: 30s when a match is live, 5min otherwise, to keep
// the bar snappy without hammering ESPN.

type CachedMatch = {
  status: "live" | "upcoming" | "finished" | "none";
  matchId: string | null;
  homeName: string;
  homeShort: string;
  homeLogo: string | null;
  homeScore: number | null;
  awayName: string;
  awayShort: string;
  awayLogo: string | null;
  awayScore: number | null;
  kickoffIso: string | null;
  minute: string | null;
  stage: string | null;
};

let cache: { at: number; ttl: number; data: CachedMatch } | null = null;

const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchScoreboard(): Promise<any[]> {
  // Query a wide window so we still find the next fixture during the long
  // gap between qualifiers and the tournament proper: 2 days back (catches
  // matches still in progress past midnight UTC) through 75 days ahead
  // (covers the entire group + knockout phase of a World Cup).
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
  const url = `${ESPN_SCOREBOARD}?dates=${yyyymmdd(start)}-${yyyymmdd(end)}&limit=100`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.events) ? json.events : [];
}

function pickMatch(events: any[]): CachedMatch {
  const empty: CachedMatch = {
    status: "none",
    matchId: null,
    homeName: "", homeShort: "", homeLogo: null, homeScore: null,
    awayName: "", awayShort: "", awayLogo: null, awayScore: null,
    kickoffIso: null, minute: null, stage: null,
  };
  if (!events.length) return empty;

  // Map each event into a normalised shape and bucket by state.
  const normalised = events.map((ev) => {
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: any) => c?.homeAway === "home") ?? competitors[0];
    const away = competitors.find((c: any) => c?.homeAway === "away") ?? competitors[1];
    const state: string = ev?.status?.type?.state ?? "pre"; // pre | in | post
    const detail: string = ev?.status?.type?.shortDetail ?? "";
    return {
      id: String(ev?.id ?? ""),
      kickoffIso: ev?.date ?? null,
      kickoffMs: ev?.date ? Date.parse(ev.date) : 0,
      state,
      detail,
      stage: ev?.season?.slug || comp?.notes?.[0]?.headline || null,
      home: {
        name: home?.team?.displayName ?? "",
        short: home?.team?.shortDisplayName ?? home?.team?.abbreviation ?? "",
        logo: home?.team?.logo ?? null,
        score: home?.score != null ? Number(home.score) : null,
      },
      away: {
        name: away?.team?.displayName ?? "",
        short: away?.team?.shortDisplayName ?? away?.team?.abbreviation ?? "",
        logo: away?.team?.logo ?? null,
        score: away?.score != null ? Number(away.score) : null,
      },
    };
  });

  // Priority: any LIVE match → earliest upcoming → most recent finished.
  const live = normalised.filter((m) => m.state === "in");
  const upcoming = normalised
    .filter((m) => m.state === "pre")
    .sort((a, b) => a.kickoffMs - b.kickoffMs);
  const finished = normalised
    .filter((m) => m.state === "post")
    .sort((a, b) => b.kickoffMs - a.kickoffMs);

  const chosen = live[0] ?? upcoming[0] ?? finished[0];
  if (!chosen) return empty;

  const status: CachedMatch["status"] =
    chosen.state === "in" ? "live" : chosen.state === "pre" ? "upcoming" : "finished";

  return {
    status,
    matchId: chosen.id,
    homeName: chosen.home.name,
    homeShort: chosen.home.short,
    homeLogo: chosen.home.logo,
    homeScore: chosen.home.score,
    awayName: chosen.away.name,
    awayShort: chosen.away.short,
    awayLogo: chosen.away.logo,
    awayScore: chosen.away.score,
    kickoffIso: chosen.kickoffIso,
    minute: status === "live" ? chosen.detail : null,
    stage: chosen.stage,
  };
}

export async function getNextWorldCupMatch(): Promise<CachedMatch> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;
  try {
    const events = await fetchScoreboard();
    const data = pickMatch(events);
    const ttl = data.status === "live" ? 30_000 : 5 * 60_000;
    cache = { at: now, ttl, data };
    return data;
  } catch (err: any) {
    console.error("[WORLD_CUP] fetch error:", err.message);
    // Serve stale cache if we have it; otherwise empty.
    if (cache) return cache.data;
    return {
      status: "none",
      matchId: null,
      homeName: "", homeShort: "", homeLogo: null, homeScore: null,
      awayName: "", awayShort: "", awayLogo: null, awayScore: null,
      kickoffIso: null, minute: null, stage: null,
    };
  }
}
