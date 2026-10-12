import { Linking } from "react-native";
import { router } from "expo-router";
import { activateBannerDestination, type BannerDestination, type BannerTab } from "@workspace/db/schema";

export function openBannerDestination(destination: BannerDestination | null, currentTab: BannerTab): void {
  activateBannerDestination(destination, currentTab, {
    navigate: (href) => router.navigate(href),
    openURL: (url) => Linking.openURL(url),
  });
}
