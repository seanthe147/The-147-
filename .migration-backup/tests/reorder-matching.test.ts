import {
  buildReorderPayload,
  type ReorderMenuItem,
  type ReorderRawItem,
} from "../server/reorder-matching";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

const menu: ReorderMenuItem[] = [
  // Multi-variation item with modifiers (the case that previously broke).
  {
    id: "ITEM_PIZZA",
    variationId: "VAR_PIZZA_LARGE",
    name: "Pepperoni Pizza",
    variationName: "Large",
    price: 1400,
    modifiers: [
      {
        id: "ML_TOPPINGS",
        options: [
          { id: "OPT_OLIVES", name: "Olives", price: 100 },
          { id: "OPT_MUSHROOMS", name: "Mushrooms", price: 100 },
        ],
      },
    ],
  },
  {
    id: "ITEM_PIZZA",
    variationId: "VAR_PIZZA_SMALL",
    name: "Pepperoni Pizza",
    variationName: "Small",
    price: 900,
    modifiers: [
      {
        id: "ML_TOPPINGS",
        options: [
          { id: "OPT_OLIVES", name: "Olives", price: 100 },
        ],
      },
    ],
  },
  // Single-variation item (no variation name on the menu).
  {
    id: "ITEM_FRIES",
    variationId: "VAR_FRIES_REG",
    name: "Fries",
    price: 350,
  },
  // A renamed item that no longer matches what the customer ordered.
  {
    id: "ITEM_SALAD",
    variationId: "VAR_SALAD_NEW",
    name: "Garden Salad (NEW)",
    price: 700,
  },
];

const raw: ReorderRawItem[] = [
  // Cart formats varied items as "<name> — <variation>" before checkout.
  { name: "Pepperoni Pizza — Large", quantity: 2, price: 1400, modifiers: ["Olives"] },
  { name: "Fries", quantity: 1, price: 350 },
  // This used to live on the menu as "Garden Salad" and was renamed.
  { name: "Garden Salad", quantity: 1, price: 700 },
  // Modifier no longer exists — line should still come back without it.
  { name: "Pepperoni Pizza — Small", quantity: 1, price: 900, modifiers: ["Pineapple"] },
];

console.log("\n=== Reorder matching ===");

const result = buildReorderPayload(menu, raw, () => false);

assert(result.items.length === 3, "three live items resolved (pizza large, fries, pizza small)");
assert(result.skipped.length === 1 && result.skipped[0] === "Garden Salad", "renamed salad is reported as skipped");

const pizza = result.items.find((i) => i.variationId === "VAR_PIZZA_LARGE");
assert(!!pizza, "large pizza variation matched by base name + variation");
assert(pizza?.quantity === 2, "large pizza quantity preserved from receipt");
assert(pizza?.name === "Pepperoni Pizza — Large", "large pizza display name combines base + variation");
assert(
  !!pizza?.modifiers && pizza.modifiers.length === 1 && pizza.modifiers[0].catalogObjectId === "OPT_OLIVES",
  "olives modifier resolved back to its catalog object id",
);

const fries = result.items.find((i) => i.variationId === "VAR_FRIES_REG");
assert(!!fries && fries.quantity === 1, "single-variation item matched by name");
assert(fries?.modifiers === undefined, "fries line has no modifiers attached");

const small = result.items.find((i) => i.variationId === "VAR_PIZZA_SMALL");
assert(!!small, "small pizza variation matched even though its modifier list lacks the requested option");
assert(small?.modifiers === undefined, "unresolved modifier is dropped rather than skipping the whole line");

// Sold-out / hidden gating
const gatedResult = buildReorderPayload(menu, [
  { name: "Fries", quantity: 1, price: 350 },
], (variationId) => variationId === "VAR_FRIES_REG");
assert(
  gatedResult.items.length === 0 && gatedResult.skipped.length === 1,
  "items flagged as unavailable by the override callback are skipped",
);

// ── ID-based matching (newer orders persist variation/modifier IDs) ──────────
// The receipt names below are the OLD names — the menu has since been renamed.
// With saved IDs, reorder should still resolve correctly.
const renamedMenu: ReorderMenuItem[] = [
  {
    id: "ITEM_PIZZA",
    variationId: "VAR_PIZZA_LARGE",
    name: "Margherita Pizza (rebrand)",
    variationName: "Large 12in",
    price: 1500,
    modifiers: [
      {
        id: "ML_TOPPINGS",
        options: [
          { id: "OPT_OLIVES", name: "Black Olives (renamed)", price: 120 },
        ],
      },
    ],
  },
];

const idResult = buildReorderPayload(renamedMenu, [
  {
    name: "Pepperoni Pizza — Large",
    quantity: 1,
    price: 1400,
    variationId: "VAR_PIZZA_LARGE",
    itemId: "ITEM_PIZZA",
    modifiers: ["Olives"],
    modifierIds: ["OPT_OLIVES"],
  },
], () => false);

assert(idResult.items.length === 1 && idResult.skipped.length === 0, "renamed item resolved via saved variation id");
assert(idResult.items[0].variationId === "VAR_PIZZA_LARGE", "matched line points at the same variation id");
assert(
  idResult.items[0].name === "Margherita Pizza (rebrand) — Large 12in",
  "resolved line uses the live menu name, not the stale receipt name",
);
assert(
  !!idResult.items[0].modifiers && idResult.items[0].modifiers[0].catalogObjectId === "OPT_OLIVES",
  "renamed modifier resolved via saved catalog id",
);

// ID lookup wins even if there's a name collision elsewhere.
const collisionMenu: ReorderMenuItem[] = [
  { id: "ITEM_A", variationId: "VAR_A", name: "Coke", price: 200 },
  { id: "ITEM_B", variationId: "VAR_B", name: "Coke", price: 250 },
];
const collisionResult = buildReorderPayload(collisionMenu, [
  { name: "Coke", quantity: 1, price: 250, variationId: "VAR_B", itemId: "ITEM_B" },
], () => false);
assert(
  collisionResult.items.length === 1 && collisionResult.items[0].variationId === "VAR_B",
  "ID lookup picks the exact variation even when names collide",
);

// If the saved variation id is gone from the menu, fall back to name match.
const fallbackResult = buildReorderPayload(menu, [
  { name: "Fries", quantity: 1, price: 350, variationId: "VAR_DELETED", itemId: "ITEM_DELETED" },
], () => false);
assert(
  fallbackResult.items.length === 1 && fallbackResult.items[0].variationId === "VAR_FRIES_REG",
  "stale variation id falls back to name matching",
);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
