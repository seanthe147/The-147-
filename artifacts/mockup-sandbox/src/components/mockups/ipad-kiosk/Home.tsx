import { useState, useEffect, useRef } from "react";

const BANNER_SLIDES = [
  { bg: "#0047AB", accent: "#D4A843", emoji: "🎱", title: "Table Booking", body: "Reserve your table in the app — no queuing, no waiting." },
  { bg: "#1a1a2e", accent: "#DF3131", emoji: "🎤", title: "Live Music — Fri 13 Jun", body: "Doors open 8pm · Free entry for members · Bar open until 2am." },
  { bg: "#132742", accent: "#D4A843", emoji: "⭐", title: "Join The 147 Club", body: "Earn points on every order. Get free drinks, priority booking & more." },
  { bg: "#0d1e34", accent: "#4caf50", emoji: "🍔", title: "Kitchen Hours: 12–10pm", body: "Full menu available daily. Table service or order here at the kiosk." },
  { bg: "#1c0a28", accent: "#D4A843", emoji: "📺", title: "Sky Sports & TNT", body: "All major fixtures live. Check our fixtures board for today's games." },
  { bg: "#0A1628", accent: "#DF3131", emoji: "🏆", title: "Snooker Leagues", body: "Join our Wednesday night league — sign up at the bar or in the app." },
];

const SLIDE_DURATION = 4000;
const TRANSITION = 600;

export function Home() {
  const [time, setTime] = useState(new Date());
  const [pulse, setPulse] = useState(false);
  const [slide, setSlide] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const p = setInterval(() => setPulse(v => !v), 1800);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setSlide(s => (s + 1) % BANNER_SLIDES.length);
        setFading(false);
      }, TRANSITION);
    }, SLIDE_DURATION);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const current = BANNER_SLIDES[slide];

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
        marginTop: -40,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 90, height: 90,
          background: "linear-gradient(135deg, #0047AB 0%, #1a6bd4 100%)",
          borderRadius: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 28,
          boxShadow: "0 0 60px rgba(0,71,171,0.5), 0 0 120px rgba(0,71,171,0.2)",
        }}>
          <span style={{ color: "#D4A843", fontSize: 38, fontWeight: 800 }}>147</span>
        </div>

        {/* Venue name */}
        <h1 style={{
          color: "#FFFFFF", fontSize: 64, fontWeight: 700,
          letterSpacing: -2, margin: 0, lineHeight: 1,
          textShadow: "0 2px 40px rgba(0,71,171,0.4)",
        }}>
          The 147
        </h1>
        <p style={{
          color: "#D4A843", fontSize: 17, fontWeight: 500,
          letterSpacing: 6, textTransform: "uppercase",
          margin: "10px 0 0",
        }}>
          Snooker · Bar · Restaurant
        </p>

        {/* Divider */}
        <div style={{
          width: 60, height: 2,
          background: "linear-gradient(90deg, transparent, #D4A843, transparent)",
          margin: "32px 0",
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
            padding: "26px 76px",
            fontSize: 24,
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
          color: "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 18,
          letterSpacing: 1,
        }}>
          Card payment only · Terminal on counter
        </p>
      </div>

      {/* ──────────── Advertising Banner ──────────── */}
      <div style={{
        width: "100%",
        height: 108,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        background: current.bg,
        borderTop: `2px solid ${current.accent}`,
        transition: `background ${TRANSITION}ms ease, border-color ${TRANSITION}ms ease`,
        display: "flex",
        alignItems: "center",
        padding: "0 48px",
        gap: 24,
      }}>
        {/* Slide fade container */}
        <div style={{
          display: "flex", alignItems: "center", gap: 24, width: "100%",
          opacity: fading ? 0 : 1,
          transition: `opacity ${TRANSITION}ms ease`,
        }}>
          {/* Emoji icon */}
          <div style={{
            width: 64, height: 64, borderRadius: 16, flexShrink: 0,
            background: "rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30,
          }}>
            {current.emoji}
          </div>

          {/* Text */}
          <div style={{ flex: 1 }}>
            <div style={{
              color: current.accent, fontSize: 11, fontWeight: 700,
              letterSpacing: 3, textTransform: "uppercase", marginBottom: 4,
            }}>
              {current.title}
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 17, fontWeight: 400, lineHeight: 1.4 }}>
              {current.body}
            </div>
          </div>

          {/* Dot indicators */}
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {BANNER_SLIDES.map((_, i) => (
              <div
                key={i}
                onClick={() => {
                  setFading(true);
                  setTimeout(() => { setSlide(i); setFading(false); }, TRANSITION);
                  if (timerRef.current) clearInterval(timerRef.current);
                  timerRef.current = setInterval(() => {
                    setFading(true);
                    setTimeout(() => {
                      setSlide(s => (s + 1) % BANNER_SLIDES.length);
                      setFading(false);
                    }, TRANSITION);
                  }, SLIDE_DURATION);
                }}
                style={{
                  width: i === slide ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === slide ? current.accent : "rgba(255,255,255,0.25)",
                  transition: "all 0.4s ease",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
