// Upcoming sports fixtures for the staff dashboard bar.
//
// Fetches from TheSportsDB's documented public API key for leagues relevant to a
// UK sports venue: Premier League, Championship, FA Cup, Champions League,
// Europa League, England internationals, Super League Rugby League, and the
// Rugby League Challenge Cup. Bradford City and Leeds United are also fetched
// directly because their next televised fixture can be absent from the first
// event returned by a league feed.
//
// Channel info comes from strTVStation in the API response when available;
// falls back to a league-based default based on current UK broadcast deals for
// general league fixtures. Direct team fixtures are only included when the
// provider explicitly confirms Sky Sports, TNT Sports, or BT Sport.
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
  { id: 4396, name: "League One",       sport: "football",     defaultChannel: "",                enabled: true  },
  // Football — European (TNT Sports only — enable when subscribed)
  { id: 4480, name: "Champions League", sport: "football",     defaultChannel: "TNT Sports",      enabled: false },
  { id: 4481, name: "Europa League",    sport: "football",     defaultChannel: "TNT Sports",      enabled: false },
  // Football — international
  { id: 4429, name: "England",          sport: "football",     defaultChannel: "ITV / Channel 4", enabled: true  },
  // Rugby League
  { id: 4325, name: "Super League",     sport: "rugby-league", defaultChannel: "Sky Sports",      enabled: true  },
  { id: 4330, name: "Challenge Cup",    sport: "rugby-league", defaultChannel: "BBC",             enabled: true  },
];

type TeamConfig = {
  id: number;
  name: string;
  sport: Fixture["sport"];
  // Keep this list explicit so a team event from an unexpected competition
  // cannot be promoted to a televised fixture by the team feed.
  competitionIds: readonly number[];
};

// TheSportsDB team IDs and the competitions in which these clubs can appear.
// The team endpoint is the source of truth for the schedule; the competition
// list is a guard against unrelated or malformed provider events.
const TEAMS: TeamConfig[] = [
  {
    id: 134189,
    name: "Bradford City",
    sport: "football",
    competitionIds: [4396, 4482, 4570, 4847], // League One, FA Cup, EFL Cup, EFL Trophy
  },
  {
    id: 133635,
    name: "Leeds United",
    sport: "football",
    competitionIds: [4328, 4392, 4570], // Premier League, FA Cup, EFL Cup
  },
];

// TheSportsDB's current public key is 123. Key 3 is a legacy test key and
// returns HTTP 403 from production servers.
import { createFixtureProvider } from "./fixture-provider.ts";

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123";
const CACHE_TTL = 5 * 60_000; // 5 minutes — short enough that a finished game drops off the bar within one poll cycle
const DAILY_LEAGUE_IDS = new Set([4328, 4329, 4392, 4396]);
const DAILY_LOOKAHEAD_DAYS = 4;

let cache: { at: number; data: Fixture[]; priorityIds: string[] } | null = null;
let refreshInFlight: Promise<void> | null = null;
let provider = createFixtureProvider();
let staleRequestCount = 0;
let failedRequestCount = 0;
let lastSuccessfulRefreshAt: string | null = null;

export type FixtureFeedStatus = {
  isDegraded: boolean;
  refreshInProgress: boolean;
  failedRequestCount: number;
  lastSuccessfulRefreshAt: string | null;
};

