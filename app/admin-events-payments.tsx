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
  square?: {
    configured: boolean;
    applicationId: string | null;
    locationId: string | null;
    environment: "production" | "sandbox";
  };
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={styles.title}>Events & Payments</Text>
          <Text style={styles.subtitle}>Sell tickets and take card payments</Text>
        </View>
      </View>

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, tab === "tickets" && styles.tabBtnActive]}
          onPress={() => setTab("tickets")}
        >
          <Ionicons name="ticket-outline" size={18} color={tab === "tickets" ? "#fff" : Colors.light.textSecondary} />
          <Text style={[styles.tabText, tab === "tickets" && styles.tabTextActive]}>Sell Tickets</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "payment" && styles.tabBtnActive]}
          onPress={() => setTab("payment")}
        >
          <Ionicons name="card-outline" size={18} color={tab === "payment" ? "#fff" : Colors.light.textSecondary} />
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
          square={config?.square}
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

  // TicketSource's *widget* URLs (widgets.ticketsource.co.uk / box-office paths)
  // are explicitly embeddable. The plain storefront URL (www.ticketsource.com/...)
  // is blocked from iframes by their X-Frame-Options header. We try to embed
  // either way; if the URL turns out to be the storefront variant the user can
  // still use the "Open in new tab" link below.
  const embedUrl = normaliseTicketSourceUrl(boxOfficeUrl);
  const openExternal = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(boxOfficeUrl, "_blank", "noopener,noreferrer");
    } else {
      const Linking = require("react-native").Linking;
      Linking.openURL(boxOfficeUrl);
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.iframeBar}>
        <Text style={styles.iframeLabel}>TicketSource Box Office</Text>
        <Pressable onPress={openExternal} style={styles.openExternalBtn}>
          <Ionicons name="open-outline" size={14} color={Colors.brand.blue} />
          <Text style={styles.openExternalText}>Open in new tab</Text>
        </Pressable>
      </View>
      {React.createElement("iframe" as any, {
        src: embedUrl,
        style: {
          display: "block",
          width: "100%",
          height: "calc(100vh - 240px)",
          minHeight: 520,
          border: "1px solid " + Colors.light.border,
          borderRadius: 8,
          background: "#fff",
        },
        allow: "payment *",
        title: "TicketSource Box Office",
      })}
      <Text style={[styles.helperMuted, { marginTop: 8, textAlign: "center" }]}>
        If the box office doesn't load below, click "Open in new tab".
      </Text>
    </View>
  );
}

// Convert common TicketSource storefront URLs to their embeddable widget form
// where possible. Widget paths under widgets.ticketsource.co.uk and the
// /box-office/<org> path on www.ticketsource.co.uk are iframe-friendly; the
// plain /<org> storefront page sends X-Frame-Options and cannot be embedded.
function normaliseTicketSourceUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    // Already an embeddable widget URL — leave alone
    if (host.startsWith("widgets.ticketsource")) return url;
    if (u.pathname.startsWith("/box-office/")) return url;
    // Storefront URL like https://www.ticketsource.com/the147 → try /box-office/the147
    if (host.endsWith("ticketsource.com") || host.endsWith("ticketsource.co.uk")) {
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments.length >= 1) {
        const org = segments[0];
        return `https://www.ticketsource.co.uk/box-office/${org}`;
      }
    }
  } catch {
    /* fall through */
  }
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment tab — Stripe Elements (web only)
// ─────────────────────────────────────────────────────────────────────────────

type Processor = "stripe" | "square";

