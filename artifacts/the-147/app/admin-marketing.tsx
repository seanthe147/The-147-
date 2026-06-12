import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { MarketingCampaign } from "@workspace/db/schema";

type AudienceKey = "all" | "members" | "loyalty" | "recent_30" | "recent_90";

const AUDIENCES: { key: AudienceKey; label: string; description: string; icon: string }[] = [
  { key: "all",       label: "All Customers",       description: "Everyone with an account",         icon: "people" },
  { key: "members",   label: "Members Only",         description: "Active membership subscribers",   icon: "card" },
  { key: "loyalty",   label: "Loyalty Members",      description: "Customers in the loyalty scheme", icon: "ribbon" },
  { key: "recent_30", label: "Recent (30 days)",     description: "Visited or booked in last month",  icon: "time" },
  { key: "recent_90", label: "Recent (90 days)",     description: "Visited or booked in last 90 days",icon: "calendar" },
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

interface FormState {
  title: string;
  subject: string;
  bodyText: string;
  audience: AudienceKey;
}

const EMPTY_FORM: FormState = { title: "", subject: "", bodyText: "", audience: "all" };

export default function AdminMarketingScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading } = useStaffAuth();
  const canManage = isManager || isOwner;

  const [view, setView] = useState<"list" | "compose">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);

  React.useEffect(() => {
    if (!authLoading && (!isAuthenticated || !canManage)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, canManage]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const campaignsQuery = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/staff/email-campaigns"],
    enabled: isAuthenticated && canManage,
    refetchOnMount: "always",
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

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const res = await apiRequest("PUT", `/api/staff/email-campaigns/${editingId}`, form);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/staff/email-campaigns", form);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] });
      setView("list");
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      Alert.alert("Save failed", err?.message || "Please try again.");
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/staff/email-campaigns/${id}/send`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] });
      Alert.alert(
        "Sending!",
        `Your campaign is being sent to ${data.recipientCount ?? "your"} recipients. The status will update when complete.`
      );
    },
    onError: (err: any) => {
      Alert.alert("Send failed", err?.message || "Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff/email-campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff/email-campaigns"] });
    },
    onError: (err: any) => {
      Alert.alert("Delete failed", err?.message || "Please try again.");
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openNew = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("compose");
  }, []);

  const openEdit = useCallback((c: MarketingCampaign) => {
    setEditingId(c.id);
    setForm({
      title:    c.title,
      subject:  c.subject,
      bodyText: c.bodyText,
      audience: c.audience as AudienceKey,
    });
    setView("compose");
  }, []);

  const confirmSend = useCallback((id: number, recipientLabel: string) => {
    Alert.alert(
      "Send campaign?",
      `This will email ${recipientLabel}. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send now", style: "destructive", onPress: () => sendMutation.mutate(id) },
      ]
    );
  }, [sendMutation]);

  const confirmDelete = useCallback((id: number) => {
    Alert.alert(
      "Delete draft?",
      "This draft will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }, [deleteMutation]);

  const canSaveForm = form.title.trim() && form.subject.trim() && form.bodyText.trim();
  const campaigns = campaignsQuery.data ?? [];
  const sentCampaigns = campaigns.filter(c => c.status === "sent");
  const totalSent = sentCampaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
  const selectedAudience = AUDIENCES.find(a => a.key === form.audience) ?? AUDIENCES[0];

  // ── Compose view ───────────────────────────────────────────────────────────

  if (view === "compose") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.brand.dark }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.composeScroll,
            { paddingTop: insets.top + webTopInset + 12, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.composeHeader}>
            <Pressable onPress={() => { setView("list"); setEditingId(null); setForm(EMPTY_FORM); }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.brand.gold} />
            </Pressable>
            <Text style={styles.composeTitle}>{editingId ? "Edit Draft" : "New Campaign"}</Text>
          </View>

          {/* Campaign name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Campaign Name</Text>
            <Text style={styles.fieldHint}>Internal only — customers never see this</Text>
            <TextInput
              style={styles.input}
              value={form.title}
              onChangeText={t => setForm(f => ({ ...f, title: t }))}
              placeholder="e.g. June Members Promotion"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>

          {/* Email subject */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Subject Line</Text>
            <Text style={styles.fieldHint}>What customers see in their inbox</Text>
            <TextInput
              style={styles.input}
              value={form.subject}
              onChangeText={t => setForm(f => ({ ...f, subject: t }))}
              placeholder="e.g. Special offer for our valued members 🎱"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>

          {/* Audience */}
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
                  <Pressable
                    key={a.key}
                    style={[styles.audienceOption, form.audience === a.key && styles.audienceOptionActive]}
                    onPress={() => { setForm(f => ({ ...f, audience: a.key })); setShowAudiencePicker(false); }}
                  >
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

          {/* Message body */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Message</Text>
            <Text style={styles.fieldHint}>Write your email — use blank lines to separate paragraphs</Text>
            <TextInput
              style={[styles.input, styles.bodyInput]}
              value={form.bodyText}
              onChangeText={t => setForm(f => ({ ...f, bodyText: t }))}
              placeholder={"Hi there,\n\nWe wanted to share some exciting news with you…\n\nSee you at the table,\nThe 147 Team"}
              placeholderTextColor="rgba(255,255,255,0.3)"
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Preview card */}
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

          {/* Actions */}
          <View style={styles.composeActions}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary, (!canSaveForm || saveMutation.isPending) && styles.btnDisabled]}
              onPress={() => canSaveForm && saveMutation.mutate()}
              disabled={!canSaveForm || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="save-outline" size={18} color="#fff" />
              )}
              <Text style={styles.actionBtnText}>{editingId ? "Update Draft" : "Save Draft"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/staff-portal")} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.brand.gold} />
          </Pressable>
          <Text style={styles.headerTitle}>Email Marketing</Text>
        </View>

        {/* Stats */}
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

        {/* New campaign button */}
        <View style={styles.newBtnRow}>
          <Pressable style={styles.newBtn} onPress={openNew}>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.newBtnText}>New Campaign</Text>
          </Pressable>
        </View>

        {/* Campaign list */}
        {campaignsQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No campaigns yet</Text>
            <Text style={styles.emptyBody}>
              Create your first email campaign to reach customers directly from the app — no external tools needed.
            </Text>
          </View>
        ) : (
          <View style={styles.campaignList}>
            {campaigns.map(c => {
              const audienceInfo = AUDIENCES.find(a => a.key === c.audience) ?? AUDIENCES[0];
              const isSent = c.status === "sent";
              const isDraft = c.status === "draft";
              const isSending = c.status === "sending";
              return (
                <View key={c.id} style={styles.campaignCard}>
                  <View style={styles.campaignCardTop}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[c.status] ?? "#6B7280" }]} />
                    <Text style={[styles.statusBadge, { color: STATUS_COLORS[c.status] ?? "#6B7280" }]}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </Text>
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
                    {isSent && (
                      <>
                        <Text style={styles.campaignMetaDot}>·</Text>
                        <Ionicons name="checkmark-circle-outline" size={13} color="#059669" />
                        <Text style={[styles.campaignMetaText, { color: "#059669" }]}>{c.sentCount ?? 0} delivered</Text>
                        {(c.failedCount ?? 0) > 0 && (
                          <>
                            <Text style={styles.campaignMetaDot}>·</Text>
                            <Text style={[styles.campaignMetaText, { color: "#DC2626" }]}>{c.failedCount} failed</Text>
                          </>
                        )}
                      </>
                    )}
                  </View>

                  {/* Actions */}
                  {(isDraft || isSending) && (
                    <View style={styles.campaignActions}>
                      {isDraft && (
                        <>
                          <Pressable
                            style={styles.cardActionBtn}
                            onPress={() => openEdit(c)}
                          >
                            <Ionicons name="create-outline" size={15} color={Colors.brand.gold} />
                            <Text style={[styles.cardActionText, { color: Colors.brand.gold }]}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.cardActionBtn, styles.cardActionSend]}
                            onPress={() => confirmSend(c.id, audienceInfo.label.toLowerCase())}
                            disabled={sendMutation.isPending}
                          >
                            {sendMutation.isPending && sendMutation.variables === c.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="send" size={14} color="#fff" />
                            )}
                            <Text style={[styles.cardActionText, { color: "#fff" }]}>Send</Text>
                          </Pressable>
                          <Pressable
                            style={styles.cardActionBtn}
                            onPress={() => confirmDelete(c.id)}
                          >
                            <Ionicons name="trash-outline" size={15} color="#DC2626" />
                          </Pressable>
                        </>
                      )}
                      {isSending && (
                        <View style={styles.sendingRow}>
                          <ActivityIndicator size="small" color={Colors.brand.gold} />
                          <Text style={styles.sendingText}>Sending to {audienceInfo.label.toLowerCase()}…</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.brand.dark,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.brand.gold,
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 3,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
  // New button
  newBtnRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand.blue,
    paddingVertical: 13,
    borderRadius: 11,
  },
  newBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
  emptyBody: {
    fontSize: 14,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 20,
  },
  // Campaign list
  campaignList: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  campaignCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 6,
  },
  campaignCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  campaignDate: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
  campaignTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  campaignSubject: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontStyle: "italic",
  },
  campaignMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  campaignMetaText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  campaignMetaDot: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
  },
  campaignActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  cardActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardActionSend: {
    backgroundColor: "#059669",
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sendingText: {
    fontSize: 13,
    color: Colors.brand.gold,
    fontStyle: "italic",
  },
  // ── Compose view ──────────────────────────────────────────────────────────
  composeScroll: {
    paddingHorizontal: 16,
  },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  composeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.brand.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  fieldHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 13,
    color: "#fff",
    fontSize: 15,
  },
  bodyInput: {
    minHeight: 180,
    lineHeight: 22,
  },
  // Audience picker
  audienceSelector: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 13,
  },
  audienceSelectorInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  audienceSelectorLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  audienceSelectorDesc: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 1,
  },
  audienceCount: {
    fontSize: 12,
    color: Colors.brand.gold,
    fontWeight: "600",
  },
  audienceDropdown: {
    marginTop: 4,
    backgroundColor: "#0d1e35",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    overflow: "hidden",
  },
  audienceOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  audienceOptionActive: {
    backgroundColor: "rgba(212,168,67,0.1)",
  },
  audienceOptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  audienceOptionDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 1,
  },
  // Preview
  previewCard: {
    marginBottom: 20,
    backgroundColor: "#0d1e35",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.3)",
    overflow: "hidden",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(212,168,67,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,168,67,0.15)",
  },
  previewHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.brand.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  previewBrand: {
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: Colors.brand.gold,
    backgroundColor: "#0a1628",
  },
  previewBrandNum: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.brand.gold,
    letterSpacing: 4,
  },
  previewBrandName: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 3,
    marginTop: 4,
  },
  previewSubject: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    padding: 16,
    paddingBottom: 8,
  },
  previewBody: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    paddingHorizontal: 16,
    paddingBottom: 16,
    lineHeight: 20,
  },
  previewFooter: {
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  // Compose actions
  composeActions: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 11,
  },
  actionBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
