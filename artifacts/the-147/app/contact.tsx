import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { useNotifications } from "@/contexts/NotificationContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useColors } from "@/hooks/useColors";

const SUBJECTS = [
  "General Enquiry",
  "Booking Question",
  "Event Enquiry",
  "Food & Drink",
  "Feedback",
  "Other",
];

import { useResponsive } from "@/hooks/useResponsive";

export default function ContactScreen() {
  const colors = useColors();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { expoPushToken } = useNotifications();
  const { customer, getCustomerToken } = useCustomerAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    if (!subject) {
      setError("Please select a subject");
      return;
    }
    if (!message.trim()) {
      setError("Please enter your message");
      return;
    }
    if (!gdprConsent) {
      setError("You must consent to data processing to send a message");
      return;
    }

    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/contact", baseUrl);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customer) {
        const customerToken = await getCustomerToken();
        if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          subject,
          message: message.trim(),
          gdprConsent: true,
          pushToken: expoPushToken ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Failed to send message");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
      setGdprConsent(false);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Contact Us</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#1B5E20" />
          </View>
          <Text style={styles.successTitle}>Message Sent</Text>
          <Text style={styles.successSubtitle}>
            Thank you for getting in touch. We'll reply to your email as soon as possible.
          </Text>
          <Pressable
            onPress={() => setSuccess(false)}
            style={({ pressed }) => [styles.sendAnotherButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.brand.blue} />
            <Text style={styles.sendAnotherText}>Send Another Message</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.goBackButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            <Text style={styles.goBackText}>Back to App</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
        <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Contact Us</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { marginHorizontal: tabletPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.introSection}>
            <Ionicons name="mail" size={32} color={Colors.brand.blue} />
            <Text style={styles.introTitle}>Get in Touch</Text>
            <Text style={styles.introSubtitle}>
              Have a question or feedback? We'd love to hear from you.
            </Text>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NAME *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                placeholder="Your full name"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
                testID="contact-name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL *</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(""); }}
                placeholder="your@email.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="contact-email"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PHONE (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Your phone number"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                testID="contact-phone"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SUBJECT *</Text>
              <View style={styles.subjectGrid}>
                {SUBJECTS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => { setSubject(s); setError(""); }}
                    style={[
                      styles.subjectChip,
                      subject === s && styles.subjectChipActive,
                    ]}
                    testID={`contact-subject-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Text
                      style={[
                        styles.subjectChipText,
                        subject === s && styles.subjectChipTextActive,
                      ]}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MESSAGE *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={message}
                onChangeText={(t) => { setMessage(t); setError(""); }}
                placeholder="Tell us how we can help..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                testID="contact-message"
              />
            </View>
          </View>

          <Pressable
            onPress={() => { setGdprConsent(!gdprConsent); setError(""); }}
            style={styles.consentRow}
            testID="contact-gdpr-consent"
          >
            <View style={[styles.checkbox, gdprConsent && styles.checkboxChecked]}>
              {gdprConsent && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.consentText}>
              I consent to The 147 processing my personal data to respond to this enquiry.
              Your data will be stored securely and only used to handle your message.
              You can request deletion at any time. See our Privacy Policy for details.
            </Text>
          </Pressable>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitButton,
              loading && styles.submitButtonDisabled,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            testID="contact-submit"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFFFFF" />
                <Text style={styles.submitText}>Send Message</Text>
              </>
            )}
          </Pressable>

          <View style={styles.contactInfoSection}>
            <Text style={styles.contactInfoTitle}>Other Ways to Reach Us</Text>
            <View style={styles.contactInfoRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.brand.blue} />
              <Text style={styles.contactInfoText}>info@the147.co.uk</Text>
            </View>
            <View style={styles.contactInfoRow}>
              <Ionicons name="globe-outline" size={18} color={Colors.brand.blue} />
              <Text style={styles.contactInfoText}>www.the147.co.uk</Text>
            </View>
          </View>

          <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styleSource = {
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  introSection: {
    alignItems: "center",
    marginBottom: 28,
    marginTop: 8,
    gap: 8,
  },
  introTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
    marginTop: 4,
  },
  introSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  formSection: {
    gap: 16,
    marginBottom: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: Colors.light.text,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  subjectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
    borderWidth: 2,
    borderColor: Colors.light.border,
  },
  subjectChipActive: {
    backgroundColor: Colors.brand.blue + "12",
    borderColor: Colors.brand.blue,
  },
  subjectChipText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  subjectChipTextActive: {
    color: Colors.brand.blue,
    fontFamily: "Montserrat_600SemiBold",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.red,
  },
  consentRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  consentText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  successIcon: {
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
  },
  successSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  sendAnotherButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.brand.blue,
  },
  sendAnotherText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  goBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue,
  },
  goBackText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  contactInfoSection: {
    marginTop: 28,
    alignItems: "center",
    gap: 10,
  },
  contactInfoTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 4,
  },
  contactInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactInfoText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
};

const createThemeStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create(themeSource(styleSource, colors));
function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([name, value]: any) => [name, Object.fromEntries(Object.entries(value).map(([key, token]: any) => [key, themeToken(name, key, token, colors)]))])); }
function themeToken(name: string, key: string, token: any, colors: ReturnType<typeof useColors>) { if (typeof token !== "string") return token; const isWhiteForeground = key === "color" && /(primary|action|button|submit|done|retry|pay|badge|selected|hero|image.?overlay|warning|status)/i.test(name); if (token === Colors.light.background) return colors.background; if (token === Colors.light.surface) return colors.surface; if (token === Colors.light.text) return isWhiteForeground ? token : colors.text; if (token === Colors.light.textSecondary) return colors.textSecondary; if (token === Colors.light.border) return colors.border; if (token === Colors.brand.blue) return colors.tint; if (token === Colors.brand.red) return colors.accent; if (token.startsWith(Colors.brand.blue)) return `${colors.tint}${token.slice(Colors.brand.blue.length)}`; return token; }
