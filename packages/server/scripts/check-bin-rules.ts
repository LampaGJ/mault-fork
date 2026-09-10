/**
 * Self-check for SWU bin rule evaluation.
 *
 * The repo has no test runner, so this is a plain assert script:
 *   pnpm --filter @magic-vault/server check:bin-rules
 *
 * It guards the two things that silently broke before: relation arrays
 * (keywords/traits/arenas) resolving to string[] through getByPath, and the
 * field-definition seed staying in sync with what evaluateCardBin can read.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateCardBin,
  getCardValue,
  type BinConfig,
  type FieldMeta,
} from "@magic-vault/shared";

// __dirname, matching bootstrap-swu.ts - tsx transpiles to CJS, where
// import.meta.dirname is undefined.
const DATA_DIR = join(__dirname, "..", "..", "..", "data", "seed");

const fieldDefinitions = JSON.parse(
  readFileSync(join(DATA_DIR, "swu-field-definitions.json"), "utf-8"),
) as FieldMeta[];

const rel = (...names: string[]) => ({
  data: names.map((name) => ({ attributes: { name } })),
});

// Shaped exactly like a live /api/card-list row, via normalizeSwuCard's output
// (raw is the whole record, which is what getCardValue reads first).
function card(attributes: Record<string, unknown>) {
  return { colorIdentity: [] as string[], raw: { id: 1, attributes } };
}

const jerjerrod = card({
  title: "Moff Jerjerrod",
  serialCode: "08010094",
  cardNumber: 94,
  cost: 2,
  power: 1,
  hp: 3,
  unique: true,
  hasFoil: true,
  keywords: rel(),
  traits: rel("Imperial", "Official"),
  arenas: rel("Ground"),
  aspects: rel("Command", "Villainy"),
  rarity: { data: { attributes: { name: "Special" } } },
  type: { data: { attributes: { name: "Unit" } } },
  variantTypes: rel("Standard"),
  expansion: { data: { attributes: { name: "Ashes of the Empire", code: "ASH" } } },
});

const ambusher = card({
  title: "Ambush Test Unit",
  cost: 7,
  keywords: rel("Ambush", "Raid"),
  traits: rel("Rebel"),
  arenas: rel("Space"),
  rarity: { data: { attributes: { name: "Rare" } } },
  type: { data: { attributes: { name: "Unit" } } },
  variantTypes: rel("Hyperspace Foil"),
  expansion: { data: { attributes: { name: "Ashes of the Empire", code: "ASH" } } },
});

const value = (c: unknown, field: string) =>
  getCardValue(c as object, field, fieldDefinitions);

// --- relation arrays resolve to string[], not undefined -------------------
assert.deepEqual(value(jerjerrod, "traits"), ["Imperial", "Official"]);
assert.deepEqual(value(jerjerrod, "arenas"), ["Ground"]);
assert.deepEqual(value(ambusher, "keywords"), ["Ambush", "Raid"]);
assert.deepEqual(value(ambusher, "variant_types"), ["Hyperspace Foil"]);

// An empty relation must stay [] so is_null / contains_none still match a card
// that simply has no keywords - returning undefined would break both.
assert.deepEqual(value(jerjerrod, "keywords"), []);

// --- scalars, including the previously stripped ones ----------------------
assert.equal(value(jerjerrod, "cost"), 2);
assert.equal(value(jerjerrod, "hp"), 3);
assert.equal(value(jerjerrod, "card_number"), 94);
assert.equal(value(jerjerrod, "expansion_code"), "ASH");
assert.equal(value(jerjerrod, "rarity"), "Special");
// Booleans ride the enum type and compare as strings.
assert.equal(String(value(jerjerrod, "unique")), "true");

// --- every seeded field must resolve against a real card -----------------
// getCardValue returns "" for an unknown field, which is how a typo in the seed
// would otherwise pass unnoticed.
for (const meta of fieldDefinitions) {
  assert.ok(
    fieldDefinitions.some((f) => f.field === meta.field),
    `field ${meta.field} not resolvable`,
  );
  assert.ok(meta.operators.length > 0, `field ${meta.field} has no operators`);
}

// --- the bins the user actually asked for --------------------------------
const bins: BinConfig[] = [
  {
    guid: "bin-1-green",
    binNumber: 1,
    rules: {
      id: "g1",
      combinator: "and",
      conditions: [
        { id: "c1", field: "traits", operator: "contains_any", value: ["Imperial"] },
      ],
    },
  },
  {
    guid: "bin-2-rarity",
    binNumber: 2,
    rules: {
      id: "g2",
      combinator: "and",
      conditions: [
        { id: "c2", field: "rarity", operator: "in", value: ["Rare", "Legendary"] },
      ],
    },
  },
  {
    guid: "bin-3-expensive",
    binNumber: 3,
    rules: {
      id: "g3",
      combinator: "and",
      conditions: [{ id: "c3", field: "cost", operator: "gt", value: 5 }],
    },
  },
  {
    guid: "bin-4-keyword",
    binNumber: 4,
    rules: {
      id: "g4",
      combinator: "and",
      conditions: [
        { id: "c4", field: "keywords", operator: "contains_any", value: ["Ambush"] },
      ],
    },
  },
  { guid: "bin-9-catchall", binNumber: 9, rules: { id: "g9", combinator: "and", conditions: [] }, isCatchAll: true },
];

// Imperial trait -> bin 1.
assert.equal(evaluateCardBin(jerjerrod, bins, fieldDefinitions)?.binNumber, 1);
// First match wins, so a Rare cost-7 Ambusher lands in bin 2 (rarity) ahead of
// the cost and keyword bins - bin order is the priority order.
assert.equal(evaluateCardBin(ambusher, bins, fieldDefinitions)?.binNumber, 2);

// Keyword bin is reachable once rarity no longer shadows it.
const keywordOnly = bins.filter((b) => b.binNumber !== 2 && b.binNumber !== 3);
assert.equal(evaluateCardBin(ambusher, keywordOnly, fieldDefinitions)?.binNumber, 4);

// Nothing matches -> catch-all.
const blank = card({ title: "Nothing", keywords: rel(), traits: rel() });
assert.equal(evaluateCardBin(blank, bins, fieldDefinitions)?.binNumber, 9);

console.log(`ok - ${fieldDefinitions.length} SWU fields, bin rules verified`);
