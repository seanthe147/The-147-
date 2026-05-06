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

// Custom on-screen numeric pad shown on iPad in the details step. Beats the
// cramped iOS keyboard popover for table-number entry — every key is a
// dedicated 88pt touch target so customers can type with a thumb without
// looking. Phone layout still uses the normal keyboard.
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
              testID="kiosk-numpad-back"
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
            testID={`kiosk-numpad-${k}`}
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
  // On iPad use up to 1100pt of width so the redesigned two-column layouts
  // can breathe; on phone keep the original 640pt cap.
  const contentMaxWidth = isTablet ? Math.min(width - 48, isLandscape ? 1100 : 760) : Math.min(width, 640);
  // Two-column cart + details only when there's enough horizontal room
  // (iPad in landscape, or a portrait iPad Pro). Portrait iPad mini and
  // every phone fall back to the existing single-column layout.
  const useTwoColumn = isTablet && (isLandscape || width >= 900);
  const { items, updateQuantity, totalPrice, clearCart } = useCart();
  const { resetIdle, showAttract } = useKiosk();
  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketNumber: number; appOrderId: number; terminalPushed: boolean } | null>(null);

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

  // After confirmation, auto-close + return to attract after 12s.
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
  const canSubmit = name.trim().length >= 2 && /^\d+$/.test(tableNumber.trim()) && Number(tableNumber.trim()) > 0;
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
        // Kitchen closed mid-flight → bounce back to the cart so the user
        // can drop the offending food items. The order screen behind the
        // sheet already greys those out via /api/ordering-status.
        if (data?.kitchenClosed || data?.barClosed) {
          const title = data?.kitchenClosed && data?.barClosed
            ? "Kitchen & bar closed"
            : data?.barClosed
              ? "Bar closed"
              : "Kitchen closed";
          Alert.alert(title, data?.message || "Some items aren't available right now. Please remove them from your basket.");
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

  const handleCancel = () => {
    if (submitting) return;
    onClose();
  };

  // ───────── Cart line (shared) ─────────
  const renderCartLine = (item: typeof items[number]) => {
    const linePrice = (item.price + (item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0)) * item.quantity;
    return (
      <View key={item.cartKey} style={[styles.line, isTablet && styles.lineTablet]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.lineName, isTablet && { fontSize: 20 }]}>{item.name}</Text>
          {item.modifiers && item.modifiers.length > 0 && (
            <Text style={[styles.lineMods, isTablet && { fontSize: 15 }]}>
              {item.modifiers.map((m) => m.name).join(", ")}
            </Text>
          )}
          <Text style={[styles.linePrice, isTablet && { fontSize: 18, marginTop: 8 }]}>{formatPrice(linePrice)}</Text>
        </View>
        <View style={[styles.qtyBox, isTablet && { gap: 18 }]}>
          <Pressable
            onPress={() => updateQuantity(item.cartKey, -1)}
            style={({ pressed }) => [styles.qtyBtn, isTablet && styles.qtyBtnTablet, pressed && { opacity: 0.7 }]}
            hitSlop={6}
            testID={`kiosk-dec-${item.variationId}`}
          >
            <Ionicons name="remove" size={isTablet ? 28 : 20} color={Colors.brand.blue} />
          </Pressable>
          <Text style={[styles.qtyText, isTablet && { fontSize: 22, minWidth: 32 }]}>{item.quantity}</Text>
          <Pressable
            onPress={() => updateQuantity(item.cartKey, 1)}
            style={({ pressed }) => [styles.qtyBtn, isTablet && styles.qtyBtnTablet, pressed && { opacity: 0.7 }]}
            hitSlop={6}
            testID={`kiosk-inc-${item.variationId}`}
          >
            <Ionicons name="add" size={isTablet ? 28 : 20} color={Colors.brand.blue} />
          </Pressable>
        </View>
      </View>
    );
  };

  // ───────── Cart step body ─────────
  const renderCartStep = () => {
    if (items.length === 0) {
      return (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={isTablet ? 88 : 56} color={Colors.light.textSecondary} />
          <Text style={[styles.emptyText, isTablet && { fontSize: 20 }]}>Your basket is empty</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, isTablet && styles.primaryBtnTablet, { opacity: pressed ? 0.85 : 1, marginTop: 24 }]}
            onPress={onClose}
            testID="kiosk-back-to-menu"
          >
            <Text style={[styles.primaryBtnText, isTablet && { fontSize: 22 }]}>Back to menu</Text>
          </Pressable>
        </View>
      );
    }

    if (useTwoColumn) {
      // Tablet two-column: items scroll on the left, sticky summary panel on the right.
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
                testID="kiosk-continue"
              >
                <Text style={[styles.primaryBtnText, { fontSize: 22 }]}>Continue</Text>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </Pressable>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.ghostBtn, styles.ghostBtnTablet, { opacity: pressed ? 0.7 : 1, marginTop: 12 }]}
                testID="kiosk-add-more"
              >
                <Ionicons name="add-circle-outline" size={22} color={Colors.brand.blue} />
                <Text style={[styles.ghostBtnText, { fontSize: 17 }]}>Add more items</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    // Phone / portrait-mini fallback — original single-column layout (with
    // slightly bigger touch targets when isTablet but useTwoColumn=false).
    return (
      <>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          {items.map(renderCartLine)}
        </ScrollView>

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, isTablet && { fontSize: 22 }]}>Total</Text>
          <Text style={[styles.totalAmount, isTablet && { fontSize: 30 }]}>{formatPrice(totalPrice)}</Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.ghostBtn, isTablet && styles.ghostBtnTablet, { opacity: pressed ? 0.7 : 1 }]}
            testID="kiosk-add-more"
          >
            <Ionicons name="add-circle-outline" size={isTablet ? 22 : 20} color={Colors.brand.blue} />
            <Text style={[styles.ghostBtnText, isTablet && { fontSize: 17 }]}>Add more items</Text>
          </Pressable>
          <Pressable
            onPress={() => setStep("details")}
            disabled={!canContinue}
            style={({ pressed }) => [
              styles.primaryBtn,
              isTablet && styles.primaryBtnTablet,
              { opacity: !canContinue ? 0.5 : pressed ? 0.85 : 1 },
            ]}
            testID="kiosk-continue"
          >
            <Text style={[styles.primaryBtnText, isTablet && { fontSize: 22 }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={isTablet ? 24 : 20} color="#fff" />
          </Pressable>
        </View>
      </>
    );
  };

  // ───────── Details step body ─────────
  const renderDetailsStep = () => {
    if (useTwoColumn) {
      // Tablet: form on the left, big number pad on the right.
      return (
        <View style={styles.twoCol}>
          <ScrollView style={styles.twoColLeft} contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 8, paddingBottom: 24 }}>
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
              testID="kiosk-name"
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
              testID="kiosk-phone"
            />

            <View style={[styles.callout, { marginTop: 28, padding: 18 }]}>
              <Ionicons name="cash-outline" size={28} color={Colors.brand.blue} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.calloutTitle, { fontSize: 16 }]}>Pay at the counter</Text>
                <Text style={[styles.calloutText, { fontSize: 15 }]}>
                  Take your order number to the bar to pay. We'll then bring your order to your table.
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
                  // Reject leading zeros so "007" can't end up as the table number.
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
                testID="kiosk-send-to-counter"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={[styles.primaryBtnText, { fontSize: 22 }]}>Send to counter</Text>
                    <Ionicons name="arrow-forward" size={24} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    // Phone / portrait-mini fallback — original keyboard-driven form.
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Text style={styles.sectionTitle}>Your name</Text>
        <Text style={styles.sectionSub}>So we can call you when it's ready</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="First name"
          placeholderTextColor={Colors.light.textSecondary}
          style={styles.bigInput}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={40}
          testID="kiosk-name"
        />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Table number</Text>
        <Text style={styles.sectionSub}>Type the number on your table card</Text>
        <TextInput
          value={tableNumber}
          onChangeText={(t) => setTableNumber(t.replace(/[^0-9]/g, ""))}
          placeholder="e.g. 12"
          placeholderTextColor={Colors.light.textSecondary}
          style={[styles.bigInput, { textAlign: "center", letterSpacing: 4, fontSize: 32 }]}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={3}
          testID="kiosk-table"
        />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Member phone (optional)</Text>
        <Text style={styles.sectionSub}>Add it to earn loyalty points on this order</Text>
        <TextInput
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/[^0-9+\s]/g, ""))}
          placeholder="07…"
          placeholderTextColor={Colors.light.textSecondary}
          style={styles.bigInput}
          keyboardType="phone-pad"
          returnKeyType="done"
          maxLength={16}
          testID="kiosk-phone"
        />

        <View style={styles.callout}>
          <Ionicons name="cash-outline" size={22} color={Colors.brand.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.calloutTitle}>Pay at the counter</Text>
            <Text style={styles.calloutText}>Take your order number to the bar to pay. We'll then bring your order to your table.</Text>
          </View>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          style={({ pressed }) => [
            styles.primaryBtn,
            { opacity: !canSubmit || submitting ? 0.5 : pressed ? 0.85 : 1, marginTop: 24 },
          ]}
          testID="kiosk-send-to-counter"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>Send to counter</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </Pressable>
      </ScrollView>
    );
  };

  // ───────── Confirmation step ─────────
  const renderConfirmationStep = () => {
    if (!confirmation) return null;
    return (
      <View style={[styles.confirmWrap, isTablet && { padding: 48 }]}>
        <View style={[styles.confirmCheck, isTablet && { width: 128, height: 128, borderRadius: 64 }]}>
          <Ionicons name="checkmark" size={isTablet ? 88 : 64} color="#fff" />
        </View>
        <Text style={[styles.confirmHeading, isTablet && { fontSize: 40, marginTop: 28 }]}>Order received</Text>
        <Text style={[styles.confirmSub, isTablet && { fontSize: 22, marginTop: 14, maxWidth: 640 }]}>
          {confirmation.terminalPushed
            ? "Tap, insert or swipe your card on the terminal at the counter"
            : "Take this number to the counter to pay"}
        </Text>
        <View style={[styles.ticketBox, isTablet && styles.ticketBoxTablet]}>
          <Text style={[styles.ticketLabel, isTablet && { fontSize: 14, letterSpacing: 4 }]}>YOUR ORDER NUMBER</Text>
          <Text style={[styles.ticketNumber, isTablet && { fontSize: 220, lineHeight: 240 }]}>{confirmation.ticketNumber}</Text>
        </View>
        {confirmation.terminalPushed && (
          <Text style={[styles.confirmHint, isTablet && { fontSize: 16, marginTop: 20 }]}>
            Show this number to staff if anything goes wrong with the terminal.
          </Text>
        )}
        <Text style={[styles.confirmFooter, isTablet && { fontSize: 16 }]}>Closing automatically in a few seconds…</Text>
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
          testID="kiosk-confirm-done"
        >
          <Text style={[styles.primaryBtnText, isTablet && { fontSize: 22 }]}>Done</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <Pressable
        style={{ flex: 1 }}
        onTouchStart={() => resetIdle()}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flex: 1, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }}>
              {step !== "confirmation" && (
                <View style={[styles.header, isTablet && styles.headerTablet]}>
                  {step === "details" ? (
                    <Pressable onPress={() => setStep("cart")} hitSlop={12} testID="kiosk-back">
                      <Ionicons name="chevron-back" size={isTablet ? 36 : 28} color={Colors.light.text} />
                    </Pressable>
                  ) : (
                    <View style={{ width: isTablet ? 36 : 28 }} />
                  )}
                  <Text style={[styles.title, isTablet && { fontSize: 28 }]}>
                    {step === "cart" ? "Your Order" : "Almost done"}
                  </Text>
                  <Pressable onPress={handleCancel} hitSlop={12} testID="kiosk-close">
                    <Ionicons name="close" size={isTablet ? 36 : 28} color={Colors.light.text} />
                  </Pressable>
                </View>
              )}

              {step === "cart" && renderCartStep()}
              {step === "details" && renderDetailsStep()}
              {step === "confirmation" && renderConfirmationStep()}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  headerTablet: { paddingHorizontal: 32, paddingBottom: 18 },
  title: { fontSize: 22, fontWeight: "700" as const, color: Colors.light.text },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 16, marginTop: 12 },

  // Two-column shell — used on iPad landscape & wide portrait.
  twoCol: { flex: 1, flexDirection: "row" as const, paddingTop: 12 },
  twoColLeft: { flex: 1.4, borderRightWidth: 1, borderRightColor: "#F1F5F9" },
  twoColRight: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },

  // Sticky summary panel on the right side of the cart step.
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryLabel: { fontSize: 12, letterSpacing: 3, fontWeight: "700" as const, color: Colors.light.textSecondary, marginBottom: 14 },
  summaryRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "baseline" as const },
  summaryRowLabel: { fontSize: 16, color: Colors.light.textSecondary },
  summaryRowValue: { fontSize: 16, color: Colors.light.text, fontWeight: "600" as const },
  summaryTotalLabel: { fontSize: 22, color: Colors.light.text, fontWeight: "700" as const },
  summaryTotalValue: { fontSize: 32, color: Colors.light.text, fontWeight: "700" as const },

  // Number pad host (right column on the details step).
  padCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tableDisplay: {
    marginTop: 14,
    backgroundColor: "#0A1628",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center" as const,
  },
  tableDisplayText: { color: "#fff", fontSize: 56, fontWeight: "700" as const, letterSpacing: 6, lineHeight: 62 },

  line: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  lineTablet: { paddingVertical: 22 },
  lineName: { color: Colors.light.text, fontSize: 17, fontWeight: "600" as const },
  lineMods: { color: Colors.light.textSecondary, fontSize: 13, marginTop: 2 },
  linePrice: { color: Colors.light.text, fontSize: 16, fontWeight: "600" as const, marginTop: 6 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF" },
  qtyBtnTablet: { width: 56, height: 56, borderRadius: 28 },
  qtyText: { fontSize: 17, fontWeight: "700" as const, color: Colors.light.text, minWidth: 22, textAlign: "center" },

  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9", backgroundColor: "#F9FAFB" },
  totalLabel: { fontSize: 18, fontWeight: "600" as const, color: Colors.light.text },
  totalAmount: { fontSize: 24, fontWeight: "700" as const, color: Colors.light.text },

  primaryBtn: { backgroundColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnTablet: { paddingVertical: 22, borderRadius: 16, gap: 12 },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" as const },

  ghostBtn: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostBtnTablet: { paddingVertical: 18, borderRadius: 14 },
  ghostBtnText: { color: Colors.brand.blue, fontSize: 15, fontWeight: "600" as const },

  sectionTitle: { fontSize: 18, fontWeight: "700" as const, color: Colors.light.text, marginTop: 12 },
  sectionSub: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 4 },
  bigInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 18, color: Colors.light.text, marginTop: 10, backgroundColor: "#F9FAFB" },
  bigInputTablet: { paddingVertical: 20, paddingHorizontal: 20, fontSize: 22, borderRadius: 14 },

  callout: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginTop: 24 },
  calloutTitle: { color: Colors.brand.blue, fontWeight: "700" as const, fontSize: 14 },
  calloutText: { color: Colors.light.text, fontSize: 13, marginTop: 2 },

  confirmWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  confirmCheck: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  confirmHeading: { fontSize: 28, fontWeight: "700" as const, color: Colors.light.text, marginTop: 20 },
  confirmSub: { fontSize: 16, color: Colors.light.textSecondary, marginTop: 8, textAlign: "center" },
  ticketBox: { marginTop: 28, backgroundColor: "#0A1628", paddingHorizontal: 48, paddingVertical: 24, borderRadius: 20, alignItems: "center" },
  ticketBoxTablet: { marginTop: 36, paddingHorizontal: 80, paddingVertical: 32, borderRadius: 28 },
  ticketLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 3, fontWeight: "700" as const },
  ticketNumber: { color: "#fff", fontSize: 96, fontWeight: "700" as const, letterSpacing: 2 },
  confirmHint: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 16, textAlign: "center", paddingHorizontal: 24 },
  confirmFooter: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 24 },
});

const padStyles = StyleSheet.create({
  grid: {
    marginTop: 16,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },
  cell: {
    width: "31.5%",
    aspectRatio: 1.6,
  },
  btn: {
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  btnGhost: { backgroundColor: "#F1F5F9" },
  btnText: { fontSize: 32, fontWeight: "700" as const, color: Colors.light.text },
});
