type Delivery = {
  sendEmail: (to: string, subject: string, html: string) => Promise<boolean>;
  sendPush: (email: string, title: string, body: string) => Promise<void>;
};

/** Transactional billing notices, independent of marketing preferences. */
export async function notifyMembershipPaymentFailure(email: string, attempt: number, delivery: Delivery) {
  if (attempt === 1) {
    const sent = await delivery.sendEmail(
      email,
      "Your The 147 membership payment failed",
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#142033">
        <h1>The 147 — membership payment failed</h1>
        <p>We could not collect your membership payment. This is the first failed payment attempt.</p>
        <p>Please check your card has sufficient funds and that your payment details are up to date.
        Open The 147 app or the membership page on our website to manage your membership,
        or contact the club if you need help.</p>
        <p>Your membership has not been suspended for this first failure.
        After a second failed payment we will send an app notification.
        After three failed payments, your membership benefits will be suspended until payment succeeds.</p>
        <p>The 147 team</p>
      </div>`,
    );
    if (!sent) throw new Error("Membership payment-failure email could not be sent");
  } else if (attempt === 2) {
    await delivery.sendPush(email, "Membership Payment Failed Again",
      "Your membership payment has failed twice. Please check your payment details or contact the club. One more failed payment will suspend your membership benefits.");
  } else if (attempt === 3) {
    await delivery.sendPush(email, "Membership Suspended",
      "Your membership benefits have been suspended after 3 failed payments. Please resolve your payment with the club to restore access.");
  }
}
