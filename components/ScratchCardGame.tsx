/**
 * ScratchCardGame
 * 
 * A daily scratch card mini-game tied to the server game system.
 * 
 * States: idle → scratching → [won | no_prize | already_played | error]
 *
 * The API is fired on first touch so the server rolls the prize while the
 * customer is still scratching. The card auto-completes when 40 % of cells
 * are uncovered or the finger is lifted, whichever comes first.
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  PanResponder,
  Animated,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

// ── Grid constants ────────────────────────────────────────────────────────────

const COLS = 8;
const ROWS = 5;
const TOTAL = COLS * ROWS;
const REVEAL_THRESHOLD = 0.40;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameConfig {
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
  withinWindow: boolean;
}

interface GameResult {
  won: boolean;
  prize: { name: string; description: string; prizeType: string } | null;
  pointsAwarded: number | null;
  playId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, "0")}${suffix}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PrizeContent({ result, error }: { result: GameResult | null; error: string | null }) {
  if (error) {
    return (
      <View style={prize.wrap}>
        <Ionicons name="alert-circle" size={32} color="#EF4444" />
        <Text style={prize.errorText}>{error}</Text>
      </View>
    );
  }
  if (!result) {
    return (
      <View style={prize.wrap}>
        <ActivityIndicator color={Colors.brand.gold} size="small" />
        <Text style={prize.loadingText}>Rolling the balls…</Text>
      </View>
    );
  }
  if (!result.won || !result.prize) {
    return (
      <View style={prize.wrap}>
        <Text style={prize.missEmoji}>🎱</Text>
        <Text style={prize.missTitle}>No Pot This Time</Text>
        <Text style={prize.missSub}>Better luck tomorrow — the balls don't always drop!</Text>
      </View>
    );
  }
  return (
    <View style={prize.wrap}>
      <LinearGradient
        colors={[Colors.brand.gold, "#B8860B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={prize.winBadge}
      >
        <Ionicons name="trophy" size={28} color="#FFF" />
      </LinearGradient>
      <Text style={prize.winTitle}>{result.prize.name}</Text>
      {!!result.prize.description && (
        <Text style={prize.winDesc}>{result.prize.description}</Text>
      )}
      {!!result.pointsAwarded && (
        <View style={prize.pointsPill}>
          <Ionicons name="star" size={13} color={Colors.brand.gold} />
          <Text style={prize.pointsText}>+{result.pointsAwarded} points added</Text>
        </View>
      )}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScratchCardGame() {
  const { customer, getCustomerToken } = useCustomerAuth();
  const qc = useQueryClient();

  const { data: config, isLoading: cfgLoading } = useQuery<GameConfig>({
    queryKey: ["/api/game/config"],
    refetchInterval: 60_000,
  });

  const { data: myPlays, isLoading: playsLoading } = useQuery<{ playedToday: boolean }>({
    queryKey: ["/api/game/my-prizes"],
    enabled: !!customer,
  });

  // ── Card state ──────────────────────────────────────────────────────────────
  const [scratchStarted, setScratchStarted] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const [result, setResult]             = useState<GameResult | null>(null);
  const [gameError, setGameError]       = useState<string | null>(null);
  const [localPlayed, setLocalPlayed]   = useState(false);

  // Cell tracking — avoid stale-closure issues by using refs as the source of truth
  const [revealedCells, setRevealedCells] = useState<Set<number>>(new Set());
  const revealedRef     = useRef<Set<number>>(new Set());
  const thresholdRef    = useRef(false);
  const apiCalledRef    = useRef(false);

  // Scratch area absolute position (filled on first measure)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scratchViewRef  = useRef<any>(null);
  const measureRef      = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Overlay opacity — animates from 1 → 0 on full reveal
  const overlayAnim     = useRef(new Animated.Value(1)).current;

  // ── Derived ─────────────────────────────────────────────────────────────────
  const alreadyPlayed = localPlayed || (myPlays?.playedToday ?? false);
  const gameActive    = !!(config?.enabled && config?.withinWindow);
  const loading       = cfgLoading || playsLoading;

  // ── Reset when a new day arrives (alreadyPlayed flips to false) ──────────────
  useEffect(() => {
    if (!localPlayed && !(myPlays?.playedToday)) {
      revealedRef.current = new Set();
      thresholdRef.current = false;
      apiCalledRef.current = false;
      setRevealedCells(new Set());
      setScratchStarted(false);
      setOverlayGone(false);
      setResult(null);
      setGameError(null);
      overlayAnim.setValue(1);
    }
  }, [myPlays?.playedToday, localPlayed]);

  // ── Stable refs for pan-handler callbacks ────────────────────────────────────

  const resultRef      = useRef<GameResult | null>(null);
  const gameErrorRef   = useRef<string | null>(null);

  // ── Fully reveal the overlay (fade out) ──────────────────────────────────────
  const triggerReveal = useCallback(() => {
    if (thresholdRef.current) return;
    thresholdRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // Fill remaining cells instantly
    const full = new Set<number>();
    for (let i = 0; i < TOTAL; i++) full.add(i);
    revealedRef.current = full;
    setRevealedCells(full);
    Animated.timing(overlayAnim, {
      toValue: 0,
      duration: 380,
      useNativeDriver: true,
    }).start(() => setOverlayGone(true));
  }, [overlayAnim]);

  const triggerRevealRef = useRef(triggerReveal);
  triggerRevealRef.current = triggerReveal;

  // ── Call the game API ────────────────────────────────────────────────────────
  const callApi = useCallback(async () => {
    if (apiCalledRef.current) return;
    apiCalledRef.current = true;
    try {
      const res = await fetch(new URL("/api/game/play", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getCustomerToken() ? { Authorization: `Bearer ${getCustomerToken()}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setLocalPlayed(true);
          qc.invalidateQueries({ queryKey: ["/api/game/my-prizes"] });
        } else {
          const msg = data.message || "Something went wrong. Please try again.";
          setGameError(msg);
          gameErrorRef.current = msg;
        }
        triggerRevealRef.current();
        return;
      }
      const r = data as GameResult;
      setResult(r);
      resultRef.current = r;
      qc.invalidateQueries({ queryKey: ["/api/game/my-prizes"] });
      if (r.pointsAwarded) {
        qc.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
        // Bump home-screen points pill too
        qc.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
      }
      if (thresholdRef.current) {
        // Already revealed while waiting — just ensure haptic
        Haptics.notificationAsync(
          r.won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
        ).catch(() => {});
      }
    } catch {
      const msg = "Network error — please try again.";
      setGameError(msg);
      gameErrorRef.current = msg;
      triggerRevealRef.current();
    }
  }, [getCustomerToken, qc]);

  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;

  // ── Cell hit-test ────────────────────────────────────────────────────────────
  const handlePoint = useCallback((pageX: number, pageY: number) => {
    const m = measureRef.current;
    if (!m) return;
    const rx = pageX - m.x;
    const ry = pageY - m.y;
    if (rx < 0 || ry < 0 || rx > m.w || ry > m.h) return;
    const col = Math.floor((rx / m.w) * COLS);
    const row = Math.floor((ry / m.h) * ROWS);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    const idx = row * COLS + col;
    if (revealedRef.current.has(idx)) return;
    const next = new Set(revealedRef.current).add(idx);
    revealedRef.current = next;
    setRevealedCells(new Set(next));
    if (next.size % 3 === 0) {
      Haptics.selectionAsync().catch(() => {});
    }
    if (!thresholdRef.current && next.size / TOTAL >= REVEAL_THRESHOLD) {
      triggerRevealRef.current();
    }
  }, []);

  const handlePointRef = useRef(handlePoint);
  handlePointRef.current = handlePoint;

  // ── PanResponder ─────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (!apiCalledRef.current) {
          setScratchStarted(true);
          // Measure scratch area absolute position
          scratchViewRef.current?.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) => {
            measureRef.current = { x: px, y: py, w, h };
          });
          callApiRef.current();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        handlePointRef.current(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        handlePointRef.current(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderRelease: () => {
        // If user lifts finger before hitting threshold, wait 600 ms for API
        // then auto-reveal
        setTimeout(() => {
          if (!thresholdRef.current) {
            triggerRevealRef.current();
          }
        }, 600);
      },
    })
  ).current;

  // ── Guard renders ─────────────────────────────────────────────────────────────
  if (loading) return null;
  if (!config?.enabled) return null;

  // ── Already played today ──────────────────────────────────────────────────────
  if (alreadyPlayed) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.cardFrame}>
          <LinearGradient
            colors={[Colors.brand.dark, Colors.brand.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playedContainer}
          >
            <Text style={styles.eyebrow}>DAILY LUCKY BREAK</Text>
            <Text style={styles.playedEmoji}>🎱</Text>
            <Text style={styles.playedTitle}>You've played today!</Text>
            <Text style={styles.playedSub}>Come back tomorrow for another go.</Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  // ── Game not currently available (outside schedule) ───────────────────────────
  if (!gameActive) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.cardFrame}>
          <LinearGradient
            colors={[Colors.brand.dark, Colors.brand.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playedContainer}
          >
            <Text style={styles.eyebrow}>DAILY LUCKY BREAK</Text>
            <Ionicons name="time-outline" size={32} color={Colors.brand.gold} style={{ marginBottom: 8 }} />
            <Text style={styles.playedTitle}>Not available yet</Text>
            <Text style={styles.playedSub}>
              Back at{" "}
              <Text style={{ color: Colors.brand.gold, fontFamily: "Montserrat_700Bold" }}>
                {fmtTime(config?.windowStart || "00:00")}
              </Text>
              {" "}today
            </Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  // ── Main scratch card ─────────────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      {/* Card header */}
      <View style={styles.headerRow}>
        <LinearGradient
          colors={[Colors.brand.gold, "#B8860B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerBadge}
        >
          <Ionicons name="sparkles" size={13} color="#FFF" />
          <Text style={styles.headerBadgeText}>DAILY LUCKY BREAK</Text>
        </LinearGradient>
        <Text style={styles.headerSub}>Free • 1 per day</Text>
      </View>

      {/* Card body */}
      <View style={styles.cardFrame}>
        {/* Prize area — always rendered underneath */}
        <View style={styles.prizeArea}>
          <PrizeContent result={result} error={gameError} />
        </View>

        {/* Scratch overlay — fades out on reveal */}
        {!overlayGone && (
          <Animated.View
            style={[styles.overlayContainer, { opacity: overlayAnim }]}
            ref={scratchViewRef}
            onLayout={() => {
              scratchViewRef.current?.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) => {
                measureRef.current = { x: px, y: py, w, h };
              });
            }}
            {...panResponder.panHandlers}
          >
            {/* Silver scratch grid cells */}
            <View style={styles.grid} pointerEvents="none">
              {Array.from({ length: ROWS }, (_, row) =>
                Array.from({ length: COLS }, (_, col) => {
                  const idx = row * COLS + col;
                  const scratched = revealedCells.has(idx);
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.cell,
                        { width: `${100 / COLS}%`, height: `${100 / ROWS}%` },
                        scratched && styles.cellScratched,
                      ]}
                    />
                  );
                })
              )}
            </View>

            {/* Prompt shown before scratching starts */}
            {!scratchStarted && (
              <View style={styles.scratchPrompt} pointerEvents="none">
                <Ionicons name="finger-print" size={28} color={Colors.brand.gold} />
                <Text style={styles.scratchPromptText}>Scratch here</Text>
              </View>
            )}
          </Animated.View>
        )}
      </View>

      <Text style={styles.footer}>
        Available until {fmtTime(config?.windowEnd || "23:59")}
      </Text>
    </View>
  );
}

