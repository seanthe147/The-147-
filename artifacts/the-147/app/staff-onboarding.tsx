import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Alert, Platform, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
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

const STARTER_DECLS = [
  { value: "A", label: "Statement A", sub: "This is my first job since 6 April and I have not received a taxable benefit" },
  { value: "B", label: "Statement B", sub: "This is now my only job but I have had another job or taxable benefit since 6 April" },
  { value: "C", label: "Statement C", sub: "I have another job or receive a state or occupational pension" },
];

const RTW_TYPES = [
  { value: "british-passport", label: "British / Irish Passport", icon: "bookmark" as const },
  { value: "eu-settled", label: "EU Settled / Pre-settled Status", icon: "earth" as const },
  { value: "visa", label: "UK Visa / Biometric Residence Permit", icon: "card" as const },
  { value: "other", label: "Other — speak to your manager", icon: "help-circle" as const },
];

type FormState = {
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  nationalInsurance: string;
  starterDeclaration: string;
  taxCode: string;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;
  rightToWorkType: string;
  rightToWorkExpiry: string;
};

const EMPTY: FormState = {
  emergencyName: "", emergencyPhone: "", emergencyRelation: "",
  nationalInsurance: "", starterDeclaration: "", taxCode: "",
  bankAccountName: "", bankSortCode: "", bankAccountNumber: "",
  rightToWorkType: "", rightToWorkExpiry: "",
};

