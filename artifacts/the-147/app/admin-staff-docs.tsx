import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Alert, Platform, Modal, TextInput, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getApiUrl, getStaffToken } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

async function hrApi(path: string, opts?: RequestInit) {
  const url = new URL(path, getApiUrl()).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { credentials: "include", headers, ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).message || `HTTP ${r.status}`);
  }
  return r.json();
}

const CATEGORIES = [
  { value: "contract", label: "Contract", icon: "document-text" as const, color: "#1D4ED8" },
  { value: "right-to-work", label: "Right to Work", icon: "shield-checkmark" as const, color: "#059669" },
  { value: "certification", label: "Certification", icon: "ribbon" as const, color: "#7C3AED" },
  { value: "id", label: "ID Document", icon: "card" as const, color: "#DC2626" },
  { value: "onboarding", label: "Onboarding", icon: "person-add" as const, color: "#D97706" },
  { value: "other", label: "Other", icon: "folder" as const, color: Colors.light.textSecondary },
];

const STARTER_DECLS = [
  { value: "A", label: "A — This is my first job since 6 April and I have not received a taxable state benefit" },
  { value: "B", label: "B — This is now my only job but I have had another job or taxable benefit since 6 April" },
  { value: "C", label: "C — I have another job or pension" },
];

const RTW_TYPES = [
  { value: "british-passport", label: "British/Irish Passport" },
  { value: "eu-settled", label: "EU Settled/Pre-settled Status" },
  { value: "visa", label: "UK Visa / BRP" },
  { value: "other", label: "Other (see notes)" },
];

