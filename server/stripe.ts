import Stripe = require("stripe");

let cachedClient: Stripe.Stripe | null = null;
let cachedKey: string | null = null;

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}

export function getStripeClient(): Stripe.Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
    cachedKey = key;
  }
  return cachedClient;
}

export function getPublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}
