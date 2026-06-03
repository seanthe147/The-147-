import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SquareTier {
  id: string;
  name: string;
  points: number;
  discountType: "FIXED_PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
}

interface GameConfig {
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
}

interface GamePrize {
  id: number;
  name: string;
  description: string | null;
  prizeType: "none" | "loyalty_points" | "reward_tier" | "gift_card" | "customer_group";
  value: number | null;
  rewardTierId: string | null;
  giftCardAmountPence: number | null;
  squareCustomerGroupId: string | null;
  prizeExpiryHours: number | null;
  maxDiscountPence: number | null;
  weightPercent: number;
  active: boolean;
}

interface GameWinner {
  id: number;
  customerId: number;
  customerName: string | null;
  prizeId: number | null;
  pointsAwarded: number | null;
  giftCardGan: string | null;
  playedAt: string;
  londonDate: string;
  prize: GamePrize | null;
}

interface PendingClaim {
  id: number;
  customerId: number;
  customerName: string | null;
  prizeName: string;
  prizeType: string;
  playedAt: string;
  londonDate: string;
}

// ── Empty prize template ───────────────────────────────────────────────────────

function emptyDraft(): PrizeDraft {
  return {
    name: "",
    description: "",
    prizeType: "none",
    value: "",
    rewardTierId: "",
    giftCardAmountPounds: "",
    squareCustomerGroupId: "",
    prizeExpiryHours: "24",
    maxDiscountPounds: "",
    weightPercent: "10",
    active: true,
  };
}

interface PrizeDraft {
  name: string;
  description: string;
  prizeType: "none" | "loyalty_points" | "reward_tier" | "gift_card" | "customer_group";
  value: string;
  rewardTierId: string;
  giftCardAmountPounds: string;
  squareCustomerGroupId: string;
  prizeExpiryHours: string;
  maxDiscountPounds: string;
  weightPercent: string;
  active: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function prizeTypeLabel(t: string): string {
  if (t === "none") return "No prize";
  if (t === "loyalty_points") return "Points";
  if (t === "reward_tier") return "Reward";
  if (t === "gift_card") return "Gift Card";
  if (t === "customer_group") return "POS Discount";
  return t;
}

function prizeTypeColor(t: string): string {
  if (t === "none") return "#6B7280";
  if (t === "loyalty_points") return Colors.brand.gold;
  if (t === "reward_tier") return "#10B981";
  if (t === "gift_card") return "#6366F1";
  if (t === "customer_group") return "#EC4899";
  return "#6B7280";
}

// ── Prize row ─────────────────────────────────────────────────────────────────

interface PrizeRowProps {
  prize: GamePrize;
  onToggleActive: (p: GamePrize, active: boolean) => void;
  onEdit: (p: GamePrize) => void;
  saving: boolean;
}

function PrizeRow({ prize, onToggleActive, onEdit, saving }: PrizeRowProps) {
  return (
    <View style={[prizeRow.card, !prize.active && prizeRow.inactive]}>
      <View style={prizeRow.left}>
        <View style={[prizeRow.typeBadge, { backgroundColor: prizeTypeColor(prize.prizeType) + "22", borderColor: prizeTypeColor(prize.prizeType) + "55" }]}>
          <Text style={[prizeRow.typeText, { color: prizeTypeColor(prize.prizeType) }]}>
            {prizeTypeLabel(prize.prizeType)}
          </Text>
        </View>
        <Text style={[prizeRow.name, !prize.active && prizeRow.dimText]}>{prize.name}</Text>
        {!!prize.description && (
          <Text style={prizeRow.desc} numberOfLines={1}>{prize.description}</Text>
        )}
        <View style={prizeRow.metaRow}>
          <Ionicons name="scale-outline" size={11} color="#9CA3AF" />
          <Text style={prizeRow.meta}>Weight: {prize.weightPercent}</Text>
          {prize.prizeType === "loyalty_points" && !!prize.value && (
            <>
              <Text style={prizeRow.metaDot}>·</Text>
              <Ionicons name="star" size={11} color={Colors.brand.gold} />
              <Text style={prizeRow.meta}>{prize.value} pts</Text>
            </>
          )}
          {prize.prizeType === "gift_card" && !!prize.giftCardAmountPence && (
            <>
              <Text style={prizeRow.metaDot}>·</Text>
              <Ionicons name="card-outline" size={11} color="#6366F1" />
              <Text style={prizeRow.meta}>£{(prize.giftCardAmountPence / 100).toFixed(2)}</Text>
            </>
          )}
        </View>
        {prize.prizeType === "reward_tier" && !prize.rewardTierId && (
          <View style={prizeRow.noTierWarn}>
            <Ionicons name="warning-outline" size={12} color="#D97706" />
            <Text style={prizeRow.noTierWarnText}>No Square tier linked — tap ✎ to link one</Text>
          </View>
        )}
      </View>
      <View style={prizeRow.right}>
        <Pressable onPress={() => onEdit(prize)} style={prizeRow.editBtn} hitSlop={8}>
          <Ionicons name="pencil" size={16} color="#6B7280" />
        </Pressable>
        <Switch
          value={prize.active}
          onValueChange={(v) => onToggleActive(prize, v)}
          disabled={saving}
          trackColor={{ false: "#D1D5DB", true: Colors.brand.gold }}
          thumbColor={Platform.OS === "android" ? (prize.active ? "#fff" : "#f4f3f4") : undefined}
        />
      </View>
    </View>
  );
}

const prizeRow = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inactive: { opacity: 0.55 },
  left: { flex: 1, gap: 3 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeBadge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    marginBottom: 2,
  },
  typeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  dimText: { color: "#9CA3AF" },
  desc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  meta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
  },
  metaDot: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#D1D5DB",
  },
  noTierWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#FEF3C7",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignSelf: "flex-start",
  },
  noTierWarnText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 10,
    color: "#92400E",
  },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
  },
});

