import { useState, useEffect } from "react";

export function Home() {
  const [time, setTime] = useState(new Date());
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const p = setInterval(() => setPulse(v => !v), 1800);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      style={{
        width: "1194px",
        height: "834px",
        background: "linear-gradient(160deg, #0A1628 0%, #132742 60%, #0d1f3a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "'Inter', sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(212,168,67,0.06) 1px, transparent 0)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Top glow */}
      <div style={{
        position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300,
        background: "radial-gradient(ellipse, rgba(0,71,171,0.3) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Header row */}
      <div style={{
        width: "100%", display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "32px 48px 0",
      }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>
          {fmtDate(time)}
        </div>
        <div style={{
          color: "rgba(255,255,255,0.5)", fontSize: 28, fontWeight: 300,
          letterSpacing: 2, fontVariantNumeric: "tabular-nums",
        }}>
          {fmt(time)}
        </div>
      </div>

      {/* Centre content */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
        marginTop: -20,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 100, height: 100,
          background: "linear-gradient(135deg, #0047AB 0%, #1a6bd4 100%)",
          borderRadius: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 32,
          boxShadow: "0 0 60px rgba(0,71,171,0.5), 0 0 120px rgba(0,71,171,0.2)",
        }}>
          <span style={{ color: "#D4A843", fontSize: 42, fontWeight: 800 }}>147</span>
        </div>

        {/* Venue name */}
        <h1 style={{
          color: "#FFFFFF", fontSize: 68, fontWeight: 700,
          letterSpacing: -2, margin: 0, lineHeight: 1,
          textShadow: "0 2px 40px rgba(0,71,171,0.4)",
        }}>
          The 147
        </h1>
        <p style={{
          color: "#D4A843", fontSize: 18, fontWeight: 500,
          letterSpacing: 6, textTransform: "uppercase",
          margin: "12px 0 0",
        }}>
          Snooker · Bar · Restaurant
        </p>

        {/* Divider */}
        <div style={{
          width: 60, height: 2,
          background: "linear-gradient(90deg, transparent, #D4A843, transparent)",
          margin: "40px 0",
        }} />

        {/* CTA */}
        <button
          style={{
            background: pulse
              ? "linear-gradient(135deg, #D4A843 0%, #e8c05a 100%)"
              : "linear-gradient(135deg, #c9a03c 0%, #D4A843 100%)",
            color: "#0A1628",
            border: "none",
            borderRadius: 20,
            padding: "28px 80px",
            fontSize: 26,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 0.5,
            boxShadow: pulse
              ? "0 0 50px rgba(212,168,67,0.7), 0 8px 32px rgba(0,0,0,0.4)"
              : "0 0 30px rgba(212,168,67,0.4), 0 8px 32px rgba(0,0,0,0.4)",
            transition: "all 0.6s ease",
            transform: pulse ? "scale(1.02)" : "scale(1)",
          }}
        >
          Tap to Start Your Order
        </button>

        <p style={{
          color: "rgba(255,255,255,0.3)", fontSize: 15, marginTop: 24,
          letterSpacing: 1,
        }}>
          Card payment only — Terminal on counter
        </p>
      </div>

      {/* Bottom footer */}
      <div style={{
        width: "100%", display: "flex", justifyContent: "center",
        padding: "0 48px 40px",
        gap: 48,
      }}>
        {["🍺  Bar", "🍔  Food", "🎱  Snooker"].map(item => (
          <div key={item} style={{
            color: "rgba(255,255,255,0.3)", fontSize: 15, letterSpacing: 1,
          }}>
            {item}
          </div>
        ))}
      </div>

      {/* Bottom gold bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, transparent 0%, #D4A843 30%, #D4A843 70%, transparent 100%)",
      }} />
    </div>
  );
}
