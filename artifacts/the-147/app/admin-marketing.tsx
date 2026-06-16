import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { MarketingCampaign, EmailAutomation } from "@workspace/db/schema";

// ── Campaign types ─────────────────────────────────────────────────────────────

type AudienceKey = "all" | "members" | "loyalty" | "recent_30" | "recent_90";

const AUDIENCES: { key: AudienceKey; label: string; description: string; icon: string }[] = [
  { key: "all",       label: "All Customers",    description: "Everyone with an account",          icon: "people" },
  { key: "members",   label: "Members Only",      description: "Active membership subscribers",    icon: "card" },
  { key: "loyalty",   label: "Loyalty Members",   description: "Customers in the loyalty scheme",  icon: "ribbon" },
  { key: "recent_30", label: "Recent (30 days)",  description: "Visited or booked in last month",  icon: "time" },
  { key: "recent_90", label: "Recent (90 days)",  description: "Visited or booked in last 90 days",icon: "calendar" },
];

const STATUS_COLORS: Record<string, string> = {
  draft:   "#6B7280",
  sending: "#F59E0B",
  sent:    "#059669",
  failed:  "#DC2626",
};

const STATUS_LABELS: Record<string, string> = {
  draft:   "Draft",
  sending: "Sending…",
  sent:    "Sent",
  failed:  "Failed",
};

interface CampaignForm {
  title: string;
  subject: string;
  bodyText: string;
  audience: AudienceKey;
}

const EMPTY_FORM: CampaignForm = { title: "", subject: "", bodyText: "", audience: "all" };

// ── Automation types ───────────────────────────────────────────────────────────

interface AutomationConfig {
  type: string;
  title: string;
  description: string;
  how: string;
  icon: keyof typeof Ionicons.glyphMap;
  defaultSubject: string;
  defaultBody: string;
  showDaysConfig?: boolean;
  showGiftCardConfig?: boolean;
}

const AUTOMATION_CONFIGS: AutomationConfig[] = [
  {
    type: "birthday",
    title: "Birthday Voucher",
    description: "Sends a personalised email during each customer's birthday week",
    how: "Runs automatically once daily. Uses the birthday date customers provide in the app.",
    icon: "gift",
    defaultSubject: "🎂 Happy Birthday from The 147!",
    defaultBody: "Hi there,\n\nWishing you a wonderful birthday from all of us at The 147 Bradford!\n\nAs a little birthday treat, why not come in for a frame this week? We'd love to celebrate with you.\n\nSee you at the table,\nThe 147 Team",
    showGiftCardConfig: true,
  },
  {
    type: "welcome",
    title: "Welcome Email",
    description: "Sent automatically when a new customer creates an account",
    how: "Fires immediately on registration — no delay.",
    icon: "person-add",
    defaultSubject: "Welcome to The 147 Bradford! 🎱",
    defaultBody: "Hi there,\n\nWelcome to The 147 Bradford — we're thrilled to have you!\n\nYou can now book snooker and pool tables, browse our food and drinks menu, and start earning loyalty points with every visit.\n\nSee you at the table soon,\nThe 147 Team",
  },
  {
    type: "win_back",
    title: "Win-back",
    description: "Re-engages customers who haven't visited in a while",
    how: "Runs daily. Only contacts customers who haven't booked within the configured window. Won't re-send to the same customer within 90 days.",
    icon: "refresh",
    defaultSubject: "We miss you at The 147! 🎱",
    defaultBody: "Hi there,\n\nIt's been a while since we've seen you — we miss you!\n\nCome back in for a game of snooker or pool. Our tables are ready and waiting.\n\nBook your table through the app anytime.\n\nHope to see you soon,\nThe 147 Team",
    showDaysConfig: true,
  },
];

