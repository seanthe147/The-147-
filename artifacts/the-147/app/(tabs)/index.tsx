import React, { useRef, useState, useEffect, useCallback, useContext, useMemo, memo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Linking,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useResponsive } from "@/hooks/useResponsive";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
const baseColors = Colors;
import { OPENING_HOURS } from "@/lib/data";
import type { Event, BannerImage, Offer } from "@workspace/db/schema";
import { isSafePublicUrl } from "@workspace/db/schema";
import { EnableNotificationsBanner } from "@/components/EnableNotificationsBanner";
import { trackEvent } from "@/lib/analytics";

const logoImage = require("@/assets/images/logo-147.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function resolveImageUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  const base = getApiUrl();
  return new URL(path, base).toString();
}

// Appends a ?v=<timestamp> cache-busting parameter to HTTP/HTTPS/path URLs so
// that expo-image treats a replaced image as a new resource. data: URIs are
// returned unchanged — their content IS the cache key, so no busting needed.
function withCacheBuster(url: string, ts: string | number | null | undefined): string {
  const resolved = resolveImageUrl(url);
  if (!ts || resolved.startsWith("data:")) return resolved;
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}v=${ts}`;
}

interface LoyaltyMeSnapshot {
  linked: boolean;
  account?: { balance: number } | null;
}

// Always-visible points pill on the home screen header. Quietly fetches the
// signed-in customer's loyalty balance and tucks it next to the hours chip.
// Renders nothing for signed-out customers or those who haven't linked yet —
// no need for a noisy "Join now" prompt up here, the loyalty tab handles that.
const HomePointsPill = memo(function HomePointsPill({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const { isAuthenticated, customer, getCustomerToken } = useCustomerAuth();
  // Key includes customer.id so that signing out + signing in as a different
  // customer on a shared device doesn't briefly surface the previous user's
  // points. Same key shape as the loyalty tab — so enroll/refresh on either
  // screen invalidates both.
  const { data } = useQuery<LoyaltyMeSnapshot>({
    queryKey: ["/api/loyalty/me", customer?.id],
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(new URL("/api/loyalty/me", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  if (!isAuthenticated || !data?.linked || !data.account) return null;

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/(tabs)/loyalty");
      }}
      style={({ pressed }) => [styles.pointsPill, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name="star" size={13} color={Colors.brand.gold} />
      <Text style={styles.pointsPillText}>{data.account.balance}</Text>
    </Pressable>
  );
});

const QuickActionPill = memo(function QuickActionPill({
  styles,
  icon,
  label,
  iconColor,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.quickTileWrap,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <View style={styles.quickTileIcon}>
        <Ionicons name={icon} size={24} color={iconColor ?? "#FFFFFF"} />
      </View>
      <Text style={styles.quickTileLabel}>{label}</Text>
    </Pressable>
  );
});

const BANNER_WIDTH = SCREEN_WIDTH - 40;
// Ratio matches the recommended 1500×650 upload size (2.308:1).
// Using a ratio instead of a fixed pixel height means the banner never
// crops left/right edges when the image aspect ratio matches the slot.
const BANNER_HEIGHT = Math.round(BANNER_WIDTH / 2.3);
const AUTO_SCROLL_INTERVAL = 5000;

const BannerCarousel = memo(function BannerCarousel({ images, styles }: { images: BannerImage[]; styles: ReturnType<typeof createStyles> }) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoScroll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % images.length;
        scrollRef.current?.scrollTo({ x: next * (BANNER_WIDTH + 12), animated: true });
        return next;
      });
    }, AUTO_SCROLL_INTERVAL);
  }, [images.length]);

  useEffect(() => {
    startAutoScroll();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoScroll]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / (BANNER_WIDTH + 12));
    setActiveIndex(idx);
    startAutoScroll();
  }, [startAutoScroll]);

  return (
    <View style={styles.bannerSection}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20 }}
        onMomentumScrollEnd={onScrollEnd}
        scrollEnabled={images.length > 1}
        scrollEventThrottle={16}
      >
        {images.map((item) => {
          const hasLink = !!item.linkType;
          const handleBannerPress = () => {
            if (!item.linkType) return;
            if (item.linkType === "event") {
              router.push("/(tabs)/events");
            } else if (item.linkType === "order") {
              router.push("/(tabs)/order");
            } else if (item.linkType === "url" && item.linkValue) {
              // Defense-in-depth: even though the server now rejects unsafe
              // schemes on write, refuse to open anything that isn't a plain
              // http(s) URL. On web `Linking.openURL` becomes a navigation,
              // and `javascript:` URLs would execute in the page origin.
              if (isSafePublicUrl(item.linkValue)) {
                Linking.openURL(item.linkValue);
              }
            }
          };
          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.bannerSlide,
                hasLink && { opacity: pressed ? 0.88 : 1 },
              ]}
              onPress={hasLink ? handleBannerPress : undefined}
            >
              <ExpoImage
                source={{ uri: withCacheBuster(item.imageUrl, item.updatedAt ? new Date(item.updatedAt).getTime() : undefined) }}
                style={styles.bannerImage}
                contentFit="cover"
                transition={250}
                cachePolicy="disk"
              />
              {item.title ? (
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.6)"]}
                  style={styles.bannerOverlay}
                >
                  <Text style={styles.bannerCaption} numberOfLines={2}>{item.title}</Text>
                  {hasLink ? (
                    <View style={styles.bannerLinkBadge}>
                      <Ionicons
                        name={item.linkType === "event" ? "ticket-outline" : item.linkType === "order" ? "restaurant-outline" : "open-outline"}
                        size={11}
                        color="rgba(255,255,255,0.9)"
                      />
                      <Text style={styles.bannerLinkText}>
                        {item.linkType === "event" ? "View Events" : item.linkType === "order" ? "Order Now" : "Learn More"}
                      </Text>
                      <Ionicons name="chevron-forward" size={11} color="rgba(255,255,255,0.9)" />
                    </View>
                  ) : null}
                </LinearGradient>
              ) : hasLink ? (
                <View style={styles.bannerOverlayMinimal}>
                  <View style={styles.bannerLinkBadge}>
                    <Ionicons
                      name={item.linkType === "event" ? "ticket-outline" : item.linkType === "order" ? "restaurant-outline" : "open-outline"}
                      size={11}
                      color="rgba(255,255,255,0.9)"
                    />
                    <Text style={styles.bannerLinkText}>
                      {item.linkType === "event" ? "View Events" : item.linkType === "order" ? "Order Now" : "Learn More"}
                    </Text>
                    <Ionicons name="chevron-forward" size={11} color="rgba(255,255,255,0.9)" />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.dotRow}>
          {images.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
});

interface Deal {
  id: string;
  name: string;
  discountType: "FIXED_PERCENTAGE" | "FIXED_AMOUNT";
  percentage?: string;
  amountPence?: number;
  expiresOn?: string; // "YYYY-MM-DD"
}

function formatDealValue(deal: Deal): string {
  if (deal.discountType === "FIXED_AMOUNT" && deal.amountPence != null) {
    const pounds = deal.amountPence / 100;
    return pounds % 1 === 0 ? `£${pounds} off` : `£${pounds.toFixed(2)} off`;
  }
  if (deal.discountType === "FIXED_PERCENTAGE" && deal.percentage) {
    const pct = parseFloat(deal.percentage);
    return `${pct % 1 === 0 ? pct : deal.percentage}% off`;
  }
  return "";
}

const OffersSection = memo(function OffersSection({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const { data: offers } = useQuery<Offer[]>({ queryKey: ["/api/offers"] });
  const active = (offers || []).filter((o) => o.active);
  if (active.length === 0) return null;
  return (
    <View style={styles.offersSection}>
      <View style={styles.offersSectionHeader}>
        <Ionicons name="pricetag" size={16} color="#B45309" />
        <Text style={styles.offersSectionTitle}>Special Offers</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.offersScroll}
        decelerationRate="fast"
      >
        {active.map((offer) => {
          const linkType = (offer as any).linkType as string | null;
          const linkUrl = (offer as any).linkUrl as string | null;
          const hasLink = !!(linkType || linkUrl);
          const handleOfferPress = () => {
            if (linkType === "order_item" && linkUrl) {
              const [catId, itemId, itemName] = linkUrl.split("|");
              router.push({ pathname: "/(tabs)/order", params: { hlCatId: catId, hlItemId: itemId, hlItemName: itemName } } as any);
            } else if (linkUrl) {
              Linking.openURL(linkUrl);
            }
          };
          return (
            <Pressable
              key={offer.id}
              onPress={hasLink ? handleOfferPress : undefined}
              style={({ pressed }) => [styles.offerCard, hasLink && { opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={[offer.gradientStart || "#0047AB", offer.gradientEnd || "#1E6FD9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.offerCardGradient}
              >
                <View style={styles.offerCardTop}>
                  <View style={styles.offerCardIconWrap}>
                    <Ionicons name={(offer.icon || "pricetag") as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
                  </View>
                  <View style={styles.offerCardBadge}>
                    <Text style={styles.offerCardBadgeText}>{offer.discount}</Text>
                  </View>
                  {hasLink && (
                    <View style={styles.offerCardLinkBadge}>
                      <Ionicons name="open-outline" size={11} color="rgba(255,255,255,0.85)" />
                    </View>
                  )}
                </View>
                <Text style={styles.offerCardTitle} numberOfLines={2}>{offer.title}</Text>
                <Text style={styles.offerCardSub} numberOfLines={2}>{offer.subtitle}</Text>
                {offer.validUntil ? (
                  <View style={styles.offerCardFooter}>
                    <Ionicons name="calendar-outline" size={10} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.offerCardValid}>{offer.validUntil}</Text>
                  </View>
                ) : null}
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const DealsSection = memo(function DealsSection({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const { data: deals } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  if (!deals || deals.length === 0) return null;
  return (
    <View style={styles.dealsSection}>
      <View style={styles.dealsSectionHeader}>
        <Ionicons name="pricetag" size={16} color={Colors.brand.gold} />
        <Text style={styles.dealsSectionTitle}>Current Deals</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dealsScroll}
        decelerationRate="fast"
      >
        {deals.map((deal) => {
          const value = formatDealValue(deal);
          const expiry = deal.expiresOn
            ? (() => {
                const [y, m, d] = deal.expiresOn.split("-").map(Number);
                return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              })()
            : null;
          return (
            <View key={deal.id} style={styles.dealCard}>
              <Text style={styles.dealName} numberOfLines={2}>{deal.name}</Text>
              {value ? <Text style={styles.dealValue}>{value}</Text> : null}
              {expiry ? (
                <View style={styles.dealExpiry}>
                  <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.dealExpiryText}>Ends {expiry}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

const EventPreview = memo(function EventPreview({
  styles,
  colors,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events?type=event"],
  });

  const upcoming = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return (events || [])
      .filter((e) => {
        if (!e.date) return true;
        return new Date(e.date + "T23:59:59") >= now;
      })
      .slice(0, 3);
  }, [events]);

  if (upcoming.length === 0) return null;

  return (
    <View style={styles.eventsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/events")}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={styles.seeAllText}>See All</Text>
        </Pressable>
      </View>
      {upcoming.map((event) => {
        const color = event.imageColor || "#0047AB";
        let dayNum = "--";
        let monthStr = "---";
        if (event.date) {
          const eventDate = new Date(event.date + "T00:00:00");
          dayNum = eventDate.getDate().toString();
          monthStr = eventDate.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
        }
        const timeDisplay = event.time
          ? (() => {
              const [h, m] = event.time.split(":");
              const hour = parseInt(h, 10);
              const suffix = hour >= 12 ? "pm" : "am";
              const dh = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
              return m === "00" ? `${dh}${suffix}` : `${dh}:${m}${suffix}`;
            })()
          : "";
        return (
          <Pressable
            key={event.id}
            onPress={() => router.push("/(tabs)/events")}
            style={({ pressed }) => [styles.eventRow, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.eventDateBox, { backgroundColor: color + "18" }]}>
              <Text style={[styles.eventDateDay, { color }]}>{dayNum}</Text>
              <Text style={[styles.eventDateMonth, { color }]}>{monthStr}</Text>
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event.date ? `${dayNum} ${monthStr}` : "Date TBC"}
                {timeDisplay ? ` at ${timeDisplay}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.border} />
          </Pressable>
        );
      })}
    </View>
  );
});

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { isAuthenticated } = useCustomerAuth();
  const { greeting } = useCustomerGreeting();

  const { data: bannerImages, isLoading: bannersLoading } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images?page=home"],
  });

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const bannerImageUrl = settings?.banner_image;
  const todayHours = useMemo(() => getOpeningHoursToday(), []);

  const goToBook = useCallback(() => {
    trackEvent("home_navigation_tapped", { destination: "booking" });
    router.push("/booking");
  }, []);
  const goToEvents = useCallback(() => {
    trackEvent("home_navigation_tapped", { destination: "events" });
    router.push("/(tabs)/events");
  }, []);
  const goToOrder = useCallback(() => {
    trackEvent("home_navigation_tapped", { destination: "order" });
    router.push("/(tabs)/order");
  }, []);
  const goToContact = useCallback(() => {
    trackEvent("home_navigation_tapped", { destination: "contact" });
    router.push("/contact");
  }, []);

  const heroOverlay = (
    <LinearGradient
      colors={
        bannerImageUrl
          ? ["transparent", "rgba(10,22,40,0.55)", "rgba(10,22,40,0.92)"]
          : [Colors.brand.dark, Colors.brand.navy, Colors.brand.blue + "70"]
      }
      locations={bannerImageUrl ? [0, 0.5, 1] : [0, 0.6, 1]}
      style={StyleSheet.absoluteFillObject}
    />
  );

  const heroTopPad = insets.top + 10 + webTopInset;
  const heroContent = (
    <View style={[styles.heroContent, { paddingTop: heroTopPad }]}>
      <View style={styles.heroTopBar}>
        <ExpoImage source={logoImage} style={styles.logoImage} contentFit="contain" cachePolicy="memory" />
        <View style={styles.heroTopRight}>
          <HomePointsPill styles={styles} />
          <Pressable
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.hoursChip, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.liveDot} />
            <Text style={styles.hoursChipText}>Open until {todayHours.closeTime}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/account")}
            style={({ pressed }) => [styles.accountButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name={isAuthenticated ? "person" : "person-outline"} size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.heroCenter}>
        {greeting ? (
          // Personalised greeting via the shared useCustomerGreeting
          // hook — only renders for signed-in customers and stays in
          // sync with the same logic used on Loyalty, Book, Account
          // and the order confirmation screen.
          <Text style={styles.heroGreeting} numberOfLines={1}>
            {greeting}
          </Text>
        ) : null}
        <Text style={styles.heroTitle}>The 147</Text>
        <View style={styles.heroTagline}>
          <View style={styles.tagDivider} />
          <Text style={styles.heroSubtitle}>Venue</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Snooker</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Bar</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Restaurant</Text>
          <View style={styles.tagDivider} />
        </View>
      </View>

      <View style={styles.heroActions}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            trackEvent("home_navigation_tapped", { destination: "booking" });
            router.push("/booking");
          }}
          style={({ pressed }) => [
            styles.primaryCta,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Ionicons name="calendar" size={17} color={Colors.brand.dark} />
          <Text style={styles.primaryCtaText}>Book a Table</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            trackEvent("home_navigation_tapped", { destination: "order" });
            router.push("/(tabs)/order");
          }}
          style={({ pressed }) => [
            styles.secondaryCta,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Ionicons name="restaurant" size={17} color="#FFFFFF" />
          <Text style={styles.secondaryCtaText}>Order Food</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        <View style={styles.heroBanner}>
          {bannerImageUrl ? (
            <ExpoImage
              source={{ uri: withCacheBuster(bannerImageUrl, settings?.banner_image_updated_at) }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={300}
              cachePolicy="disk"
            />
          ) : null}
          {heroOverlay}
          {heroContent}
        </View>

        <View style={[styles.body, isTablet && { maxWidth: 720, width: "100%", alignSelf: "center" }]}>
          {/* FEATURE_PERSONALISED_HOME: personalised cards rendered above
              quick actions. The hook returns an empty array unless the
              flag is on, the customer is signed in, and there's something
              relevant to show — so this section silently disappears in
              every other case. */}
          <PersonalisedHomeCards styles={styles} colors={colors} />

          <View style={styles.quickNav}>
            <QuickActionPill
              styles={styles}
              icon="calendar"
              label="Book Table"
              iconColor={Colors.brand.blue}
              onPress={goToBook}
            />
            <QuickActionPill
              styles={styles}
              icon="restaurant"
              label="Order Food"
              iconColor={Colors.brand.gold}
              onPress={goToOrder}
            />
            <QuickActionPill
              styles={styles}
              icon="diamond"
              label="Membership"
              iconColor="#FFFFFF"
              onPress={() => router.push("/(tabs)/loyalty")}
            />
            <QuickActionPill
              styles={styles}
              icon="mail-outline"
              label="Contact Us"
              iconColor="#FFFFFF"
              onPress={goToContact}
            />
          </View>

          <EnableNotificationsBanner />

          {bannerImages && bannerImages.length > 0 ? (
            <BannerCarousel images={bannerImages} styles={styles} />
          ) : null}

          <OffersSection styles={styles} />

          <DealsSection styles={styles} />

          <EventPreview styles={styles} colors={colors} />

          <Pressable
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.hoursCard, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <View style={styles.hoursCardLeft}>
              <View style={styles.hoursIconWrap}>
                <Ionicons name="time" size={22} color={Colors.brand.gold} />
              </View>
              <View>
                <Text style={styles.hoursCardTitle}>Opening Hours</Text>
                <Text style={styles.hoursCardSub}>{todayHours.day}: {todayHours.hours}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL("https://www.the147.co.uk")}
            style={({ pressed }) => [styles.websiteCard, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="globe-outline" size={18} color={Colors.brand.gold} />
            <Text style={styles.websiteText}>Visit www.the147.co.uk</Text>
            <Ionicons name="open-outline" size={13} color="rgba(255,255,255,0.4)" />
          </Pressable>

          <View style={{ height: Platform.OS === "web" ? 50 : tabBarHeight + 20 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function getOpeningHoursToday(): { day: string; hours: string; closeTime: string } {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];
  const entry = OPENING_HOURS.find((h) => h.day === today);
  const hours = entry?.hours ?? "Closed";
  const closeTime = hours.includes("-") ? hours.split("-")[1].trim() : "late";
  return { day: today, hours, closeTime };
}

const createStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroBanner: {
    width: "100%",
    minHeight: 280,
  },
  heroContent: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flex: 1,
    justifyContent: "space-between",
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
  },
  heroTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  hoursChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(217,165,46,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(217,165,46,0.45)",
  },
  pointsPillText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
  },
  hoursChipText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.2,
  },
  heroCenter: {
    alignItems: "center",
    marginVertical: 2,
  },
  heroGreeting: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.3,
    marginBottom: 2,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 48,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTagline: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  heroSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  tagDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.brand.gold,
  },
  tagDivider: {
    width: 16,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand.gold,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryCtaText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.brand.dark,
  },
  secondaryCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  secondaryCtaText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  body: {
    paddingTop: 20,
    backgroundColor: palette.background,
  },
  quickNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 28,
    gap: 8,
  },
  quickTileWrap: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  quickTileIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
    borderRightWidth: 1,
    borderRightColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  quickTileLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: palette.textSecondary,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: palette.text,
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.gold,
  },
  bannerSection: {
    marginBottom: 28,
  },
  bannerSlide: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: 12,
    backgroundColor: "rgba(19,39,66,0.8)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 30,
  },
  bannerCaption: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bannerOverlayMinimal: {
    position: "absolute",
    bottom: 10,
    right: 12,
  },
  bannerLinkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  bannerLinkText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.3,
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: Colors.brand.gold,
    width: 20,
    borderRadius: 3,
  },
  eventsSection: {
    marginBottom: 24,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 20,
    backgroundColor: palette.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  eventDateBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDateDay: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: palette.text,
    marginBottom: 2,
  },
  eventMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: palette.textSecondary,
  },
  offersSection: {
    marginBottom: 16,
  },
  offersSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  offersSectionTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: palette.text,
  },
  offersScroll: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 4,
  },
  offerCard: {
    borderRadius: 16,
    overflow: "hidden",
    minWidth: 160,
    maxWidth: 200,
  },
  offerCardGradient: {
    padding: 14,
    minHeight: 120,
    justifyContent: "space-between",
  },
  offerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  offerCardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerCardBadge: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  offerCardBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  offerCardLinkBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerCardTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#fff",
    marginBottom: 3,
  },
  offerCardSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 15,
    marginBottom: 6,
  },
  offerCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  offerCardValid: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
  },
  dealsSection: {
    marginBottom: 16,
  },
  dealsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  dealsSectionTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: palette.text,
  },
  dealsScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  dealCard: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minWidth: 140,
    maxWidth: 180,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  dealName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: palette.text,
    marginBottom: 8,
  },
  dealValue: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.brand.gold,
  },
  dealExpiry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 6,
  },
  dealExpiryText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 10,
    color: palette.textSecondary,
  },
  hoursCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  hoursCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  hoursIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(212,168,67,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  hoursCardTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: palette.text,
  },
  hoursCardSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 1,
  },
  websiteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  websiteText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.gold,
  },

  // FEATURE_PERSONALISED_HOME — section + cards on the home tab.
  personalisedSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  personalisedTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: palette.textSecondary,
    marginBottom: 4,
  },
  personalisedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
    borderRightWidth: 1,
    borderRightColor: palette.border,
    padding: 14,
    gap: 12,
  },
  personalisedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,71,171,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  personalisedBody: {
    flex: 1,
  },
  personalisedHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: palette.text,
    marginBottom: 2,
  },
  personalisedSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: palette.textSecondary,
  },
  });
};