function ProcessorCard({
  label,
  hint,
  iconName,
  accent,
  active,
  ready,
  onPress,
}: {
  label: string;
  hint: string;
  iconName: any;
  accent: string;
  active: boolean;
  ready: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.procCard,
        active && { borderColor: accent, backgroundColor: accent + "0D", shadowColor: accent },
        !ready && styles.procBtnDisabled,
      ]}
      disabled={!ready}
      onPress={onPress}
    >
      <View style={[styles.procIconWrap, { backgroundColor: accent + "1A" }]}>
        <Ionicons name={iconName} size={22} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.procTitleRow}>
          <Text style={[styles.procText, active && { color: accent }]}>{label}</Text>
          {ready ? (
            active && (
              <View style={[styles.procBadge, { backgroundColor: accent }]}>
                <Ionicons name="checkmark" size={11} color="#fff" />
                <Text style={styles.procBadgeText}>Selected</Text>
              </View>
            )
          ) : (
            <View style={styles.procBadgeDim}>
              <Text style={styles.procBadgeDimText}>Not connected</Text>
            </View>
          )}
        </View>
        <Text style={styles.procHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

type StatusMsg = {
  type: "ok" | "err";
  text: string;
  hint?: string; // What to tell the customer / next step
};

// ─── Friendly payment error mapper ───────────────────────────────────────────
// Translates Stripe / Square error codes into a clear staff-facing message
// PLUS a hint of what to say or do next, so staff can relay it to the customer
// instead of staring at "payment declined".
type FriendlyError = { text: string; hint: string };

function friendlyStripeError(err: any): FriendlyError {
  const code = err?.code as string | undefined;
  const declineCode = err?.decline_code as string | undefined;
  const fallback = err?.message || "Payment failed";

  // Decline codes (most specific) take priority
  switch (declineCode) {
    case "insufficient_funds":
      return { text: "Card declined — insufficient funds", hint: "Ask the customer to use a different card, or to top up and try again." };
    case "lost_card":
    case "stolen_card":
      return { text: "Card declined by the bank", hint: "Don't give a reason. Ask the customer to use a different card." };
    case "expired_card":
      return { text: "Card has expired", hint: "Check the expiry date on the front of the card. Ask the customer for a different card if it's out of date." };
    case "incorrect_cvc":
      return { text: "Wrong CVC / security code", hint: "Ask the customer for the 3-digit number on the back of the card and re-enter." };
    case "card_velocity_exceeded":
      return { text: "Card declined — too many attempts", hint: "The bank has temporarily blocked the card. Ask the customer to try again later or use a different card." };
    case "do_not_honor":
    case "generic_decline":
      return { text: "Card declined by the bank", hint: "We don't know the exact reason — ask the customer to call their bank or use a different card." };
    case "fraudulent":
    case "pickup_card":
      return { text: "Card declined by the bank", hint: "Ask the customer to use a different card. Don't share the reason." };
    case "issuer_not_available":
    case "try_again_later":
      return { text: "Bank temporarily unreachable", hint: "Try the payment again in a minute. If it keeps failing, use a different card." };
    case "withdrawal_count_limit_exceeded":
      return { text: "Card has reached its daily limit", hint: "Ask the customer to use a different card." };
    case "currency_not_supported":
      return { text: "This card doesn't support GBP", hint: "Ask for a different card." };
  }

  // Top-level codes
  switch (code) {
    case "card_declined":
      return { text: "Card declined by the bank", hint: "Ask the customer to use a different card or contact their bank." };
    case "expired_card":
      return { text: "Card has expired", hint: "Check the expiry date — ask for a different card if needed." };
    case "incorrect_cvc":
    case "invalid_cvc":
      return { text: "Wrong CVC / security code", hint: "Ask the customer for the 3 digits on the back of the card and re-enter." };
    case "incorrect_number":
    case "invalid_number":
      return { text: "Card number isn't valid", hint: "Re-read each digit back to the customer carefully and re-enter." };
    case "invalid_expiry_month":
    case "invalid_expiry_year":
      return { text: "Expiry date isn't valid", hint: "Confirm the MM/YY on the front of the card and re-enter." };
    case "incomplete_number":
    case "incomplete_cvc":
    case "incomplete_expiry":
      return { text: "Card details look incomplete", hint: "Double-check every field is filled in before charging." };
    case "processing_error":
      return { text: "Bank had a temporary problem", hint: "Wait a moment and try again. If it keeps happening, ask for a different card." };
    case "authentication_required":
      return { text: "Bank wants to verify the customer (3-D Secure)", hint: "For phone payments, this card can't be charged remotely. Ask for a different card or take the payment in person." };
    case "rate_limit":
      return { text: "Too many attempts — slow down", hint: "Wait 30 seconds and try again." };
  }

  return { text: fallback, hint: "Re-check every field. If it still fails, ask for a different card." };
}

function friendlySquareError(errorCode: string | null | undefined, fallbackMsg: string): FriendlyError {
  switch (errorCode) {
    // Tokenisation (client-side) — wrong fields entered
    case "INVALID_CARD_NUMBER":
      return { text: "Card number isn't valid", hint: "Re-read each digit carefully with the customer and re-enter." };
    case "INVALID_EXPIRATION":
    case "INVALID_EXPIRATION_DATE":
    case "INVALID_EXPIRATION_YEAR":
    case "INVALID_EXPIRATION_MONTH":
      return { text: "Expiry date isn't valid", hint: "Confirm the MM/YY on the front of the card and re-enter." };
    case "INVALID_CVV":
      return { text: "Wrong CVC / security code", hint: "Ask the customer for the 3 digits on the back of the card." };
    case "INVALID_POSTAL_CODE":
      return { text: "Postcode doesn't match the card", hint: "Confirm the customer's billing postcode (the one on their card statement) and re-enter." };

    // Charge (server-side) — bank declines
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
      return { text: "Card declined by the bank", hint: "Ask the customer to use a different card or contact their bank." };
    case "INSUFFICIENT_FUNDS":
      return { text: "Card declined — insufficient funds", hint: "Ask the customer to use a different card or top up." };
    case "CVV_FAILURE":
      return { text: "CVC didn't match", hint: "Ask the customer to re-read the 3 digits on the back of the card." };
    case "ADDRESS_VERIFICATION_FAILURE":
      return { text: "Postcode didn't match the card", hint: "Confirm the customer's billing postcode and try again." };
    case "INVALID_EXPIRATION_DATE":
      return { text: "Expiry date is invalid or expired", hint: "Check the MM/YY — ask for a different card if it's out of date." };
    case "CARD_EXPIRED":
      return { text: "Card has expired", hint: "Ask the customer for a different card." };
    case "CARD_NOT_SUPPORTED":
      return { text: "We can't accept this card type", hint: "Ask for a Visa, Mastercard or Amex instead." };
    case "VOICE_FAILURE":
      return { text: "Bank wants the customer to call them", hint: "Ask the customer to ring the number on the back of their card to authorise — or use a different card." };
    case "PAN_FAILURE":
      return { text: "Card number is invalid", hint: "Re-read each digit carefully and re-enter." };
    case "PAYMENT_LIMIT_EXCEEDED":
      return { text: "This payment exceeds the daily limit", hint: "Take a smaller amount, or split the payment across two transactions." };
    case "CHIP_INSERTION_REQUIRED":
    case "INSERT_CHIP":
      return { text: "Card needs to be inserted, not tapped", hint: "Take this payment in person on a card reader — phone payments aren't allowed for this card." };
    case "CARD_TOKEN_USED":
      return { text: "This card was already charged", hint: "Refresh the page before charging again." };
    case "TEMPORARY_ERROR":
      return { text: "Bank temporarily unreachable", hint: "Wait a moment and try again." };
    case "ALLOWABLE_PIN_TRIES_EXCEEDED":
      return { text: "Too many wrong PIN attempts", hint: "Card is locked — ask the customer to use a different card." };
  }
  return { text: fallbackMsg || "Card charge failed", hint: "Re-check every field. If it still fails, ask for a different card." };
}

// ─── Hero amount input with quick-pick chips ────────────────────────────────
const QUICK_AMOUNTS = [10, 20, 50, 100];

function AmountHero({
  amount,
  onAmount,
  description,
  onDescription,
}: {
  amount: string;
  onAmount: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
}) {
  return (
    <View style={styles.amountHero}>
      <Text style={styles.amountHeroLabel}>Amount to charge</Text>
      <View style={styles.amountHeroRow}>
        <Text style={styles.amountHeroPrefix}>£</Text>
        <TextInput
          style={styles.amountHeroInput}
          value={amount}
          onChangeText={onAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          placeholderTextColor="#CBD5E1"
        />
      </View>
      <View style={styles.quickRow}>
        {QUICK_AMOUNTS.map((q) => {
          const active = parseFloat(amount) === q;
          return (
            <Pressable
              key={q}
              onPress={() => onAmount(q.toFixed(2))}
              style={[styles.quickChip, active && styles.quickChipActive]}
            >
              <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>£{q}</Text>
            </Pressable>
          );
        })}
        {amount !== "" && (
          <Pressable onPress={() => onAmount("")} style={styles.quickClear}>
            <Ionicons name="close" size={14} color={Colors.light.textSecondary} />
          </Pressable>
        )}
      </View>
      <View style={[styles.field, { marginTop: 12 }]}>
        <Text style={styles.label}>What's this for?</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={onDescription}
          placeholder="e.g. Booking deposit – Smith"
          placeholderTextColor={Colors.light.textSecondary}
        />
      </View>
    </View>
  );
}

function StatusBanner({ msg }: { msg: StatusMsg }) {
  const ok = msg.type === "ok";
  return (
    <View style={[styles.banner, ok ? styles.bannerOk : styles.bannerErr]}>
      <Ionicons
        name={ok ? "checkmark-circle" : "alert-circle"}
        size={20}
        color={ok ? "#047857" : "#B91C1C"}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerText, { color: ok ? "#065F46" : "#991B1B" }]}>{msg.text}</Text>
        {msg.hint && (
          <Text style={[styles.bannerHint, { color: ok ? "#047857" : "#B91C1C" }]}>{msg.hint}</Text>
        )}
      </View>
    </View>
  );
}

