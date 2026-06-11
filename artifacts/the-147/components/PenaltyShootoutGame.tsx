/**
 * PenaltyShootoutGame — World Cup 2026 special event game
 *
 * Tap one of 6 corners/zones to take your penalty. A random keeper
 * animation decides if you score. If you score → prize awarded via the
 * same /api/game/wc-play endpoint that uses the existing prize backend.
 *
 * States: idle → aiming → shooting → scored | saved | already_played | unavailable
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import Colors from "@/constants/colors";

const WC_STORAGE_KEY = "wc_penalty_result_today";

// 6 goal zones — 2 rows × 3 cols
const ZONES = [
  { id: "tl", label: "Top\nLeft",   icon: "↖" },
  { id: "tc", label: "Top\nCentre", icon: "↑" },
  { id: "tr", label: "Top\nRight",  icon: "↗" },
  { id: "bl", label: "Bot\nLeft",   icon: "↙" },
  { id: "bc", label: "Bot\nCentre", icon: "↓" },
  { id: "br", label: "Bot\nRight",  icon: "↘" },
];

type GameState =
  | "loading"
  | "idle"
  | "aiming"
  | "shooting"
  | "scored"
  | "saved"
  | "already_played"
  | "unavailable"
  | "error";

interface WcPlayResult {
  won: boolean;
  saved: boolean;
  prize: { name: string; description?: string; prizeType: string } | null;
  pointsAwarded: number | null;
  giftCardGan: string | null;
  playId: number;
  squareRewardIssued: boolean;
}

interface WcStatusResult {
  available: boolean;
  matchDay: boolean;
  todayMatch: {
    homeName: string;
    awayName: string;
    homeShort: string;
    awayShort: string;
    homeLogo: string | null;
    awayLogo: string | null;
    kickoffIso: string | null;
    status: string;
    minute: string | null;
  } | null;
  alreadyPlayed: boolean;
}

export function PenaltyShootoutGame() {
  const { isAuthenticated, getCustomerToken } = useCustomerAuth();
  const queryClient = useQueryClient();

  const [gameState, setGameState] = useState<GameState>("loading");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [result, setResult] = useState<WcPlayResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ballAnim = useRef(new Animated.Value(0)).current;
  const keeperAnim = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const { data: statusData, isLoading: statusLoading } = useQuery<WcStatusResult>({
    queryKey: ["/api/game/wc-status"],
    queryFn: async () => {
      const token = getCustomerToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL("/api/game/wc-status", getApiUrl()).toString(), { headers });
      if (!res.ok) throw new Error("Status check failed");
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Restore today's cached result from AsyncStorage
  useEffect(() => {
    if (!isAuthenticated) return;
    AsyncStorage.getItem(WC_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { date, result: r } = JSON.parse(raw);
        const today = new Date().toISOString().slice(0, 10);
        if (date === today && r) {
          setResult(r);
          setGameState(r.won ? "scored" : "saved");
          resultOpacity.setValue(1);
        }
      } catch {}
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (statusLoading) return;
    if (!statusData) return;
    // Only override if we're still in loading/idle (don't clobber a cached result)
    if (gameState !== "loading" && gameState !== "idle") return;
    if (statusData.alreadyPlayed) {
      setGameState("already_played");
    } else if (!statusData.available || !statusData.matchDay) {
      setGameState("unavailable");
    } else {
      setGameState("idle");
    }
  }, [statusData, statusLoading]);

  const handleZoneSelect = useCallback((zoneId: string) => {
    if (gameState !== "idle") return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedZone(zoneId);
    setGameState("aiming");
  }, [gameState]);

  const handleShoot = useCallback(async () => {
    if (gameState !== "aiming" || !selectedZone) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setGameState("shooting");

    // Ball fly animation
    Animated.sequence([
      Animated.timing(ballAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    // Keeper dive animation
    Animated.timing(keeperAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    try {
      const token = getCustomerToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(new URL("/api/game/wc-play", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zone: selectedZone }),
      });
      const data: WcPlayResult = await res.json();

      if (res.status === 429) {
        setGameState("already_played");
        return;
      }
      if (!res.ok) {
        setErrorMsg((data as any).message ?? "Something went wrong");
        setGameState("error");
        return;
      }

      const won = data.won && !data.saved;
      setResult(data);

      // Cache result for today
      const today = new Date().toISOString().slice(0, 10);
      AsyncStorage.setItem(WC_STORAGE_KEY, JSON.stringify({ date: today, result: data }));

      setTimeout(() => {
        setGameState(won ? "scored" : "saved");
        if (!won) {
          // Shake the post/keeper
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 5, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
          ]).start();
        } else {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Animated.timing(resultOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        queryClient.invalidateQueries({ queryKey: ["/api/game/my-prizes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
      }, 600);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Something went wrong");
      setGameState("error");
    }
  }, [gameState, selectedZone, getCustomerToken, queryClient]);

  const handleReset = useCallback(() => {
    setSelectedZone(null);
    setGameState("idle");
    ballAnim.setValue(0);
    keeperAnim.setValue(0);
    resultOpacity.setValue(0);
    shakeAnim.setValue(0);
  }, []);

  if (!isAuthenticated) return null;
  if (gameState === "loading" || statusLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }
  if (gameState === "unavailable") {
    return (
      <View style={styles.card}>
        <LinearGradient colors={["#1a2a1a", "#0d1a0d"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.unavailableWrap}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.unavailableTitle}>World Cup Penalty Challenge</Text>
          <Text style={styles.unavailableDesc}>
            Available on World Cup match days only.{"\n"}Check back on the next match day!
          </Text>
          {statusData?.todayMatch && (
            <View style={styles.nextMatchPill}>
              <Text style={styles.nextMatchText}>
                Next: {statusData.todayMatch.homeShort} vs {statusData.todayMatch.awayShort}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (gameState === "already_played") {
    const won = result?.won && !result?.saved;
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={won ? ["#0d2d0d", "#1a4a1a"] : ["#1a1a2e", "#16213e"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.unavailableWrap}>
          <Text style={styles.trophy}>{won ? "⚽" : "🧤"}</Text>
          <Text style={styles.unavailableTitle}>
            {won ? "GOAL! Well played!" : "Saved — better luck next match!"}
          </Text>
          {result?.prize && (
            <View style={styles.prizeBox}>
              <Text style={styles.prizeBoxName}>{result.prize.name}</Text>
              {result.prize.description ? (
                <Text style={styles.prizeBoxDesc}>{result.prize.description}</Text>
              ) : null}
              {result.giftCardGan ? (
                <Text style={styles.prizeBoxSub}>Gift Card: {result.giftCardGan}</Text>
              ) : null}
            </View>
          )}
          <Text style={styles.unavailableDesc}>Come back tomorrow for another shot!</Text>
        </View>
      </View>
    );
  }

  if (gameState === "scored" || gameState === "saved") {
    const won = gameState === "scored";
    return (
      <Animated.View style={[styles.card, { opacity: resultOpacity }]}>
        <LinearGradient
          colors={won ? ["#0a2a0a", "#1a5c1a", "#0a3a0a"] : ["#1a0a0a", "#3a1010", "#1a0a0a"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.resultWrap}>
          <Animated.Text style={[styles.bigEmoji, { transform: [{ translateX: shakeAnim }] }]}>
            {won ? "⚽" : "🧤"}
          </Animated.Text>
          <Text style={[styles.resultTitle, { color: won ? "#4ade80" : "#f87171" }]}>
            {won ? "GOAL!" : "SAVED!"}
          </Text>
          <Text style={styles.resultSub}>
            {won ? "You scored in the " + (ZONES.find(z => z.id === selectedZone)?.label.replace("\n", " ") ?? "") + "!" : "The keeper got there!"}
          </Text>
          {won && result?.prize && (
            <View style={styles.prizeBox}>
              <Text style={styles.prizeBoxLabel}>🏅 YOUR PRIZE</Text>
              <Text style={styles.prizeBoxName}>{result.prize.name}</Text>
              {result.prize.description ? (
                <Text style={styles.prizeBoxDesc}>{result.prize.description}</Text>
              ) : null}
              {result.giftCardGan ? (
                <View style={styles.ganBox}>
                  <Ionicons name="card-outline" size={14} color="#4ade80" />
                  <Text style={styles.ganText}>Gift Card: {result.giftCardGan}</Text>
                </View>
              ) : null}
              {result.squareRewardIssued && (
                <Text style={styles.prizeBoxSub}>✓ Reward added to your loyalty account</Text>
              )}
            </View>
          )}
          {!won && (
            <Text style={styles.savedDesc}>No prize this time — come back on the next match day!</Text>
          )}
        </View>
      </Animated.View>
    );
  }

  if (gameState === "error") {
    return (
      <View style={styles.card}>
        <LinearGradient colors={["#2a0a0a", "#1a0505"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.unavailableWrap}>
          <Ionicons name="warning-outline" size={36} color="#f87171" />
          <Text style={styles.unavailableTitle}>Something went wrong</Text>
          <Text style={styles.unavailableDesc}>{errorMsg ?? "Please try again."}</Text>
          <Pressable onPress={handleReset} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // idle or aiming
  const match = statusData?.todayMatch;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["#0d1f0d", "#0a2a1a", "#051a0d"]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Grass texture overlay */}
      <View style={styles.grassStripes} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.grassStripe, i % 2 === 0 && styles.grassStripeDark]} />
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "transparent"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.headerContent}>
          <Text style={styles.headerEmoji}>⚽</Text>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>PENALTY CHALLENGE</Text>
            <Text style={styles.headerSub}>WORLD CUP 2026 · ONE SHOT PER MATCH DAY</Text>
          </View>
        </View>
        {match && (
          <View style={styles.matchPill}>
            <View style={styles.matchPillDot} />
            <Text style={styles.matchPillText}>
              {match.status === "live"
                ? `LIVE ${match.minute ?? ""} · ${match.homeShort} ${match.homeName === match.homeShort ? "" : ""} vs ${match.awayShort}`
                : `TODAY · ${match.homeShort} vs ${match.awayShort}`}
            </Text>
          </View>
        )}
      </View>

      {/* Goal frame */}
      <View style={styles.goalSection}>
        <View style={styles.goalPost}>
          {/* Crossbar */}
          <View style={styles.crossbar} />
          {/* Left post */}
          <View style={[styles.goalSidePost, { left: 0 }]} />
          {/* Right post */}
          <View style={[styles.goalSidePost, { right: 0 }]} />

          {/* Zone grid */}
          <View style={styles.zoneGrid}>
            {ZONES.map((zone) => {
              const isSelected = selectedZone === zone.id;
              return (
                <Pressable
                  key={zone.id}
                  onPress={() => handleZoneSelect(zone.id)}
                  disabled={gameState === "shooting"}
                  style={({ pressed }) => [
                    styles.zone,
                    isSelected && styles.zoneSelected,
                    pressed && styles.zonePressed,
                  ]}
                >
                  <Text style={styles.zoneArrow}>{zone.icon}</Text>
                  <Text style={styles.zoneLabel}>{zone.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Goalkeeper line */}
        <View style={styles.keeperLine}>
          <Animated.Text style={[
            styles.keeperEmoji,
            {
              transform: [{
                translateX: keeperAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, selectedZone?.startsWith("t") || selectedZone?.startsWith("b")
                    ? (selectedZone?.endsWith("l") ? -40 : selectedZone?.endsWith("r") ? 40 : 0)
                    : 0],
                }),
              }],
            },
          ]}>
            🧤
          </Animated.Text>
        </View>
      </View>

      {/* Ball / shoot zone */}
      <View style={styles.pitchLine}>
        <View style={styles.penaltySpot} />
        <Animated.View style={[
          styles.ballWrap,
          {
            transform: [{
              translateY: ballAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -100] }),
            }, {
              scale: ballAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
            }],
          },
        ]}>
          <Text style={styles.ballEmoji}>⚽</Text>
        </Animated.View>
      </View>

      {/* CTA */}
      <View style={styles.ctaRow}>
        {gameState === "idle" && (
          <View style={styles.promptWrap}>
            <Text style={styles.promptText}>👆 Tap a zone to aim your shot</Text>
          </View>
        )}
        {gameState === "aiming" && (
          <View style={styles.aimRow}>
            <Pressable onPress={handleReset} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleShoot} style={styles.shootBtn}>
              <LinearGradient colors={["#16a34a", "#15803d"]} style={styles.shootBtnGrad}>
                <Text style={styles.shootText}>⚽ SHOOT!</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
        {gameState === "shooting" && (
          <View style={styles.promptWrap}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.promptText}>  Shooting…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 14,
  },
  grassStripes: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  grassStripe: {
    flex: 1,
    backgroundColor: "rgba(22,101,34,0.3)",
  },
  grassStripeDark: {
    backgroundColor: "rgba(15,70,23,0.3)",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    position: "relative",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerEmoji: {
    fontSize: 28,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerSub: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  matchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  matchPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  matchPillText: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  goalSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  goalPost: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.25)",
    position: "relative",
    height: 140,
    overflow: "hidden",
  },
  crossbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#FFFFFF",
  },
  goalSidePost: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "#FFFFFF",
  },
  zoneGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 4,
    gap: 3,
  },
  zone: {
    width: "31.5%",
    height: 60,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  zoneSelected: {
    backgroundColor: "rgba(74,222,128,0.3)",
    borderColor: "#4ade80",
    borderWidth: 2,
  },
  zonePressed: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  zoneArrow: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  zoneLabel: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 8,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  keeperLine: {
    alignItems: "center",
    marginTop: 4,
    height: 30,
    justifyContent: "center",
  },
  keeperEmoji: {
    fontSize: 24,
  },
  pitchLine: {
    alignItems: "center",
    marginTop: 8,
    position: "relative",
    height: 50,
    justifyContent: "flex-end",
  },
  penaltySpot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginBottom: 4,
  },
  ballWrap: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
  },
  ballEmoji: {
    fontSize: 28,
  },
  ctaRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 60,
    justifyContent: "center",
  },
  promptWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  promptText: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  aimRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelText: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
  },
  shootBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  shootBtnGrad: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  shootText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    letterSpacing: 1,
  },
  // Result screens
  resultWrap: {
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  bigEmoji: {
    fontSize: 56,
    marginBottom: 6,
  },
  resultTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 32,
    letterSpacing: 3,
  },
  resultSub: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  savedDesc: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  prizeBox: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
    width: "100%",
  },
  prizeBoxLabel: {
    color: "#4ade80",
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  prizeBoxName: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  prizeBoxDesc: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
  prizeBoxSub: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
  ganBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  ganText: {
    color: "#4ade80",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
  },
  // Unavailable / already_played
  unavailableWrap: {
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  trophy: {
    fontSize: 44,
    marginBottom: 6,
  },
  unavailableTitle: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  unavailableDesc: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  nextMatchPill: {
    marginTop: 8,
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
  },
  nextMatchText: {
    color: "#4ade80",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  retryText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
  },
});
