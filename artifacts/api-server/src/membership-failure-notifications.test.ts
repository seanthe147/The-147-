import test from "node:test";
import assert from "node:assert/strict";
import { notifyMembershipPaymentFailure } from "./membership-failure-notifications.ts";

function delivery(emailSucceeds = true) {
  const emails: { subject: string; html: string }[] = [];
  const pushes: { title: string; body: string }[] = [];
  return {
    emails, pushes,
    sendEmail: async (_to: string, subject: string, html: string) => {
      emails.push({ subject, html }); return emailSucceeds;
    },
    sendPush: async (_email: string, title: string, body: string) => { pushes.push({ title, body }); },
  };
}
test("first failure sends transactional email, never a push", async () => {
  const d = delivery();
  await notifyMembershipPaymentFailure("test@example.invalid", 1, d);
  assert.equal(d.emails.length, 1);
  assert.match(d.emails[0].html, /first failed payment/);
  assert.match(d.emails[0].html, /three failed payments/);
  assert.equal(d.pushes.length, 0);
});
test("second failure sends a push warning, not another email", async () => {
  const d = delivery();
  await notifyMembershipPaymentFailure("test@example.invalid", 2, d);
  assert.equal(d.emails.length, 0);
  assert.equal(d.pushes.length, 1);
  assert.match(d.pushes[0].body, /One more failed payment/);
});
test("third failure sends suspension push, with no extra email", async () => {
  const d = delivery();
  await notifyMembershipPaymentFailure("test@example.invalid", 3, d);
  assert.equal(d.emails.length, 0);
  assert.match(d.pushes[0].title, /Suspended/);
});
test("later failures do not repeatedly notify an already suspended member", async () => {
  const d = delivery();
  await notifyMembershipPaymentFailure("test@example.invalid", 4, d);
  assert.equal(d.emails.length + d.pushes.length, 0);
});
test("email delivery failures are explicit rather than reported as sent", async () => {
  await assert.rejects(notifyMembershipPaymentFailure("test@example.invalid", 1, delivery(false)),
    /email could not be sent/);
});