// ── Prize editor modal (inline sheet) ─────────────────────────────────────────

interface PrizeEditorProps {
  draft: PrizeDraft;
  onChange: (d: PrizeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
  squareTiers: SquareTier[];
  tiersLoading: boolean;
  tiersError: boolean;
  tiersRefetch: () => void;
}

function tierDiscountLabel(tier: SquareTier): string {
  if (tier.discountType === "FIXED_PERCENTAGE" && tier.discountValue != null) {
    return `${tier.discountValue}% off`;
  }
  if (tier.discountType === "FIXED_AMOUNT" && tier.discountValue != null) {
    return `£${(tier.discountValue / 100).toFixed(2)} off`;
  }
  return "";
}

function PrizeEditor({ draft, onChange, onSave, onCancel, saving, isNew, squareTiers, tiersLoading, tiersError, tiersRefetch }: PrizeEditorProps) {
  const set = (key: keyof PrizeDraft, val: string | boolean) =>
    onChange({ ...draft, [key]: val });

  const handleSelectTier = (tier: SquareTier) => {
    onChange({
      ...draft,
      rewardTierId: tier.id,
      name: draft.name || tier.name,
    });
  };

  return (
    <View style={editor.container}>
      <View style={editor.header}>
        <Text style={editor.title}>{isNew ? "Add Prize" : "Edit Prize"}</Text>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Ionicons name="close" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <View style={editor.field}>
        <Text style={editor.label}>Name *</Text>
        <TextInput
          style={editor.input}
          value={draft.name}
          onChangeText={(v) => set("name", v)}
          placeholder="e.g. Free Soft Drink"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={editor.field}>
        <Text style={editor.label}>Description</Text>
        <TextInput
          style={editor.input}
          value={draft.description}
          onChangeText={(v) => set("description", v)}
          placeholder="Shown to customer on win screen"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={editor.field}>
        <Text style={editor.label}>Prize Type *</Text>
        <View style={editor.segRow}>
          {(["none", "loyalty_points", "reward_tier", "gift_card", "customer_group"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => set("prizeType", t)}
              style={[editor.seg, draft.prizeType === t && editor.segActive]}
            >
              <Text style={[editor.segText, draft.prizeType === t && editor.segTextActive]}>
                {t === "none" ? "No Prize" : t === "loyalty_points" ? "Points" : t === "reward_tier" ? "Reward" : t === "gift_card" ? "Gift Card" : "POS Discount"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={editor.hint}>
          {draft.prizeType === "none"
            ? "The customer scratches but wins nothing. Always include at least one of these."
            : draft.prizeType === "loyalty_points"
            ? "Adds points to the customer's Square loyalty account automatically when they win."
            : draft.prizeType === "reward_tier"
            ? "Issues a Square loyalty reward to the winner's account. See warning below."
            : draft.prizeType === "gift_card"
            ? "Issues a unique gift card code exclusively to the winner — best choice for physical prizes like free drinks."
            : "Adds the winner to a Square customer group so a CatalogPricingRule discount fires automatically at POS. Removed after their next payment or after expiry."}
        </Text>
      </View>

      {draft.prizeType === "loyalty_points" && (
        <View style={editor.field}>
          <Text style={editor.label}>Points to Award *</Text>
          <TextInput
            style={editor.input}
            value={draft.value}
            onChangeText={(v) => set("value", v)}
            placeholder="50"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />
        </View>
      )}

      {draft.prizeType === "reward_tier" && (
        <View style={editor.warnBox}>
          <Ionicons name="warning-outline" size={16} color="#92400E" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={editor.warnTitle}>Not exclusive to game winners</Text>
            <Text style={editor.warnText}>
              Square loyalty reward tiers are part of your whole loyalty programme — any customer who collects enough points through normal spending can also earn this reward. It cannot be made game-only.{"\n\n"}
              For prizes that should only go to game winners (e.g. a free drink, a discount), use <Text style={{ fontFamily: "Montserrat_600SemiBold" }}>Gift Card</Text> instead — it issues a unique code exclusively to that winner.
            </Text>
          </View>
        </View>
      )}

      {draft.prizeType === "reward_tier" && (
        <View style={editor.field}>
          <Text style={editor.label}>Select Reward Tier *</Text>
          {tiersLoading ? (
            <View style={editor.tierLoading}>
              <ActivityIndicator size="small" color={Colors.brand.gold} />
              <Text style={editor.tierLoadingText}>Loading tiers from Square…</Text>
            </View>
          ) : tiersError ? (
            <View style={editor.tierEmpty}>
              <Ionicons name="cloud-offline-outline" size={16} color="#EF4444" />
              <Text style={[editor.tierEmptyText, { color: "#EF4444" }]}>
                Could not load tiers from Square. Check your Square connection, then tap Retry.
              </Text>
              <Pressable onPress={tiersRefetch} style={editor.retryBtn}>
                <Ionicons name="refresh" size={13} color="#fff" />
                <Text style={editor.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : squareTiers.length === 0 ? (
            <View style={editor.tierEmpty}>
              <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
              <Text style={editor.tierEmptyText}>
                No reward tiers found in Square. Create them in Square Dashboard → Loyalty → Reward Tiers, then tap Retry.
              </Text>
              <Pressable onPress={tiersRefetch} style={editor.retryBtn}>
                <Ionicons name="refresh" size={13} color="#fff" />
                <Text style={editor.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={editor.tierList}>
              {squareTiers.map((tier) => {
                const selected = draft.rewardTierId === tier.id;
                const label = tierDiscountLabel(tier);
                return (
                  <Pressable
                    key={tier.id}
                    onPress={() => handleSelectTier(tier)}
                    style={[editor.tierRow, selected && editor.tierRowSelected]}
                  >
                    <View style={editor.tierRowLeft}>
                      <Text style={[editor.tierName, selected && editor.tierNameSelected]}>
                        {tier.name}
                      </Text>
                      <View style={editor.tierMeta}>
                        {!!label && (
                          <View style={[editor.tierBadge, selected && editor.tierBadgeSelected]}>
                            <Text style={[editor.tierBadgeText, selected && editor.tierBadgeTextSelected]}>
                              {label}
                            </Text>
                          </View>
                        )}
                        <Text style={editor.tierPoints}>{tier.points} pts cost</Text>
                      </View>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.brand.gold} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={editor.hint}>
            The reward is issued automatically to the customer's Square account. Net points change is zero — the tier's point cost is gifted then immediately spent by the reward creation.
          </Text>
        </View>
      )}

      {draft.prizeType === "gift_card" && (
        <View style={editor.field}>
          <Text style={editor.label}>Prize Amount (£) *</Text>
          <TextInput
            style={editor.input}
            value={draft.giftCardAmountPounds}
            onChangeText={(v) => set("giftCardAmountPounds", v)}
            placeholder="5.00"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
          />
          <Text style={editor.hint}>
            A unique Square gift card is created exclusively for this winner — nobody else can use it. The winner sees the code on their win screen and shows it at the bar. Staff redeem it in Square POS like any gift card.
          </Text>
        </View>
      )}

      {draft.prizeType === "customer_group" && (
        <>
          <View style={editor.field}>
            <Text style={editor.label}>Square Customer Group ID *</Text>
            <TextInput
              style={editor.input}
              value={draft.squareCustomerGroupId}
              onChangeText={(v) => set("squareCustomerGroupId", v)}
              placeholder="e.g. ABC123DEF456"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={editor.hint}>
              The ID of the Square customer group linked to a CatalogPricingRule. Find it in Square Dashboard → Customers → Groups. Winners are added automatically and removed after they pay or after expiry.
            </Text>
          </View>
          <View style={editor.field}>
            <Text style={editor.label}>Discount Expiry (hours)</Text>
            <TextInput
              style={editor.input}
              value={draft.prizeExpiryHours}
              onChangeText={(v) => set("prizeExpiryHours", v)}
              placeholder="24"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={editor.hint}>
              How many hours the winner stays in the group if they don't pay in time. Defaults to 24h. A background job removes them automatically after expiry.
            </Text>
          </View>
          <View style={editor.field}>
            <Text style={editor.label}>Max Discount Cap (£, optional)</Text>
            <TextInput
              style={editor.input}
              value={draft.maxDiscountPounds}
              onChangeText={(v) => set("maxDiscountPounds", v)}
              placeholder="e.g. 6.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
            <Text style={editor.hint}>
              Reminder: also set the matching "Maximum price" on the CatalogPricingRule in Square Dashboard to enforce this cap at the till. This field is for your reference only.
            </Text>
          </View>
        </>
      )}

      <View style={editor.field}>
        <Text style={editor.label}>Weight</Text>
        <TextInput
          style={editor.input}
          value={draft.weightPercent}
          onChangeText={(v) => set("weightPercent", v)}
          placeholder="10"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
        />
        <Text style={editor.hint}>
          Relative probability — higher means more likely. The "No Prize" entry typically has the highest weight (e.g. 70) so winning prizes are rare.
        </Text>
      </View>

      <View style={editor.toggleRow}>
        <Text style={editor.label}>Active</Text>
        <Switch
          value={draft.active}
          onValueChange={(v) => set("active", v)}
          trackColor={{ false: "#D1D5DB", true: Colors.brand.gold }}
          thumbColor={Platform.OS === "android" ? (draft.active ? "#fff" : "#f4f3f4") : undefined}
        />
      </View>

      <View style={editor.actions}>
        <Pressable onPress={onCancel} style={editor.cancelBtn}>
          <Text style={editor.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [editor.saveBtn, { opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          <Text style={editor.saveText}>{saving ? "Saving…" : isNew ? "Add Prize" : "Save Changes"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const editor = StyleSheet.create({
  container: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.brand.gold + "55",
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
  },
  field: { gap: 4 },
  label: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.text,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: "#fff",
  },
  hint: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
    lineHeight: 15,
  },
  warnBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F59E0B55",
    padding: 12,
  },
  warnTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#92400E",
  },
  warnText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#92400E",
    lineHeight: 16,
  },
  segRow: { flexDirection: "row", gap: 6 },
  seg: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  segActive: {
    borderColor: Colors.brand.gold,
    backgroundColor: Colors.brand.gold + "18",
  },
  segText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#6B7280",
  },
  segTextActive: { color: Colors.brand.gold },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  cancelText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#6B7280",
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.brand.gold,
    alignItems: "center",
  },
  saveText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  tierLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tierLoadingText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
  },
  tierEmpty: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  tierEmptyText: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#92400E",
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#374151",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  retryBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  tierList: {
    gap: 6,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  tierRowSelected: {
    borderColor: Colors.brand.gold,
    backgroundColor: Colors.brand.gold + "0D",
  },
  tierRowLeft: {
    flex: 1,
    gap: 4,
  },
  tierName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  tierNameSelected: {
    color: Colors.brand.gold,
  },
  tierMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tierBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tierBadgeSelected: {
    backgroundColor: Colors.brand.gold + "22",
    borderColor: Colors.brand.gold + "55",
  },
  tierBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#6B7280",
  },
  tierBadgeTextSelected: {
    color: Colors.brand.gold,
  },
  tierPoints: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AdminGameScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isLoading: authLoading } = useStaffAuth();

  // Guard — managers only
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isManager)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, isManager]);

  // ── Config ────────────────────────────────────────────────────────────────
  const configQuery = useQuery<GameConfig>({
    queryKey: ["/api/staff/game/config"],
    refetchOnMount: "always",
  });

  const [gameEnabled, setGameEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("00:00");
  const [windowEnd, setWindowEnd] = useState("23:59");
  const [configHydrated, setConfigHydrated] = useState(false);

  useEffect(() => {
    if (configQuery.data && !configHydrated) {
      setGameEnabled(configQuery.data.enabled);
      setWindowStart(configQuery.data.windowStart);
      setWindowEnd(configQuery.data.windowEnd);
      setConfigHydrated(true);
    }
  }, [configQuery.data, configHydrated]);

  const configMutation = useMutation({
    mutationFn: async (payload: Partial<GameConfig>) => {
      const res = await apiRequest("POST", "/api/staff/game/config", payload);
      return res.json() as Promise<GameConfig>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/staff/game/config"], data);
      setGameEnabled(data.enabled);
      setWindowStart(data.windowStart);
      setWindowEnd(data.windowEnd);
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to save config";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const handleToggleEnabled = (v: boolean) => {
    setGameEnabled(v);
    configMutation.mutate({ enabled: v, windowStart, windowEnd });
  };

  const validateTime = (t: string) => /^\d{1,2}:\d{2}$/.test(t);

  const handleSaveSchedule = () => {
    if (!validateTime(windowStart) || !validateTime(windowEnd)) {
      const msg = "Enter times in HH:MM format, e.g. 10:00";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid time", msg);
      return;
    }
    configMutation.mutate({ enabled: gameEnabled, windowStart, windowEnd });
  };

  const scheduleIsDirty = configQuery.data &&
    (windowStart !== configQuery.data.windowStart || windowEnd !== configQuery.data.windowEnd);

  // ── Prizes ────────────────────────────────────────────────────────────────
  const prizesQuery = useQuery<GamePrize[]>({
    queryKey: ["/api/staff/game/prizes"],
    refetchOnMount: "always",
  });

  // Square reward tiers — fetched live so managers can pick from a dropdown
  const tiersQuery = useQuery<SquareTier[]>({
    queryKey: ["/api/staff/game/square-reward-tiers"],
    refetchOnMount: "always",
    retry: false,
  });
  const squareTiers = tiersQuery.data ?? [];
  const tiersLoading = tiersQuery.isLoading;
  const tiersError = tiersQuery.isError;
  const tiersRefetch = () => { tiersQuery.refetch(); };

  const [editingPrize, setEditingPrize] = useState<GamePrize | null>(null);
  const [editDraft, setEditDraft] = useState<PrizeDraft>(emptyDraft());
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<PrizeDraft>(emptyDraft());

  const prizeMutation = useMutation({
    mutationFn: async (payload: { id?: number; name: string; description?: string; prizeType: string; value?: number | null; rewardTierId?: string | null; tierPoints?: number | null; squareDiscountType?: string | null; squareDiscountValue?: number | null; giftCardAmountPence?: string | null; squareCustomerGroupId?: string | null; prizeExpiryHours?: number | null; maxDiscountPence?: string | null; weightPercent: number; active: boolean }) => {
      const { id, ...body } = payload;
      const res = id
        ? await apiRequest("PUT", `/api/staff/game/prizes/${id}`, body)
        : await apiRequest("POST", "/api/staff/game/prizes", body);
      return res.json() as Promise<GamePrize>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/game/prizes"] });
      setEditingPrize(null);
      setAddingNew(false);
      setNewDraft(emptyDraft());
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to save prize";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const buildPayload = (draft: PrizeDraft, id?: number) => {
    const wp = Number(draft.weightPercent);
    if (!draft.name.trim()) throw new Error("Name is required");
    if (!Number.isInteger(wp) || wp < 1 || wp > 10000) throw new Error("Weight must be a whole number between 1 and 10000");
    if (draft.prizeType === "loyalty_points") {
      const pts = Number(draft.value);
      if (!Number.isInteger(pts) || pts < 1) throw new Error("Points must be a positive whole number");
    }
    if (draft.prizeType === "reward_tier" && !draft.rewardTierId) {
      throw new Error("Please select a reward tier from the list");
    }
    if (draft.prizeType === "gift_card") {
      const amt = parseFloat(draft.giftCardAmountPounds);
      if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid prize amount in pounds (e.g. 5.00)");
    }
    if (draft.prizeType === "customer_group" && !draft.squareCustomerGroupId.trim()) {
      throw new Error("Please enter the Square customer group ID");
    }
    // For reward_tier — look up the matching Square tier so we can persist its
    // points cost and discount details alongside the tier ID.
    const selectedTier = draft.prizeType === "reward_tier"
      ? squareTiers.find(t => t.id === draft.rewardTierId) ?? null
      : null;
    return {
      id,
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      prizeType: draft.prizeType,
      value: draft.prizeType === "loyalty_points" ? Number(draft.value) : null,
      rewardTierId: draft.prizeType === "reward_tier" ? draft.rewardTierId.trim() || null : null,
      tierPoints: selectedTier ? selectedTier.points : undefined,
      squareDiscountType: selectedTier ? selectedTier.discountType : undefined,
      squareDiscountValue: selectedTier ? selectedTier.discountValue : undefined,
      giftCardAmountPence: draft.prizeType === "gift_card" ? String(draft.giftCardAmountPounds) : null,
      squareCustomerGroupId: draft.prizeType === "customer_group" ? draft.squareCustomerGroupId.trim() || null : null,
      prizeExpiryHours: draft.prizeType === "customer_group" && draft.prizeExpiryHours ? parseInt(draft.prizeExpiryHours, 10) || 24 : null,
      maxDiscountPence: draft.prizeType === "customer_group" && draft.maxDiscountPounds ? String(draft.maxDiscountPounds) : null,
      weightPercent: wp,
      active: draft.active,
    };
  };

  const handleSaveEdit = () => {
    try {
      const payload = buildPayload(editDraft, editingPrize!.id);
      prizeMutation.mutate(payload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid data";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid", msg);
    }
  };

  const handleSaveNew = () => {
    try {
      const payload = buildPayload(newDraft);
      prizeMutation.mutate(payload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid data";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid", msg);
    }
  };

  const handleEditPrize = (p: GamePrize) => {
    setAddingNew(false);
    setEditingPrize(p);
    setEditDraft({
      name: p.name,
      description: p.description ?? "",
      prizeType: p.prizeType,
      value: p.value != null ? String(p.value) : "",
      rewardTierId: p.rewardTierId ?? "",
      giftCardAmountPounds: p.giftCardAmountPence != null ? String(p.giftCardAmountPence / 100) : "",
      squareCustomerGroupId: p.squareCustomerGroupId ?? "",
      prizeExpiryHours: p.prizeExpiryHours != null ? String(p.prizeExpiryHours) : "24",
      maxDiscountPounds: p.maxDiscountPence != null ? String(p.maxDiscountPence / 100) : "",
      weightPercent: String(p.weightPercent),
      active: p.active,
    });
  };

  const handleTogglePrizeActive = (p: GamePrize, active: boolean) => {
    prizeMutation.mutate({ id: p.id, name: p.name, description: p.description ?? undefined, prizeType: p.prizeType, value: p.value, rewardTierId: p.rewardTierId, giftCardAmountPence: p.giftCardAmountPence != null ? String(p.giftCardAmountPence / 100) : null, squareCustomerGroupId: p.squareCustomerGroupId, prizeExpiryHours: p.prizeExpiryHours, maxDiscountPence: p.maxDiscountPence != null ? String(p.maxDiscountPence / 100) : null, weightPercent: p.weightPercent, active });
  };

  // ── Pending claims (reward_tier prizes awaiting collection) ──────────────
  const claimsQuery = useQuery<PendingClaim[]>({
    queryKey: ["/api/staff/game/pending-claims"],
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  const claimMutation = useMutation({
    mutationFn: async (playId: number) => {
      const res = await apiRequest("POST", `/api/staff/game/plays/${playId}/claim`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/game/pending-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/game/winners"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to mark as claimed";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const handleMarkClaimed = (claim: PendingClaim) => {
    const confirmMsg = `Mark "${claim.prizeName}" for ${claim.customerName ?? "customer"} as claimed?`;
    if (Platform.OS === "web") {
      if (window.confirm(confirmMsg)) claimMutation.mutate(claim.id);
    } else {
      Alert.alert("Mark as Claimed", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Mark Claimed", onPress: () => claimMutation.mutate(claim.id) },
      ]);
    }
  };

  // ── Winners ───────────────────────────────────────────────────────────────
  const winnersQuery = useQuery<GameWinner[]>({
    queryKey: ["/api/staff/game/winners"],
    refetchOnMount: "always",
  });

  const winners = (winnersQuery.data ?? []).filter(w => w.prize && w.prize.prizeType !== "none").slice(0, 20);

  // ── Auth guard render ─────────────────────────────────────────────────────
  if (authLoading || !isAuthenticated || !isManager) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.brand.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} testID="back-button">
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Scratch Card Game</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40, marginHorizontal: tabletPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Game On / Off ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Game Settings</Text>

        {configQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} style={{ marginBottom: 8 }} />
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.fieldHeader}>
                <Ionicons name="game-controller" size={18} color={Colors.brand.gold} />
                <Text style={styles.fieldTitle}>Daily Lucky Break</Text>
              </View>
              <Text style={styles.fieldDescription}>
                When enabled, logged-in customers can play one scratch card per day to win prizes.
              </Text>
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: gameEnabled ? Colors.brand.gold : "#6B7280" }]}>
                  {gameEnabled ? "Live" : "Off"}
                </Text>
                <Switch
                  value={gameEnabled}
                  onValueChange={handleToggleEnabled}
                  disabled={configMutation.isPending}
                  trackColor={{ false: "#D1D5DB", true: Colors.brand.gold }}
                  thumbColor={Platform.OS === "android" ? (gameEnabled ? "#fff" : "#f4f3f4") : undefined}
                  testID="toggle-game-enabled"
                />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.fieldHeader}>
                <Ionicons name="time-outline" size={18} color="#0EA5E9" />
                <Text style={styles.fieldTitle}>Available Window</Text>
              </View>
              <Text style={styles.fieldDescription}>
                Customers can only play within this time window each day. Use 24-hour HH:MM format. Default is 00:00 to 23:59 (all day).
              </Text>
              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>From</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={windowStart}
                    onChangeText={setWindowStart}
                    placeholder="00:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numbers-and-punctuation"
                    testID="input-window-start"
                  />
                </View>
                <Ionicons name="arrow-forward" size={16} color="#9CA3AF" style={{ marginTop: 22 }} />
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>Until</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={windowEnd}
                    onChangeText={setWindowEnd}
                    placeholder="23:59"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numbers-and-punctuation"
                    testID="input-window-end"
                  />
                </View>
              </View>
              <Pressable
                onPress={handleSaveSchedule}
                disabled={!scheduleIsDirty || configMutation.isPending}
                style={({ pressed }) => [
                  styles.saveButton,
                  { opacity: !scheduleIsDirty || configMutation.isPending ? 0.45 : pressed ? 0.85 : 1 },
                ]}
                testID="save-schedule"
              >
                <Text style={styles.saveButtonText}>
                  {configMutation.isPending ? "Saving…" : "Save Schedule"}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Prize Pool ────────────────────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Prize Pool</Text>
          {!addingNew && (
            <Pressable
              onPress={() => { setEditingPrize(null); setNewDraft(emptyDraft()); setAddingNew(true); }}
              style={styles.addButton}
              testID="add-prize"
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add Prize</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={14} color="#0EA5E9" />
          <Text style={styles.hintText}>
            Each prize has a relative <Text style={{ fontFamily: "Montserrat_600SemiBold" }}>weight</Text> — higher weight means more likely to be picked. Give your "No Prize" slot the highest weight (e.g. 70) so actual prizes are rare. Only active prizes are included in the draw.
          </Text>
        </View>

        {prizesQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} />
        ) : prizesQuery.error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>Failed to load prizes.</Text>
          </View>
        ) : (
          <View style={styles.prizeList}>
            {addingNew && (
              <PrizeEditor
                draft={newDraft}
                onChange={setNewDraft}
                onSave={handleSaveNew}
                onCancel={() => setAddingNew(false)}
                saving={prizeMutation.isPending}
                isNew
                squareTiers={squareTiers}
                tiersLoading={tiersLoading}
                tiersError={tiersError}
                tiersRefetch={tiersRefetch}
              />
            )}
            {(prizesQuery.data ?? []).map((p) =>
              editingPrize?.id === p.id ? (
                <PrizeEditor
                  key={p.id}
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingPrize(null)}
                  saving={prizeMutation.isPending}
                  isNew={false}
                  squareTiers={squareTiers}
                  tiersLoading={tiersLoading}
                  tiersError={tiersError}
                  tiersRefetch={tiersRefetch}
                />
              ) : (
                <PrizeRow
                  key={p.id}
                  prize={p}
                  onToggleActive={handleTogglePrizeActive}
                  onEdit={handleEditPrize}
                  saving={prizeMutation.isPending}
                />
              )
            )}
            {(prizesQuery.data ?? []).length === 0 && !addingNew && (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No prizes set up yet. Tap "Add Prize" to create the first one.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Prize Claims ──────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Prize Claims</Text>

        {claimsQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} />
        ) : (claimsQuery.data ?? []).length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No unclaimed prizes — all clear.</Text>
          </View>
        ) : (
          <View style={styles.winnerList}>
            {(claimsQuery.data ?? []).map((claim) => (
              <View key={claim.id} style={styles.claimRow}>
                <View style={styles.winnerLeft}>
                  <Text style={styles.winnerName}>{claim.customerName ?? "Unknown customer"}</Text>
                  <Text style={styles.winnerPrize}>
                    {claim.prizeName} · <Text style={{ color: "#34D399" }}>Ref #{claim.id.toString().padStart(5, "0")}</Text>
                  </Text>
                  <Text style={styles.winnerDate}>{fmtDateTime(claim.playedAt)}</Text>
                </View>
                <Pressable
                  onPress={() => handleMarkClaimed(claim)}
                  disabled={claimMutation.isPending}
                  style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.claimBtnText}>Claimed</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── Recent Winners ────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recent Winners</Text>

        {winnersQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} />
        ) : winners.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No prize winners recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.winnerList}>
            {winners.map((w) => (
              <View key={w.id} style={styles.winnerRow}>
                <View style={styles.winnerLeft}>
                  <Text style={styles.winnerName}>{w.customerName ?? "Unknown customer"}</Text>
                  <Text style={styles.winnerPrize}>
                    {w.prize?.name ?? "Unknown prize"}
                    {w.pointsAwarded ? ` · +${w.pointsAwarded} pts` : ""}
                    {w.giftCardGan ? ` · GAN: ${w.giftCardGan}` : ""}
                  </Text>
                </View>
                <Text style={styles.winnerDate}>{fmtDateTime(w.playedAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 18,
    color: Colors.light.text,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: 2,
    marginTop: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  fieldHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  fieldDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  toggleLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  timeField: { flex: 1, gap: 4 },
  timeLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.text,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_500Medium",
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: "#F9FAFB",
    textAlign: "center",
  },
  saveButton: {
    backgroundColor: Colors.brand.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.brand.gold,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  hintBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "flex-start",
  },
  hintText: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#1E40AF",
    lineHeight: 16,
  },
  prizeList: { gap: 8 },
  winnerList: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  winnerLeft: { flex: 1, gap: 2 },
  winnerName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  winnerPrize: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  winnerDate: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
  },
  claimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 10,
  },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  claimBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  emptyText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingVertical: 4,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#B91C1C",
  },
});
