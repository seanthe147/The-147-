import React, { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useKiosk } from "@/contexts/KioskContext";

type Match = {
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

function formatKickoff(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (sameDay) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return `${day} ${time}`;
}

export function NextMatchBar() {
  const insets = useSafeAreaInsets();
  const { isKioskMode } = useKiosk();
  const [pollMs, setPollMs] = useState(5 * 60_000);

  const { data, error } = useQuery<Match>({
    queryKey: ["/api/world-cup/next-match"],
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 25_000,
  });

  // Poll every 30s when live, every 60s when kickoff is within 90 min,
  // otherwise every 5 min.
  useEffect(() => {
    if (!data) return;
    if (data.status === "live" || data.status === "finished") {
      setPollMs(30_000);
      return;
    }
    if (data.kickoffIso) {
      const minsToKickoff = (new Date(data.kickoffIso).getTime() - Date.now()) / 60_000;
      if (minsToKickoff <= 90) {
        setPollMs(60_000);
        return;
      }
    }
    setPollMs(5 * 60_000);
  }, [data?.status, data?.kickoffIso]);

  if (isKioskMode) return null;
  if (error || !data || data.status === "none") return null;

  const isLive = data.status === "live";
  const isFinished = data.status === "finished";
  const showScore = isLive || isFinished;
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 8) : insets.top;

  return (
    <View style={[styles.wrap, { paddingTop: topPad }]}>
      <View style={styles.bar}>
        <View style={styles.statusCol}>
          {isLive ? (
            <View style={styles.liveDotRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : isFinished ? (
            <Text style={styles.ftText}>FT</Text>
          ) : (
            <Text style={styles.upcomingText}>WORLD CUP</Text>
          )}
          {isLive && data.minute ? (
            <Text style={styles.minuteText} numberOfLines={1}>{data.minute}</Text>
          ) : !showScore ? (
            <Text style={styles.kickoffText} numberOfLines={1}>{formatKickoff(data.kickoffIso)}</Text>
          ) : null}
        </View>

        <View style={styles.teamsRow}>
          <View style={styles.team}>
            {data.homeLogo ? (
              <Image source={{ uri: data.homeLogo }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback} />
            )}
            <Text style={styles.teamText} numberOfLines={1}>{data.homeShort || data.homeName}</Text>
          </View>

          <View style={styles.scoreBox}>
            {showScore ? (
              <Text style={styles.scoreText}>
                {data.homeScore ?? 0} <Text style={styles.scoreDash}>–</Text> {data.awayScore ?? 0}
              </Text>
            ) : (
              <Text style={styles.vsText}>vs</Text>
            )}
          </View>

          <View style={[styles.team, styles.teamRight]}>
            <Text style={[styles.teamText, styles.teamTextRight]} numberOfLines={1}>{data.awayShort || data.awayName}</Text>
            {data.awayLogo ? (
              <Image source={{ uri: data.awayLogo }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.brand.blue,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  statusCol: {
    minWidth: 78,
    justifyContent: "center",
  },
  liveDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  ftText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  upcomingText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  minuteText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 1,
  },
  kickoffText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 1,
  },
  teamsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  team: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamRight: {
    justifyContent: "flex-end",
  },
  teamText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  teamTextRight: {
    textAlign: "right",
  },
  logo: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
  logoFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  scoreBox: {
    minWidth: 56,
    alignItems: "center",
  },
  scoreText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  scoreDash: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  vsText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
  },
});