/**
 * FEATURE_PERSONALISED_HOME
 * Renders the customer's personalised cards (last-order reorder, dietary
 * reminder, etc) at the top of the home body. Returns null when the flag
 * is off, the customer isn't signed in, or the server returned no cards
 * — keeping the home layout identical to the pre-flag version in those
 * cases.
 */
function PersonalisedHomeCards({
  styles,
  colors,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useColors>;
}) {
  const { customer, getCustomerToken } = useCustomerAuth();
  const { flags } = useFeatureFlags();

  type ReorderCard = {
    type: "reorder";
    appOrderId: number;
    summary: string;
    totalPence: number;
    placedAt: string;
  };
  type DietaryCard = {
    type: "dietary_reminder";
    filters: string[];
  };
  type HomeCard = ReorderCard | DietaryCard;

  const { data } = useQuery<{ cards: HomeCard[] }>({
    queryKey: ["/api/customers/me/home-cards", customer?.id],
    enabled: !!flags.personalisedHome && !!customer,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) return { cards: [] };
      const res = await fetch(new URL("/api/customers/me/home-cards", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
  });

  const cards = data?.cards ?? [];
  if (!flags.personalisedHome || !customer || cards.length === 0) return null;

  return (
    <View style={styles.personalisedSection}>
      <Text style={styles.personalisedTitle}>For you</Text>
      {cards.map((card, idx) => {
        if (card.type === "reorder") {
          return (
            <Pressable
              key={`reorder-${card.appOrderId}`}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(tabs)/order");
              }}
              style={({ pressed }) => [styles.personalisedCard, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              testID="home-card-reorder"
            >
              <View style={styles.personalisedIconWrap}>
                <Ionicons name="repeat" size={20} color={Colors.brand.blue} />
              </View>
              <View style={styles.personalisedBody}>
                <Text style={styles.personalisedHeading} numberOfLines={1}>
                  Reorder your last round
                </Text>
                <Text style={styles.personalisedSub} numberOfLines={1}>
                  {card.summary} · £{(card.totalPence / 100).toFixed(2)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          );
        }
        // dietary_reminder
        return (
          <Pressable
            key={`dietary-${idx}`}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/order");
            }}
            style={({ pressed }) => [styles.personalisedCard, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            testID="home-card-dietary"
          >
            <View style={[styles.personalisedIconWrap, { backgroundColor: "#16A34A1A" }]}>
              <Ionicons name="leaf" size={20} color="#16A34A" />
            </View>
            <View style={styles.personalisedBody}>
              <Text style={styles.personalisedHeading} numberOfLines={1}>
                Showing {card.filters.join(", ")} options
              </Text>
              <Text style={styles.personalisedSub} numberOfLines={1}>
                Tap to browse the filtered menu
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}