function getCatInfo(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type Doc = {
  id: number; staffId: number; uploadedBy: number; category: string;
  fileName: string; fileType: string; fileSizeBytes: number;
  notes: string | null; expiresAt: string | null; createdAt: string;
};

type Onboarding = {
  emergencyName: string | null; emergencyPhone: string | null; emergencyRelation: string | null;
  nationalInsurance: string | null; starterDeclaration: string | null; taxCode: string | null;
  bankAccountName: string | null; bankSortCode: string | null; bankAccountNumber: string | null;
  rightToWorkType: string | null; rightToWorkExpiry: string | null;
  completedAt: string | null; updatedAt: string;
};

export default function AdminStaffDocsScreen() {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { staffId, staffName } = useLocalSearchParams<{ staffId: string; staffName: string }>();
  const { isAuthenticated, isManager } = useStaffAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"docs" | "onboarding">("docs");
  const [uploading, setUploading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("contract");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [pickedFile, setPickedFile] = useState<{ name: string; type: string; base64: string; size: number } | null>(null);

  const { data: docs = [], isLoading: docsLoading, refetch: refetchDocs } = useQuery<Doc[]>({
    queryKey: [`/api/hr/staff/${staffId}/documents`],
    queryFn: () => hrApi(`/api/hr/staff/${staffId}/documents`),
    enabled: !!staffId && isAuthenticated && isManager,
  });

  const { data: onboarding, isLoading: onboardingLoading } = useQuery<Onboarding | null>({
    queryKey: [`/api/hr/staff/${staffId}/onboarding`],
    queryFn: () => hrApi(`/api/hr/staff/${staffId}/onboarding`),
    enabled: !!staffId && isAuthenticated && isManager && activeTab === "onboarding",
  });

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 10 * 1024 * 1024) {
        Alert.alert("File Too Large", "Please choose a file smaller than 10 MB.");
        return;
      }

      let base64 = "";
      if (Platform.OS === "web") {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string).split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as any });
      }

      setPickedFile({
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
        base64,
        size: asset.size ?? base64.length * 0.75,
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not read file.");
    }
  }, []);

  const submitUpload = useCallback(async () => {
    if (!pickedFile) return;
    setUploading(true);
    try {
      await hrApi(`/api/hr/staff/${staffId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          category: uploadCategory,
          fileName: pickedFile.name,
          fileType: pickedFile.type,
          fileData: pickedFile.base64,
          fileSizeBytes: pickedFile.size,
          notes: uploadNotes.trim() || undefined,
          expiresAt: uploadExpiry.trim() || undefined,
        }),
      });
      setUploadModal(false);
      setPickedFile(null);
      setUploadNotes("");
      setUploadExpiry("");
      refetchDocs();
    } catch (e: any) {
      Alert.alert("Upload Failed", e.message || "Could not upload document.");
    } finally {
      setUploading(false);
    }
  }, [pickedFile, staffId, uploadCategory, uploadNotes, uploadExpiry, refetchDocs]);

  const deleteDoc = useCallback((doc: Doc) => {
    const doDelete = async () => {
      try {
        await hrApi(`/api/hr/documents/${doc.id}`, { method: "DELETE" });
        refetchDocs();
      } catch (e: any) {
        Alert.alert("Error", e.message || "Could not delete document.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${doc.fileName}"?`)) doDelete();
    } else {
      Alert.alert("Delete Document", `Delete "${doc.fileName}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }, [refetchDocs]);

  const downloadDoc = useCallback(async (doc: Doc) => {
    try {
      const full = await hrApi(`/api/hr/documents/${doc.id}/download`);
      const dataUrl = `data:${full.fileType};base64,${full.fileData}`;
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = full.fileName;
        a.click();
      } else {
        const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
        const path = cacheDir + full.fileName;
        await FileSystem.writeAsStringAsync(path, full.fileData, { encoding: 'base64' as any });
        Alert.alert("Saved", `Saved to ${path}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not download document.");
    }
  }, []);

  const isExpiringSoon = (expiry: string | null) => {
    if (!expiry) return false;
    const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
    return days <= 30 && days >= 0;
  };
  const isExpired = (expiry: string | null) => {
    if (!expiry) return false;
    return new Date(expiry).getTime() < Date.now();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{staffName || "Staff Member"}</Text>
          <Text style={styles.headerSub}>HR Documents & Onboarding</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable onPress={() => setActiveTab("docs")} style={[styles.tabBtn, activeTab === "docs" && styles.tabBtnActive]}>
          <Ionicons name="documents" size={15} color={activeTab === "docs" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.tabText, activeTab === "docs" && styles.tabTextActive]}>Documents</Text>
          {docs.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{docs.length}</Text></View>}
        </Pressable>
        <Pressable onPress={() => setActiveTab("onboarding")} style={[styles.tabBtn, activeTab === "onboarding" && styles.tabBtnActive]}>
          <Ionicons name="person-circle" size={15} color={activeTab === "onboarding" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.tabText, activeTab === "onboarding" && styles.tabTextActive]}>Onboarding</Text>
          {onboarding?.completedAt && <Ionicons name="checkmark-circle" size={14} color="#059669" />}
        </Pressable>
      </View>

      {/* Documents tab */}
      {activeTab === "docs" && (
        <>
          {docsLoading ? (
            <View style={styles.centered}><ActivityIndicator color={Colors.brand.blue} /></View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80, marginHorizontal: tabletPad }}>
              {docs.length === 0 && (
                <View style={styles.empty}>
                  <Ionicons name="documents-outline" size={44} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyText}>No documents uploaded yet</Text>
                  <Text style={styles.emptySub}>Upload contracts, ID and certifications below</Text>
                </View>
              )}
              {docs.map(doc => {
                const cat = getCatInfo(doc.category);
                const expired = isExpired(doc.expiresAt);
                const expiring = isExpiringSoon(doc.expiresAt);
                return (
                  <View key={doc.id} style={styles.docCard}>
                    <View style={styles.docCardLeft}>
                      <View style={[styles.catIcon, { backgroundColor: cat.color + "18" }]}>
                        <Ionicons name={cat.icon} size={20} color={cat.color} />
                      </View>
                    </View>
                    <View style={styles.docCardBody}>
                      <Text style={styles.docName} numberOfLines={1}>{doc.fileName}</Text>
                      <View style={styles.docMeta}>
                        <View style={[styles.catBadge, { backgroundColor: cat.color + "18" }]}>
                          <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
                        </View>
                        <Text style={styles.docSize}>{fmtSize(doc.fileSizeBytes)}</Text>
                      </View>
                      {doc.notes ? <Text style={styles.docNotes} numberOfLines={1}>{doc.notes}</Text> : null}
                      {doc.expiresAt && (
                        <View style={[styles.expiryRow, expired && styles.expiryExpired, expiring && !expired && styles.expiryWarning]}>
                          <Ionicons name={expired ? "alert-circle" : "time-outline"} size={12} color={expired ? "#DC2626" : expiring ? "#D97706" : Colors.light.textSecondary} />
                          <Text style={[styles.expiryText, expired && { color: "#DC2626" }, expiring && !expired && { color: "#D97706" }]}>
                            {expired ? "Expired" : expiring ? "Expiring soon" : "Expires"}: {fmtDate(doc.expiresAt)}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.docDate}>Added {fmtDate(doc.createdAt)}</Text>
                    </View>
                    <View style={styles.docActions}>
                      <Pressable onPress={() => downloadDoc(doc)} hitSlop={10} style={styles.docActionBtn}>
                        <Ionicons name="download-outline" size={20} color={Colors.brand.blue} />
                      </Pressable>
                      <Pressable onPress={() => deleteDoc(doc)} hitSlop={10} style={styles.docActionBtn}>
                        <Ionicons name="trash-outline" size={20} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          {/* Upload FAB */}
          <Pressable
            onPress={() => setUploadModal(true)}
            style={[styles.fab, { bottom: insets.bottom + 20 }]}
          >
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={styles.fabText}>Upload Document</Text>
          </Pressable>
        </>
      )}

      {/* Onboarding tab */}
      {activeTab === "onboarding" && (
        onboardingLoading ? (
          <View style={styles.centered}><ActivityIndicator color={Colors.brand.blue} /></View>
        ) : !onboarding ? (
          <View style={styles.centered}>
            <Ionicons name="person-outline" size={44} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No onboarding data yet</Text>
            <Text style={styles.emptySub}>This staff member hasn't completed their onboarding form</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, marginHorizontal: tabletPad }}>
            {/* Status banner */}
            <View style={[styles.statusBanner, onboarding.completedAt ? styles.statusComplete : styles.statusPending]}>
              <Ionicons name={onboarding.completedAt ? "checkmark-circle" : "time"} size={16} color={onboarding.completedAt ? "#059669" : "#D97706"} />
              <Text style={[styles.statusText, { color: onboarding.completedAt ? "#059669" : "#D97706" }]}>
                {onboarding.completedAt ? `Completed ${fmtDate(onboarding.completedAt)}` : "Onboarding in progress"}
              </Text>
            </View>

            <OnboardingSection title="Emergency Contact" icon="call">
              <OField label="Name" value={onboarding.emergencyName} />
              <OField label="Phone" value={onboarding.emergencyPhone} />
              <OField label="Relationship" value={onboarding.emergencyRelation} />
            </OnboardingSection>

            <OnboardingSection title="Tax & HMRC" icon="business">
              <OField label="National Insurance No." value={onboarding.nationalInsurance} sensitive />
              <OField label="Starter Declaration" value={
                onboarding.starterDeclaration
                  ? `${onboarding.starterDeclaration} — ${STARTER_DECLS.find(d => d.value === onboarding.starterDeclaration)?.label.split("—")[1]?.trim() ?? ""}`
                  : null
              } />
              <OField label="Tax Code" value={onboarding.taxCode} />
            </OnboardingSection>

            <OnboardingSection title="Bank Details" icon="card">
              <OField label="Account Name" value={onboarding.bankAccountName} sensitive />
              <OField label="Sort Code" value={onboarding.bankSortCode} sensitive />
              <OField label="Account Number" value={onboarding.bankAccountNumber} sensitive />
            </OnboardingSection>

            <OnboardingSection title="Right to Work" icon="shield-checkmark">
              <OField label="Document Type" value={RTW_TYPES.find(r => r.value === onboarding.rightToWorkType)?.label ?? onboarding.rightToWorkType} />
              <OField label="Expiry Date" value={onboarding.rightToWorkExpiry ? fmtDate(onboarding.rightToWorkExpiry) : "No expiry / permanent"} />
            </OnboardingSection>
          </ScrollView>
        )
      )}

      {/* Upload Modal */}
      <Modal visible={uploadModal} transparent animationType="slide" onRequestClose={() => setUploadModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setUploadModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Upload Document</Text>

            {/* File picker */}
            <Pressable onPress={pickFile} style={[styles.filePicker, pickedFile && styles.filePickerDone]}>
              <Ionicons name={pickedFile ? "document" : "cloud-upload-outline"} size={24} color={pickedFile ? Colors.brand.blue : Colors.light.textSecondary} />
              <Text style={[styles.filePickerText, pickedFile && { color: Colors.brand.blue }]}>
                {pickedFile ? pickedFile.name : "Tap to choose a file (PDF or image, max 10 MB)"}
              </Text>
              {pickedFile && <Text style={styles.filePickerSize}>{fmtSize(pickedFile.size)}</Text>}
            </Pressable>

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    onPress={() => setUploadCategory(cat.value)}
                    style={[styles.catChip, uploadCategory === cat.value && { backgroundColor: cat.color, borderColor: cat.color }]}
                  >
                    <Ionicons name={cat.icon} size={13} color={uploadCategory === cat.value ? "#fff" : cat.color} />
                    <Text style={[styles.catChipText, uploadCategory === cat.value && { color: "#fff" }]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Expiry */}
            <Text style={styles.fieldLabel}>Expiry Date (optional, YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={uploadExpiry}
              onChangeText={setUploadExpiry}
              placeholder="e.g. 2027-06-15"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
            />

            {/* Notes */}
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: "top" }]}
              value={uploadNotes}
              onChangeText={setUploadNotes}
              placeholder="Any notes about this document…"
              placeholderTextColor={Colors.light.textSecondary}
              multiline
            />

            <View style={styles.btnRow}>
              <Pressable onPress={() => { setUploadModal(false); setPickedFile(null); }} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitUpload}
                disabled={!pickedFile || uploading}
                style={[styles.saveBtn, (!pickedFile || uploading) && { opacity: 0.5 }]}
              >
                {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Upload</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function OnboardingSection({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  const colors = useColors();
  const oStyles = React.useMemo(() => createOnboardingStyles(colors), [colors]);
  return (
    <View style={oStyles.section}>
      <View style={oStyles.sectionHeader}>
        <Ionicons name={icon} size={16} color={colors.tint} />
        <Text style={oStyles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function OField({ label, value, sensitive }: { label: string; value: string | null | undefined; sensitive?: boolean }) {
  const colors = useColors();
  const oStyles = React.useMemo(() => createOnboardingStyles(colors), [colors]);
  const [reveal, setReveal] = useState(false);
  const display = sensitive && !reveal ? "••••••••" : (value || "—");
  return (
    <View style={oStyles.field}>
      <Text style={oStyles.fieldLabel}>{label}</Text>
      <Pressable onPress={() => sensitive && setReveal(r => !r)} style={oStyles.fieldValueRow}>
        <Text style={[oStyles.fieldValue, !value && oStyles.fieldEmpty]}>{display}</Text>
        {sensitive && value && (
          <Ionicons name={reveal ? "eye-off-outline" : "eye-outline"} size={14} color={colors.textSecondary} />
        )}
      </Pressable>
    </View>
  );
}

const createOnboardingStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  section: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldValue: { fontSize: 14, color: colors.text, fontWeight: "500" },
  fieldEmpty: { color: colors.textSecondary, fontStyle: "italic", fontWeight: "400" },
});

const createThemedStyles = (colors: any) => themedStyleSheet({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  headerBack: { width: 36 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.text },
  headerSub: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 1 },

  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.brand.blue },
  tabText: { fontSize: 13, fontWeight: "600", color: Colors.light.textSecondary },
  tabTextActive: { color: Colors.brand.blue },
  badge: { backgroundColor: Colors.brand.blue, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },

  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600", color: Colors.light.text },
  emptySub: { fontSize: 13, color: Colors.light.textSecondary, textAlign: "center" },

  docCard: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, marginBottom: 10, alignItems: "flex-start" },
  docCardLeft: { marginRight: 10 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docCardBody: { flex: 1 },
  docName: { fontSize: 14, fontWeight: "700", color: Colors.light.text, marginBottom: 4 },
  docMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  catBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  catBadgeText: { fontSize: 11, fontWeight: "700" },
  docSize: { fontSize: 11, color: Colors.light.textSecondary },
  docNotes: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 4 },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  expiryExpired: {},
  expiryWarning: {},
  expiryText: { fontSize: 11, color: Colors.light.textSecondary },
  docDate: { fontSize: 11, color: Colors.light.textSecondary },
  docActions: { gap: 4, marginLeft: 8 },
  docActionBtn: { padding: 6 },

  fab: { position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.brand.blue, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 30, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  statusBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 12, marginBottom: 14 },
  statusComplete: { backgroundColor: "#D1FAE5" },
  statusPending: { backgroundColor: "#FEF3C7" },
  statusText: { fontSize: 13, fontWeight: "600" },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 12 },
  dragHandle: { width: 36, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, marginBottom: 16 },

  filePicker: { borderWidth: 2, borderColor: "#E2E8F0", borderStyle: "dashed", borderRadius: 12, padding: 16, alignItems: "center", gap: 8, marginBottom: 16 },
  filePickerDone: { borderColor: Colors.brand.blue, borderStyle: "solid", backgroundColor: "#EFF6FF" },
  filePickerText: { fontSize: 13, color: Colors.light.textSecondary, textAlign: "center" },
  filePickerSize: { fontSize: 11, color: Colors.brand.blue, fontWeight: "600" },

  fieldLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 14, color: Colors.light.text, backgroundColor: "#F8FAFC", marginBottom: 4 },

  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff" },
  catChipText: { fontSize: 12, fontWeight: "600", color: Colors.light.text },

  btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  cancelBtnText: { color: Colors.light.text, fontSize: 14, fontWeight: "600" },
  saveBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.brand.blue },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
}, colors);
function themedStyleSheet(source: any, colors: ReturnType<typeof useColors>) { return StyleSheet.create(themeSource(source, colors)); } function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([n,v]: any) => [n,Object.fromEntries(Object.entries(v).map(([k,t]: any)=>[k,themeToken(n,k,t,colors)]))])); } function themeToken(n:string,k:string,t:any,c:ReturnType<typeof useColors>) { if(typeof t!=="string")return t;if(k==="color"&&/^#fff(?:fff)?$/i.test(t))return /btn|button|badge|chip|pill|selected|active|primary|action|cta|fab|submit|save|publish|approve|confirm|complete|clock|gdpr|back|close|filter|tab|preview|retry|claim|redeem|login/i.test(n)?t:c.text;if(k==="color")return ["#0A1628","#132742","#111827","#1E293B","#1F2937","#334155","#374151","#4B5563"].includes(t)?c.text:["#475569","#4B5A72","#64748B","#6B7280","#94A3B8"].includes(t)?c.textSecondary:t;if(/border.*color/i.test(k)&&["#E2E8F0","#E5E7EB","#CBD5E1","#D1D5DB"].includes(t))return c.border;if(/backgroundcolor/i.test(k))return ["#F2F5FA","#F4F7FB","#F8FAFC","#F9FAFB","#F1F5F9"].includes(t)?c.background:["#fff","#FFFFFF"].includes(t)?c.surface:["#0A1628","#132742","#0F172A","#1E293B"].includes(t)?c.surfaceElevated:t;return t;}
