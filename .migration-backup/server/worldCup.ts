// Lightweight World Cup live-score fetcher.
//
// Primary source: ESPN public scoreboard (unauthenticated). Covers live
// minute-by-minute scores, kickoff times, team logos.
//
// Fallback source: TheSportsDB free season feed (unauthenticated). Only
// surfaces fixtures + final scores (no live minute), but keeps the bar
// alive if ESPN is unreachable between matches.
//
// We cache aggressively: 30s when a match is live, 5min otherwise.

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
  source: "espn" | "thesportsdb" | "none";
};

let cache: { at: number; ttl: number; data: CachedMatch } | null = null;
let englandCache: { at: number; ttl: number; data: CachedMatch[] } | null = null;

const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SPORTSDB_SEASON =
  "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";
const SPORTSDB_NEXT =
  "https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4429";

function emptyMatch(): CachedMatch {
  return {
    status: "none",
    matchId: null,
    homeName: "", homeShort: "", homeLogo: null, homeScore: null,
    awayName: "", awayShort: "", awayLogo: null, awayScore: null,
    kickoffIso: null, minute: null, stage: null, source: "none",
  };
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ── ESPN ────────────────────────────────────────────────────────────────────

async function fetchEspn(): Promise<CachedMatch> {
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
  const url = `${ESPN_SCOREBOARD}?dates=${yyyymmdd(start)}-${yyyymmdd(end)}&limit=100`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = await res.json();
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  if (!events.length) return emptyMatch();

  const normalised = events.map((ev) => {
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: any) => c?.homeAway === "home") ?? competitors[0];
    const away = competitors.find((c: any) => c?.homeAway === "away") ?? competitors[1];
    const state: string = ev?.status?.type?.state ?? "pre";
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

  const live = normalised.filter((m) => m.state === "in");
  const upcoming = normalised.filter((m) => m.state === "pre").sort((a, b) => a.kickoffMs - b.kickoffMs);
  const finished = normalised.filter((m) => m.state === "post").sort((a, b) => b.kickoffMs - a.kickoffMs);
  const chosen = live[0] ?? upcoming[0] ?? finished[0];
  if (!chosen) return emptyMatch();

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
    source: "espn",
  };
}

// ── TheSportsDB fallback ────────────────────────────────────────────────────

function sportsDbStatus(raw: string | null | undefined, homeScore: number | null, awayScore: number | null, kickoffMs: number): CachedMatch["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("match finished") || s.includes("full time") || s === "ft") return "finished";
  if (s.includes("not started") || s === "ns") return "upcoming";
  // Anything else with scores set → live; otherwise infer from clock.
  if (homeScore != null && awayScore != null && kickoffMs && kickoffMs < Date.now()) return "live";
  return kickoffMs > Date.now() ? "upcoming" : "finished";
}

function parseSportsDbEvent(ev: any): { kickoffMs: number; data: CachedMatch } | null {
  const date = ev?.dateEvent;
  const time = ev?.strTime || "00:00:00";
  if (!date) return null;
  const iso = `${date}T${time.length === 5 ? `${time}:00` : time}Z`;
  const kickoffMs = Date.parse(iso);
  if (!kickoffMs) return null;
  const homeScore = ev?.intHomeScore != null && ev.intHomeScore !== "" ? Number(ev.intHomeScore) : null;
  const awayScore = ev?.intAwayScore != null && ev.intAwayScore !== "" ? Number(ev.intAwayScore) : null;
  const status = sportsDbStatus(ev?.strStatus, homeScore, awayScore, kickoffMs);
  return {
    kickoffMs,
    data: {
      status,
      matchId: String(ev?.idEvent ?? ""),
      homeName: ev?.strHomeTeam ?? "",
      homeShort: ev?.strHomeTeam ?? "",
      homeLogo: ev?.strHomeTeamBadge ?? null,
      homeScore,
      awayName: ev?.strAwayTeam ?? "",
      awayShort: ev?.strAwayTeam ?? "",
      awayLogo: ev?.strAwayTeamBadge ?? null,
      awayScore,
      kickoffIso: iso,
      minute: null, // free tier has no live minute
      stage: ev?.strSeason ?? null,
      source: "thesportsdb",
    },
  };
}

async function fetchSportsDb(): Promise<CachedMatch> {
  // Try season endpoint first (covers finished + upcoming), fall back to
  // the bare "next fixture" endpoint if the season feed is unavailable.
  let events: any[] = [];
  try {
    const res = await fetch(SPORTSDB_SEASON, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json();
      events = Array.isArray(json?.events) ? json.events : [];
    }
  } catch {
    // swallow — try fallback below
  }
  if (!events.length) {
    try {
      const res = await fetch(SPORTSDB_NEXT, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const json = await res.json();
        events = Array.isArray(json?.events) ? json.events : [];
      }
    } catch {
      // give up
    }
  }
  if (!events.length) return emptyMatch();

  const parsed = events
    .map(parseSportsDbEvent)
    .filter((x): x is { kickoffMs: number; data: CachedMatch } => !!x);

  const live = parsed.filter((p) => p.data.status === "live");
  const upcoming = parsed.filter((p) => p.data.status === "upcoming").sort((a, b) => a.kickoffMs - b.kickoffMs);
  const finished = parsed.filter((p) => p.data.status === "finished").sort((a, b) => b.kickoffMs - a.kickoffMs);
  const chosen = live[0] ?? upcoming[0] ?? finished[0];
  return chosen ? chosen.data : emptyMatch();
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getNextWorldCupMatch(): Promise<CachedMatch> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;

  let data: CachedMatch = emptyMatch();
  let espnError: string | null = null;

  // 1. ESPN primary
  try {
    data = await fetchEspn();
  } catch (err: any) {
    espnError = err?.message ?? String(err);
    console.error("[WORLD_CUP] ESPN fetch error:", espnError);
  }

  // 2. TheSportsDB fallback — only if ESPN threw or returned nothing.
  if (data.status === "none") {
    try {
      const fallback = await fetchSportsDb();
      if (fallback.status !== "none") {
        data = fallback;
        if (espnError) console.log("[WORLD_CUP] Falling back to TheSportsDB (ESPN unavailable)");
      }
    } catch (err: any) {
      console.error("[WORLD_CUP] TheSportsDB fetch error:", err?.message ?? err);
    }
  }

  // 3. If both failed, serve stale cache if we have any.
  if (data.status === "none" && cache) return cache.data;

  const ttl = data.status === "live" ? 30_000 : 5 * 60_000;
  cache = { at: now, ttl, data };
  return data;
}

