/**
 * KioskPinOverlay — full-screen PIN entry modal for staff to exit kiosk mode.
 *
 * Triggered by a 2-second long-press on the logo in the attract screen.
 * Correct PIN → choice between exiting the app or going to the staff setup
 * screen to change the PIN.
 * Wrong PIN → silent dismiss (no error shown to customer).
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  BackHandler,
  Platform,
  Linking,
} from "react-native";
import Colors from "@/constants/colors";

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
      <Pressable style={overlayStyles.backdrop} onPress={onDismiss}>
        <Pressable style={overlayStyles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={overlayStyles.title}>Staff Access</Text>
          <PinDots value={entry} />
          <NumPad onPress={handleKey} onDelete={handleDelete} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Called after PIN is confirmed — shows Exit / Setup options. */
export function KioskExitActions({
  visible,
  onDismiss,
  onSetupPin,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSetupPin: () => void;
}) {
  const handleExit = useCallback(() => {
    if (Platform.OS === "android") {
      BackHandler.exitApp();
    } else {
      Linking.openURL("app-settings:");
    }
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={overlayStyles.backdrop} onPress={onDismiss}>
        <Pressable style={overlayStyles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={overlayStyles.title}>Staff Menu</Text>

          <View style={actionStyles.btnGroup}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const overlayStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: Colors.brand.navy,
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 24,
    minWidth: 320,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    marginTop: -16,
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
    borderColor: "rgba(255,255,255,0.3)",
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
  },
  keyEmpty: {
    width: 72,
    height: 72,
  },
  keyPressed: {
    backgroundColor: Colors.brand.gold,
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
  },
  btnPrimary: {
    backgroundColor: Colors.brand.gold,
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.12)",
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