function PaymentTab({
  stripeConfigured,
  publishableKey,
  square,
  logs,
  onRefresh,
}: {
  stripeConfigured: boolean;
  publishableKey: string | null;
  square?: PaymentConfig["square"];
  logs: PaymentLog[];
  onRefresh: () => void;
}) {
  const squareReady = !!(square?.configured && square.applicationId && square.locationId);
  // Default: Square if configured (recommended for MOTO), else Stripe
  const [processor, setProcessor] = useState<Processor>(squareReady ? "square" : "stripe");

  if (Platform.OS !== "web") {
    return (
      <View style={styles.card}>
        <Ionicons name="laptop" size={32} color={Colors.light.textSecondary} />
        <Text style={styles.cardTitle}>Open on a computer</Text>
        <Text style={styles.cardSub}>
          Card payments require a desktop browser to load the secure card field. Open this page
          on a laptop to take phone or in-person card payments.
        </Text>
      </View>
    );
  }

  const stripeReady = stripeConfigured && !!publishableKey;
  const noneReady = !stripeReady && !squareReady;

  if (noneReady) {
    return (
      <>
        <View style={[styles.card, styles.warnCard]}>
          <Ionicons name="warning" size={24} color="#B45309" />
          <Text style={styles.cardTitle}>No payment processor connected</Text>
          <Text style={styles.cardSub}>
            Add Stripe keys (STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY) or Square keys
            (SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, SQUARE_LOC_ID) to enable card payments.
          </Text>
        </View>
        <PaymentLogTable logs={logs} onRefresh={onRefresh} />
      </>
    );
  }

  const isWide = Platform.OS === "web" && typeof window !== "undefined" && window.innerWidth >= 1024;

  const formCol = (
    <View style={{ flex: isWide ? 1.4 : undefined, minWidth: 0 }}>
      <Text style={styles.sectionLabel}>Choose payment processor</Text>
      <View style={styles.processorRow}>
        <ProcessorCard
          label="Square"
          hint="MOTO ready · phone payments"
          iconName="phone-portrait-outline"
          accent="#006AFF"
          active={processor === "square"}
          ready={squareReady}
          onPress={() => setProcessor("square")}
        />
        <ProcessorCard
          label="Stripe"
          hint="Standard online card"
          iconName="card-outline"
          accent="#635BFF"
          active={processor === "stripe"}
          ready={stripeReady}
          onPress={() => setProcessor("stripe")}
        />
      </View>

      {processor === "stripe" && stripeReady && (
        <StripeForm publishableKey={publishableKey!} onSuccess={onRefresh} />
      )}
      {processor === "square" && squareReady && (
        <SquareForm
          applicationId={square!.applicationId!}
          locationId={square!.locationId!}
          environment={square!.environment}
          onSuccess={onRefresh}
        />
      )}
    </View>
  );

  const logCol = (
    <View style={{ flex: isWide ? 1 : undefined, minWidth: 0 }}>
      <PaymentStats logs={logs} />
      <PaymentLogTable logs={logs} onRefresh={onRefresh} />
    </View>
  );

  return (
    <View style={{ flexDirection: isWide ? "row" : "column", gap: 20, alignItems: "flex-start" }}>
      {formCol}
      {logCol}
    </View>
  );
}

