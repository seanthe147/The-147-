/**
 * KioskPinOverlay — full-screen PIN entry modal for staff to exit kiosk mode.
 *
 * Triggered by a 2-second long-press on the logo in the attract screen.
 * Correct PIN → choice between exiting the app, going to PIN setup,
 * or redeeming a prize code.
 * Wrong PIN → silent dismiss (no error shown to customer).
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  BackHandler,
  Platform,
  Linking,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const PIN_LENGTH = 4;

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onCorrect: () => void;
  checkPin: (candidate: string) => boolean;
}

function PinDots({ value }: { value: string }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[dotStyles.dot, i < value.length && dotStyles.dotFilled]}
        />
      ))}
    </View>
  );
}

const PAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

function NumPad({
  onPress,
  onDelete,
}: {
  onPress: (key: string) => void;
  onDelete: () => void;
}) {
  return (
    <View style={padStyles.grid}>
      {PAD_KEYS.map((row, ri) => (
        <View key={ri} style={padStyles.row}>
          {row.map((key, ki) => {
            if (key === "") return <View key={ki} style={padStyles.keyEmpty} />;
            return (
              <Pressable
                key={ki}
                style={({ pressed }) => [
                  padStyles.key,
                  pressed && padStyles.keyPressed,
                ]}
                onPress={() => (key === "⌫" ? onDelete() : onPress(key))}
              >
                <Text style={padStyles.keyText}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function KioskPinOverlay({ visible, onDismiss, onCorrect, checkPin }: Props) {
  const [entry, setEntry] = useState("");

  useEffect(() => {
    if (!visible) setEntry("");
  }, [visible]);

  const handleKey = useCallback(
    (key: string) => {
      if (entry.length >= PIN_LENGTH) return;
      const next = entry + key;
      setEntry(next);
      if (next.length === PIN_LENGTH) {
        if (checkPin(next)) {
          onCorrect();
        } else {
          setTimeout(() => {
            setEntry("");
            onDismiss();
          }, 120);
        }
      }
    },
    [entry, checkPin, onCorrect, onDismiss]
  );

  const handleDelete = useCallback(() => {
    setEntry((e) => e.slice(0, -1));
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <BlurView intensity={35} tint="dark" style={overlayStyles.blurFill}>
        <Pressable style={overlayStyles.backdrop} onPress={onDismiss}>
          <Pressable style={overlayStyles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={overlayStyles.title}>Staff Access</Text>
            <PinDots value={entry} />
            <NumPad onPress={handleKey} onDelete={handleDelete} />
          </Pressable>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

type StaffMode = "menu" | "redeem";
type RedeemStatus = "idle" | "loading" | "success" | "error";

/** Called after PIN is confirmed — shows Exit / Redeem Prize Code / Setup options. */
export function KioskExitActions({
  visible,
  onDismiss,
  onSetupPin,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSetupPin: () => void;
}) {
  const [mode, setMode] = useState<StaffMode>("menu");
  const [code, setCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<RedeemStatus>("idle");
  const [resultMsg, setResultMsg] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setMode("menu");
      setCode("");
      setRedeemStatus("idle");
      setResultMsg("");
    }
  }, [visible]);

  useEffect(() => {
    if (mode === "redeem") {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [mode]);

  const handleExit = useCallback(() => {
    if (Platform.OS === "android") {
      BackHandler.exitApp();
    } else {
      Linking.openURL("app-settings:");
    }
  }, []);

  const handleRedeem = useCallback(async () => {
    const trimmed = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (trimmed.length < 4) return;
    setRedeemStatus("loading");
    try {
      const res = await apiRequest("POST", "/api/kiosk/redeem-prize-code", { code: trimmed });
      const data = await res.json() as { prizeName: string; customerName: string | null };
      setRedeemStatus("success");
      setResultMsg(`✓ ${data.prizeName}${data.customerName ? ` for ${data.customerName}` : ""}`);
      setCode("");
    } catch (err: any) {
      setRedeemStatus("error");
      const raw: string = err?.message ?? "";
      setResultMsg(raw.replace(/^\d+:\s*/, "") || "Code not found or already redeemed");
    }
  }, [code]);

  const handleBackToMenu = useCallback(() => {
    setMode("menu");
    setCode("");
    setRedeemStatus("idle");
    setResultMsg("");
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <BlurView intensity={35} tint="dark" style={overlayStyles.blurFill}>
        <Pressable style={overlayStyles.backdrop} onPress={onDismiss}>
          <Pressable
            style={[overlayStyles.card, mode === "redeem" && overlayStyles.cardWide]}
            onPress={(e) => e.stopPropagation()}
          >
            {mode === "menu" ? (
              <>
                <Text style={overlayStyles.title}>Staff Menu</Text>
                <View style={actionStyles.btnGroup}>
                  <Pressable
                    style={({ pressed }) => [
                      actionStyles.btn,
                      actionStyles.btnGreen,
                      pressed && actionStyles.btnPressed,
                    ]}
                    onPress={() => setMode("redeem")}
                  >
                    <Text style={actionStyles.btnTextGreen}>🎟 Redeem Prize Code</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      actionStyles.btn,
                      actionStyles.btnPrimary,
                      pressed && actionStyles.btnPressed,
                    ]}
                    onPress={handleExit}
                  >
                    <Text style={actionStyles.btnTextPrimary}>
                      {Platform.OS === "android" ? "Exit App" : "Open Settings"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      actionStyles.btn,
                      actionStyles.btnSecondary,
                      pressed && actionStyles.btnPressed,
                    ]}
                    onPress={onSetupPin}
                  >
                    <Text style={actionStyles.btnTextSecondary}>Change PIN</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      actionStyles.btn,
                      actionStyles.btnGhost,
                      pressed && actionStyles.btnPressed,
                    ]}
                    onPress={onDismiss}
                  >
                    <Text style={actionStyles.btnTextGhost}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={overlayStyles.title}>Redeem Prize Code</Text>
                <Text style={redeemStyles.hint}>
                  Enter the 6-character code shown to the customer after winning
                </Text>

                <TextInput
                  ref={inputRef}
                  style={redeemStyles.codeInput}
                  value={code}
                  onChangeText={(t) => {
                    setCode(t.toUpperCase());
                    if (redeemStatus !== "idle") {
                      setRedeemStatus("idle");
                      setResultMsg("");
                    }
                  }}
                  placeholder="A B C 1 2 3"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  autoCapitalize="characters"
                  maxLength={8}
                  editable={redeemStatus !== "loading"}
                />

                {redeemStatus === "success" && (
                  <View style={redeemStyles.successBox}>
                    <Text style={redeemStyles.successText}>{resultMsg}</Text>
                  </View>
                )}
                {redeemStatus === "error" && (
                  <View style={redeemStyles.errorBox}>
                    <Text style={redeemStyles.errorText}>{resultMsg}</Text>
                  </View>
                )}

                <View style={actionStyles.btnGroup}>
                  {redeemStatus !== "success" && (
                    <Pressable
                      style={({ pressed }) => [
                        actionStyles.btn,
                        actionStyles.btnGreen,
                        (redeemStatus === "loading" || code.trim().length < 4) && { opacity: 0.45 },
                        pressed && actionStyles.btnPressed,
                      ]}
                      onPress={handleRedeem}
                      disabled={redeemStatus === "loading" || code.trim().length < 4}
                    >
                      {redeemStatus === "loading"
                        ? <ActivityIndicator color={Colors.brand.dark} />
                        : <Text style={actionStyles.btnTextGreen}>Redeem</Text>}
                    </Pressable>
                  )}
                  {redeemStatus === "success" && (
                    <Pressable
                      style={({ pressed }) => [
                        actionStyles.btn,
                        actionStyles.btnGreen,
                        pressed && actionStyles.btnPressed,
                      ]}
                      onPress={handleBackToMenu}
                    >
                      <Text style={actionStyles.btnTextGreen}>Redeem Another</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={({ pressed }) => [
                      actionStyles.btn,
                      actionStyles.btnGhost,
                      pressed && actionStyles.btnPressed,
                    ]}
                    onPress={handleBackToMenu}
                  >
                    <Text style={actionStyles.btnTextGhost}>← Back</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

const overlayStyles = StyleSheet.create({
  blurFill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  card: {
    backgroundColor: "rgba(10,22,40,0.82)",
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 24,
    minWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 24,
  },
  cardWide: {
    minWidth: 380,
    maxWidth: 460,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1,
  },
});

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: Colors.brand.gold,
    borderColor: Colors.brand.gold,
  },
});

