/**
 * ScratchCardGame — v2
 *
 * Uses react-native-svg with an SVG Mask to create genuine finger-scratch
 * feel: a metallic silver overlay has circular holes cut out wherever the
 * finger has moved, revealing the prize underneath.  No square grid cells.
 *
 * States: idle → scratching → [won | no_prize | already_played | error]
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
  LayoutChangeEvent,
} from "react-native";
import Svg, {
  Defs,
  Mask,
  Rect,
  Circle,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Radius of the scratch "brush" in logical pixels */
const BRUSH_RADIUS = 22;

/**
 * Fraction of the card surface that must be scratched before the overlay
 * fully fades out and the prize is revealed.
 */
const REVEAL_THRESHOLD = 0.38;

/**
 * Coarse coverage grid — used only to estimate what percentage of the card
 * has been scratched, so we know when to trigger the full reveal.
 */
const GRID_COLS = 30;
const GRID_ROWS = 18;

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
  giftCardGan: string | null;
  playId: number;
  squareRewardIssued?: boolean;
  squareGroupAdded?: boolean;
}

interface ScratchPoint {
  x: number;
  y: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, "0")}${suffix}`;
}

// ── Prize reveal content ───────────────────────────────────────────────────────

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
      {!!result.giftCardGan && (
        <View style={prize.giftCardBox}>
          <Ionicons name="card" size={14} color="#6366F1" />
          <View style={prize.giftCardTextCol}>
            <Text style={prize.giftCardLabel}>Square Gift Card</Text>
            <Text style={prize.giftCardGan}>{result.giftCardGan}</Text>
            <Text style={prize.giftCardHint}>Show this number at the bar to redeem</Text>
          </View>
        </View>
      )}
      {result.prize.prizeType === "reward_tier" && result.squareRewardIssued && (
        <View style={prize.claimBox}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" />
          <View style={prize.claimTextCol}>
            <Text style={prize.claimLabel}>Added to your loyalty account</Text>
            <Text style={prize.claimHint}>It'll appear automatically next time you pay at the bar</Text>
          </View>
        </View>
      )}
      {result.prize.prizeType === "reward_tier" && !result.squareRewardIssued && (
        <View style={prize.claimBox}>
          <Ionicons name="ticket-outline" size={16} color="#059669" />
          <View style={prize.claimTextCol}>
            <Text style={prize.claimLabel}>Show this screen to staff to claim</Text>
            <Text style={prize.claimRef}>Ref #{result.playId.toString().padStart(5, "0")}</Text>
          </View>
        </View>
      )}
      {result.prize.prizeType === "customer_group" && result.squareGroupAdded && (
        <View style={prize.claimBox}>
          <Ionicons name="pricetag" size={16} color="#EC4899" />
          <View style={prize.claimTextCol}>
            <Text style={prize.claimLabel}>Discount applied to your account</Text>
            <Text style={prize.claimHint}>Just pay at the bar — your discount fires automatically. One transaction only.</Text>
          </View>
        </View>
      )}
      {result.prize.prizeType === "customer_group" && !result.squareGroupAdded && (
        <View style={prize.claimBox}>
          <Ionicons name="ticket-outline" size={16} color="#EC4899" />
          <View style={prize.claimTextCol}>
            <Text style={prize.claimLabel}>Show this screen to staff to apply your discount</Text>
            <Text style={prize.claimRef}>Ref #{result.playId.toString().padStart(5, "0")}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Scratch overlay (SVG) ─────────────────────────────────────────────────────

/**
 * Renders the metallic silver scratch surface as an SVG with a Mask.
 * Black circles punched into the mask correspond to places the finger
 * has touched — those areas become transparent, revealing the prize below.
 */
function ScratchOverlay({
  points,
  cardW,
  cardH,
  overlayOpacity,
}: {
  points: ScratchPoint[];
  cardW: number;
  cardH: number;
  overlayOpacity: Animated.Value;
}) {
  if (cardW === 0 || cardH === 0) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
      pointerEvents="none"
    >
      <Svg width={cardW} height={cardH} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Silver metallic gradient */}
          <SvgLinearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%"   stopColor="#CACACA" stopOpacity="1" />
            <Stop offset="25%"  stopColor="#EEEEEE" stopOpacity="1" />
            <Stop offset="50%"  stopColor="#AFAFAF" stopOpacity="1" />
            <Stop offset="75%"  stopColor="#DCDCDC" stopOpacity="1" />
            <Stop offset="100%" stopColor="#BEBEBE" stopOpacity="1" />
          </SvgLinearGradient>

          {/*
            Scratch mask:
            - White rect  = silver overlay is VISIBLE
            - Black circles at each scratch point = those areas are TRANSPARENT
          */}
          <Mask id="scratchMask" x="0" y="0" width={cardW} height={cardH}>
            <Rect x="0" y="0" width={cardW} height={cardH} fill="white" />
            {points.map((pt, i) => (
              <Circle key={i} cx={pt.x} cy={pt.y} r={BRUSH_RADIUS} fill="black" />
            ))}
          </Mask>
        </Defs>

        {/* Silver surface with scratch holes cut out via the mask */}
        <Rect
          x="0"
          y="0"
          width={cardW}
          height={cardH}
          fill="url(#silverGrad)"
          mask="url(#scratchMask)"
        />
      </Svg>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScratchCardGame({
  onScratchStart,
  onScratchEnd,
}: {
  onScratchStart?: () => void;
  onScratchEnd?: () => void;
} = {}) {
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

  // ── Card dimensions (from onLayout) ─────────────────────────────────────
  const [cardW, setCardW] = useState(0);
  const [cardH, setCardH] = useState(0);
  const cardSizeRef = useRef({ w: 0, h: 0 });

  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCardW(width);
    setCardH(height);
    cardSizeRef.current = { w: width, h: height };
  }, []);

  // ── Scratch state ────────────────────────────────────────────────────────
  const [scratchStarted, setScratchStarted] = useState(false);
  const [overlayGone, setOverlayGone]       = useState(false);
  const [result, setResult]                 = useState<GameResult | null>(null);
  const [gameError, setGameError]           = useState<string | null>(null);
  const [localPlayed, setLocalPlayed]       = useState(false);
  const [scratchPoints, setScratchPoints]   = useState<ScratchPoint[]>([]);

  // Refs — always-fresh values accessible inside PanResponder callbacks
  const scratchPointsRef = useRef<ScratchPoint[]>([]);
  const coveredCells     = useRef(new Set<number>());
  const thresholdRef     = useRef(false);
  const apiCalledRef     = useRef(false);
  const cardViewRef      = useRef<View>(null);
  const cardPosRef       = useRef<{ x: number; y: number } | null>(null);
  const overlayAnim      = useRef(new Animated.Value(1)).current;

  // ── Derived ──────────────────────────────────────────────────────────────
  // Use apiCalledRef (set synchronously on first touch) instead of the
  // scratchStarted state (which is async and may not be committed before the
  // query invalidation refetch returns playedToday=true). Without this, there
  // is a race condition where the "already played" screen appears mid-scratch.
  const alreadyPlayed = localPlayed || (!apiCalledRef.current && (myPlays?.playedToday ?? false));
  const gameActive    = !!(config?.enabled && config?.withinWindow);
  const loading       = cfgLoading || playsLoading;

  // ── Reset when a new day arrives ─────────────────────────────────────────
  // Guard with !apiCalledRef.current so mid-scratch query refetches can never
  // wipe the scratch state. The reset is only needed between days (when the
  // user hasn't yet interacted with today's card).
  useEffect(() => {
    if (!localPlayed && !(myPlays?.playedToday) && !apiCalledRef.current) {
      scratchPointsRef.current = [];
      coveredCells.current.clear();
      thresholdRef.current = false;
      apiCalledRef.current = false;
      setScratchPoints([]);
      setScratchStarted(false);
      setOverlayGone(false);
      setResult(null);
      setGameError(null);
      overlayAnim.setValue(1);
      cardPosRef.current = null;
    }
  }, [myPlays?.playedToday, localPlayed]);

  // ── Full reveal — fade out silver overlay ────────────────────────────────
  const triggerReveal = useCallback(() => {
    if (thresholdRef.current) return;
    thresholdRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Animated.timing(overlayAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setOverlayGone(true));
  }, [overlayAnim]);

  const triggerRevealRef = useRef(triggerReveal);
  triggerRevealRef.current = triggerReveal;

  // Keep scratch-lock callbacks fresh inside the PanResponder closure
  const onScratchStartRef = useRef(onScratchStart ?? (() => {}));
  onScratchStartRef.current = onScratchStart ?? (() => {});
  const onScratchEndRef = useRef(onScratchEnd ?? (() => {}));
  onScratchEndRef.current = onScratchEnd ?? (() => {});

  // ── API call ─────────────────────────────────────────────────────────────
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
        }
        triggerRevealRef.current();
        return;
      }
      const r = data as GameResult;
      setResult(r);
      qc.invalidateQueries({ queryKey: ["/api/game/my-prizes"] });
      if (r.pointsAwarded) {
        qc.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
      }
      if (thresholdRef.current) {
        Haptics.notificationAsync(
          r.won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
        ).catch(() => {});
      }
    } catch {
      setGameError("Network error — please try again.");
      triggerRevealRef.current();
    }
  }, [getCustomerToken, qc]);

  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;

  // ── Handle each touch point ───────────────────────────────────────────────
  const handlePoint = useCallback((pageX: number, pageY: number) => {
    // Ensure we have the card's absolute screen position
    if (!cardPosRef.current) return;

    const { w, h } = cardSizeRef.current;
    const { x: ox, y: oy } = cardPosRef.current;
    const lx = pageX - ox;
    const ly = pageY - oy;

    // Skip if well outside the card
    if (lx < -BRUSH_RADIUS || ly < -BRUSH_RADIUS || lx > w + BRUSH_RADIUS || ly > h + BRUSH_RADIUS) return;

    // Skip if too close to the previous point (avoids redundant SVG circles)
    const pts = scratchPointsRef.current;
    const last = pts[pts.length - 1];
    if (last) {
      const dx = lx - last.x;
      const dy = ly - last.y;
      if (dx * dx + dy * dy < 36) return; // less than 6 px apart
    }

    if (pts.length % 4 === 0) {
      Haptics.selectionAsync().catch(() => {});
    }

    const next = [...pts, { x: lx, y: ly }];
    scratchPointsRef.current = next;
    setScratchPoints(next);

    // Coverage tracking via a coarse grid
    if (!thresholdRef.current && w > 0 && h > 0) {
      const cellW = w / GRID_COLS;
      const cellH = h / GRID_ROWS;
      const bw = BRUSH_RADIUS / cellW;
      const bh = BRUSH_RADIUS / cellH;
      const cc = lx / cellW;
      const cr = ly / cellH;
      const c0 = Math.max(0, Math.floor(cc - bw));
      const c1 = Math.min(GRID_COLS - 1, Math.ceil(cc + bw));
      const r0 = Math.max(0, Math.floor(cr - bh));
      const r1 = Math.min(GRID_ROWS - 1, Math.ceil(cr + bh));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          coveredCells.current.add(r * GRID_COLS + c);
        }
      }
      if (coveredCells.current.size / (GRID_COLS * GRID_ROWS) >= REVEAL_THRESHOLD) {
        triggerRevealRef.current();
      }
    }
  }, []);

  const handlePointRef = useRef(handlePoint);
  handlePointRef.current = handlePoint;

  // ── PanResponder ─────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      // Claim the touch immediately so the parent ScrollView never gets it
      onStartShouldSetPanResponder:         () => true,
      onMoveShouldSetPanResponder:          () => true,
      onStartShouldSetPanResponderCapture:  () => true,
      onMoveShouldSetPanResponderCapture:   () => true,
      onPanResponderGrant: (evt) => {
        // Tell the parent ScrollView to freeze while the user scratches
        onScratchStartRef.current();
        // Measure the card's screen position on the very first touch
        cardViewRef.current?.measure((_x, _y, _w, _h, px, py) => {
          cardPosRef.current = { x: px, y: py };
          // Process the touch now that we have a position
          handlePointRef.current(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        });
        if (!apiCalledRef.current) {
          setScratchStarted(true);
          callApiRef.current();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      },
      onPanResponderMove: (evt) => {
        // Re-measure on every move so a ScrollView scroll between the initial
        // touch and now doesn't cause the brush to appear offset/jumping.
        cardViewRef.current?.measure((_x, _y, _w, _h, px, py) => {
          cardPosRef.current = { x: px, y: py };
          handlePointRef.current(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        });
      },
      onPanResponderRelease: () => {
        // Re-enable scroll as soon as the finger lifts
        onScratchEndRef.current();
        // Give the API up to 600 ms; auto-reveal if threshold not yet hit
        setTimeout(() => {
          if (!thresholdRef.current) triggerRevealRef.current();
        }, 600);
      },
      onPanResponderTerminate: () => {
        // iOS can steal the responder (e.g. system gesture); re-enable scroll
        onScratchEndRef.current();
      },
    })
  ).current;

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (loading)          return null;
  if (!config?.enabled) return null;

  // ── Already played today ──────────────────────────────────────────────────
  if (alreadyPlayed) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.wrapperLabel}>
          <Ionicons name="star" size={13} color={Colors.brand.gold} />
          <Text style={styles.wrapperLabelText}>TODAY'S LUCKY BREAK</Text>
        </View>
        <View style={styles.cardFrame}>
          <LinearGradient
            colors={[Colors.brand.dark, Colors.brand.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.stateContainer}
          >
            <Text style={styles.eyebrow}>DAILY LUCKY BREAK</Text>
            <Text style={styles.stateEmoji}>🎱</Text>
            <Text style={styles.stateTitle}>You've played today!</Text>
            <Text style={styles.stateSub}>Come back tomorrow for another go.</Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  // ── Outside schedule window ───────────────────────────────────────────────
  if (!gameActive) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.wrapperLabel}>
          <Ionicons name="star" size={13} color={Colors.brand.gold} />
          <Text style={styles.wrapperLabelText}>TODAY'S LUCKY BREAK</Text>
        </View>
        <View style={styles.cardFrame}>
          <LinearGradient
            colors={[Colors.brand.dark, Colors.brand.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.stateContainer}
          >
            <Text style={styles.eyebrow}>DAILY LUCKY BREAK</Text>
            <Ionicons name="time-outline" size={32} color={Colors.brand.gold} style={{ marginBottom: 8 }} />
            <Text style={styles.stateTitle}>Not available yet</Text>
            <Text style={styles.stateSub}>
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

  // ── Active scratch card ───────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      <View style={styles.wrapperLabel}>
        <Ionicons name="star" size={13} color={Colors.brand.gold} />
        <Text style={styles.wrapperLabelText}>TODAY'S LUCKY BREAK</Text>
      </View>
      {/* Badge + subtitle row */}
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
        <Text style={styles.headerSub}>Free · 1 per day</Text>
      </View>

      {/* Card body */}
      <View
        ref={cardViewRef}
        style={styles.cardFrame}
        onLayout={onCardLayout}
        {...(!overlayGone ? panResponder.panHandlers : {})}
      >
        {/* Prize area — always rendered beneath the scratch surface */}
        <View style={StyleSheet.absoluteFill}>
          <PrizeContent result={result} error={gameError} />
        </View>

        {/* SVG metallic scratch overlay */}
        {!overlayGone && (
          <ScratchOverlay
            points={scratchPoints}
            cardW={cardW}
            cardH={cardH}
            overlayOpacity={overlayAnim}
          />
        )}

        {/* "Scratch here" prompt — only before the first touch */}
        {!overlayGone && !scratchStarted && (
          <View style={styles.scratchPrompt} pointerEvents="none">
            <Ionicons name="finger-print" size={30} color={Colors.brand.gold} />
            <Text style={styles.scratchPromptText}>Scratch here</Text>
          </View>
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
  missEmoji: { fontSize: 36, lineHeight: 44 },
  missTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.brand.gold, textAlign: "center" },
  missSub:   { fontFamily: "Montserrat_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 18 },
  winBadge: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  winTitle:   { fontFamily: "Montserrat_700Bold", fontSize: 20, color: Colors.brand.gold, textAlign: "center" },
  winDesc:    { fontFamily: "Montserrat_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 18 },
  pointsPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(212,168,67,0.18)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5, marginTop: 4,
    borderWidth: 1, borderColor: "rgba(212,168,67,0.35)",
  },
  pointsText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.brand.gold },
  giftCardBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8,
    backgroundColor: "rgba(99,102,241,0.14)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(99,102,241,0.35)",
    alignSelf: "stretch",
  },
  giftCardTextCol: { flex: 1, gap: 2 },
  giftCardLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 11, color: "#818CF8", letterSpacing: 0.5 },
  giftCardGan:   { fontFamily: "Montserrat_700Bold", fontSize: 18, color: "#fff", letterSpacing: 2 },
  giftCardHint:  { fontFamily: "Montserrat_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)" },
  claimBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8,
    backgroundColor: "rgba(5,150,105,0.15)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(5,150,105,0.4)",
    alignSelf: "stretch",
  },
  claimTextCol: { flex: 1, gap: 3 },
  claimLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: "#34D399" },
  claimRef:   { fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#fff", letterSpacing: 1.5 },
  claimHint:  { fontFamily: "Montserrat_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 15 },
});

// ── Main styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.brand.gold,
    backgroundColor: "rgba(212,168,67,0.07)",
    padding: 12,
    ...Platform.select({
      android: { elevation: 12 },
      default: {
        shadowColor: Colors.brand.gold,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 22,
      },
    }),
  },
  wrapperLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  wrapperLabelText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.brand.gold,
    letterSpacing: 1.5,
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
    borderRadius: 14,
    overflow: "hidden",
    height: 210,
    backgroundColor: Colors.brand.dark,
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
  stateContainer: {
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
  stateEmoji: { fontSize: 36, lineHeight: 44 },
  stateTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 17,
    color: "#FFF",
    textAlign: "center",
  },
  stateSub: {
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
