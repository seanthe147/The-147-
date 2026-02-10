import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { EVENTS, formatDate, getCategoryLabel, type Event } from "@/lib/data";

const FILTERS = ["All", "Tournament", "Live Music", "Social", "Special"] as const;

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={[event.imageColor + "20", event.imageColor + "08"]}
        style={styles.eventCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.eventCardLeft}>
          <View style={[styles.eventDateBadge, { backgroundColor: event.imageColor }]}>
            <Text style={styles.eventDateDay}>{new Date(event.date + "T00:00:00").getDate()}</Text>
            <Text style={styles.eventDateMonth}>
              {new Date(event.date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.eventCardContent}>
          <View style={[styles.categoryBadge, { backgroundColor: event.imageColor + "18" }]}>
            <Text style={[styles.categoryText, { color: event.imageColor }]}>
              {getCategoryLabel(event.category)}
            </Text>
          </View>
          <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
          <View style={styles.eventMeta}>
            <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.eventMetaText}>{event.time}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.eventPrice}>
              {event.price === "0" ? "Free" : `\u00A3${event.price}`}
            </Text>
          </View>
          <View style={styles.spotsRow}>
            <View style={styles.spotsBarBg}>
              <View
                style={[
                  styles.spotsBarFill,
                  {
                    width: `${Math.max(10, 100 - (event.spotsLeft / 50) * 100)}%`,
                    backgroundColor: event.spotsLeft < 10 ? Colors.brand.red : Colors.brand.blue,
                  },
                ]}
              />
            </View>
            <Text style={[styles.spotsText, event.spotsLeft < 10 && { color: Colors.brand.red }]}>
              {event.spotsLeft} spots left
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
      </LinearGradient>
    </Pressable>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showTicketConfirm, setShowTicketConfirm] = useState(false);
  const [ticketCount, setTicketCount] = useState(1);

  const filteredEvents = EVENTS.filter((e) => {
    if (activeFilter === "All") return true;
    return getCategoryLabel(e.category) === activeFilter;
  });

  const handleGetTickets = useCallback(() => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTicketConfirm(true);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 + webTopInset },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>What's On</Text>
        <Text style={styles.pageSubtitle}>Upcoming events & entertainment</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <Pressable
                key={filter}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveFilter(filter);
                }}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{filter}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No events in this category</Text>
          </View>
        ) : (
          filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedEvent(event);
                setTicketCount(1);
                setShowTicketConfirm(false);
              }}
            />
          ))
        )}

        <View style={{ height: Platform.OS === "web" ? 34 : 100 }} />
      </ScrollView>

      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            {selectedEvent && (
              <>
                <View style={styles.modalHandle} />
                <Pressable style={styles.modalClose} onPress={() => setSelectedEvent(null)}>
                  <Ionicons name="close" size={24} color={Colors.light.text} />
                </Pressable>

                <LinearGradient
                  colors={[selectedEvent.imageColor, selectedEvent.imageColor + "BB"]}
                  style={styles.modalHero}
                >
                  <View style={[styles.categoryBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                    <Text style={[styles.categoryText, { color: "#FFFFFF" }]}>
                      {getCategoryLabel(selectedEvent.category)}
                    </Text>
                  </View>
                  <Text style={styles.modalHeroTitle}>{selectedEvent.title}</Text>
                </LinearGradient>

                <View style={styles.modalBody}>
                  <View style={styles.modalInfoRow}>
                    <View style={styles.modalInfoItem}>
                      <Ionicons name="calendar-outline" size={20} color={Colors.brand.blue} />
                      <Text style={styles.modalInfoLabel}>{formatDate(selectedEvent.date)}</Text>
                    </View>
                    <View style={styles.modalInfoItem}>
                      <Ionicons name="time-outline" size={20} color={Colors.brand.blue} />
                      <Text style={styles.modalInfoLabel}>{selectedEvent.time}</Text>
                    </View>
                    <View style={styles.modalInfoItem}>
                      <Ionicons name="pricetag-outline" size={20} color={Colors.brand.blue} />
                      <Text style={styles.modalInfoLabel}>
                        {selectedEvent.price === "0" ? "Free" : `\u00A3${selectedEvent.price}`}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.modalDescription}>{selectedEvent.description}</Text>

                  {!showTicketConfirm ? (
                    <>
                      <Text style={styles.ticketLabel}>Number of Tickets</Text>
                      <View style={styles.ticketCounter}>
                        <Pressable
                          onPress={() => {
                            if (ticketCount > 1) {
                              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setTicketCount((c) => c - 1);
                            }
                          }}
                          style={[styles.counterBtn, ticketCount <= 1 && { opacity: 0.4 }]}
                        >
                          <Ionicons name="remove" size={20} color={Colors.brand.blue} />
                        </Pressable>
                        <Text style={styles.counterValue}>{ticketCount}</Text>
                        <Pressable
                          onPress={() => {
                            if (ticketCount < selectedEvent.spotsLeft) {
                              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setTicketCount((c) => c + 1);
                            }
                          }}
                          style={[styles.counterBtn, ticketCount >= selectedEvent.spotsLeft && { opacity: 0.4 }]}
                        >
                          <Ionicons name="add" size={20} color={Colors.brand.blue} />
                        </Pressable>
                      </View>

                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalPrice}>
                          {selectedEvent.price === "0"
                            ? "Free"
                            : `\u00A3${(parseInt(selectedEvent.price) * ticketCount).toFixed(2)}`}
                        </Text>
                      </View>

                      <Pressable
                        onPress={handleGetTickets}
                        style={({ pressed }) => [
                          styles.getTicketsBtn,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                      >
                        <LinearGradient
                          colors={[Colors.brand.blue, Colors.brand.navy]}
                          style={styles.getTicketsGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        >
                          <Ionicons name="ticket" size={18} color="#FFFFFF" />
                          <Text style={styles.getTicketsText}>Get Tickets</Text>
                        </LinearGradient>
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.confirmView}>
                      <View style={styles.confirmIconWrap}>
                        <Ionicons name="checkmark-circle" size={56} color={Colors.brand.blue} />
                      </View>
                      <Text style={styles.confirmTitle}>Tickets Reserved!</Text>
                      <Text style={styles.confirmSub}>
                        {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} for {selectedEvent.title}
                      </Text>
                      <Pressable
                        onPress={() => setSelectedEvent(null)}
                        style={({ pressed }) => [
                          styles.confirmDoneBtn,
                          { opacity: pressed ? 0.9 : 1 },
                        ]}
                      >
                        <Text style={styles.confirmDoneText}>Done</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: Colors.light.text,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 20,
  },
  filterRow: {
    gap: 8,
    marginBottom: 20,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  filterChipActive: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  filterText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  eventCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: Colors.light.surface,
    elevation: 2,
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.08)",
  },
  eventCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  eventCardLeft: {},
  eventDateBadge: {
    width: 52,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDateDay: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1,
  },
  eventCardContent: {
    flex: 1,
    gap: 4,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  categoryText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  eventTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  eventMetaText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.light.textSecondary,
    marginHorizontal: 4,
  },
  eventPrice: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
  },
  spotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  spotsBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    overflow: "hidden",
  },
  spotsBarFill: {
    height: 4,
    borderRadius: 2,
  },
  spotsText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHero: {
    padding: 24,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 8,
  },
  modalHeroTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
    marginTop: 4,
  },
  modalBody: {
    padding: 24,
  },
  modalInfoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  modalInfoItem: {
    alignItems: "center",
    gap: 4,
  },
  modalInfoLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.text,
  },
  modalDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  ticketLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 12,
  },
  ticketCounter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 20,
  },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: Colors.light.text,
    minWidth: 40,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  totalLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
  },
  totalPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: Colors.brand.blue,
  },
  getTicketsBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  getTicketsGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  getTicketsText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  confirmView: {
    alignItems: "center",
    paddingVertical: 16,
  },
  confirmIconWrap: {
    marginBottom: 16,
  },
  confirmTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: Colors.light.text,
    marginBottom: 6,
  },
  confirmSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 28,
  },
  confirmDoneBtn: {
    width: "100%",
    backgroundColor: Colors.brand.blue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmDoneText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
