/**
 * PenaltyShootoutGame — World Cup 2026 special event game
 *
 * Flick the ball upward toward the goal. Direction + speed determine
 * where it aims. 60% chance of scoring, 40% keeper save (server-side).
 *
 * States: loading → idle → shooting → scored | saved | already_played | unavailable | error
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  Platform,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

const WC_STORAGE_KEY = "wc_penalty_result_today";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;

// Where the ball flies based on aim (x offset, y offset from ball home)
const GOAL_TARGETS: Record<string, { x: number; y: number }> = {
  tl: { x: -CARD_WIDTH * 0.22, y: -260 },
  tc: { x: 0,                  y: -265 },
  tr: { x: CARD_WIDTH * 0.22,  y: -260 },
  bl: { x: -CARD_WIDTH * 0.18, y: -215 },
  bc: { x: 0,                  y: -210 },
  br: { x: CARD_WIDTH * 0.18,  y: -215 },
};

// Keeper dive x offset for each aim column
const KEEPER_DIVE: Record<string, number> = {
  l: -55, c: 0, r: 55,
};

type GameState =
  | "loading"
  | "idle"
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
    kickoffIso: string | null;
    status: string;
    minute: string | null;
  } | null;
  alreadyPlayed: boolean;
}

function calcAimZone(dx: number, vy: number): string {
  const col = dx < -28 ? "l" : dx > 28 ? "r" : "c";
  const row = vy < -1.2 ? "t" : "b";
  return `${row}${col}`;
}

export function PenaltyShootoutGame() {
  const { isAuthenticated, getCustomerToken } = useCustomerAuth();
  const queryClient = useQueryClient();

  const [gameState, setGameState] = useState<GameState>("loading");
  const [result, setResult] = useState<WcPlayResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aimedZone, setAimedZone] = useState<string>("bc");
  const [isDragging, setIsDragging] = useState(false);

  const gameStateRef = useRef<GameState>("loading");
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Ball animation
  const ballPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const ballOpacity = useRef(new Animated.Value(1)).current;

  // Keeper animation
  const keeperX = useRef(new Animated.Value(0)).current;
  const keeperScale = useRef(new Animated.Value(1)).current;

  // Result overlay
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Aim indicator (live during drag)
  const aimIndicatorOpacity = useRef(new Animated.Value(0)).current;

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

  // Restore cached result for today
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
    if (gameState !== "loading" && gameState !== "idle") return;
    if (statusData.alreadyPlayed) {
      setGameState("already_played");
    } else if (!statusData.available || !statusData.matchDay) {
      setGameState("unavailable");
    } else {
      setGameState("idle");
    }
  }, [statusData, statusLoading]);

  const resetBall = useCallback(() => {
    Animated.parallel([
      Animated.spring(ballPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, tension: 80, friction: 7 }),
      Animated.spring(ballScale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(ballOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(keeperX, { toValue: 0, useNativeDriver: true }),
    ]).start();
    Animated.timing(aimIndicatorOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }, []);

  const fireShot = useCallback(async (zone: string) => {
    const target = GOAL_TARGETS[zone] ?? GOAL_TARGETS.bc;
    const col = zone[1] as "l" | "c" | "r";

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Ball flies to goal
    Animated.parallel([
      Animated.timing(ballPos, {
        toValue: { x: target.x, y: target.y },
        duration: 380,
        useNativeDriver: false,
      }),
      Animated.timing(ballScale, {
        toValue: 0.45,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();

    // Slight delay then keeper dives
    setTimeout(() => {
      Animated.spring(keeperX, {
        toValue: KEEPER_DIVE[col] ?? 0,
        useNativeDriver: true,
        tension: 120,
        friction: 6,
      }).start();
      Animated.spring(keeperScale, {
        toValue: 1.15,
        useNativeDriver: true,
      }).start();
    }, 180);

    // API call
    try {
      const token = getCustomerToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(new URL("/api/game/wc-play", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zone }),
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

      const today = new Date().toISOString().slice(0, 10);
      AsyncStorage.setItem(WC_STORAGE_KEY, JSON.stringify({ date: today, result: data }));

      setTimeout(() => {
        if (won) {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setGameState("scored");
        } else {
          // Keeper save shake
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
          ]).start();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setGameState("saved");
        }
        Animated.timing(resultOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        queryClient.invalidateQueries({ queryKey: ["/api/game/my-prizes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
      }, 550);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Something went wrong");
      setGameState("error");
    }
  }, [getCustomerToken, queryClient]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameStateRef.current === "idle",
      onMoveShouldSetPanResponder: () => gameStateRef.current === "idle",
      onPanResponderGrant: () => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsDragging(true);
        Animated.timing(aimIndicatorOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        ballPos.setOffset({ x: (ballPos.x as any).__getValue(), y: (ballPos.y as any).__getValue() });
        ballPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        // Only allow upward drags
        const clampedDy = Math.min(0, gesture.dy);
        const clampedDx = Math.max(-80, Math.min(80, gesture.dx));
        ballPos.setValue({ x: clampedDx, y: clampedDy });
      },
      onPanResponderRelease: (_, gesture) => {
        ballPos.flattenOffset();
        setIsDragging(false);
        Animated.timing(aimIndicatorOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();

        const isFlick = gesture.vy < -0.5 || gesture.dy < -55;
        if (isFlick && gameStateRef.current === "idle") {
          const zone = calcAimZone(gesture.dx, gesture.vy);
          setAimedZone(zone);
          setGameState("shooting");
          fireShot(zone);
        } else {
          resetBall();
        }
      },
      onPanResponderTerminate: () => {
        ballPos.flattenOffset();
        setIsDragging(false);
        Animated.timing(aimIndicatorOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
        resetBall();
      },
    })
  ).current;

  // Dev-only reset (clears AsyncStorage so you can replay)
  const devReset = useCallback(async () => {
    await AsyncStorage.removeItem(WC_STORAGE_KEY);
    ballPos.setValue({ x: 0, y: 0 });
    ballScale.setValue(1);
    ballOpacity.setValue(1);
    keeperX.setValue(0);
    keeperScale.setValue(1);
    resultOpacity.setValue(0);
    shakeAnim.setValue(0);
    setResult(null);
    setGameState("idle");
    queryClient.invalidateQueries({ queryKey: ["/api/game/wc-status"] });
  }, [queryClient]);

  if (!isAuthenticated) return null;

  if (gameState === "loading" || statusLoading) {
    return (
      <View style={styles.card}>
        <LinearGradient colors={["#0d1f0d", "#051a0d"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.centreWrap}>
          <ActivityIndicator color="#4ade80" size="large" />
        </View>
      </View>
    );
  }

  if (gameState === "unavailable") {
    return (
      <View style={styles.card}>
        <LinearGradient colors={["#1a2a1a", "#0d1a0d"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.centreWrap}>
          <Text style={styles.bigEmoji}>🏆</Text>
          <Text style={styles.stateTitle}>World Cup Penalty Challenge</Text>
          <Text style={styles.stateDesc}>
            Available 30 minutes before each World Cup match.{"\n"}Check back on the next match day!
          </Text>
          {statusData?.todayMatch && (
            <View style={styles.nextPill}>
              <Text style={styles.nextPillText}>
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
        <View style={styles.centreWrap}>
          <Text style={styles.bigEmoji}>{won ? "⚽" : "🧤"}</Text>
          <Text style={styles.stateTitle}>{won ? "GOAL! Well played!" : "Saved — better luck next match!"}</Text>
          {result?.prize && (
            <View style={styles.prizeBox}>
              <Text style={styles.prizeBoxName}>{result.prize.name}</Text>
              {result.prize.description ? <Text style={styles.prizeBoxDesc}>{result.prize.description}</Text> : null}
            </View>
          )}
          <Text style={styles.stateDesc}>Come back on the next match day for another shot!</Text>
          {__DEV__ && (
            <Pressable onPress={devReset} style={styles.devBtn}>
              <Text style={styles.devBtnText}>🔧 Reset for testing</Text>
            </Pressable>
          )}
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
        <View style={styles.centreWrap}>
          <Animated.Text style={[styles.bigEmoji, { transform: [{ translateX: shakeAnim }] }]}>
            {won ? "⚽" : "🧤"}
          </Animated.Text>
          <Text style={[styles.stateTitle, { color: won ? "#4ade80" : "#f87171" }]}>
            {won ? "GOAL!" : "SAVED!"}
          </Text>
          <Text style={styles.stateDesc}>
            {won ? "You scored — nice penalty!" : "The keeper got there — better luck next match!"}
          </Text>
          {won && result?.prize && (
            <View style={styles.prizeBox}>
              <Text style={styles.prizeBoxLabel}>🏅 YOUR PRIZE</Text>
              <Text style={styles.prizeBoxName}>{result.prize.name}</Text>
              {result.prize.description ? <Text style={styles.prizeBoxDesc}>{result.prize.description}</Text> : null}
              {result.giftCardGan ? (
                <View style={styles.ganRow}>
                  <Ionicons name="card-outline" size={14} color="#4ade80" />
                  <Text style={styles.ganText}>Gift Card: {result.giftCardGan}</Text>
                </View>
              ) : null}
              {result.squareRewardIssued && (
                <Text style={styles.prizeBoxSub}>✓ Reward added to your loyalty account</Text>
              )}
            </View>
          )}
          {__DEV__ && (
            <Pressable onPress={devReset} style={styles.devBtn}>
              <Text style={styles.devBtnText}>🔧 Reset for testing</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  if (gameState === "error") {
    return (
      <View style={styles.card}>
        <LinearGradient colors={["#2a0a0a", "#1a0505"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.centreWrap}>
          <Ionicons name="warning-outline" size={36} color="#f87171" />
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateDesc}>{errorMsg ?? "Please try again."}</Text>
          <Pressable
            onPress={() => { resetBall(); setGameState("idle"); setErrorMsg(null); }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── idle / shooting ───────────────────────────────────────────────────────
  const match = statusData?.todayMatch;
  const isLive = match?.status === "live";

  return (
    <View style={styles.card}>
      {/* Grass */}
      <LinearGradient
        colors={["#0d2a0d", "#0a3818", "#062010"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.grassStripes} pointerEvents="none">
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={[styles.grassStripe, i % 2 === 0 && styles.grassStripeDark]} />
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>⚽  PENALTY CHALLENGE</Text>
          {match && (
            <View style={[styles.matchPill, isLive && styles.matchPillLive]}>
              {isLive && <View style={styles.liveDot} />}
              <Text style={styles.matchPillText}>
                {isLive
                  ? `LIVE ${match.minute ?? ""}  ${match.homeShort} vs ${match.awayShort}`
                  : `${match.homeShort} vs ${match.awayShort}`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSub}>WORLD CUP 2026 · ONE SHOT PER MATCH</Text>
      </View>

      {/* Goal */}
      <View style={styles.goalArea}>
        <View style={styles.goalPost}>
          {/* Net lines */}
          <View style={styles.netLines}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.netVLine} />
            ))}
          </View>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={[styles.netHLine, { top: `${30 + i * 28}%` as any }]} />
          ))}
          {/* Aim zone grid — lights up while dragging */}
          {(["tl","tc","tr","bl","bc","br"] as const).map((zone) => (
            <Animated.View
              key={zone}
              style={[
                styles.aimZoneHint,
                {
                  top: zone.startsWith("t") ? 0 : "50%",
                  left: zone.endsWith("l") ? 0 : zone.endsWith("c") ? "33.3%" : "66.6%",
                  opacity: aimIndicatorOpacity,
                },
              ]}
            />
          ))}
        </View>

        {/* Keeper */}
        <View style={styles.keeperLine}>
          <Animated.Text style={[
            styles.keeperEmoji,
            { transform: [{ translateX: keeperX }, { scale: keeperScale }] },
          ]}>
            🧤
          </Animated.Text>
        </View>
      </View>

      {/* Pitch + ball */}
      <View style={styles.pitchSection}>
        {/* Penalty arc */}
        <View style={styles.penaltyArc} />
        <View style={styles.penaltySpot} />

        {/* Draggable ball */}
        <Animated.View
          style={[
            styles.ballWrap,
            {
              transform: [
                ...ballPos.getTranslateTransform(),
                { scale: ballScale },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.ballEmoji}>⚽</Text>
          {/* Drag handle hint */}
          {gameState === "idle" && !isDragging && (
            <View style={styles.dragHint}>
              <Text style={styles.dragHintArrow}>↑</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Instruction */}
      <View style={styles.instruction}>
        {gameState === "idle" && (
          <Text style={styles.instructionText}>
            {isDragging ? "Release to shoot! 🔥" : "Drag ⚽ upward to shoot"}
          </Text>
        )}
        {gameState === "shooting" && (
          <View style={styles.shootingRow}>
            <ActivityIndicator color="#4ade80" size="small" />
            <Text style={styles.instructionText}>  Flying…</Text>
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
    height: 430,
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
    backgroundColor: "rgba(22,101,34,0.25)",
  },
  grassStripeDark: {
    backgroundColor: "rgba(10,60,18,0.25)",
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSub: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 3,
  },
  matchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
  },
  matchPillLive: {
    borderColor: "rgba(255,59,48,0.4)",
    backgroundColor: "rgba(255,59,48,0.1)",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#ff3b30",
  },
  matchPillText: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.4,
  },

  // Goal
  goalArea: {
    paddingHorizontal: 22,
  },
  goalPost: {
    height: 130,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderBottomWidth: 0,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.3)",
    overflow: "hidden",
    position: "relative",
  },
  netLines: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 2,
  },
  netVLine: {
    width: 1,
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 8,
  },
  netHLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  aimZoneHint: {
    position: "absolute",
    width: "33.3%",
    height: "50%",
    backgroundColor: "#4ade80",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.6)",
  },
  keeperLine: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  keeperEmoji: {
    fontSize: 26,
  },

  // Pitch / penalty area
  pitchSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 12,
    position: "relative",
  },
  penaltyArc: {
    width: 70,
    height: 35,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  penaltySpot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginBottom: 10,
  },
  ballWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
  },
  ballEmoji: {
    fontSize: 36,
  },
  dragHint: {
    position: "absolute",
    top: -18,
    backgroundColor: "rgba(74,222,128,0.8)",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  dragHintArrow: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Montserrat_700Bold",
  },

  // Instruction bar
  instruction: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  shootingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Non-game states
  centreWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  bigEmoji: {
    fontSize: 54,
    marginBottom: 4,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  stateDesc: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 2,
  },
  nextPill: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
  },
  nextPillText: {
    color: "#4ade80",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
  prizeBox: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
    padding: 14,
    gap: 4,
    alignItems: "center",
    width: "100%",
    marginTop: 4,
  },
  prizeBoxLabel: {
    color: "#4ade80",
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  prizeBoxName: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  prizeBoxDesc: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
  prizeBoxSub: {
    color: "#4ade80",
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  ganRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  ganText: {
    color: "#4ade80",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
  retryBtn: {
    backgroundColor: "rgba(248,113,113,0.2)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 6,
  },
  retryText: {
    color: "#f87171",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
  },
  devBtn: {
    marginTop: 12,
    backgroundColor: "rgba(255,200,0,0.15)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  devBtnText: {
    color: "#fbbf24",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
});
