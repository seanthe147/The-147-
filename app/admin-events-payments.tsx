import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

type TabKey = "tickets" | "payment";

interface PaymentConfig {
  stripeConfigured: boolean;
  publishableKey: string | null;
  boxOfficeUrl: string;
}

interface PaymentLog {
  id: number;
  amountPence: number;
  currency: string;
  description: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  staffDisplayName: string | null;
  createdAt: string;
  failureMessage: string | null;
}

function formatGBP(pence: number): string {
  return "£" + (pence / 100).toFixed(2);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminEventsPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, role } = useStaffAuth();
  const [tab, setTab] = useState<TabKey>("tickets");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const isManager = role === "manager" || role === "owner";

  const { data: config, isLoading: cfgLoading } = useQuery<PaymentConfig>({
    queryKey: ["/api/staff/payments/config"],
    enabled: isAuthenticated && isManager,
  });

  const { data: logs, refetch: refetchLogs } = useQuery<PaymentLog[]>({
    queryKey: ["/api/staff/payments/log"],
    enabled: isAuthenticated && isManager && tab === "payment",
    refetchInterval: tab === "payment" ? 15000 : false,
  });

  if (authLoading || !isAuthenticated) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + webTopInset }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isManager) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + webTopInset }]}>
        <Ionicons name="lock-closed" size={48} color={Colors.light.textSecondary} />
        <Text style={styles.lockTitle}>Manager access required</Text>
        <Text style={styles.lockSub}>Only managers and owners can take payments.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.light.background }}
      contentContainerStyle={{
        paddingTop: insets.top + webTopInset + 12,
        paddingBottom: insets.bottom + 80,
        paddingHorizontal: 16,
      }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Events & Payments</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, tab === "tickets" && styles.tabBtnActive]}
          onPress={() => setTab("tickets")}
        >
          <Ionicons name="ticket" size={16} color={tab === "tickets" ? "#fff" : Colors.light.text} />
          <Text style={[styles.tabText, tab === "tickets" && styles.tabTextActive]}>Sell Tickets</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "payment" && styles.tabBtnActive]}
          onPress={() => setTab("payment")}
        >
          <Ionicons name="card" size={16} color={tab === "payment" ? "#fff" : Colors.light.text} />
          <Text style={[styles.tabText, tab === "payment" && styles.tabTextActive]}>Take Payment</Text>
        </Pressable>
      </View>

      {cfgLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : tab === "tickets" ? (
        <TicketsTab boxOfficeUrl={config?.boxOfficeUrl || ""} />
      ) : (
        <PaymentTab
          stripeConfigured={!!config?.stripeConfigured}
          publishableKey={config?.publishableKey || null}
          logs={logs || []}
          onRefresh={refetchLogs}
        />
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tickets tab — embeds TicketSource Box Office iframe (web only)
// ─────────────────────────────────────────────────────────────────────────────

function TicketsTab({ boxOfficeUrl }: { boxOfficeUrl: string }) {
  if (!boxOfficeUrl) {
    return (
      <View style={styles.card}>
        <Ionicons name="settings" size={32} color={Colors.light.textSecondary} />
        <Text style={styles.cardTitle}>TicketSource Box Office not set up</Text>
        <Text style={styles.cardSub}>
          Set the TICKETSOURCE_BOX_OFFICE_URL environment variable to your Box Office page URL
          (find it in TicketSource → Box Office → Setup).
        </Text>
      </View>
    );
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.card}>
        <Ionicons name="laptop" size={32} color={Colors.light.textSecondary} />
        <Text style={styles.cardTitle}>Open on a computer</Text>
        <Text style={styles.cardSub}>
          Selling tickets through TicketSource Box Office works best on a desktop browser.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => {
            // open externally
            const Linking = require("react-native").Linking;
            Linking.openURL(boxOfficeUrl);
          }}
        >
          <Text style={styles.primaryBtnText}>Open Box Office</Text>
        </Pressable>
      </View>
    );
  }

  // TicketSource blocks embedding their storefront in iframes for security,
  // so we present a prominent launch button instead of trying to embed it.
  return (
    <View style={[styles.card, { marginTop: 8 }]}>
      <Ionicons name="ticket" size={40} color={Colors.brand.blue} />
      <Text style={styles.cardTitle}>TicketSource Box Office</Text>
      <Text style={styles.cardSub}>
        TicketSource opens in a new tab — log in there to sell tickets, take payment and check
        attendees. (Their site can't be embedded inside other apps for security.)
      </Text>
      <View style={{ height: 4 }} />
      <Pressable
        style={[styles.primaryBtn, { paddingHorizontal: 28 }]}
        onPress={() => {
          if (Platform.OS === "web" && typeof window !== "undefined") {
            window.open(boxOfficeUrl, "_blank", "noopener,noreferrer");
          } else {
            const Linking = require("react-native").Linking;
            Linking.openURL(boxOfficeUrl);
          }
        }}
      >
        <Text style={styles.primaryBtnText}>Open Box Office</Text>
      </Pressable>
      <Text style={[styles.helperMuted, { marginTop: 12, textAlign: "center" }]}>{boxOfficeUrl}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment tab — Stripe Elements (web only)
// ─────────────────────────────────────────────────────────────────────────────

function PaymentTab({
  stripeConfigured,
  publishableKey,
  logs,
  onRefresh,
}: {
  stripeConfigured: boolean;
  publishableKey: string | null;
  logs: PaymentLog[];
  onRefresh: () => void;
}) {
  if (Platform.OS !== "web") {
    return (
      <View style={styles.card}>
        <Ionicons name="laptop" size={32} color={Colors.light.textSecondary} />
        <Text style={styles.cardTitle}>Open on a computer</Text>
        <Text style={styles.cardSub}>
          Card payments use Stripe Elements which only runs in a desktop browser. Open this page
          on a laptop to take phone or in-person card payments.
        </Text>
      </View>
    );
  }

  if (!stripeConfigured || !publishableKey) {
    return (
      <>
        <View style={[styles.card, styles.warnCard]}>
          <Ionicons name="warning" size={24} color="#B45309" />
          <Text style={styles.cardTitle}>Stripe is not connected yet</Text>
          <Text style={styles.cardSub}>
            Add STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY to enable card payments. Once
            configured, the form below will activate.
          </Text>
        </View>
        <PaymentLogTable logs={logs} onRefresh={onRefresh} />
      </>
    );
  }

  return (
    <>
      <StripeForm publishableKey={publishableKey} onSuccess={onRefresh} />
      <PaymentLogTable logs={logs} onRefresh={onRefresh} />
    </>
  );
}

function StripeForm({ publishableKey, onSuccess }: { publishableKey: string; onSuccess: () => void }) {
  const formRef = useRef<HTMLDivElement | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const stateRef = useRef<{ stripe: any; elements: any; card: any } | null>(null);

  // Form fields
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [moto, setMoto] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = (window as any).Stripe;
    function init() {
      const Stripe = (window as any).Stripe;
      if (!Stripe) return;
      const stripe = Stripe(publishableKey);
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: {
          base: { fontSize: "16px", color: "#0a0a0a", "::placeholder": { color: "#94a3b8" } },
          invalid: { color: "#dc2626" },
        },
      });
      // Wait for ref then mount
      const tryMount = () => {
        const node = document.getElementById("payment-card-element");
        if (node) {
          card.mount("#payment-card-element");
          stateRef.current = { stripe, elements, card };
          setStripeReady(true);
        } else {
          setTimeout(tryMount, 50);
        }
      };
      tryMount();
    }
    if (existing) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = init;
      document.head.appendChild(script);
    }
    return () => {
      try {
        stateRef.current?.card?.destroy();
      } catch {}
    };
  }, [publishableKey]);

  async function handleSubmit() {
    setStatusMsg(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0.5) {
      setStatusMsg({ type: "err", text: "Enter an amount of at least £0.50" });
      return;
    }
    if (!description.trim()) {
      setStatusMsg({ type: "err", text: "Description is required" });
      return;
    }
    if (!stateRef.current) {
      setStatusMsg({ type: "err", text: "Stripe is still loading — try again in a moment" });
      return;
    }
    setSubmitting(true);
    try {
      const intentRes = await apiRequest("POST", "/api/staff/payments/create-intent", {
        amountPence: Math.round(amt * 100),
        description: description.trim(),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        moto,
      });
      const intent = (await intentRes.json()) as { clientSecret: string; paymentIntentId: string };
      const { stripe, card } = stateRef.current;
      const result = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: {
          card,
          billing_details: {
            name: customerName.trim() || undefined,
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined,
          },
        },
      });
      if (result.error) {
        await apiRequest("POST", "/api/staff/payments/finalize", {
          paymentIntentId: intent.paymentIntentId,
        });
        setStatusMsg({ type: "err", text: result.error.message || "Payment failed" });
      } else if (result.paymentIntent?.status === "succeeded") {
        await apiRequest("POST", "/api/staff/payments/finalize", {
          paymentIntentId: intent.paymentIntentId,
        });
        setStatusMsg({ type: "ok", text: "✓ Charged " + formatGBP(Math.round(amt * 100)) + " successfully" });
        setAmount("");
        setDescription("");
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("");
        try {
          card.clear();
        } catch {}
        onSuccess();
      } else {
        setStatusMsg({ type: "err", text: "Unexpected status: " + result.paymentIntent?.status });
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Payment failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Take a card payment</Text>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Amount (£)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor={Colors.light.textSecondary}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Description / reference</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Booking deposit – Smith"
            placeholderTextColor={Colors.light.textSecondary}
          />
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Customer name (optional)</Text>
          <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholderTextColor={Colors.light.textSecondary} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email (optional, sends receipt)</Text>
          <TextInput
            style={styles.input}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={Colors.light.textSecondary}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" placeholderTextColor={Colors.light.textSecondary} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Card details</Text>
        <View ref={formRef as any} style={styles.cardElementWrap}>
          {React.createElement("div" as any, {
            id: "payment-card-element",
            style: { padding: "12px", background: "#fff", borderRadius: "6px", minHeight: 24 },
          })}
        </View>
        {!stripeReady && <Text style={styles.helperMuted}>Loading secure card field…</Text>}
      </View>

      <Pressable style={styles.checkRow} onPress={() => setMoto((v) => !v)}>
        <View style={[styles.checkbox, moto && styles.checkboxOn]}>
          {moto && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkLabel}>This is a phone / mail order payment (MOTO)</Text>
      </Pressable>

      {statusMsg && (
        <Text style={[styles.statusMsg, statusMsg.type === "ok" ? styles.statusOk : styles.statusErr]}>
          {statusMsg.text}
        </Text>
      )}

      <Pressable
        style={[styles.primaryBtn, (!stripeReady || submitting) && styles.primaryBtnDisabled]}
        disabled={!stripeReady || submitting}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Charge card</Text>
        )}
      </Pressable>
    </View>
  );
}

