/**
 * Shared email helpers for marketing campaigns and automations.
 * Used by both routes.ts (campaign sends) and index.ts (scheduled automations).
 */
import nodemailer from "nodemailer";

/** Branded HTML email template with The 147's dark/gold styling */
export function buildMarketingEmailHtml(subject: string, bodyText: string): string {
  const bodyHtml = bodyText
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.75;color:rgba(255,255,255,0.87);">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(160deg,#0d1e35 0%,#0a1628 100%);border:1px solid rgba(212,168,67,0.25);border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0d1e35,#162640);padding:28px 32px;border-bottom:2px solid #d4a843;text-align:center;">
        <div style="font-size:42px;font-weight:900;color:#d4a843;letter-spacing:6px;line-height:1;">147</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:4px;margin-top:6px;text-transform:uppercase;">The 147 Bradford</div>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 20px 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">${subject}</h2>
        <div style="font-size:15px;">${bodyHtml}</div>
      </div>
      <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.2);">
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.28);text-align:center;line-height:1.6;">
          The 147 Bradford · Snooker &amp; Bar<br>
          You are receiving this email as a valued customer of The 147.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Send a single email via SMTP → Resend fallback. Returns true on success. */
export async function sendMarketingEmail(to: string, subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== "false",
        auth: { user, pass },
      });
      await transporter.sendMail({
        from: `"The 147 Bradford" <${user}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch { /* fall through to Resend */ }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@the147.co.uk";
    const fromName  = process.env.RESEND_FROM_NAME  || "The 147 Bradford";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
