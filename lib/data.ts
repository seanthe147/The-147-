export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  price: string;
  category: "tournament" | "social" | "live" | "special";
  spotsLeft: number;
  imageColor: string;
}

export interface TableType {
  id: string;
  name: string;
  description: string;
  pricePerHour: string;
  icon: string;
}

export const TABLE_TYPES: TableType[] = [
  {
    id: "snooker",
    name: "Snooker Table",
    description: "Full-size professional snooker table",
    pricePerHour: "12",
    icon: "ellipse",
  },
  {
    id: "pool",
    name: "Pool Table",
    description: "American-style pool table",
    pricePerHour: "10",
    icon: "ellipse-outline",
  },
  {
    id: "dining",
    name: "Dining Table",
    description: "Restaurant dining reservation",
    pricePerHour: "Free",
    icon: "restaurant",
  },
  {
    id: "vip",
    name: "VIP Lounge",
    description: "Private area with dedicated service",
    pricePerHour: "25",
    icon: "star",
  },
];

export const EVENTS: Event[] = [
  {
    id: "1",
    title: "Friday Night Tournament",
    date: "2026-02-13",
    time: "19:00",
    description: "Weekly knockout tournament open to all skill levels. Cash prizes for top 3 finishers. Sign up at the bar or through the app.",
    price: "15",
    category: "tournament",
    spotsLeft: 8,
    imageColor: "#0047AB",
  },
  {
    id: "2",
    title: "Live Music: The Blue Chalks",
    date: "2026-02-14",
    time: "20:00",
    description: "Enjoy live music from local band The Blue Chalks while you play. Full bar and food menu available all evening.",
    price: "5",
    category: "live",
    spotsLeft: 45,
    imageColor: "#7C3AED",
  },
  {
    id: "3",
    title: "Beginners Snooker Workshop",
    date: "2026-02-15",
    time: "14:00",
    description: "Learn the basics of snooker from our resident coach. All equipment provided. Perfect for complete beginners.",
    price: "20",
    category: "social",
    spotsLeft: 12,
    imageColor: "#059669",
  },
  {
    id: "4",
    title: "Valentine's Dinner & Play",
    date: "2026-02-14",
    time: "18:00",
    description: "Special Valentine's package: 3-course dinner for two followed by a private snooker table for the evening. Includes a bottle of prosecco.",
    price: "75",
    category: "special",
    spotsLeft: 6,
    imageColor: "#DC2626",
  },
  {
    id: "5",
    title: "Saturday Doubles League",
    date: "2026-02-21",
    time: "13:00",
    description: "Bring a partner and compete in our doubles league. Runs every Saturday for 8 weeks. League table and trophies at the end.",
    price: "10",
    category: "tournament",
    spotsLeft: 16,
    imageColor: "#0047AB",
  },
  {
    id: "6",
    title: "Sunday Carvery & Games",
    date: "2026-02-22",
    time: "12:00",
    description: "Traditional Sunday carvery followed by free table time. Book your carvery spot and enjoy an afternoon of games.",
    price: "18",
    category: "special",
    spotsLeft: 30,
    imageColor: "#B45309",
  },
];

export const TIME_SLOTS = [
  "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
];

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

export const OPENING_HOURS = [
  { day: "Monday", hours: "12:00 - 23:00" },
  { day: "Tuesday", hours: "12:00 - 23:00" },
  { day: "Wednesday", hours: "12:00 - 23:00" },
  { day: "Thursday", hours: "12:00 - 23:00" },
  { day: "Friday", hours: "12:00 - 00:00" },
  { day: "Saturday", hours: "10:00 - 00:00" },
  { day: "Sunday", hours: "10:00 - 22:00" },
];

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function getCategoryLabel(cat: Event["category"]): string {
  switch (cat) {
    case "tournament": return "Tournament";
    case "social": return "Social";
    case "live": return "Live Music";
    case "special": return "Special";
  }
}