export default function StaffOnboardingScreen() {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated } = useStaffAuth();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showNI, setShowNI] = useState(false);
  const [showBank, setShowBank] = useState(false);

  const { data: existing, isLoading } = useQuery<any>({
    queryKey: ["/api/hr/onboarding/mine"],
    queryFn: () => hrApi("/api/hr/onboarding/mine"),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        emergencyName: existing.emergencyName ?? "",
        emergencyPhone: existing.emergencyPhone ?? "",
        emergencyRelation: existing.emergencyRelation ?? "",
        nationalInsurance: existing.nationalInsurance ?? "",
        starterDeclaration: existing.starterDeclaration ?? "",
        taxCode: existing.taxCode ?? "",
        bankAccountName: existing.bankAccountName ?? "",
        bankSortCode: existing.bankSortCode ?? "",
        bankAccountNumber: existing.bankAccountNumber ?? "",
        rightToWorkType: existing.rightToWorkType ?? "",
        rightToWorkExpiry: existing.rightToWorkExpiry ?? "",
      });
    }
  }, [existing]);

  const set = (key: keyof FormState) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const save = async (markComplete = false) => {
    setSaving(true);
    try {
      await hrApi("/api/hr/onboarding/mine", {
        method: "PUT",
        body: JSON.stringify({ ...form, markComplete }),
      });
      qc.invalidateQueries({ queryKey: ["/api/hr/onboarding/mine"] });
      if (markComplete) {
        if (Platform.OS === "web") window.alert("Onboarding marked as complete. Thank you!");
        else Alert.alert("Complete", "Your onboarding form has been submitted. Thank you!");
        router.back();
      } else {
        if (Platform.OS === "web") window.alert("Progress saved.");
        else Alert.alert("Saved", "Your progress has been saved.");
      }
    } catch (e: any) {
      if (Platform.OS === "web") window.alert("Error: " + (e.message || "Could not save."));
      else Alert.alert("Error", e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.brand.blue} /></View>;
  }

  const isCompleted = !!existing?.completedAt;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Onboarding Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, marginHorizontal: tabletPad }}>

        {isCompleted && (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.completedText}>Submitted — you can still update your details below</Text>
          </View>
        )}

        <Text style={styles.intro}>
          Please fill in your details below. All information is stored securely and used only for payroll, HR, and emergency purposes.
        </Text>

        {/* Emergency Contact */}
        <Section title="Emergency Contact" icon="call-outline">
          <Field label="Full Name" value={form.emergencyName} onChangeText={set("emergencyName")} placeholder="e.g. Jane Smith" />
          <Field label="Phone Number" value={form.emergencyPhone} onChangeText={set("emergencyPhone")} placeholder="e.g. 07700 900000" keyboardType="phone-pad" />
          <Field label="Relationship" value={form.emergencyRelation} onChangeText={set("emergencyRelation")} placeholder="e.g. Partner, Parent" />
        </Section>

        {/* Tax Information */}
        <Section title="Tax & HMRC" icon="business-outline">
          <View style={styles.sensitiveRow}>
            <Text style={styles.sensitiveLabel}>National Insurance Number</Text>
            <Pressable onPress={() => setShowNI(v => !v)} style={styles.revealBtn}>
              <Ionicons name={showNI ? "eye-off-outline" : "eye-outline"} size={16} color={Colors.brand.blue} />
              <Text style={styles.revealBtnText}>{showNI ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={showNI ? form.nationalInsurance : (form.nationalInsurance ? "••••••••" : "")}
            onChangeText={showNI ? set("nationalInsurance") : undefined}
            editable={showNI}
            placeholder={showNI ? "e.g. AB 12 34 56 C" : "Tap 'Show' to enter"}
            placeholderTextColor={Colors.light.textSecondary}
            autoCapitalize="characters"
          />

          <Text style={[styles.fieldLabelTop, { marginTop: 4 }]}>Starter Declaration (P46)</Text>
          <Text style={styles.fieldHint}>Choose the statement that applies to you for this job.</Text>
          {STARTER_DECLS.map(d => (
            <Pressable
              key={d.value}
              onPress={() => set("starterDeclaration")(d.value)}
              style={[styles.radioCard, form.starterDeclaration === d.value && styles.radioCardActive]}
            >
              <View style={[styles.radioCircle, form.starterDeclaration === d.value && styles.radioCircleActive]}>
                {form.starterDeclaration === d.value && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.radioLabel, form.starterDeclaration === d.value && { color: Colors.brand.blue }]}>{d.label}</Text>
                <Text style={styles.radioSub}>{d.sub}</Text>
              </View>
            </Pressable>
          ))}

          <Field label="Tax Code (if known)" value={form.taxCode} onChangeText={set("taxCode")} placeholder="e.g. 1257L" hint="Leave blank if unsure — HMRC will advise your employer" />
        </Section>

        {/* Bank Details */}
        <Section title="Bank Details (for payroll)" icon="card-outline">
          <View style={styles.sensitiveRow}>
            <Text style={styles.sensitiveLabel}>Your bank details are encrypted and used for payroll only.</Text>
            <Pressable onPress={() => setShowBank(v => !v)} style={styles.revealBtn}>
              <Ionicons name={showBank ? "eye-off-outline" : "eye-outline"} size={16} color={Colors.brand.blue} />
              <Text style={styles.revealBtnText}>{showBank ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <Field label="Account Holder Name" value={form.bankAccountName} onChangeText={set("bankAccountName")} placeholder="Full name as on account" />
          {showBank ? (
            <>
              <Field label="Sort Code" value={form.bankSortCode} onChangeText={set("bankSortCode")} placeholder="XX-XX-XX" keyboardType="numeric" maxLength={8} />
              <Field label="Account Number" value={form.bankAccountNumber} onChangeText={set("bankAccountNumber")} placeholder="8-digit account number" keyboardType="numeric" maxLength={8} />
            </>
          ) : (
            <View style={styles.hiddenFields}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.hiddenFieldsText}>Sort code and account number hidden — tap Show to edit</Text>
            </View>
          )}
        </Section>

        {/* Right to Work */}
        <Section title="Right to Work" icon="shield-checkmark-outline">
          <Text style={styles.fieldHint}>Please indicate the document that proves your right to work in the UK. Your manager will verify the original.</Text>
          {RTW_TYPES.map(r => (
            <Pressable
              key={r.value}
              onPress={() => set("rightToWorkType")(r.value)}
              style={[styles.radioCard, form.rightToWorkType === r.value && styles.radioCardActive]}
            >
              <View style={[styles.radioCircle, form.rightToWorkType === r.value && styles.radioCircleActive]}>
                {form.rightToWorkType === r.value && <View style={styles.radioDot} />}
              </View>
              <Ionicons name={r.icon} size={16} color={form.rightToWorkType === r.value ? Colors.brand.blue : Colors.light.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.radioLabel, form.rightToWorkType === r.value && { color: Colors.brand.blue }]}>{r.label}</Text>
            </Pressable>
          ))}
          {(form.rightToWorkType === "eu-settled" || form.rightToWorkType === "visa") && (
            <Field label="Document Expiry Date (YYYY-MM-DD)" value={form.rightToWorkExpiry} onChangeText={set("rightToWorkExpiry")} placeholder="e.g. 2027-06-15" />
          )}
        </Section>

      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => save(false)} disabled={saving} style={styles.saveProgressBtn}>
          {saving ? <ActivityIndicator color={Colors.brand.blue} size="small" /> : (
            <>
              <Ionicons name="save-outline" size={16} color={Colors.brand.blue} />
              <Text style={styles.saveProgressText}>Save Progress</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={() => save(true)} disabled={saving} style={styles.completeBtn}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : (
            <>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.completeBtnText}>Mark Complete</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={Colors.brand.blue} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, maxLength, hint }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; maxLength?: number; hint?: string;
}) {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabelTop}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
    </View>
  );
}