export function getFixtureFeedStatus(): FixtureFeedStatus {
  return {
    isDegraded: failedRequestCount > 0 || !cache || Date.now() - cache.at >= CACHE_TTL,
    refreshInProgress: refreshInFlight !== null,
    failedRequestCount,
    lastSuccessfulRefreshAt,
  };
}

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
export function normaliseChannel(raw: string | null | undefined, defaultChannel: string): string {
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

function normaliseTelevisedChannel(raw: string | null | undefined): "Sky Sports" | "TNT Sports" | null {
  const channel = normaliseChannel(raw, "");
  return channel === "Sky Sports" || channel === "TNT Sports" ? channel : null;
}

type ParseEventOptions = {
  fallbackId: string;
  leagueName: string;
  sport: Fixture["sport"];
  defaultChannel: string;
  channel?: string | null;
};

function parseFixtureEvent(ev: any, options: ParseEventOptions): Fixture | null {
  const date: string | null = ev?.dateEvent ?? null;
  const time: string = ev?.strTime || "00:00:00";
  if (!date) return null;

  const timeStr = time.length === 5 ? `${time}:00` : time;
  // TheSportsDB times are UTC
  const iso = `${date}T${timeStr}Z`;
  const kickoffMs = Date.parse(iso);
  if (!kickoffMs || isNaN(kickoffMs)) return null;

  // Skip games already in the past — no upper cutoff so the bar always has
  // content even when the next game is days away.
  if (kickoffMs < Date.now()) return null;

  const homeScore =
    ev?.intHomeScore != null && ev.intHomeScore !== "" ? Number(ev.intHomeScore) : null;
  const awayScore =
    ev?.intAwayScore != null && ev.intAwayScore !== "" ? Number(ev.intAwayScore) : null;
  const status = sportsDbStatus(ev?.strStatus, homeScore, awayScore, kickoffMs);
  if (status === "finished") return null;

  const eventLeagueId = Number(ev?.idLeague);
  const fallbackId = Number.isFinite(eventLeagueId)
    ? `${eventLeagueId}-${kickoffMs}`
    : `${options.fallbackId}-${kickoffMs}`;

  return {
    id: String(ev?.idEvent ?? fallbackId),
    sport: options.sport,
    leagueName: options.leagueName,
    homeTeam: ev?.strHomeTeam ?? "Home",
    awayTeam: ev?.strAwayTeam ?? "Away",
    homeLogo: ev?.strHomeTeamBadge ?? null,
    awayLogo: ev?.strAwayTeamBadge ?? null,
    kickoffIso: iso,
    kickoffMs,
    status,
    channel: options.channel ?? normaliseChannel(ev?.strTVStation, options.defaultChannel),
    homeScore,
    awayScore,
  };
}

async function fetchLeagueFixtures(
  leagueId: number,
  name: string,
  sport: Fixture["sport"],
  defaultChannel: string,
): Promise<Fixture[]> {
  const url = `${SPORTSDB_BASE}/eventsnextleague.php?id=${leagueId}`;
  const json = await fetchFixtureJson(url);
  const events: any[] = Array.isArray(json?.events) ? json.events : [];

  const fixtures: Fixture[] = [];
  for (const ev of events) {
    const fixture = parseFixtureEvent(ev, {
      fallbackId: String(leagueId),
      leagueName: name,
      sport,
      defaultChannel,
    });
    if (fixture) fixtures.push(fixture);
  }

  return fixtures;
}

function ukDateOffset(daysAhead: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now()));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + daysAhead)).toISOString().slice(0, 10);
}

async function fetchLeagueFixturesForDate(
  league: (typeof LEAGUES)[number],
  date: string,
): Promise<Fixture[]> {
  const url = `${SPORTSDB_BASE}/eventsday.php?d=${date}&l=${league.id}`;
  const json = await fetchFixtureJson(url);
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  return events
    .map((ev) => parseFixtureEvent(ev, {
      fallbackId: String(league.id),
      leagueName: league.name,
      sport: league.sport,
      defaultChannel: league.defaultChannel,
    }))
    .filter((fixture): fixture is Fixture => fixture !== null);
}

function eventBelongsToTeam(ev: any, team: TeamConfig): boolean {
  const teamId = String(team.id);
  const homeId = ev?.idHomeTeam == null ? "" : String(ev.idHomeTeam);
  const awayId = ev?.idAwayTeam == null ? "" : String(ev.idAwayTeam);
  if (homeId || awayId) return homeId === teamId || awayId === teamId;

  // Some provider fixtures omit IDs. Keep the direct team endpoint useful in
  // that case while still rejecting an event whose teams are both unrelated.
  const teamName = team.name.toLowerCase();
  return [ev?.strHomeTeam, ev?.strAwayTeam]
    .filter((name): name is string => typeof name === "string")
    .some((name) => name.trim().toLowerCase() === teamName);
}

async function fetchTeamFixtures(team: TeamConfig): Promise<Fixture[]> {
  const url = `${SPORTSDB_BASE}/eventsnext.php?id=${team.id}`;
  const json = await fetchFixtureJson(url);
  const events: any[] = Array.isArray(json?.events) ? json.events : [];

  const fixtures: Fixture[] = [];
  for (const ev of events) {
    const eventLeagueId = Number(ev?.idLeague);
    if (Number.isFinite(eventLeagueId) && !team.competitionIds.includes(eventLeagueId)) continue;
    if (!eventBelongsToTeam(ev, team)) continue;

    // Unlike general league feeds, a team event must have an explicit
    // broadcaster confirmation. A league default is never enough here.
    const channel = normaliseTelevisedChannel(ev?.strTVStation);
    if (!channel) continue;

    const fixture = parseFixtureEvent(ev, {
      fallbackId: String(team.id),
      leagueName: ev?.strLeague || "Football",
      sport: team.sport,
      defaultChannel: "",
      channel,
    });
    if (fixture) fixtures.push(fixture);
  }

  return fixtures;
}

