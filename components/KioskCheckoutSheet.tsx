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
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/contexts/CartContext";
import { useKiosk } from "@/contexts/KioskContext";
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

export function KioskCheckoutSheet({ visible, onClose }: KioskCheckoutSheetProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Cap the form width on big screens (iPad landscape can be 1366pt wide).
  // Constraining to 640pt and centring keeps inputs and buttons in a
  // comfortable thumb-reach zone instead of stretching ear-to-ear.
  const contentMaxWidth = Math.min(width, 640);
  const isTablet = Math.min(width, height) >= 700;
  const { items, updateQuantity, totalPrice, clearCart } = useCart();
  const { resetIdle, showAttract } = useKiosk();
  const [step, setStep] = useState<Step>("cart");
  const [name, setName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketNumber: number; appOrderId: number } | null>(null);

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
        throw new Error(data?.message || "Could not send order. Please try again.");
      }
      setConfirmation({ ticketNumber: Number(data.ticketNumber), appOrderId: Number(data.appOrderId) });
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
            {/* Cap the form to a comfortable reading width and centre on iPad
                so it doesn't stretch ear-to-ear in landscape. On phone this
                is a no-op because contentMaxWidth == screen width. */}
            <View style={{ flex: 1, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }}>
            {step !== "confirmation" && (
              <View style={styles.header}>
                {step === "details" ? (
                  <Pressable onPress={() => setStep("cart")} hitSlop={12} testID="kiosk-back">
                    <Ionicons name="chevron-back" size={28} color={Colors.light.text} />
                  </Pressable>
                ) : (
                  <View style={{ width: 28 }} />
                )}
                <Text style={styles.title}>{step === "cart" ? "Your Order" : "Almost done"}</Text>
                <Pressable onPress={handleCancel} hitSlop={12} testID="kiosk-close">
                  <Ionicons name="close" size={28} color={Colors.light.text} />
                </Pressable>
              </View>
            )}

            {step === "cart" && (
              <>
                {items.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="cart-outline" size={56} color={Colors.light.textSecondary} />
                    <Text style={styles.emptyText}>Your basket is empty</Text>
                    <Pressable
                      style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1, marginTop: 24 }]}
                      onPress={onClose}
                      testID="kiosk-back-to-menu"
                    >
                      <Text style={styles.primaryBtnText}>Back to menu</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                      {items.map((item) => {
                        const linePrice = (item.price + (item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0)) * item.quantity;
                        return (
                          <View key={item.cartKey} style={styles.line}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lineName}>{item.name}</Text>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <Text style={styles.lineMods}>{item.modifiers.map((m) => m.name).join(", ")}</Text>
                              )}
                              <Text style={styles.linePrice}>{formatPrice(linePrice)}</Text>
                            </View>
                            <View style={styles.qtyBox}>
                              <Pressable
                                onPress={() => updateQuantity(item.cartKey, -1)}
                                style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.7 }]}
                                hitSlop={6}
                                testID={`kiosk-dec-${item.variationId}`}
                              >
                                <Ionicons name="remove" size={20} color={Colors.brand.blue} />
                              </Pressable>
                              <Text style={styles.qtyText}>{item.quantity}</Text>
                              <Pressable
                                onPress={() => updateQuantity(item.cartKey, 1)}
                                style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.7 }]}
                                hitSlop={6}
                                testID={`kiosk-inc-${item.variationId}`}
                              >
                                <Ionicons name="add" size={20} color={Colors.brand.blue} />
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalAmount}>{formatPrice(totalPrice)}</Text>
                    </View>

                    <View style={{ paddingHorizontal: 20, gap: 10 }}>
                      <Pressable
                        onPress={onClose}
                        style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }]}
                        testID="kiosk-add-more"
                      >
                        <Ionicons name="add-circle-outline" size={20} color={Colors.brand.blue} />
                        <Text style={styles.ghostBtnText}>Add more items</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setStep("details")}
                        disabled={!canContinue}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          { opacity: !canContinue ? 0.5 : pressed ? 0.85 : 1 },
                        ]}
                        testID="kiosk-continue"
                      >
                        <Text style={styles.primaryBtnText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}

            {step === "details" && (
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
            )}

            {step === "confirmation" && confirmation && (
              <View style={styles.confirmWrap}>
                <View style={styles.confirmCheck}>
                  <Ionicons name="checkmark" size={64} color="#fff" />
                </View>
                <Text style={styles.confirmHeading}>Order received</Text>
                <Text style={styles.confirmSub}>Take this number to the counter to pay</Text>
                <View style={styles.ticketBox}>
                  <Text style={styles.ticketLabel}>YOUR ORDER NUMBER</Text>
                  <Text style={styles.ticketNumber}>{confirmation.ticketNumber}</Text>
                </View>
                <Text style={styles.confirmFooter}>Closing automatically in a few seconds…</Text>
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1, marginTop: 28 }]}
                  onPress={() => {
                    clearCart();
                    onClose();
                    showAttract();
                  }}
                  testID="kiosk-confirm-done"
                >
                  <Text style={styles.primaryBtnText}>Done</Text>
                </Pressable>
              </View>
            )}
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
  title: { fontSize: 22, fontWeight: "700" as const, color: Colors.light.text },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 16, marginTop: 12 },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  lineName: { color: Colors.light.text, fontSize: 17, fontWeight: "600" as const },
  lineMods: { color: Colors.light.textSecondary, fontSize: 13, marginTop: 2 },
  linePrice: { color: Colors.light.text, fontSize: 16, fontWeight: "600" as const, marginTop: 6 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF" },
  qtyText: { fontSize: 17, fontWeight: "700" as const, color: Colors.light.text, minWidth: 22, textAlign: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9", backgroundColor: "#F9FAFB" },
  totalLabel: { fontSize: 18, fontWeight: "600" as const, color: Colors.light.text },
  totalAmount: { fontSize: 24, fontWeight: "700" as const, color: Colors.light.text },
  primaryBtn: { backgroundColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" as const },
  ghostBtn: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostBtnText: { color: Colors.brand.blue, fontSize: 15, fontWeight: "600" as const },
  sectionTitle: { fontSize: 18, fontWeight: "700" as const, color: Colors.light.text, marginTop: 12 },
  sectionSub: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 4 },
  bigInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 18, color: Colors.light.text, marginTop: 10, backgroundColor: "#F9FAFB" },
  callout: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginTop: 24 },
  calloutTitle: { color: Colors.brand.blue, fontWeight: "700" as const, fontSize: 14 },
  calloutText: { color: Colors.light.text, fontSize: 13, marginTop: 2 },
  confirmWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  confirmCheck: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  confirmHeading: { fontSize: 28, fontWeight: "700" as const, color: Colors.light.text, marginTop: 20 },
  confirmSub: { fontSize: 16, color: Colors.light.textSecondary, marginTop: 8, textAlign: "center" },
  ticketBox: { marginTop: 28, backgroundColor: "#0A1628", paddingHorizontal: 48, paddingVertical: 24, borderRadius: 20, alignItems: "center" },
  ticketLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 3, fontWeight: "700" as const },
  ticketNumber: { color: "#fff", fontSize: 96, fontWeight: "700" as const, letterSpacing: 2 },
  confirmFooter: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 24 },
});