function PaymentLogTable({ logs, onRefresh }: { logs: PaymentLog[]; onRefresh: () => void }) {
  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <View style={styles.logHeader}>
        <Text style={styles.cardTitle}>Recent payments</Text>
        <Pressable onPress={onRefresh} style={styles.iconBtn}>
          <Ionicons name="refresh" size={18} color={Colors.light.text} />
        </Pressable>
      </View>
      {logs.length === 0 ? (
        <Text style={styles.cardSub}>No payments yet.</Text>
      ) : (
        logs.slice(0, 25).map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logAmount}>{formatGBP(log.amountPence)}</Text>
              <Text style={styles.logDesc}>{log.description}</Text>
              <Text style={styles.logMeta}>
                {formatDate(log.createdAt)}
                {log.customerName ? " · " + log.customerName : ""}
                {log.staffDisplayName ? " · " + log.staffDisplayName : ""}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                log.status === "succeeded"
                  ? styles.pillOk
                  : log.status === "failed"
                  ? styles.pillErr
                  : styles.pillPending,
              ]}
            >
              <Text style={styles.statusPillText}>{log.status}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: Colors.light.text },
  iconBtn: { padding: 6, borderRadius: 8 },
  tabsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  tabBtnActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  tabText: { color: Colors.light.text, fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#fff" },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  warnCard: { borderColor: "#B45309", backgroundColor: "#FEF3C7" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: Colors.light.text, textAlign: "center" },
  cardSub: { fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20 },
  lockTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, marginTop: 12 },
  lockSub: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 6, textAlign: "center" },
  backBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: Colors.brand.blue },
  backBtnText: { color: "#fff", fontWeight: "600" },
  iframeBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  iframeLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.textSecondary },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  linkBtnText: { color: Colors.brand.blue, fontSize: 13, fontWeight: "600" },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 12,
  },
  formTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.text, marginBottom: 4 },
  row2: { flexDirection: Platform.OS === "web" ? "row" : "column", gap: 12 },
  field: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.light.text },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
    color: Colors.light.text,
  },
  cardElementWrap: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  helperMuted: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  checkLabel: { fontSize: 14, color: Colors.light.text, flex: 1 },
  statusMsg: { fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 4 },
  statusOk: { color: "#059669" },
  statusErr: { color: "#dc2626" },
  primaryBtn: {
    backgroundColor: Colors.brand.blue,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 8 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    width: "100%",
    gap: 10,
  },
  logAmount: { fontSize: 15, fontWeight: "700", color: Colors.light.text },
  logDesc: { fontSize: 13, color: Colors.light.text, marginTop: 2 },
  logMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillOk: { backgroundColor: "#D1FAE5" },
  pillErr: { backgroundColor: "#FEE2E2" },
  pillPending: { backgroundColor: "#FEF3C7" },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", color: "#065F46" },
});