function selectFixtures(data: Fixture[], priorityIds: string[], limit?: number | null): Fixture[] {
  const boundedLimit = limit == null
    ? data.length
    : Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : data.length;
  if (boundedLimit === 0) return [];

  const priority = new Set(priorityIds);
  const preferred = data.filter((fixture) => priority.has(fixture.id));
  const general = data.filter((fixture) => !priority.has(fixture.id));

  // Keep confirmed Bradford/Leeds TV matches first, then represent different
  // match days before filling any remaining slots. This prevents several
  // Saturday matches from hiding the Friday and Sunday fixtures.
  const selected: Fixture[] = [];
  const selectedIds = new Set<string>();
  const selectedDays = new Set<string>();
  const add = (fixture: Fixture) => {
    if (selected.length >= boundedLimit || selectedIds.has(fixture.id)) return;
    selected.push(fixture);
    selectedIds.add(fixture.id);
    selectedDays.add(fixture.kickoffIso.slice(0, 10));
  };
  for (const fixture of preferred) add(fixture);
  for (const fixture of general) {
    if (selected.length >= boundedLimit) break;
    if (!selectedDays.has(fixture.kickoffIso.slice(0, 10))) add(fixture);
  }
  for (const fixture of general) add(fixture);
  return selected.sort((a, b) => a.kickoffMs - b.kickoffMs);
}

export async function getUpcomingFixtures(limit: number | null = 3, waitForRefresh = true): Promise<Fixture[]> {
  const now = Date.now();
  if (!cache || now - cache.at >= CACHE_TTL) {
    if (!refreshInFlight) {
      refreshInFlight = refreshFixtures().catch(error => {
        failedRequestCount = Math.max(1, failedRequestCount);
        console.warn("[FIXTURES] Refresh failed:", error);
      }).finally(() => { refreshInFlight = null; });
    }
    if (waitForRefresh) await refreshInFlight;
  }
  return selectFixtures(cache?.data.filter(f => f.kickoffMs >= now) ?? [], cache?.priorityIds ?? [], limit);
}

async function fetchFixtureJson(url: string): Promise<any> {
  const result = await provider.get(url);
  if (result.stale) staleRequestCount++;
  return result.json;
}

async function refreshFixtures(): Promise<void> {
  staleRequestCount = 0;
  // The free provider endpoint for "next league event" returns only one
  // match, which can hide later Friday/Sunday games behind Saturday's first
  // kickoff. Read a short UK-date window for the main domestic leagues. The
  // provider queue spaces calls and stops on rate limits. All callers share
  // this refresh; HTTP routes return cached data instead of waiting on it.
  const dailyLeagues = LEAGUES.filter((league) => league.enabled && DAILY_LEAGUE_IDS.has(league.id));
  const nextOnlyLeagues = LEAGUES.filter((league) => league.enabled && !DAILY_LEAGUE_IDS.has(league.id));
  const dates = Array.from({ length: DAILY_LOOKAHEAD_DAYS + 1 }, (_, index) => ukDateOffset(index));
  const [dailyResults, leagueResults, teamResults] = await Promise.all([
    Promise.allSettled(
      dates.flatMap((date) => dailyLeagues.map((league) => fetchLeagueFixturesForDate(league, date))),
    ),
    Promise.allSettled(
      nextOnlyLeagues.map((league) =>
        fetchLeagueFixtures(league.id, league.name, league.sport, league.defaultChannel),
      ),
    ),
    Promise.allSettled(TEAMS.map((team) => fetchTeamFixtures(team))),
  ]);
  const allResults = [...dailyResults, ...leagueResults, ...teamResults];
  failedRequestCount = staleRequestCount + allResults.filter((result) => result.status === "rejected").length;
  if (failedRequestCount === 0) {
    lastSuccessfulRefreshAt = new Date(Date.now()).toISOString();
  }

  const general: Fixture[] = [];
  for (const r of [...dailyResults, ...leagueResults]) {
    if (r.status === "fulfilled") general.push(...r.value);
    else console.warn("[FIXTURES] League fetch failed:", r.reason?.message ?? r.reason);
  }

  const teamSpecific: Fixture[] = [];
  for (const [index, r] of teamResults.entries()) {
    if (r.status === "fulfilled") teamSpecific.push(...r.value);
    else {
      console.warn(
        `[FIXTURES] Team fetch failed (${TEAMS[index].name}):`,
        r.reason?.message ?? r.reason,
      );
    }
  }

  // Insert team-specific results first so an event duplicated by a general
  // feed keeps its confirmed broadcaster and receives priority at the limit.
  const seen = new Set<string>();
  const priorityIds: string[] = [];
  const priority = teamSpecific.filter((fixture) => {
    if (seen.has(fixture.id)) return false;
    seen.add(fixture.id);
    priorityIds.push(fixture.id);
    return true;
  });
  const generalUnique = general.filter((fixture) => {
    if (seen.has(fixture.id)) return false;
    seen.add(fixture.id);
    return true;
  });
  const sorted = [...priority, ...generalUnique]
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  cache = { at: Date.now(), data: sorted, priorityIds };
}

export function invalidateFixturesCache(): void {
  // Test/admin reset must not start a second refresh beside an active one.
  if (refreshInFlight) return;
  cache = null;
  provider = createFixtureProvider();
  failedRequestCount = 0;
  lastSuccessfulRefreshAt = null;
}