interface AutomationForm {
  enabled: boolean;
  subject: string;
  bodyText: string;
  winBackDays: number;
  giftCardAmountPence: number; // birthday only — 0 means no gift card
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AdminMarketingScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading, username } = useStaffAuth();
  const canManage = isManager || isOwner;

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"campaigns" | "automations">("campaigns");

  // ── Campaign state ─────────────────────────────────────────────────────────
  const [view, setView] = useState<"list" | "compose">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [sendModal, setSendModal] = useState<{ id: number; audienceLabel: string } | null>(null);
  const [testModal, setTestModal] = useState<{ id: number } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Automation state ───────────────────────────────────────────────────────
  const [expandedAuto, setExpandedAuto] = useState<string | null>(null);
  const [autoForms, setAutoForms] = useState<Record<string, AutomationForm>>({});

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !canManage)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, canManage]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const campaignsQuery = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/staff/email-campaigns"],
    enabled: isAuthenticated && canManage,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const data = query.state.data as MarketingCampaign[] | undefined;
      return data?.some(c => c.status === "sending") ? 3000 : false;
    },
  });

  const audienceCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/staff/email-campaigns/audience-count", form.audience],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staff/email-campaigns/audience-count?audience=${form.audience}`);
      return res.json();
    },
    enabled: view === "compose" && isAuthenticated,
    staleTime: 30_000,
  });

  const automationsQuery = useQuery<EmailAutomation[]>({
    queryKey: ["/api/staff/email-automations"],
    enabled: isAuthenticated && canManage,
    refetchOnMount: "always",
  });

  // Seed form state when automations load
  useEffect(() => {
    if (!automationsQuery.data) return;
    const next: Record<string, AutomationForm> = {};
    for (const cfg of AUTOMATION_CONFIGS) {
      const saved = automationsQuery.data.find(a => a.triggerType === cfg.type);
      next[cfg.type] = {
        enabled:             saved?.enabled             ?? false,
        subject:             saved?.subject             || cfg.defaultSubject,
        bodyText:            saved?.bodyText            || cfg.defaultBody,
        winBackDays:         saved?.winBackDays         ?? 90,
        giftCardAmountPence: saved?.giftCardAmountPence ?? 0,
      };
    }
    setAutoForms(next);
  }, [automationsQuery.data]);

  // ── Campaign mutations ─────────────────────────────────────────────────────

  const saveCampaign = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const res = await apiRequest("PUT", `/api/staff/email-campaigns/${editingId}`, form);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/staff/email-campaigns", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] });
      setView("list");
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => Alert.alert("Save failed", err?.message || "Please try again."),
  });

  const sendCampaign = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/staff/email-campaigns/${id}/send`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSendModal(null);
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] });
      Alert.alert("Sending!", `Campaign is being sent to ${data.recipientCount ?? "your"} recipients.`);
    },
    onError: (err: any) => {
      setSendModal(null);
      Alert.alert("Send failed", err?.message || "Please try again.");
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/staff/email-campaigns/${id}`); },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] }),
    onError: (err: any) => Alert.alert("Delete failed", err?.message || "Please try again."),
  });

  const testSendCampaign = useMutation({
    mutationFn: async ({ id, email }: { id: number; email: string }) => {
      const res = await apiRequest("POST", `/api/staff/email-campaigns/${id}/test-send`, { email });
      return res.json();
    },
    onSuccess: () => {
      setTestResult({ ok: true, message: "Test email sent — check your inbox." });
    },
    onError: (err: any) => {
      setTestResult({ ok: false, message: err?.message || "Failed to send test email." });
    },
  });

  // ── Automation mutation ────────────────────────────────────────────────────

  const saveAutomation = useMutation({
    mutationFn: async (type: string) => {
      const f = autoForms[type];
      if (!f) throw new Error("No form data");
      const res = await apiRequest("PUT", `/api/staff/email-automations/${type}`, f);
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-automations"] });
      setExpandedAuto(null);
      Alert.alert("Saved", "Automation settings updated.");
    },
    onError: (err: any) => Alert.alert("Save failed", err?.message || "Please try again."),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openNew = useCallback(() => { setEditingId(null); setForm(EMPTY_FORM); setView("compose"); }, []);
  const openEdit = useCallback((c: MarketingCampaign) => {
    setEditingId(c.id);
    setForm({ title: c.title, subject: c.subject, bodyText: c.bodyText, audience: c.audience as AudienceKey });
    setView("compose");
  }, []);

  const confirmSend = useCallback((id: number, audienceLabel: string) => {
    setSendModal({ id, audienceLabel });
  }, []);

  const confirmDelete = useCallback((id: number) => {
    Alert.alert("Delete draft?", "This draft will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteCampaign.mutate(id) },
    ]);
  }, [deleteCampaign]);

  const patchAutoForm = (type: string, patch: Partial<AutomationForm>) => {
    setAutoForms(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  };

  const toggleAutomation = (type: string, val: boolean) => {
    patchAutoForm(type, { enabled: val });
  };

  const campaigns = campaignsQuery.data ?? [];
  const sentCampaigns = campaigns.filter(c => c.status === "sent");
  const totalSent = sentCampaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
  const selectedAudience = AUDIENCES.find(a => a.key === form.audience) ?? AUDIENCES[0];
  const canSaveForm = form.title.trim() && form.subject.trim() && form.bodyText.trim();

  // ── Compose view (full-screen, no tabs) ────────────────────────────────────

  if (view === "compose") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.brand.dark }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.composeScroll, { paddingTop: insets.top + webTopInset + 12, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.composeHeader}>
            <Pressable onPress={() => { setView("list"); setEditingId(null); setForm(EMPTY_FORM); }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.brand.gold} />
            </Pressable>
            <Text style={styles.composeTitle}>{editingId ? "Edit Draft" : "New Campaign"}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Campaign Name</Text>
            <Text style={styles.fieldHint}>Internal only — customers never see this</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={t => setForm(f => ({ ...f, title: t }))} placeholder="e.g. June Members Promotion" placeholderTextColor="rgba(255,255,255,0.3)" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Subject Line</Text>
            <Text style={styles.fieldHint}>What customers see in their inbox</Text>
            <TextInput style={styles.input} value={form.subject} onChangeText={t => setForm(f => ({ ...f, subject: t }))} placeholder="e.g. Special offer for our valued members 🎱" placeholderTextColor="rgba(255,255,255,0.3)" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Audience</Text>
            <Text style={styles.fieldHint}>Who receives this email</Text>
            <Pressable style={styles.audienceSelector} onPress={() => setShowAudiencePicker(p => !p)}>
              <View style={styles.audienceSelectorInner}>
                <Ionicons name={selectedAudience.icon as any} size={18} color={Colors.brand.gold} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.audienceSelectorLabel}>{selectedAudience.label}</Text>
                  <Text style={styles.audienceSelectorDesc}>{selectedAudience.description}</Text>
                </View>
                {audienceCountQuery.isFetching ? (
                  <ActivityIndicator size="small" color={Colors.brand.gold} />
                ) : audienceCountQuery.data ? (
                  <Text style={styles.audienceCount}>{audienceCountQuery.data.count} recipients</Text>
                ) : null}
                <Ionicons name={showAudiencePicker ? "chevron-up" : "chevron-down"} size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 8 }} />
              </View>
            </Pressable>
            {showAudiencePicker && (
              <View style={styles.audienceDropdown}>
                {AUDIENCES.map(a => (
                  <Pressable key={a.key} style={[styles.audienceOption, form.audience === a.key && styles.audienceOptionActive]}
                    onPress={() => { setForm(f => ({ ...f, audience: a.key })); setShowAudiencePicker(false); }}>
                    <Ionicons name={a.icon as any} size={16} color={form.audience === a.key ? Colors.brand.gold : "rgba(255,255,255,0.6)"} />
                    <View style={{ marginLeft: 10 }}>
                      <Text style={[styles.audienceOptionLabel, form.audience === a.key && { color: Colors.brand.gold }]}>{a.label}</Text>
                      <Text style={styles.audienceOptionDesc}>{a.description}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Message</Text>
            <Text style={styles.fieldHint}>Use blank lines to separate paragraphs</Text>
            <TextInput style={[styles.input, styles.bodyInput]} value={form.bodyText} onChangeText={t => setForm(f => ({ ...f, bodyText: t }))}
              placeholder={"Hi there,\n\nWe wanted to share something with you…\n\nSee you at the table,\nThe 147 Team"} placeholderTextColor="rgba(255,255,255,0.3)" multiline textAlignVertical="top" />
          </View>

          {form.subject.trim() && form.bodyText.trim() && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Ionicons name="eye-outline" size={14} color={Colors.brand.gold} />
                <Text style={styles.previewHeaderText}>Email Preview</Text>
              </View>
              <View style={styles.previewBrand}>
                <Text style={styles.previewBrandNum}>147</Text>
                <Text style={styles.previewBrandName}>THE 147 BRADFORD</Text>
              </View>
              <Text style={styles.previewSubject}>{form.subject}</Text>
              <Text style={styles.previewBody}>{form.bodyText}</Text>
              <Text style={styles.previewFooter}>The 147 Bradford · Snooker &amp; Bar</Text>
            </View>
          )}

          <Pressable
            style={[styles.saveBtn, (!canSaveForm || saveCampaign.isPending) && styles.btnDisabled]}
            onPress={() => canSaveForm && saveCampaign.mutate()}
            disabled={!canSaveForm || saveCampaign.isPending}
          >
            {saveCampaign.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
            <Text style={styles.saveBtnText}>{editingId ? "Update Draft" : "Save Draft"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── List / Automations view ────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff-portal")} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.brand.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Email Marketing</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tabBtn, activeTab === "campaigns" && styles.tabBtnActive]} onPress={() => setActiveTab("campaigns")}>
          <Ionicons name="mail" size={16} color={activeTab === "campaigns" ? Colors.brand.gold : "rgba(255,255,255,0.45)"} />
          <Text style={[styles.tabBtnText, activeTab === "campaigns" && styles.tabBtnTextActive]}>Campaigns</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === "automations" && styles.tabBtnActive]} onPress={() => setActiveTab("automations")}>
          <Ionicons name="flash" size={16} color={activeTab === "automations" ? Colors.brand.gold : "rgba(255,255,255,0.45)"} />
          <Text style={[styles.tabBtnText, activeTab === "automations" && styles.tabBtnTextActive]}>Automations</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* ── CAMPAIGNS TAB ────────────────────────────────────────────────── */}
        {activeTab === "campaigns" && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{campaigns.length}</Text>
                <Text style={styles.statLabel}>Total campaigns</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{sentCampaigns.length}</Text>
                <Text style={styles.statLabel}>Sent</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalSent.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Emails delivered</Text>
              </View>
            </View>

            <View style={styles.newBtnRow}>
              <Pressable style={styles.newBtn} onPress={openNew}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.newBtnText}>New Campaign</Text>
              </Pressable>
            </View>

            {campaignsQuery.isLoading ? (
              <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
            ) : campaigns.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyTitle}>No campaigns yet</Text>
                <Text style={styles.emptyBody}>Create a campaign to send a broadcast email to your customers.</Text>
              </View>
            ) : (
              <View style={styles.campaignList}>
                {campaigns.map(c => {
                  const audienceInfo = AUDIENCES.find(a => a.key === c.audience) ?? AUDIENCES[0];
                  const isDraft = c.status === "draft";
                  const isSent = c.status === "sent";
                  const isSending = c.status === "sending";
                  return (
                    <View key={c.id} style={styles.campaignCard}>
                      <View style={styles.campaignCardTop}>
                        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[c.status] ?? "#6B7280" }]} />
                        <Text style={[styles.statusBadge, { color: STATUS_COLORS[c.status] ?? "#6B7280" }]}>{STATUS_LABELS[c.status] ?? c.status}</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={styles.campaignDate}>
                          {isSent && c.sentAt
                            ? new Date(c.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                      </View>
                      <Text style={styles.campaignTitle} numberOfLines={1}>{c.title}</Text>
                      <Text style={styles.campaignSubject} numberOfLines={1}>{c.subject}</Text>
                      <View style={styles.campaignMeta}>
                        <Ionicons name={audienceInfo.icon as any} size={13} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.campaignMetaText}>{audienceInfo.label}</Text>
                      </View>
                      {(isDraft || isSending) && (
                        <View style={styles.campaignActions}>
                          {isDraft && (
                            <>
                              <Pressable style={styles.cardActionBtn} onPress={() => openEdit(c)}>
                                <Ionicons name="create-outline" size={15} color={Colors.brand.gold} />
                                <Text style={[styles.cardActionText, { color: Colors.brand.gold }]}>Edit</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.cardActionBtn, styles.cardActionSend]}
                                onPress={() => confirmSend(c.id, audienceInfo.label.toLowerCase())}
                                disabled={sendCampaign.isPending}
                              >
                                {sendCampaign.isPending && sendCampaign.variables === c.id
                                  ? <ActivityIndicator size="small" color="#fff" />
                                  : <Ionicons name="send" size={14} color="#fff" />}
                                <Text style={[styles.cardActionText, { color: "#fff" }]}>Send</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.cardActionBtn, styles.cardActionTest]}
                                onPress={() => {
                                  setTestEmail(username?.includes("@") ? username : "");
                                  setTestResult(null);
                                  setTestModal({ id: c.id });
                                }}
                              >
                                <Ionicons name="flask-outline" size={14} color="#fff" />
                                <Text style={[styles.cardActionText, { color: "#fff" }]}>Test</Text>
                              </Pressable>
                              <Pressable style={styles.cardActionBtn} onPress={() => confirmDelete(c.id)}>
                                <Ionicons name="trash-outline" size={15} color="#DC2626" />
                              </Pressable>
                            </>
                          )}
                          {isSending && (
                            <View style={styles.sendingRow}>
                              <ActivityIndicator size="small" color={Colors.brand.gold} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.sendingText}>Sending to {audienceInfo.label.toLowerCase()}…</Text>
                                {(c.sentCount ?? 0) > 0 && (
                                  <Text style={styles.sendingCount}>{c.sentCount} sent so far</Text>
                                )}
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                      {(isSent || c.status === "failed") && (
                        <View style={[
                          styles.deliverySummary,
                          c.status === "failed" && (c.sentCount ?? 0) === 0
                            ? styles.deliverySummaryFailed
                            : (c.failedCount ?? 0) > 0
                              ? styles.deliverySummaryPartial
                              : styles.deliverySummaryOk,
                        ]}>
                          <View style={styles.deliverySummaryRow}>
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color="#059669"
                            />
                            <Text style={styles.deliverySummaryDelivered}>
                              {c.sentCount ?? 0} delivered
                            </Text>
                            {(c.failedCount ?? 0) > 0 && (
                              <>
                                <Text style={styles.deliverySummaryDot}>·</Text>
                                <Ionicons name="alert-circle" size={14} color="#DC2626" />
                                <Text style={styles.deliverySummaryFail}>
                                  {c.failedCount} failed
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── AUTOMATIONS TAB ──────────────────────────────────────────────── */}
        {activeTab === "automations" && (
          <View style={styles.autoList}>
            <View style={styles.autoIntro}>
              <Ionicons name="flash" size={16} color={Colors.brand.gold} />
              <Text style={styles.autoIntroText}>
                Automations run automatically using your existing email setup — no extra service needed.
              </Text>
            </View>

            {AUTOMATION_CONFIGS.map(cfg => {
              const f = autoForms[cfg.type];
              const isExpanded = expandedAuto === cfg.type;
              const isSaving = saveAutomation.isPending && saveAutomation.variables === cfg.type;

              return (
                <View key={cfg.type} style={[styles.autoCard, f?.enabled && styles.autoCardActive]}>
                  {/* Header row */}
                  <View style={styles.autoCardHeader}>
                    <View style={[styles.autoIconWrap, f?.enabled && { backgroundColor: "rgba(212,168,67,0.15)" }]}>
                      <Ionicons name={cfg.icon} size={20} color={f?.enabled ? Colors.brand.gold : "rgba(255,255,255,0.4)"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.autoTitle}>{cfg.title}</Text>
                      <Text style={styles.autoDesc}>{cfg.description}</Text>
                    </View>
                    <Switch
                      value={f?.enabled ?? false}
                      onValueChange={val => toggleAutomation(cfg.type, val)}
                      trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(212,168,67,0.4)" }}
                      thumbColor={f?.enabled ? Colors.brand.gold : "rgba(255,255,255,0.5)"}
                    />
                  </View>

                  {/* How it works */}
                  <View style={styles.autoHowRow}>
                    <Ionicons name="information-circle-outline" size={13} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.autoHow}>{cfg.how}</Text>
                  </View>

                  {/* Expand/collapse edit section */}
                  <Pressable style={styles.autoExpandBtn} onPress={() => setExpandedAuto(isExpanded ? null : cfg.type)}>
                    <Ionicons name={isExpanded ? "chevron-up" : "settings-outline"} size={14} color={Colors.brand.gold} />
                    <Text style={styles.autoExpandText}>{isExpanded ? "Collapse" : "Edit template"}</Text>
                  </Pressable>

                  {isExpanded && f && (
                    <View style={styles.autoEditForm}>
                      {/* Win-back days config */}
                      {cfg.showDaysConfig && (
                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>Inactive days threshold</Text>
                          <Text style={styles.fieldHint}>Send to customers who haven't booked in this many days</Text>
                          <TextInput
                            style={[styles.input, { marginTop: 4 }]}
                            value={String(f.winBackDays)}
                            onChangeText={t => patchAutoForm(cfg.type, { winBackDays: parseInt(t) || 90 })}
                            keyboardType="number-pad"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                          />
                        </View>
                      )}

                      {/* Birthday Square gift card config */}
                      {cfg.showGiftCardConfig && (
                        <View style={styles.fieldGroup}>
                          <Text style={styles.fieldLabel}>Birthday Gift Card Value</Text>
                          <Text style={styles.fieldHint}>
                            A real Square digital gift card will be created and emailed to each customer on their birthday. Leave at £0 to send the email only (no card).
                          </Text>
                          <View style={styles.giftCardRow}>
                            <View style={[styles.giftCardIconWrap, (f.giftCardAmountPence ?? 0) > 0 && styles.giftCardIconWrapActive]}>
                              <Ionicons name="card" size={18} color={(f.giftCardAmountPence ?? 0) > 0 ? Colors.brand.gold : "rgba(255,255,255,0.35)"} />
                            </View>
                            <Text style={styles.giftCardCurrency}>£</Text>
                            <TextInput
                              style={[styles.input, styles.giftCardInput]}
                              value={f.giftCardAmountPence > 0 ? String(f.giftCardAmountPence / 100) : ""}
                              onChangeText={t => {
                                const pounds = parseFloat(t) || 0;
                                patchAutoForm(cfg.type, { giftCardAmountPence: Math.round(pounds * 100) });
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                          </View>
                          {(f.giftCardAmountPence ?? 0) > 0 && (
                            <View style={styles.giftCardNote}>
                              <Ionicons name="information-circle-outline" size={14} color={Colors.brand.gold} />
                              <Text style={styles.giftCardNoteText}>
                                A £{(f.giftCardAmountPence / 100).toFixed(2)} Square gift card will be created in your Square account and linked to the customer. The GAN code appears in the email.
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Subject Line</Text>
                        <TextInput
                          style={[styles.input, { marginTop: 4 }]}
                          value={f.subject}
                          onChangeText={t => patchAutoForm(cfg.type, { subject: t })}
                          placeholder={cfg.defaultSubject}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Message Body</Text>
                        <Text style={styles.fieldHint}>Use blank lines to separate paragraphs</Text>
                        <TextInput
                          style={[styles.input, styles.autoBodyInput]}
                          value={f.bodyText}
                          onChangeText={t => patchAutoForm(cfg.type, { bodyText: t })}
                          placeholder={cfg.defaultBody}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          multiline
                          textAlignVertical="top"
                        />
                      </View>

                      {/* Preview */}
                      {f.subject.trim() && f.bodyText.trim() && (
                        <View style={[styles.previewCard, { marginBottom: 16 }]}>
                          <View style={styles.previewHeader}>
                            <Ionicons name="eye-outline" size={14} color={Colors.brand.gold} />
                            <Text style={styles.previewHeaderText}>Email Preview</Text>
                          </View>
                          <View style={styles.previewBrand}>
                            <Text style={styles.previewBrandNum}>147</Text>
                            <Text style={styles.previewBrandName}>THE 147 BRADFORD</Text>
                          </View>
                          <Text style={styles.previewSubject}>{f.subject}</Text>
                          <Text style={styles.previewBody}>{f.bodyText}</Text>
                          <Text style={styles.previewFooter}>The 147 Bradford · Snooker &amp; Bar</Text>
                        </View>
                      )}

                      <Pressable
                        style={[styles.saveBtn, isSaving && styles.btnDisabled]}
                        onPress={() => saveAutomation.mutate(cfg.type)}
                        disabled={isSaving}
                      >
                        {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
                        <Text style={styles.saveBtnText}>Save Automation</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Send confirmation modal ─────────────────────────────────────── */}
      <Modal
        visible={!!sendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSendModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalIconRow}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="send" size={22} color="#fff" />
              </View>
            </View>
            <Text style={styles.modalTitle}>Send campaign?</Text>
            <Text style={styles.modalBody}>
              This will email <Text style={{ color: "#fff", fontWeight: "700" }}>{sendModal?.audienceLabel}</Text>.{"\n"}This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setSendModal(null)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtnConfirm, styles.modalBtnSend, sendCampaign.isPending && styles.btnDisabled]}
                disabled={sendCampaign.isPending}
                onPress={() => { if (sendModal) sendCampaign.mutate(sendModal.id); }}
              >
                {sendCampaign.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : (<>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.modalBtnConfirmText}>Send now</Text>
                    </>)}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Test email modal ────────────────────────────────────────────── */}
      <Modal
        visible={!!testModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setTestModal(null); setTestResult(null); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalIconRow}>
                <View style={[styles.modalIconWrap, { backgroundColor: "rgba(212,168,67,0.3)" }]}>
                  <Ionicons name="flask-outline" size={22} color={Colors.brand.gold} />
                </View>
              </View>
              <Text style={styles.modalTitle}>Send test email</Text>
              <Text style={styles.modalBody}>Enter the email address to send the test to.</Text>
              <TextInput
                style={styles.modalInput}
                value={testEmail}
                onChangeText={t => { setTestEmail(t); setTestResult(null); }}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {testResult && (
                <View style={[styles.testResultBanner, testResult.ok ? styles.testResultOk : styles.testResultErr]}>
                  <Ionicons name={testResult.ok ? "checkmark-circle" : "alert-circle"} size={16} color={testResult.ok ? "#059669" : "#DC2626"} />
                  <Text style={[styles.testResultText, { color: testResult.ok ? "#059669" : "#DC2626" }]}>{testResult.message}</Text>
                </View>
              )}
              <View style={styles.modalActions}>
                <Pressable style={styles.modalBtnCancel} onPress={() => { setTestModal(null); setTestResult(null); }}>
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtnConfirm, (!testEmail.trim() || testSendCampaign.isPending) && styles.btnDisabled]}
                  disabled={!testEmail.trim() || testSendCampaign.isPending}
                  onPress={() => {
                    if (!testModal) return;
                    setTestResult(null);
                    testSendCampaign.mutate({ id: testModal.id, email: testEmail.trim() });
                  }}
                >
                  {testSendCampaign.isPending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : (<>
                        <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                        <Text style={styles.modalBtnConfirmText}>Send test</Text>
                      </>)}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brand.dark },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },

  // ── Tab bar ────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: Colors.brand.gold },
  tabBtnText: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.45)" },
  tabBtnTextActive: { color: Colors.brand.gold },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16,
  },
  statCard: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.brand.gold },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3, textAlign: "center" },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 4 },

  // ── New campaign ───────────────────────────────────────────────────────────
  newBtnRow: { paddingHorizontal: 16, paddingTop: 14 },
  newBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.brand.blue, paddingVertical: 13, borderRadius: 11,
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // ── Empty ──────────────────────────────────────────────────────────────────
  emptyState: { alignItems: "center", paddingHorizontal: 40, paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "rgba(255,255,255,0.5)" },
  emptyBody: { fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 20 },

  // ── Campaign cards ─────────────────────────────────────────────────────────
  campaignList: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  campaignCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 14, gap: 6,
  },
  campaignCardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadge: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  campaignDate: { fontSize: 11, color: "rgba(255,255,255,0.35)" },
  campaignTitle: { fontSize: 15, fontWeight: "700", color: "#fff" },
  campaignSubject: { fontSize: 13, color: "rgba(255,255,255,0.5)", fontStyle: "italic" },
  campaignMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  campaignMetaText: { fontSize: 12, color: "rgba(255,255,255,0.4)" },
  campaignMetaDot: { color: "rgba(255,255,255,0.2)", fontSize: 12 },
  campaignActions: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)",
  },
  cardActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardActionSend: { backgroundColor: "#059669" },
  cardActionTest: { backgroundColor: "#6366F1" },
  cardActionText: { fontSize: 13, fontWeight: "600" },
  sendingRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sendingText: { fontSize: 13, color: Colors.brand.gold, fontStyle: "italic" },
  sendingCount: { fontSize: 11, color: "rgba(212,168,67,0.65)", marginTop: 2 },

  deliverySummary: {
    marginTop: 6, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1,
  },
  deliverySummaryOk: {
    backgroundColor: "rgba(5,150,105,0.1)",
    borderColor: "rgba(5,150,105,0.25)",
  },
  deliverySummaryPartial: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.2)",
  },
  deliverySummaryFailed: {
    backgroundColor: "rgba(220,38,38,0.08)",
    borderColor: "rgba(220,38,38,0.2)",
  },
  deliverySummaryRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  deliverySummaryDelivered: { fontSize: 12, fontWeight: "600", color: "#059669" },
  deliverySummaryFail: { fontSize: 12, fontWeight: "600", color: "#DC2626" },
  deliverySummaryDot: { fontSize: 12, color: "rgba(255,255,255,0.2)" },

  // ── Automations ────────────────────────────────────────────────────────────
  autoList: { padding: 16, gap: 12 },
  autoIntro: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(212,168,67,0.08)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(212,168,67,0.2)",
    padding: 12, marginBottom: 4,
  },
  autoIntroText: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 18 },
  autoCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 14, gap: 10,
  },
  autoCardActive: { borderColor: "rgba(212,168,67,0.25)" },
  autoCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  autoIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  autoTitle: { fontSize: 15, fontWeight: "700", color: "#fff" },
  autoDesc: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  autoHowRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  autoHow: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 16 },
  autoExpandBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: "rgba(212,168,67,0.08)", borderRadius: 8,
  },
  autoExpandText: { fontSize: 12, fontWeight: "600", color: Colors.brand.gold },
  autoEditForm: {
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)",
    paddingTop: 14, gap: 4,
  },
  autoBodyInput: { minHeight: 160, lineHeight: 22 },

  // ── Gift card config ───────────────────────────────────────────────────────
  giftCardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  giftCardIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  giftCardIconWrapActive: { backgroundColor: "rgba(212,168,67,0.12)" },
  giftCardCurrency: { fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  giftCardInput: { flex: 1, marginTop: 0 },
  giftCardNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8,
    padding: 10, backgroundColor: "rgba(212,168,67,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(212,168,67,0.2)",
  },
  giftCardNoteText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 17 },

  // ── Compose view ───────────────────────────────────────────────────────────
  composeScroll: { paddingHorizontal: 16 },
  composeHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  composeTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 13, fontWeight: "700", color: Colors.brand.gold,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3,
  },
  fieldHint: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 8 },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10, padding: 13, color: "#fff", fontSize: 15,
  },
  bodyInput: { minHeight: 180, lineHeight: 22 },
  audienceSelector: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10, padding: 13,
  },
  audienceSelectorInner: { flexDirection: "row", alignItems: "center" },
  audienceSelectorLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  audienceSelectorDesc: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1 },
  audienceCount: { fontSize: 12, color: Colors.brand.gold, fontWeight: "600" },
  audienceDropdown: {
    marginTop: 4, backgroundColor: "#0d1e35",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden",
  },
  audienceOption: {
    flexDirection: "row", alignItems: "center", padding: 13,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  audienceOptionActive: { backgroundColor: "rgba(212,168,67,0.1)" },
  audienceOptionLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  audienceOptionDesc: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  previewCard: {
    marginBottom: 20, backgroundColor: "#0d1e35",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(212,168,67,0.3)", overflow: "hidden",
  },
  previewHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: "rgba(212,168,67,0.08)",
    borderBottomWidth: 1, borderBottomColor: "rgba(212,168,67,0.15)",
  },
  previewHeaderText: { fontSize: 11, fontWeight: "700", color: Colors.brand.gold, letterSpacing: 0.8, textTransform: "uppercase" },
  previewBrand: {
    alignItems: "center", paddingVertical: 16,
    borderBottomWidth: 2, borderBottomColor: Colors.brand.gold, backgroundColor: "#0a1628",
  },
  previewBrandNum: { fontSize: 28, fontWeight: "900", color: Colors.brand.gold, letterSpacing: 4 },
  previewBrandName: { fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 3, marginTop: 4 },
  previewSubject: { fontSize: 16, fontWeight: "700", color: "#fff", padding: 16, paddingBottom: 8 },
  previewBody: { fontSize: 13, color: "rgba(255,255,255,0.75)", paddingHorizontal: 16, paddingBottom: 16, lineHeight: 20 },
  previewFooter: { fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },

  // ── Modals ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%", maxWidth: 360,
    backgroundColor: "#0d1e35",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    padding: 24, gap: 12,
  },
  modalIconRow: { alignItems: "center", marginBottom: 4 },
  modalIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(5,150,105,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#fff", textAlign: "center" },
  modalBody: { fontSize: 14, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 20 },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10, padding: 13, color: "#fff", fontSize: 15,
    marginTop: 4,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  modalBtnCancelText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "600" },
  modalBtnConfirm: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    paddingVertical: 13, borderRadius: 10,
    backgroundColor: Colors.brand.blue,
  },
  modalBtnSend: { backgroundColor: "#059669" },
  modalBtnConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  testResultBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: 8,
    borderWidth: 1,
  },
  testResultOk: { backgroundColor: "rgba(5,150,105,0.1)", borderColor: "rgba(5,150,105,0.3)" },
  testResultErr: { backgroundColor: "rgba(220,38,38,0.1)", borderColor: "rgba(220,38,38,0.3)" },
  testResultText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
