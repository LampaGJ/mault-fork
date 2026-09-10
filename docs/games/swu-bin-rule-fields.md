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

**`data/seed/swu-field-definitions.json`** — 5 fields → 26. The original five are
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

**Pricing** is now handled — see the Pricing section below.

**Sync speed.** `fetchCards` pages sequentially at `PAGE_SIZE = 100`, so a full
sync is ~92 serial requests — and the API caps `pageSize` at 250, so 37 would do.

**The 33 MB `data/seed/swu-cards.csv.gz`** is in git history and is most of the
repo's clone cost. If the sync path works, the seed is redundant.

**`requireOrg` on `/card` routes** tightens auth for all eight games, not just
SWU. Deliberate (#129), but worth a note in the release.

## Pricing (added)

`lib/swu/prices.ts` fills `price`/`priceFoil` from TCGCSV — free, no key, a daily
mirror of TCGplayer market prices.

**Why foil is not a scanning problem.** Foil is the same art and frame with a
different surface, so the camera cannot resolve it — but it does not need to.
`collection_cards.isFoil` already exists, `card-detail-panel.tsx` already has the
toggle, and the whole UI already reads `isFoil ? priceFoil : price`. Both prices
are stored per card and the user flips one checkbox.

Every *other* variant is a separate numbered printing with its own art, so each
already has its own image vector from the sync and falls out of the scan itself:

| Variant | ASH card numbers | TCGplayer subtype |
| --- | --- | --- |
| Standard | 1–264 | Normal |
| Hyperspace | 4–528 | Normal |
| Hyperspace Foil | 529–766 | Foil |
| Showcase | 767–784 | Foil |
| Standard Prestige | 785–831 | Normal |
| Foil Prestige | 832–878 | Foil |
| Serialized Prestige | 879–925 | Foil |

The number ranges are identical on both sides, which is what makes the join work.

**Join key** is `(expansion code, leading digits of Number)` — base-set numbers
carry a `/total` suffix (`94/264`) and variant printings do not (`529`). Sampled
750 cards across SOR/JTL/ASH: 100% matched.

**Where genuine ambiguity remains:** older sets have Standard Foils sharing a
number with the standard card (204 of 750 sampled products are priced as both
Normal and Foil). Those are exactly the cards the `isFoil` toggle is for. Newer
sets number their foils separately, so the ambiguity is shrinking. Foil is not
reliably a premium — SOR Snowspeeder #244 is $0.05 normal / $0.23 foil, but
plenty of foils sell below their normal counterpart.

An inherently-foil printing (Showcase, Serialized) has no Normal listing, so
`price` falls back to the foil value rather than rendering blank.

`price` and `price_foil` are also bin fields now, so "bin 5 = anything over $5"
is a rule like any other.

### Gotcha

TCGCSV answers **401** to a request with no explicit `User-Agent` — which is what
node's `fetch` sends by default. It uses `CARD_API_HEADERS`. This failed silently
at first because `attachPrices` swallows errors by design.

### Also found

`pagination[pageSize]` caps at **250**, not 100. `fetchCards` uses 100, so a full
sync is 92 requests where 37 would do.
