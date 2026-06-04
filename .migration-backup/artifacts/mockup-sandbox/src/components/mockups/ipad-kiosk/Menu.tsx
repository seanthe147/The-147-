import { useState } from "react";
import { ShoppingCart, Plus, ChevronRight } from "lucide-react";

const CATEGORIES = [
  { id: "food", label: "Food", emoji: "🍔" },
  { id: "drinks", label: "Drinks", emoji: "🍺" },
  { id: "snacks", label: "Snacks", emoji: "🍿" },
  { id: "desserts", label: "Desserts", emoji: "🍦" },
];

const ITEMS: Record<string, { name: string; desc: string; price: number; tag?: string; emoji: string }[]> = {
  food: [
    { name: "Classic Cheeseburger", desc: "Beef patty, cheddar, lettuce, tomato, burger sauce", price: 1150, tag: "Popular", emoji: "🍔" },
    { name: "Chicken Tikka Wrap", desc: "Marinated chicken, mint yoghurt, fresh salad", price: 995, emoji: "🌯" },
    { name: "Loaded Nachos", desc: "Tortilla chips, jalapeños, sour cream, salsa, cheese", price: 875, tag: "Share", emoji: "🧀" },
    { name: "The 147 Hot Dog", desc: "Premium frank, caramelised onions, mustard relish", price: 750, emoji: "🌭" },
    { name: "Margherita Pizza", desc: "Tomato base, mozzarella, fresh basil, olive oil", price: 1095, emoji: "🍕" },
    { name: "Loaded Fries", desc: "Skin-on fries, cheese sauce, bacon bits, chives", price: 695, tag: "Favourite", emoji: "🍟" },
  ],
  drinks: [
    { name: "Draft Lager", desc: "Peroni / Fosters / Stella — ask at bar for selection", price: 550, emoji: "🍺" },
    { name: "Soft Drink", desc: "Coke, Diet Coke, Lemonade, Orange Juice", price: 295, emoji: "🥤" },
    { name: "Craft IPA", desc: "Rotating local guest ales — check board", price: 625, tag: "Seasonal", emoji: "🍻" },
    { name: "House Wine", desc: "Red or White — 175ml glass", price: 595, emoji: "🍷" },
    { name: "Espresso Martini", desc: "Vodka, Kahlúa, fresh espresso shot", price: 895, emoji: "🍸" },
    { name: "Still / Sparkling Water", desc: "750ml bottle", price: 225, emoji: "💧" },
  ],
  snacks: [
    { name: "Mozzarella Sticks", desc: "6 pieces, marinara dipping sauce", price: 595, emoji: "🧀" },
    { name: "Chicken Wings", desc: "6 wings, buffalo or BBQ sauce", price: 750, tag: "Spicy", emoji: "🍗" },
    { name: "Onion Rings", desc: "Beer-battered, with chipotle mayo", price: 445, emoji: "🧅" },
    { name: "Mixed Nuts", desc: "Salted bar nuts", price: 225, emoji: "🥜" },
  ],
  desserts: [
    { name: "Warm Cookie Dough", desc: "Served with vanilla ice cream & toffee sauce", price: 695, tag: "Must Try", emoji: "🍪" },
    { name: "Chocolate Brownie", desc: "Rich fudge brownie, raspberry coulis, cream", price: 595, emoji: "🍫" },
    { name: "Vanilla Ice Cream", desc: "2 scoops, wafer", price: 395, emoji: "🍦" },
  ],
};

export function Menu() {
  const [activeCategory, setActiveCategory] = useState("food");
  const [cart, setCart] = useState<Record<string, number>>({});

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((total, [key, qty]) => {
    const [cat, idx] = key.split(":");
    return total + (ITEMS[cat]?.[+idx]?.price ?? 0) * qty;
  }, 0);

  const addItem = (cat: string, idx: number) => {
    const key = `${cat}:${idx}`;
    setCart(c => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  };

  const items = ITEMS[activeCategory] ?? [];

  return (
    <div style={{
      width: "1194px", height: "834px",
      background: "#0A1628",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', sans-serif",
      overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        height: 72, background: "#132742",
        borderBottom: "1px solid rgba(212,168,67,0.2)",
        display: "flex", alignItems: "center",
        padding: "0 32px", gap: 20, flexShrink: 0,
      }}>
        <div style={{
          width: 40, height: 40, background: "#0047AB",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: "#D4A843", fontSize: 14, fontWeight: 800 }}>147</span>
        </div>
        <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 20 }}>The 147</span>
        <span style={{
          color: "rgba(255,255,255,0.3)", fontSize: 14, marginLeft: 4,
        }}>— Choose your order</span>

        <div style={{ flex: 1 }} />

        {/* Cart pill */}
        {cartCount > 0 && (
          <div style={{
            background: "#D4A843", borderRadius: 14,
            padding: "10px 24px",
            display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer",
          }}>
            <ShoppingCart size={18} color="#0A1628" />
            <span style={{ color: "#0A1628", fontWeight: 700, fontSize: 16 }}>
              {cartCount} item{cartCount !== 1 ? "s" : ""} · £{(cartTotal / 100).toFixed(2)}
            </span>
            <ChevronRight size={16} color="#0A1628" />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left sidebar */}
        <div style={{
          width: 180, background: "#0d1e34",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          padding: "24px 0", gap: 4, flexShrink: 0,
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                background: activeCategory === cat.id
                  ? "rgba(0,71,171,0.3)"
                  : "transparent",
                border: "none",
                borderLeft: activeCategory === cat.id
                  ? "3px solid #0047AB"
                  : "3px solid transparent",
                color: activeCategory === cat.id ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                padding: "18px 20px",
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                width: "100%",
              }}
            >
              <span style={{ fontSize: 22 }}>{cat.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: activeCategory === cat.id ? 600 : 400 }}>
                {cat.label}
              </span>
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: "min-content",
          gap: 16,
          alignContent: "start",
        }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: "#132742",
                borderRadius: 16,
                padding: "20px",
                display: "flex", flexDirection: "column", gap: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                position: "relative",
                cursor: "pointer",
              }}
            >
              {item.tag && (
                <div style={{
                  position: "absolute", top: 14, right: 14,
                  background: "rgba(212,168,67,0.15)",
                  border: "1px solid rgba(212,168,67,0.4)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  color: "#D4A843", fontSize: 11, fontWeight: 600,
                }}>
                  {item.tag}
                </div>
              )}
              <div style={{ fontSize: 32 }}>{item.emoji}</div>
              <div style={{ color: "#FFFFFF", fontWeight: 600, fontSize: 16, paddingRight: item.tag ? 60 : 0 }}>
                {item.name}
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.4 }}>
                {item.desc}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 20 }}>
                  £{(item.price / 100).toFixed(2)}
                </span>
                <button
                  onClick={() => addItem(activeCategory, idx)}
                  style={{
                    width: 44, height: 44,
                    background: cart[`${activeCategory}:${idx}`] ? "#0047AB" : "rgba(255,255,255,0.1)",
                    border: "none", borderRadius: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  {cart[`${activeCategory}:${idx}`] ? (
                    <span style={{ color: "#FFF", fontSize: 16, fontWeight: 700 }}>
                      {cart[`${activeCategory}:${idx}`]}
                    </span>
                  ) : (
                    <Plus size={20} color="rgba(255,255,255,0.7)" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