const createThemedStyles = (colors: any) => themedStyleSheet({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  headerBack: { width: 36 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: Colors.light.text },

  completedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#D1FAE5", borderRadius: 10, padding: 12, marginBottom: 12 },
  completedText: { fontSize: 13, color: "#059669", fontWeight: "600", flex: 1 },

  intro: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20, marginBottom: 16, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.brand.blue },

  section: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.light.text },

  fieldWrap: { marginBottom: 12 },
  fieldLabelTop: { fontSize: 12, fontWeight: "700", color: Colors.light.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldHint: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 6, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 15, color: Colors.light.text, backgroundColor: "#F8FAFC" },

  sensitiveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sensitiveLabel: { fontSize: 12, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, flex: 1 },
  revealBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#EFF6FF" },
  revealBtnText: { fontSize: 12, fontWeight: "700", color: Colors.brand.blue },

  hiddenFields: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
  hiddenFieldsText: { fontSize: 12, color: Colors.light.textSecondary, flex: 1 },

  radioCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8, backgroundColor: "#F8FAFC" },
  radioCardActive: { borderColor: Colors.brand.blue, backgroundColor: "#EFF6FF" },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", marginTop: 2 },
  radioCircleActive: { borderColor: Colors.brand.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand.blue },
  radioLabel: { fontSize: 13, fontWeight: "700", color: Colors.light.text, marginBottom: 2 },
  radioSub: { fontSize: 12, color: Colors.light.textSecondary, lineHeight: 16 },

  bottomBar: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E2E8F0", flexDirection: "row", padding: 12, gap: 10 },
  saveProgressBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.brand.blue },
  saveProgressText: { color: Colors.brand.blue, fontSize: 14, fontWeight: "700" },
  completeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.brand.blue },
  completeBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
}, colors);
function themedStyleSheet(source: any, colors: ReturnType<typeof useColors>) { return StyleSheet.create(themeSource(source, colors)); } function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([n,v]: any) => [n,Object.fromEntries(Object.entries(v).map(([k,t]: any)=>[k,themeToken(n,k,t,colors)]))])); } function themeToken(n:string,k:string,t:any,c:ReturnType<typeof useColors>) { if(typeof t!=="string")return t;if(k==="color"&&/^#fff(?:fff)?$/i.test(t))return /btn|button|badge|chip|pill|selected|active|primary|action|cta|fab|submit|save|publish|approve|confirm|complete|clock|gdpr|back|close|filter|tab|preview|retry|claim|redeem|login/i.test(n)?t:c.text;if(k==="color")return ["#0A1628","#132742","#111827","#1E293B","#1F2937","#334155","#374151","#4B5563"].includes(t)?c.text:["#475569","#4B5A72","#64748B","#6B7280","#94A3B8"].includes(t)?c.textSecondary:t;if(/border.*color/i.test(k)&&["#E2E8F0","#E5E7EB","#CBD5E1","#D1D5DB"].includes(t))return c.border;if(/backgroundcolor/i.test(k))return ["#F2F5FA","#F4F7FB","#F8FAFC","#F9FAFB","#F1F5F9"].includes(t)?c.background:["#fff","#FFFFFF"].includes(t)?c.surface:["#0A1628","#132742","#0F172A","#1E293B"].includes(t)?c.surfaceElevated:t;return t;}
