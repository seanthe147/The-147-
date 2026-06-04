import { Minus, Plus, CreditCard, ChevronLeft, CheckCircle2, Trash2 } from "lucide-react";
import { useState } from "react";

const INITIAL_ITEMS = [
  { name: "Classic Cheeseburger", desc: "Beef patty, cheddar, lettuce", price: 1150, qty: 1, emoji: "🍔" },
  { name: "Loaded Fries", desc: "Skin-on fries, cheese sauce", price: 695, qty: 2, emoji: "🍟" },
  { name: "Draft Lager", desc: "Peroni — pint", price: 550, qty: 2, emoji: "🍺" },
  { name: "Espresso Martini", desc: "Vodka, Kahlúa, espresso", price: 895, qty: 1, emoji: "🍸" },
];

export function Cart() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const serviceCharge = 0;
  const total = subtotal + serviceCharge;

  const adjust = (idx: number, delta: number) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], qty: Math.max(0, next[idx].qty + delta) };
      return next.filter(i => i.qty > 0);
    });
  };

  const handlePay = () => {
    setPaying(true);
    setTimeout(() => { setPaying(false); setPaid(true); }, 2200);
  };

  if (paid) {
    return (
      <div style={{
        width: "1194px", height: "834px",
        background: "#0A1628",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        gap: 24,
      }}>
        <div style={{
          width: 120, height: 120,
          background: "rgba(27,94,32,0.2)",
          border: "2px solid #4caf50",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CheckCircle2 size={60} color="#4caf50" />
        </div>
        <h2 style={{ color: "#FFF", fontSize: 40, fontWeight: 700, margin: 0 }}>Order Placed!</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, margin: 0 }}>
          Your food and drinks are on their way. Enjoy!
        </p>
        <div style={{
          background: "#132742", borderRadius: 16, padding: "20px 48px",
          color: "#D4A843", fontSize: 16, fontWeight: 600, marginTop: 16,
        }}>
          Order #147 · Table 4
        </div>
      </div>
    );
  }

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
        <button style={{
          background: "rgba(255,255,255,0.08)", border: "none",
          borderRadius: 12, padding: "10px 18px",
          display: "flex", alignItems: "center", gap: 8,
          color: "rgba(255,255,255,0.7)", fontSize: 15, cursor: "pointer",
        }}>
          <ChevronLeft size={18} />
          Back to Menu
        </button>
        <div style={{ flex: 1 }} />
        <div style={{
          width: 40, height: 40, background: "#0047AB",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: "#D4A843", fontSize: 14, fontWeight: 800 }}>147</span>
        </div>
        <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 20 }}>Your Order</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Item list */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "24px 32px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <h3 style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 8px" }}>
            {items.length} item{items.length !== 1 ? "s" : ""}
          </h3>
          {items.map((item, idx) => (
            <div key={idx} style={{
              background: "#132742",
              borderRadius: 16,
              padding: "18px 20px",
              display: "flex", alignItems: "center", gap: 16,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 28, width: 40, textAlign: "center" }}>{item.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#FFFFFF", fontWeight: 600, fontSize: 17 }}>{item.name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 }}>{item.desc}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => adjust(idx, -1)}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(255,255,255,0.08)", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {item.qty === 1
                    ? <Trash2 size={16} color="#DF3131" />
                    : <Minus size={16} color="rgba(255,255,255,0.7)" />}
                </button>
                <span style={{ color: "#FFF", fontSize: 20, fontWeight: 700, width: 24, textAlign: "center" }}>
                  {item.qty}
                </span>
                <button
                  onClick={() => adjust(idx, 1)}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(0,71,171,0.4)", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={16} color="#FFFFFF" />
                </button>
              </div>
              <div style={{
                minWidth: 72, textAlign: "right",
                color: "#FFFFFF", fontWeight: 700, fontSize: 18,
              }}>
                £{((item.price * item.qty) / 100).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Right payment panel */}
        <div style={{
          width: 360, background: "#0d1e34",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          padding: "32px 28px", gap: 16, flexShrink: 0,
        }}>
          <h3 style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, margin: 0 }}>
            Order Summary
          </h3>

          {/* Line items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
                  {item.qty}× {item.name}
                </span>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 500 }}>
                  £{((item.price * item.qty) / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 600 }}>Total</span>
            <span style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 800 }}>
              £{(total / 100).toFixed(2)}
            </span>
          </div>

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={paying || items.length === 0}
            style={{
              background: paying
                ? "rgba(212,168,67,0.6)"
                : "linear-gradient(135deg, #D4A843 0%, #e8c05a 100%)",
              border: "none",
              borderRadius: 18,
              padding: "22px 0",
              color: "#0A1628",
              fontWeight: 800,
              fontSize: 20,
              cursor: paying ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 4px 24px rgba(212,168,67,0.4)",
              marginTop: 8,
              transition: "all 0.2s",
            }}
          >
            {paying ? (
              <>
                <div style={{
                  width: 20, height: 20, border: "2px solid #0A1628",
                  borderTopColor: "transparent", borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
                Processing…
              </>
            ) : (
              <>
                <CreditCard size={22} />
                Pay with Card
              </>
            )}
          </button>

          {/* Tap terminal note */}
          <div style={{
            background: "rgba(0,71,171,0.15)",
            border: "1px solid rgba(0,71,171,0.3)",
            borderRadius: 12, padding: "14px 16px",
            color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.5,
            textAlign: "center",
          }}>
            💳  Tap, insert, or swipe your card on the terminal when prompted
          </div>

          <div style={{ flex: 1 }} />

          <div style={{
            color: "rgba(255,255,255,0.2)", fontSize: 11,
            textAlign: "center", lineHeight: 1.6,
          }}>
            Secured by Square · 256-bit SSL
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
