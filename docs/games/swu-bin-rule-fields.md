# SWU bin rule fields — findings and changes

Follow-up to the SWU support work. Context for the next person: the goal is
per-bin sort logic ("bin 1 = Imperial, bin 2 = Rare, bin 3 = cost over 5, bin 4 =
has Ambush"), and most of what was needed already existed.

## What already worked

`bins.rules` is a `jsonb` column and `packages/shared/src/evaluate-bin.ts` is a
full recursive rule engine: nested and/or groups, 18 operators, first-match-wins
bin ordering with a designated catch-all. Per-bin rules did not need to be built.
Field definitions are per-game rows in `games.field_definitions`, so adding
sortable attributes is data, not code.

## The bug: 20 of 48 API fields were being dropped

The live `admin.starwarsunlimited.com/api/card-list` response carries **48
attributes** per card (9,185 cards total). `SwuCardAttributes` declared 28, and
`z.object()` strips unrecognized keys **silently** — no validation error, the
data just vanished before reaching the rule engine. Same trap that had already
bitten `expansion.code` once.

Most significant of the dropped fields: **`keywords`, `traits`, `arenas`**.

These are first-class relations on the API, not prose. Karabast's
`scripts/fetchdata.js` reads them straight off the same endpoint
(`getAttributeNames(card.attributes.keywords)`), which is worth knowing because
the obvious workaround — matching `text contains "Ambush"` — is both fragile and
unnecessary. It false-positives on reminder text that merely mentions a keyword.

Also restored: `upgradeHp`, `upgradePower`, `rules`.

## Changes

**`packages/shared/src/evaluate-bin.ts`** — `getByPath` now maps across arrays,
so a path segment landing on a relation array applies to every element:
`attributes.traits.data.attributes.name` → `string[]`. Strictly additive; before
this an array segment returned `undefined`, and no pre-existing field definition
path crosses an array. An empty relation resolves to `[]` rather than
`undefined`, so `is_null` and `contains_none` still match a card with no
keywords.

This was chosen over adding `keywords`/`traits`/`arena` to the shared
`PlayingCard` interface, which all eight games share, for one game's benefit.

**`packages/server/src/lib/swu/api-types.ts`** — added the dropped relations and
scalars to the schema.

**`data/seed/swu-field-definitions.json`** — 5 fields → 24. The original five are
unchanged in shape; operator sets and labels per type match what was there.

| Field | Type | Notes |
| --- | --- | --- |
| `keywords` | set | 15 values |
| `traits` | set | 57 values |
| `arenas` | set | Ground, Space |
| `variant_types` | set | Standard / Hyperspace / Foil / Showcase / Prestige — sort foils to their own bin |
| `expansion_code` | string | `ASH`, distinct from expansion name |
| `type2_name`, `power`, `hp`, `upgrade_power`, `upgrade_hp`, `card_number` | | |
| `title`, `subtitle`, `artist`, `card_text` | string | |
| `unique`, `has_foil`, `hyperspace`, `showcase` | enum | see casing note |

### Two gotchas worth keeping

**Casing.** Conditions compare exact strings. The API returns Title Case
(`"Ambush"`, `"Bounty Hunter"`, `"Ground"`). Karabast's local card JSON
lowercases everything (and has an `Aggression`/`aggression` split), so it is a
good vocabulary source but its values cannot be pasted in as options directly.

**Booleans.** `FieldType` has no boolean. `unique`/`hasFoil`/`hyperspace`/
`showcase` are typed `enum` with `true`/`false` options, which works because
`evaluateCondition` stringifies both sides. A real boolean type would be
cleaner if more of these appear.

## Check

The repo has no test runner, so this is an assert script using the existing
`tsx` devDependency — no new dependencies:

```
pnpm --filter @magic-vault/server check:bin-rules
```

It covers relation arrays resolving to `string[]`, empty relations staying `[]`,
the previously stripped scalars, every seeded field having operators, and the
four example bins including first-match-wins ordering.

## Still open

**Pricing.** `price`/`priceFoil` are still `null` — the SWU API has no pricing.
TCGplayer no longer grants new API access. TCGCSV (`tcgcsv.com`, free, no key)
mirrors TCGplayer and covers SWU as category **79**, 32 groups, with
`lowPrice`/`midPrice`/`highPrice`/`marketPrice` and `Normal`/`Foil` subtypes.

The join is the awkward part and needs a decision before anyone writes the sync:
TCGCSV gives `Number: "94/264"` plus a group abbreviation, so the key is
**(expansionCode, cardNumber)** — not `serialCode`. And foil is structurally
different: TCGplayer treats it as a `subTypeName` on one product, while this
codebase makes every printing its own card (`08010094` Standard, `08020358`
Hyperspace, `08320596` Hyperspace Foil).

**Sync speed.** `fetchCards` pages sequentially at `PAGE_SIZE = 100`, so a full
sync is ~92 serial requests.

**The 33 MB `data/seed/swu-cards.csv.gz`** is in git history and is most of the
repo's clone cost. If the sync path works, the seed is redundant.

**`requireOrg` on `/card` routes** tightens auth for all eight games, not just
SWU. Deliberate (#129), but worth a note in the release.
