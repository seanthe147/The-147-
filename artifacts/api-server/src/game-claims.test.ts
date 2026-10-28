import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { inArray } from "drizzle-orm";
import { customers, gamePlays, gamePrizes } from "@workspace/db/schema";
import { db, storage } from "./storage";

if (process.env.MEMBERSHIP_BILLING_ISOLATED_TEST !== "yes") {
  throw new Error("Use the isolated membership test runner.");
}

const tag = `fixture-game-claims-${randomUUID()}`;
const customerIds: number[] = [];
const prizeIds: number[] = [];
const playIds: number[] = [];
let firstCustomer: Awaited<ReturnType<typeof storage.createCustomer>>;
let secondCustomer: Awaited<ReturnType<typeof storage.createCustomer>>;
let rewardTierId: number;
let customerGroupId: number;
let pointsId: number;

async function createPlay(data: {
  customerId: number;
  prizeId: number;
  playedAt: Date;
  prizeClaimCode?: string | null;
  prizeClaimExpiresAt?: Date | null;
  claimedAt?: Date | null;
}) {
  const [play] = await db.insert(gamePlays).values({
    ...data,
    londonDate: data.playedAt.toISOString().slice(0, 10),
  }).returning({ id: gamePlays.id });
  playIds.push(play.id);
  return play.id;
}

before(async () => {
  firstCustomer = await storage.createCustomer(`${tag}-one@example.invalid`, "Game Claims One", null, "!fixture");
  secondCustomer = await storage.createCustomer(`${tag}-two@example.invalid`, "Game Claims Two", null, "!fixture");
  customerIds.push(firstCustomer.id, secondCustomer.id);

  const prizes = await db.insert(gamePrizes).values([
    { name: `${tag} reward tier`, prizeType: "reward_tier", weightPercent: 1 },
    { name: `${tag} customer group`, prizeType: "customer_group", weightPercent: 1 },
    { name: `${tag} points`, prizeType: "loyalty_points", weightPercent: 1 },
  ]).returning({ id: gamePrizes.id });
  prizeIds.push(...prizes.map(prize => prize.id));
  [rewardTierId, customerGroupId, pointsId] = prizes.map(prize => prize.id);

  const now = Date.now();
  await createPlay({
    customerId: firstCustomer.id, prizeId: rewardTierId,
    playedAt: new Date(now - 60_000), prizeClaimCode: "REWARD1",
    prizeClaimExpiresAt: new Date(now + 60 * 60_000),
  });
  await createPlay({
    customerId: firstCustomer.id, prizeId: customerGroupId,
    playedAt: new Date(now - 120_000), prizeClaimCode: "GROUP01",
    prizeClaimExpiresAt: new Date(now + 60 * 60_000),
  });
  await createPlay({
    customerId: firstCustomer.id, prizeId: customerGroupId,
    playedAt: new Date(now - 180_000),
  });
  await createPlay({
    customerId: firstCustomer.id, prizeId: rewardTierId,
    playedAt: new Date(now - 240_000), prizeClaimCode: "EXPIRED",
    prizeClaimExpiresAt: new Date(now - 1_000),
  });
  await createPlay({
    customerId: firstCustomer.id, prizeId: pointsId,
    playedAt: new Date(now - 300_000),
  });
  await createPlay({
    customerId: firstCustomer.id, prizeId: rewardTierId,
    playedAt: new Date(now - 360_000), prizeClaimCode: "CLAIMED",
    claimedAt: new Date(now - 1_000),
  });
  await createPlay({
    customerId: secondCustomer.id, prizeId: rewardTierId,
    playedAt: new Date(now - 420_000),
  });
});

after(async () => {
  if (playIds.length) await db.delete(gamePlays).where(inArray(gamePlays.id, playIds));
  if (prizeIds.length) await db.delete(gamePrizes).where(inArray(gamePrizes.id, prizeIds));
  if (customerIds.length) await db.delete(customers).where(inArray(customers.id, customerIds));
});

test("pending prize claims use one joined query, filter by customer, and page safely", async () => {
  const originalSelect = db.select.bind(db);
  let selectCalls = 0;
  Object.defineProperty(db, "select", {
    configurable: true,
    value: (...args: Parameters<typeof db.select>) => {
      selectCalls++;
      return originalSelect(...args);
    },
  });

  try {
    const customerClaims = await storage.getPendingRewardClaims({ customerId: firstCustomer.id, limit: 2 });
    assert.equal(selectCalls, 1, "customer claims should be fetched with one joined query, not per-row selects");
    assert.equal(customerClaims.length, 2);
    assert.deepEqual(customerClaims.map(claim => claim.prizeName), [
      `${tag} reward tier`,
      `${tag} customer group`,
    ]);
    assert.deepEqual(customerClaims.map(claim => claim.customerName), ["Game Claims One", "Game Claims One"]);

    selectCalls = 0;
    const firstPage = await storage.getPendingRewardClaims({ limit: 1 });
    assert.equal(selectCalls, 1);
    assert.equal(firstPage[0].customerId, firstCustomer.id);

    selectCalls = 0;
    const nextPage = await storage.getPendingRewardClaims({
      limit: 1,
      before: { playedAt: firstPage[0].playedAt, id: firstPage[0].id },
    });
    assert.equal(selectCalls, 1);
    assert.equal(nextPage[0].customerId, firstCustomer.id);
    assert.ok(nextPage[0].playedAt < firstPage[0].playedAt);

    const allClaims = await storage.getPendingRewardClaims();
    assert.equal(allClaims.length, 3, "expired, claimed, points-only, and uncoded group wins are excluded");
    assert.ok(allClaims.some(claim => claim.customerId === secondCustomer.id));
  } finally {
    delete (db as any).select;
  }
});
