/**
 * Staff Setup screen — hidden route for changing the kiosk exit PIN.
 *
 * Not linked from any customer-facing navigation. Only reachable after
 * successfully entering the current PIN from the attract screen.
 * Route: /staff-setup
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useKioskPin } from "@/hooks/useKioskPin";

const PIN_LENGTH = 4;

const PAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

function PinDots({ value, confirmed }: { value: string; confirmed?: boolean }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            i < value.length && (confirmed ? dotStyles.dotConfirmed : dotStyles.dotFilled),
          ]}
        />
      ))}
    </View>
  );
}

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

type Step = "new" | "confirm";

export default function StaffSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { updatePin, loading } = useKioskPin();

  const [step, setStep] = useState<Step>("new");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const activeEntry = step === "new" ? newPin : confirmPin;
  const setActiveEntry = step === "new" ? setNewPin : setConfirmPin;

  const handleKey = useCallback(
    (key: string) => {
      if (activeEntry.length >= PIN_LENGTH) return;
      const next = activeEntry + key;
      setActiveEntry(next);

      if (next.length === PIN_LENGTH) {
        if (step === "new") {
          setTimeout(() => setStep("confirm"), 200);
        } else {
          if (next === newPin) {
            updatePin(newPin).then(() => {
              Alert.alert("PIN updated", "Your new PIN has been saved.", [
                { text: "Done", onPress: () => router.replace("/") },
              ]);
            });
          } else {
            Alert.alert("PINs don't match", "Please try again.", [
              {
                text: "OK",
                onPress: () => {
                  setNewPin("");
                  setConfirmPin("");
                  setStep("new");
                },
              },
            ]);
          }
        }
      }
    },
    [activeEntry, step, newPin, updatePin, router, setActiveEntry]
  );

  const handleDelete = useCallback(() => {
    setActiveEntry((e: string) => e.slice(0, -1));
  }, [setActiveEntry]);

  const handleBack = useCallback(() => {
    if (step === "confirm") {
      setConfirmPin("");
      setStep("new");
    } else {
      router.replace("/");
    }
  }, [step, router]);

  if (loading) return null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.heading}>Change Exit PIN</Text>
      <Text style={styles.sub}>
        {step === "new"
          ? "Enter a new 4-digit PIN"
          : "Confirm your new PIN"}
      </Text>

      <PinDots
        value={step === "new" ? newPin : confirmPin}
        confirmed={step === "confirm"}
      />

      <NumPad onPress={handleKey} onDelete={handleDelete} />

      <Text style={styles.hint}>
        Default PIN is 1147. Keep this screen confidential.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: Colors.brand.dark,
    alignItems: "center",
    gap: 28,
    paddingHorizontal: 32,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: Colors.brand.gold,
    fontWeight: "600",
  },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  sub: {
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
    marginTop: -16,
  },
  hint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    maxWidth: 280,
  },
});

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: Colors.brand.gold,
    borderColor: Colors.brand.gold,
  },
  dotConfirmed: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyEmpty: {
    width: 80,
    height: 80,
  },
  keyPressed: {
    backgroundColor: Colors.brand.gold,
  },
  keyText: {
    fontSize: 30,
    fontWeight: "600",
    color: "#fff",
  },
});