// ── Prize sub-styles ──────────────────────────────────────────────────────────

const prize = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  loadingText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.gold,
    marginTop: 6,
  },
  errorText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "#EF4444",
    textAlign: "center",
    marginTop: 6,
  },
  missEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  missTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.brand.gold,
    textAlign: "center",
  },
  missSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 18,
  },
  winBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  winTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.brand.gold,
    textAlign: "center",
  },
  winDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 18,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(212,168,67,0.18)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.35)",
  },
  pointsText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.gold,
  },
});

// ── Main styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  headerBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    color: "#FFF",
    letterSpacing: 0.8,
  },
  headerSub: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  cardFrame: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.brand.gold,
    height: 180,
    backgroundColor: Colors.brand.dark,
    // Elevation for Android
    ...Platform.select({
      android: { elevation: 6 },
      default: {
        shadowColor: Colors.brand.gold,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
    }),
  },
  prizeArea: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    backgroundColor: "#9E9E9E",
    borderWidth: 0.5,
    borderColor: "#BDBDBD",
  },
  cellScratched: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  scratchPrompt: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  scratchPromptText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.brand.gold,
    letterSpacing: 0.5,
  },
  // Played / unavailable states share this container
  playedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 6,
  },
  eyebrow: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 9,
    letterSpacing: 2,
    color: Colors.brand.gold,
    marginBottom: 4,
  },
  playedEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  playedTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 17,
    color: "#FFF",
    textAlign: "center",
  },
  playedSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
});