// ─── Stats row at the top of the payment log column ──────────────────────────
function PaymentStats({ logs }: { logs: PaymentLog[] }) {
  const now = new Date();
  const todayKey = now.toDateString();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  let todayPence = 0, todayCount = 0, weekPence = 0, weekCount = 0;
  for (const l of logs) {
    if (l.status !== "succeeded") continue;
    const d = new Date(l.createdAt);
    if (d.toDateString() === todayKey) {
      todayPence += l.amountPence;
      todayCount += 1;
    }
    if (d >= weekStart) {
      weekPence += l.amountPence;
      weekCount += 1;
    }
  }

  return (
    <View style={styles.statsRow}>
      <View style={[styles.statCard, styles.statCardPrimary]}>
        <Text style={styles.statLabel}>Today</Text>
        <Text style={styles.statValue}>{formatGBP(todayPence)}</Text>
        <Text style={styles.statSub}>{todayCount} payment{todayCount === 1 ? "" : "s"}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Last 7 days</Text>
        <Text style={styles.statValueSmall}>{formatGBP(weekPence)}</Text>
        <Text style={styles.statSub}>{weekCount} payment{weekCount === 1 ? "" : "s"}</Text>
      </View>
    </View>
  );
}

function StripeForm({ publishableKey, onSuccess }: { publishableKey: string; onSuccess: () => void }) {
  const formRef = useRef<HTMLDivElement | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null);
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
        const friendly = friendlyStripeError(result.error);
        setStatusMsg({ type: "err", text: friendly.text, hint: friendly.hint });
      } else if (result.paymentIntent?.status === "succeeded") {
        await apiRequest("POST", "/api/staff/payments/finalize", {
          paymentIntentId: intent.paymentIntentId,
        });
        setStatusMsg({ type: "ok", text: "Charged " + formatGBP(Math.round(amt * 100)) + " successfully", hint: customerEmail.trim() ? "A receipt has been emailed to the customer." : undefined });
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

  const amtPence = Math.round((parseFloat(amount) || 0) * 100);

  return (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View style={[styles.formIconWrap, { backgroundColor: "#635BFF1A" }]}>
          <Ionicons name="card" size={20} color="#635BFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>Take a card payment</Text>
          <Text style={styles.formSubtitle}>Powered by Stripe · processed securely</Text>
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.formSection}>Amount</Text>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.inputPrefixWrap}>
            <Text style={styles.inputPrefix}>£</Text>
            <TextInput
              style={styles.inputPrefixed}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.light.textSecondary}
            />
          </View>
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

      <View style={styles.divider} />
      <Text style={styles.formSection}>Customer details (optional)</Text>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Full name" placeholderTextColor={Colors.light.textSecondary} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email <Text style={styles.labelHint}>(sends receipt)</Text></Text>
          <TextInput
            style={styles.input}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={Colors.light.textSecondary}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="07…" keyboardType="phone-pad" placeholderTextColor={Colors.light.textSecondary} />
      </View>

      <View style={styles.divider} />
      <Text style={styles.formSection}>Card</Text>

      <View style={styles.field}>
        <View ref={formRef as any} style={styles.cardElementWrap}>
          {React.createElement("div" as any, {
            id: "payment-card-element",
            style: { padding: "14px", background: "#fff", borderRadius: "8px", minHeight: 24 },
          })}
        </View>
        {!stripeReady && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            <Text style={styles.helperMuted}>Loading secure card field…</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.checkRow} onPress={() => setMoto((v) => !v)}>
        <View style={[styles.checkbox, moto && styles.checkboxOn]}>
          {moto && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkLabel}>This is a phone / mail order payment (MOTO)</Text>
      </Pressable>

      {statusMsg && <StatusBanner msg={statusMsg} />}

      <Pressable
        style={[styles.primaryBtn, (!stripeReady || submitting) && styles.primaryBtnDisabled]}
        disabled={!stripeReady || submitting}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="lock-closed" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {amtPence >= 50 ? `Charge ${formatGBP(amtPence)}` : "Charge card"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Square Web Payments SDK form — supports MOTO out of the box
// ─────────────────────────────────────────────────────────────────────────────

function SquareForm({
  applicationId,
  locationId,
  environment,
  onSuccess,
}: {
  applicationId: string;
  locationId: string;
  environment: "production" | "sandbox";
  onSuccess: () => void;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null);
  const stateRef = useRef<{ payments: any; card: any } | null>(null);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const sdkUrl =
      environment === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js";

    async function init() {
      const Square = (window as any).Square;
      if (!Square) return;
      try {
        const payments = Square.payments(applicationId, locationId);
        const card = await payments.card();
        if (cancelled) return;
        const tryAttach = async () => {
          const node = document.getElementById("square-card-element");
          if (node) {
            await card.attach("#square-card-element");
            if (!cancelled) {
              stateRef.current = { payments, card };
              setSdkReady(true);
            }
          } else {
            setTimeout(tryAttach, 50);
          }
        };
        await tryAttach();
      } catch (e: any) {
        setStatusMsg({ type: "err", text: "Could not load Square: " + (e?.message || "unknown error") });
      }
    }

    if ((window as any).Square) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = sdkUrl;
      script.onload = init;
      script.onerror = () =>
        setStatusMsg({ type: "err", text: "Failed to load Square Web Payments SDK" });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      try {
        stateRef.current?.card?.destroy();
      } catch {}
    };
  }, [applicationId, locationId, environment]);

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
      setStatusMsg({ type: "err", text: "Square is still loading — try again in a moment" });
      return;
    }
    setSubmitting(true);
    try {
      const tokenResult = await stateRef.current.card.tokenize();
      if (tokenResult.status !== "OK") {
        const errCode = tokenResult.errors?.[0]?.type as string | undefined;
        const errDetail = tokenResult.errors?.[0]?.message || "Card details rejected";
        const friendly = friendlySquareError(errCode || null, errDetail);
        setStatusMsg({ type: "err", text: friendly.text, hint: friendly.hint });
        setSubmitting(false);
        return;
      }
      const res = await apiRequest("POST", "/api/staff/payments/square/charge", {
        sourceId: tokenResult.token,
        amountPence: Math.round(amt * 100),
        description: description.trim(),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
      });
      const body = (await res.json()) as { ok?: boolean; status?: string; message?: string; errorCode?: string | null };
      if (!res.ok || !body.ok) {
        const friendly = friendlySquareError(body.errorCode || null, body.message || `Payment ${body.status || "failed"}`);
        setStatusMsg({ type: "err", text: friendly.text, hint: friendly.hint });
      } else {
        setStatusMsg({
          type: "ok",
          text: "Charged " + formatGBP(Math.round(amt * 100)) + " successfully",
          hint: customerEmail.trim() ? "A receipt has been emailed to the customer." : undefined,
        });
        setAmount("");
        setDescription("");
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("");
        onSuccess();
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Payment failed" });
    } finally {
      setSubmitting(false);
    }
  }

  const amtPence = Math.round((parseFloat(amount) || 0) * 100);

  return (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View style={[styles.formIconWrap, { backgroundColor: "#006AFF1A" }]}>
          <Ionicons name="phone-portrait" size={20} color="#006AFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitle}>Take a card payment</Text>
          <Text style={styles.formSubtitle}>Powered by Square · MOTO auto-detected</Text>
        </View>
      </View>

      <View style={styles.infoNote}>
        <Ionicons name="information-circle" size={16} color={Colors.brand.blue} />
        <Text style={styles.infoNoteText}>
          Phone payments are charged at your Square MOTO rate automatically — no toggle needed.
        </Text>
      </View>

      <View style={styles.divider} />
      <Text style={styles.formSection}>Amount</Text>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.inputPrefixWrap}>
            <Text style={styles.inputPrefix}>£</Text>
            <TextInput
              style={styles.inputPrefixed}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.light.textSecondary}
            />
          </View>
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

      <View style={styles.divider} />
      <Text style={styles.formSection}>Customer details (optional)</Text>

      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Full name" placeholderTextColor={Colors.light.textSecondary} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email <Text style={styles.labelHint}>(sends receipt)</Text></Text>
          <TextInput
            style={styles.input}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={Colors.light.textSecondary}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="07…" keyboardType="phone-pad" placeholderTextColor={Colors.light.textSecondary} />
      </View>

      <View style={styles.divider} />
      <Text style={styles.formSection}>Card</Text>

      <View style={styles.field}>
        <View style={styles.cardElementWrap}>
          {React.createElement("div" as any, {
            id: "square-card-element",
            style: { padding: "14px", background: "#fff", borderRadius: "8px", minHeight: 56 },
          })}
        </View>
        {!sdkReady && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.light.textSecondary} />
            <Text style={styles.helperMuted}>Loading secure card field…</Text>
          </View>
        )}
      </View>

      {statusMsg && <StatusBanner msg={statusMsg} />}

      <Pressable
        style={[styles.primaryBtn, (!sdkReady || submitting) && styles.primaryBtnDisabled]}
        disabled={!sdkReady || submitting}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="lock-closed" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {amtPence >= 50 ? `Charge ${formatGBP(amtPence)}` : "Charge card"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function PaymentLogTable({ logs, onRefresh }: { logs: PaymentLog[]; onRefresh: () => void }) {
  // Today's totals (succeeded only)
  const todayKey = new Date().toDateString();
  const todaysSucceeded = logs.filter(
    (l) => l.status === "succeeded" && new Date(l.createdAt).toDateString() === todayKey
  );
  const todaysTotal = todaysSucceeded.reduce((sum, l) => sum + l.amountPence, 0);
  const todaysCount = todaysSucceeded.length;

  return (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Recent payments</Text>
          <Text style={styles.logSummary}>
            {todaysCount === 0
              ? "No payments today yet"
              : `${todaysCount} payment${todaysCount === 1 ? "" : "s"} today · ${formatGBP(
                  todaysTotal
                )}`}
          </Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={16} color={Colors.brand.blue} />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      </View>
      {logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={32} color={Colors.light.textSecondary} />
          <Text style={styles.cardSub}>No payments yet.{"\n"}Take a payment above to get started.</Text>
        </View>
      ) : (
        logs.slice(0, 25).map((log) => {
          const isOk = log.status === "succeeded";
          const isFail = log.status === "failed";
          const pillStyle = isOk ? styles.pillOk : isFail ? styles.pillErr : styles.pillPending;
          const pillTextStyle = isOk ? styles.pillTextOk : isFail ? styles.pillTextErr : styles.pillTextPending;
          return (
            <View key={log.id} style={styles.logRow}>
              <View style={[styles.logIconCol, isOk ? styles.logIconOk : isFail ? styles.logIconErr : styles.logIconPending]}>
                <Ionicons
                  name={isOk ? "checkmark" : isFail ? "close" : "time"}
                  size={16}
                  color={isOk ? "#047857" : isFail ? "#B91C1C" : "#92400E"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.logTopRow}>
                  <Text style={styles.logAmount}>{formatGBP(log.amountPence)}</Text>
                  <View style={[styles.statusPill, pillStyle]}>
                    <Text style={[styles.statusPillText, pillTextStyle]}>{log.status}</Text>
                  </View>
                </View>
                <Text style={styles.logDesc} numberOfLines={1}>{log.description}</Text>
                <Text style={styles.logMeta}>
                  {formatDate(log.createdAt)}
                  {log.customerName ? " · " + log.customerName : ""}
                  {log.staffDisplayName ? " · " + log.staffDisplayName : ""}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 4 },
  title: { fontSize: 24, fontWeight: "700", color: Colors.light.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  iconBtn: { padding: 6, borderRadius: 8 },
  tabsRow: { flexDirection: "row", gap: 8, marginBottom: 20, padding: 4, backgroundColor: Colors.light.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 7,
    backgroundColor: "transparent",
  },
  tabBtnActive: { backgroundColor: Colors.brand.blue },
  tabText: { color: Colors.light.textSecondary, fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#fff" },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
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
  openExternalBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  openExternalText: { fontSize: 13, fontWeight: "600", color: Colors.brand.blue },
  iframeLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.textSecondary },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  linkBtnText: { color: Colors.brand.blue, fontSize: 13, fontWeight: "600" },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  formHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  formIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  formTitle: { fontSize: 17, fontWeight: "700", color: Colors.light.text },
  formSubtitle: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  formSection: { fontSize: 11, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: Colors.light.border, marginVertical: 2 },
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    padding: 10,
  },
  infoNoteText: { flex: 1, fontSize: 12, color: "#1E3A8A", lineHeight: 17 },
  processorRow: { flexDirection: Platform.OS === "web" ? "row" : "column", gap: 10, marginBottom: 16 },
  procCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    shadowOpacity: 0,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  procIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  procTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  procBtnDisabled: { opacity: 0.5 },
  procText: { fontSize: 15, fontWeight: "700", color: Colors.light.text },
  procHint: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  procBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  procBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff", textTransform: "uppercase", letterSpacing: 0.4 },
  procBadgeDim: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: "#F1F5F9" },
  procBadgeDimText: { fontSize: 10, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  row2: { flexDirection: Platform.OS === "web" ? "row" : "column", gap: 12 },
  field: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.light.text },
  labelHint: { fontWeight: "400", color: Colors.light.textSecondary, fontSize: 12 },
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
  inputPrefixWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  inputPrefix: { paddingLeft: 12, paddingRight: 4, fontSize: 16, fontWeight: "600", color: Colors.light.textSecondary },
  inputPrefixed: { flex: 1, paddingHorizontal: 8, paddingVertical: 10, fontSize: 16, color: Colors.light.text, fontWeight: "600" },
  cardElementWrap: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  helperMuted: { fontSize: 12, color: Colors.light.textSecondary },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  checkLabel: { fontSize: 14, color: Colors.light.text, flex: 1 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  bannerOk: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  bannerErr: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  bannerText: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  bannerHint: { fontSize: 13, fontWeight: "500", lineHeight: 18, marginTop: 4, opacity: 0.9 },
  primaryBtn: {
    flexDirection: "row",
    backgroundColor: Colors.brand.blue,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginTop: 16,
  },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 12 },
  logSummary: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#DBEAFE" },
  refreshBtnText: { fontSize: 13, fontWeight: "600", color: Colors.brand.blue },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 10 },
  logRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    width: "100%",
    gap: 12,
  },
  logIconCol: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  logIconOk: { backgroundColor: "#D1FAE5" },
  logIconErr: { backgroundColor: "#FEE2E2" },
  logIconPending: { backgroundColor: "#FEF3C7" },
  logTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  logAmount: { fontSize: 16, fontWeight: "700", color: Colors.light.text },
  logDesc: { fontSize: 13, color: Colors.light.text, marginTop: 3 },
  logMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  pillOk: { backgroundColor: "#D1FAE5" },
  pillErr: { backgroundColor: "#FEE2E2" },
  pillPending: { backgroundColor: "#FEF3C7" },
  statusPillText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  pillTextOk: { color: "#065F46" },
  pillTextErr: { color: "#991B1B" },
  pillTextPending: { color: "#92400E" },
});