const padStyles = StyleSheet.create({
  grid: {
    gap: 12,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  keyEmpty: {
    width: 72,
    height: 72,
  },
  keyPressed: {
    backgroundColor: Colors.brand.gold,
    borderColor: Colors.brand.gold,
  },
  keyText: {
    fontSize: 28,
    fontWeight: "600",
    color: "#fff",
  },
});

const actionStyles = StyleSheet.create({
  btnGroup: {
    width: "100%",
    gap: 12,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  btnPrimary: {
    backgroundColor: Colors.brand.gold,
    borderTopColor: "rgba(255,255,255,0.4)",
  },
  btnGreen: {
    backgroundColor: "#10B981",
    borderTopColor: "rgba(255,255,255,0.3)",
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  btnGhost: {
    backgroundColor: "transparent",
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnTextPrimary: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.brand.dark,
  },
  btnTextGreen: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.brand.dark,
  },
  btnTextSecondary: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  btnTextGhost: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
  },
});

const redeemStyles = StyleSheet.create({
  hint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    maxWidth: 300,
    marginTop: -12,
    lineHeight: 20,
  },
  codeInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    width: "100%",
  },
  successBox: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.4)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    alignItems: "center",
  },
  successText: {
    color: "#34D399",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    alignItems: "center",
  },
  errorText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
