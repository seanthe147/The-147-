import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/contexts/CartContext";
import { useKiosk } from "@/contexts/KioskContext";
import { useResponsive } from "@/hooks/useResponsive";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

function formatPrice(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

interface KioskCheckoutSheetProps {
  visible: boolean;
  onClose: () => void;
}

type Step = "cart" | "details" | "confirmation";

function NumPad({
  onPress,
  onBackspace,
}: {
  onPress: (digit: string) => void;
  onBackspace: () => void;
}) {
  const keys: (string | "back")[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <View style={padStyles.grid}>
      {keys.map((k, idx) => {
        if (k === "") return <View key={`spacer-${idx}`} style={padStyles.cell} />;
        if (k === "back") {
          return (
            <Pressable
              key="back"
              onPress={onBackspace}
              style={({ pressed }) => [padStyles.cell, padStyles.btn, padStyles.btnGhost, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="backspace-outline" size={32} color={Colors.brand.blue} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={k}
            onPress={() => onPress(k)}
            style={({ pressed }) => [padStyles.cell, padStyles.btn, pressed && { opacity: 0.7 }]}
          >
            <Text style={padStyles.btnText}>{k}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function KioskCheckoutSheet({ visible, onClose }: KioskCheckoutSheetProps) {
  const insets = useSafeAreaInsets();
  const { isTablet, isLandscape, width } = useResponsive(640);
  const contentMaxWidth = isTablet ? Math.min(width - 48, isLandscape ? 1100 : 760) : Math.min(width, 640);
  const useTwoColumn = isTablet && (isLandscape || width >= 900);
  const { items, updateQuantity, totalPrice, clearCart } = useCart();
  const { resetIdle, showAttract } = useKiosk();
  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    ticketNumber: number;
    appOrderId: number;
    terminalPushed: boolean;
  } | null>(null);

  const reset = useCallback(() => {
    setStep("cart");
    setName("");
    setTableNumber("");
    setPhone("");
    setSubmitting(false);
    setConfirmation(null);
  }, []);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  useEffect(() => {
    if (step !== "confirmation") return;
    const t = setTimeout(() => {
      clearCart();
      onClose();
      showAttract();
    }, 12_000);
    return () => clearTimeout(t);
  }, [step, clearCart, onClose, showAttract]);

  const canContinue = items.length > 0;
  const canSubmit =
    name.trim().length >= 2 &&
    /^\d+$/.test(tableNumber.trim()) &&
    Number(tableNumber.trim()) > 0;
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const url = new URL("/api/orders/kiosk-checkout", getApiUrl());
      const cleanPhone = phone.replace(/[^0-9+]/g, "");
      const payload = {
        items: items.map((i) => ({
          variationId: i.variationId,
          itemId: i.itemId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          ...(i.modifiers?.length ? { modifiers: i.modifiers } : {}),
        })),
        customerName: name.trim(),
        tableNumber: tableNumber.trim(),
        ...(cleanPhone.length >= 10 ? { customerPhone: cleanPhone } : {}),
      };
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        if (data?.terminalUnavailable) {
          Alert.alert(
            "Card payment unavailable",
            data?.message || "We couldn't reach the card terminal. Please order at the counter.",
            [{ text: "OK", onPress: () => { clearCart(); onClose(); showAttract(); } }]
          );
          return;
        }
        if (data?.kitchenClosed || data?.barClosed) {
          const title =
            data?.kitchenClosed && data?.barClosed
              ? "Kitchen & bar closed"
              : data?.barClosed
              ? "Bar closed"
              : "Kitchen closed";
          Alert.alert(title, data?.message || "Some items aren't available right now.");
          setStep("cart");
          return;
        }
        throw new Error(data?.message || "Could not send order. Please try again.");
      }
      setConfirmation({
        ticketNumber: Number(data.ticketNumber),
        appOrderId: Number(data.appOrderId),
        terminalPushed: !!data.terminalCheckoutPushed,
      });
      setStep("confirmation");
    } catch (err: any) {
      Alert.alert("Order Failed", err?.message || "Could not send order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderCartLine = (item: (typeof items)[number]) => {
    const linePrice =
      (item.price + (item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0)) * item.quantity;
    return (
      <View key={item.cartKey} style={[styles.line, isTablet && styles.lineTablet]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.lineName, isTablet && { fontSize: 20 }]}>{item.name}</Text>
          {item.modifiers && item.modifiers.length > 0 && (
            <Text style={[styles.lineMods, isTablet && { fontSize: 15 }]}>
              {item.modifiers.map((m) => m.name).join(", ")}
            </Text>
          )}
          <Text style={[styles.linePrice, isTablet && { fontSize: 18, marginTop: 8 }]}>
            {formatPrice(linePrice)}
          </Text>
        </View>
        <View style={[styles.qtyBox, isTablet && { gap: 18 }]}>
          <Pressable
            onPress={() => updateQuantity(item.cartKey, -1)}
            style={({ pressed }) => [styles.qtyBtn, isTablet && styles.qtyBtnTablet, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Ionicons name="remove" size={isTablet ? 28 : 20} color={Colors.brand.blue} />
          </Pressable>
          <Text style={[styles.qtyText, isTablet && { fontSize: 22, minWidth: 32 }]}>
            {item.quantity}
          </Text>
          <Pressable
            onPress={() => updateQuantity(item.cartKey, 1)}
            style={({ pressed }) => [styles.qtyBtn, isTablet && styles.qtyBtnTablet, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Ionicons name="add" size={isTablet ? 28 : 20} color={Colors.brand.blue} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderCartStep = () => {
    if (items.length === 0) {
      return (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={88} color={Colors.light.textSecondary} />
          <Text style={[styles.emptyText, isTablet && { fontSize: 20 }]}>Your basket is empty</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, styles.primaryBtnTablet, { opacity: pressed ? 0.85 : 1, marginTop: 24 }]}
            onPress={onClose}
          >
            <Text style={[styles.primaryBtnText, { fontSize: 22 }]}>Back to menu</Text>
          </Pressable>
        </View>
      );
    }

    if (useTwoColumn) {
      return (
        <View style={styles.twoCol}>
          <View style={styles.twoColLeft}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingBottom: 24 }}>
              {items.map(renderCartLine)}
            </ScrollView>
          </View>
          <View style={styles.twoColRight}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>ORDER SUMMARY</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryRowLabel}>Items</Text>
                <Text style={styles.summaryRowValue}>{totalQty}</Text>
              </View>
              <View style={[styles.summaryRow, { marginTop: 8 }]}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>{formatPrice(totalPrice)}</Text>
              </View>
              <Pressable
                onPress={() => setStep("details")}
                disabled={!canContinue}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.primaryBtnTablet,
                  { opacity: !canContinue ? 0.5 : pressed ? 0.85 : 1, marginTop: 28 },
                ]}
              >
                <Text style={[styles.primaryBtnText, { fontSize: 22 }]}>Continue</Text>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.ghostBtn, styles.ghostBtnTablet, { opacity: pressed ? 0.7 : 1, marginTop: 12 }]}
              >
                <Ionicons name="add-circle-outline" size={22} color={Colors.brand.blue} />
                <Text style={[styles.ghostBtnText, { fontSize: 17 }]}>Add more items</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return (
      <>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          {items.map(renderCartLine)}
        </ScrollView>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatPrice(totalPrice)}</Text>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.brand.blue} />
            <Text style={styles.ghostBtnText}>Add more items</Text>
          </Pressable>
          <Pressable
            onPress={() => setStep("details")}
            disabled={!canContinue}
            style={({ pressed }) => [styles.primaryBtn, { opacity: !canContinue ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </View>
      </>
    );
  };

  const renderDetailsStep = () => {
    if (useTwoColumn) {
      return (
        <View style={styles.twoCol}>
          <ScrollView
            style={styles.twoColLeft}
            contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 8, paddingBottom: 24 }}
          >
            <Text style={[styles.sectionTitle, { fontSize: 22 }]}>Your name</Text>
            <Text style={[styles.sectionSub, { fontSize: 16 }]}>So we can call you when it's ready</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="First name"
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.bigInput, styles.bigInputTablet]}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={40}
            />
            <Text style={[styles.sectionTitle, { fontSize: 22, marginTop: 28 }]}>Member phone (optional)</Text>
            <Text style={[styles.sectionSub, { fontSize: 16 }]}>Add it to earn loyalty points on this order</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+\s]/g, ""))}
              placeholder="07…"
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.bigInput, styles.bigInputTablet]}
              keyboardType="phone-pad"
              returnKeyType="done"
              maxLength={16}
            />
            <View style={[styles.callout, { marginTop: 28, padding: 18 }]}>
              <Ionicons name="card-outline" size={28} color={Colors.brand.blue} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.calloutTitle, { fontSize: 16 }]}>Card payment only</Text>
                <Text style={[styles.calloutText, { fontSize: 15 }]}>
                  Tap, insert or swipe your card on the terminal at the counter. We'll bring your order to your table.
                </Text>
              </View>
            </View>
          </ScrollView>
          <View style={styles.twoColRight}>
            <View style={styles.padCard}>
              <Text style={[styles.sectionTitle, { fontSize: 22, marginTop: 0 }]}>Table number</Text>
              <Text style={[styles.sectionSub, { fontSize: 15 }]}>Tap the number on your table card</Text>
              <View style={styles.tableDisplay}>
                <Text style={styles.tableDisplayText}>
                  {tableNumber || <Text style={{ color: Colors.light.textSecondary }}>—</Text>}
                </Text>
              </View>
              <NumPad
                onPress={(d) => {
                  if (tableNumber.length >= 3) return;
                  if (tableNumber.length === 0 && d === "0") return;
                  setTableNumber(tableNumber + d);
                }}
                onBackspace={() => setTableNumber((t) => t.slice(0, -1))}
              />
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.primaryBtnTablet,
                  { opacity: !canSubmit || submitting ? 0.5 : pressed ? 0.85 : 1, marginTop: 20 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[styles.primaryBtnText, { fontSize: 22 }]}>Pay by card</Text>
                    <Ionicons name="card-outline" size={24} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Text style={styles.sectionTitle}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="First name"
          placeholderTextColor={Colors.light.textSecondary}
          style={styles.bigInput}
          autoCapitalize="words"
          maxLength={40}
        />
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Table number</Text>
        <TextInput
          value={tableNumber}
          onChangeText={(t) => setTableNumber(t.replace(/[^0-9]/g, ""))}
          placeholder="e.g. 12"
          placeholderTextColor={Colors.light.textSecondary}
          style={[styles.bigInput, { textAlign: "center", letterSpacing: 4, fontSize: 32 }]}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          style={({ pressed }) => [styles.primaryBtn, { opacity: !canSubmit || submitting ? 0.5 : pressed ? 0.85 : 1, marginTop: 24 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>Pay by card</Text>
              <Ionicons name="card-outline" size={20} color="#fff" />
            </>
          )}
        </Pressable>
      </ScrollView>
    );
  };

  const renderConfirmationStep = () => {
    if (!confirmation) return null;
    return (
      <View style={[styles.confirmWrap, isTablet && { padding: 48 }]}>
        <View style={[styles.confirmCheck, isTablet && { width: 128, height: 128, borderRadius: 64 }]}>
          <Ionicons name="checkmark" size={isTablet ? 88 : 64} color="#fff" />
        </View>
        <Text style={[styles.confirmHeading, isTablet && { fontSize: 40, marginTop: 28 }]}>
          Order received
        </Text>
        <Text style={[styles.confirmSub, isTablet && { fontSize: 22, marginTop: 14, maxWidth: 640 }]}>
          Tap, insert or swipe your card on the terminal at the counter
        </Text>
        <View style={[styles.ticketBox, isTablet && styles.ticketBoxTablet]}>
          <Text style={[styles.ticketLabel, isTablet && { fontSize: 14, letterSpacing: 4 }]}>
            YOUR ORDER NUMBER
          </Text>
          <Text style={[styles.ticketNumber, isTablet && { fontSize: 220, lineHeight: 240 }]}>
            {confirmation.ticketNumber}
          </Text>
        </View>
        <Text style={[styles.confirmFooter, isTablet && { fontSize: 16 }]}>
          Closing automatically in a few seconds…
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            isTablet && styles.primaryBtnTablet,
            { opacity: pressed ? 0.85 : 1, marginTop: 28 },
          ]}
          onPress={() => {
            clearCart();
            onClose();
            showAttract();
          }}
        >
          <Text style={[styles.primaryBtnText, isTablet && { fontSize: 22 }]}>Done</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <Pressable style={{ flex: 1 }} onTouchStart={() => resetIdle()}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flex: 1, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }}>
              {step !== "confirmation" && (
                <View style={[styles.header, isTablet && styles.headerTablet]}>
                  {step === "details" ? (
                    <Pressable onPress={() => setStep("cart")} hitSlop={12}>
                      <Ionicons name="chevron-back" size={isTablet ? 36 : 28} color={Colors.light.text} />
                    </Pressable>
                  ) : (
                    <View style={{ width: isTablet ? 36 : 28 }} />
                  )}
                  <Text style={[styles.headerTitle, isTablet && { fontSize: 26 }]}>
                    {step === "cart" ? "Your order" : "Your details"}
                  </Text>
                  <Pressable onPress={onClose} hitSlop={12}>
                    <Ionicons name="close" size={isTablet ? 36 : 28} color={Colors.light.text} />
                  </Pressable>
                </View>
              )}

              <View style={{ flex: 1 }}>
                {step === "cart" && renderCartStep()}
                {step === "details" && renderDetailsStep()}
                {step === "confirmation" && renderConfirmationStep()}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTablet: { paddingHorizontal: 28, paddingBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.light.text },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  lineTablet: { paddingVertical: 18 },
  lineName: { fontSize: 16, fontWeight: "600", color: Colors.light.text },
  lineMods: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  linePrice: { fontSize: 15, fontWeight: "700", color: Colors.brand.blue, marginTop: 4 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.light.surfaceElevated, alignItems: "center", justifyContent: "center" },
  qtyBtnTablet: { width: 52, height: 52, borderRadius: 26 },
  qtyText: { fontSize: 18, fontWeight: "700", color: Colors.light.text, minWidth: 24, textAlign: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.light.border },
  totalLabel: { fontSize: 18, fontWeight: "600", color: Colors.light.text },
  totalAmount: { fontSize: 24, fontWeight: "800", color: Colors.brand.blue },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 18, color: Colors.light.textSecondary },
  twoCol: { flex: 1, flexDirection: "row" },
  twoColLeft: { flex: 1 },
  twoColRight: { width: 340, borderLeftWidth: 1, borderLeftColor: Colors.light.border, padding: 24 },
  summaryCard: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 24, gap: 4 },
  summaryLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 2, color: Colors.light.textSecondary, marginBottom: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryRowLabel: { fontSize: 16, color: Colors.light.text },
  summaryRowValue: { fontSize: 16, fontWeight: "600", color: Colors.light.text },
  summaryTotalLabel: { fontSize: 20, fontWeight: "700", color: Colors.light.text },
  summaryTotalValue: { fontSize: 24, fontWeight: "800", color: Colors.brand.blue },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, marginBottom: 4 },
  sectionSub: { fontSize: 14, color: Colors.light.textSecondary, marginBottom: 12 },
  bigInput: { backgroundColor: Colors.light.surface, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, color: Colors.light.text },
  bigInputTablet: { fontSize: 22, paddingVertical: 18, paddingHorizontal: 20 },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14 },
  calloutTitle: { fontSize: 14, fontWeight: "700", color: Colors.brand.blue, marginBottom: 2 },
  calloutText: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  padCard: { flex: 1, alignItems: "center" },
  tableDisplay: { width: 180, height: 90, borderWidth: 2, borderColor: Colors.brand.blue, borderRadius: 16, alignItems: "center", justifyContent: "center", marginVertical: 16 },
  tableDisplayText: { fontSize: 48, fontWeight: "800", color: Colors.light.text, letterSpacing: 4 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24 },
  primaryBtnTablet: { paddingVertical: 20, borderRadius: 18 },
  primaryBtnText: { fontSize: 18, fontWeight: "700", color: "#fff" },
  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  ghostBtnTablet: { paddingVertical: 18, borderRadius: 18 },
  ghostBtnText: { fontSize: 16, fontWeight: "600", color: Colors.brand.blue },
  confirmWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCheck: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.brand.blue, alignItems: "center", justifyContent: "center" },
  confirmHeading: { fontSize: 32, fontWeight: "800", color: Colors.light.text, marginTop: 20 },
  confirmSub: { fontSize: 18, color: Colors.light.textSecondary, textAlign: "center", marginTop: 10, maxWidth: 480 },
  ticketBox: { alignItems: "center", marginTop: 12 },
  ticketBoxTablet: { marginTop: 8 },
  ticketLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 3, color: Colors.light.textSecondary },
  ticketNumber: { fontSize: 140, fontWeight: "800", color: Colors.brand.blue, lineHeight: 160 },
  confirmFooter: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 12 },
});

const padStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", width: 280, gap: 10 },
  cell: { width: 80, height: 80 },
  btn: { borderRadius: 16, backgroundColor: Colors.light.surfaceElevated, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: Colors.light.border },
  btnText: { fontSize: 28, fontWeight: "700", color: Colors.light.text },
});