// ── England-specific fixtures ───────────────────────────────────────────────
//
// Returns the next `limit` upcoming or live England matches (defaults to 2).
// Used by the home screen's "WORLD CUP 2026" card. Falls back to TheSportsDB
// if ESPN is unavailable, just like the single-match endpoint.

function isEnglandName(name: string | null | undefined): boolean {
  if (!name) return false;
  const s = name.trim().toLowerCase();
  return s === "england" || s === "england national football team";
}

async function fetchEspnEnglandList(limit: number): Promise<CachedMatch[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  // ESPN's scoreboard endpoint rejects windows larger than ~200 days with a
  // 400. 200 days easily covers the entire World Cup group + knockout stage
  // from any point during the tournament, which is all this card needs.
  const end = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000);
  const url = `${ESPN_SCOREBOARD}?dates=${yyyymmdd(start)}-${yyyymmdd(end)}&limit=200`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const json = await res.json();
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  if (!events.length) return [];

  const out: { kickoffMs: number; data: CachedMatch }[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: any) => c?.homeAway === "home") ?? competitors[0];
    const away = competitors.find((c: any) => c?.homeAway === "away") ?? competitors[1];
    const homeName: string = home?.team?.displayName ?? "";
    const awayName: string = away?.team?.displayName ?? "";
    if (!isEnglandName(homeName) && !isEnglandName(awayName)) continue;
    const state: string = ev?.status?.type?.state ?? "pre";
    if (state === "post") continue; // only upcoming/live
    const kickoffIso: string | null = ev?.date ?? null;
    const kickoffMs = kickoffIso ? Date.parse(kickoffIso) : 0;
    const status: CachedMatch["status"] = state === "in" ? "live" : "upcoming";
    out.push({
      kickoffMs,
      data: {
        status,
        matchId: String(ev?.id ?? ""),
        homeName,
        homeShort: home?.team?.shortDisplayName ?? home?.team?.abbreviation ?? "",
        homeLogo: home?.team?.logo ?? null,
        homeScore: home?.score != null ? Number(home.score) : null,
        awayName,
        awayShort: away?.team?.shortDisplayName ?? away?.team?.abbreviation ?? "",
        awayLogo: away?.team?.logo ?? null,
        awayScore: away?.score != null ? Number(away.score) : null,
        kickoffIso,
        minute: status === "live" ? (ev?.status?.type?.shortDetail ?? null) : null,
        stage: ev?.season?.slug || comp?.notes?.[0]?.headline || null,
        source: "espn",
      },
    });
  }
  return out.sort((a, b) => a.kickoffMs - b.kickoffMs).slice(0, limit).map((x) => x.data);
}

async function fetchSportsDbEnglandList(limit: number): Promise<CachedMatch[]> {
  let events: any[] = [];
  try {
    const res = await fetch(SPORTSDB_SEASON, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json();
      events = Array.isArray(json?.events) ? json.events : [];
    }
  } catch {}
  if (!events.length) {
    try {
      const res = await fetch(SPORTSDB_NEXT, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const json = await res.json();
        events = Array.isArray(json?.events) ? json.events : [];
      }
    } catch {}
  }
  if (!events.length) return [];

  const parsed = events
    .map(parseSportsDbEvent)
    .filter((x): x is { kickoffMs: number; data: CachedMatch } => !!x)
    .filter((x) => isEnglandName(x.data.homeName) || isEnglandName(x.data.awayName))
    .filter((x) => x.data.status !== "finished");

  return parsed.sort((a, b) => a.kickoffMs - b.kickoffMs).slice(0, limit).map((x) => x.data);
}

export async function getNextEnglandMatches(limit = 2): Promise<CachedMatch[]> {
  const now = Date.now();
  if (englandCache && now - englandCache.at < englandCache.ttl && englandCache.data.length >= limit) {
    return englandCache.data.slice(0, limit);
  }

  let data: CachedMatch[] = [];
  let espnError: string | null = null;
  try {
    data = await fetchEspnEnglandList(limit);
  } catch (err: any) {
    espnError = err?.message ?? String(err);
    console.error("[WORLD_CUP] ESPN England fetch error:", espnError);
  }

  if (data.length === 0) {
    try {
      const fallback = await fetchSportsDbEnglandList(limit);
      if (fallback.length) {
        data = fallback;
        if (espnError) console.log("[WORLD_CUP] England fallback to TheSportsDB");
      }
    } catch (err: any) {
      console.error("[WORLD_CUP] TheSportsDB England fetch error:", err?.message ?? err);
    }
  }

  if (data.length === 0 && englandCache) return englandCache.data.slice(0, limit);

  const anyLive = data.some((d) => d.status === "live");
  const ttl = anyLive ? 30_000 : 10 * 60_000;
  englandCache = { at: now, ttl, data };
  return data;
}
