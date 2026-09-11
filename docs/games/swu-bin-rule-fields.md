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

**Sync speed.** `fetchCards` now pages at 250, the largest the API will serve —
37 requests for the catalogue instead of 92. Still sequential; parallelising the
page fetches is the next lever if it matters.

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

`pagination[pageSize]` caps at **250**, not 100 — anything larger silently
returns 250. `fetchCards` now uses 250.

## Card images — the CDN blocks server-side fetches

`cdn.starwarsunlimited.com` (AmazonS3) answers **403 AccessDenied** to node's
`fetch` under every header combination tried: `MagicVault/1.0`, a browser
User-Agent, a Referer, a full Chrome header set, and both the doubled and tidied
slash. A real Chromium loads the identical URL. So it rejects the client, not the
URL.

This is not only a display problem. `sync-job.ts` fetches `imageUrl` to build the
embedding every scan is matched against, so the entire SWU catalog vectorized to
nothing.

`lib/swu/images.ts` routes both paths through the SWU site's own Next.js image
endpoint, which does serve server-side clients:

```
https://starwarsunlimited.com/_next/image?url=<encoded cdn url>&w=384&q=75
```

Two constraints, both of which return 400 or 403 if broken:

- **The doubled slash in the CDN url is load-bearing.** The endpoint validates
  against the exact registered url and rejects the cleaned-up one.
- **Width and quality are allowlisted.** `w=384&q=75` works; `q=80` does not.
  384 is the smallest allowed width at or above SigLIP's 224px input.

Verified end to end: fetch returns 200 / 54 KB / `image/png`, and
`vectorizeImageFromBuffer` produces a 768-dimensional embedding from it.

`starwarsunlimited.com` is added to `ALLOWED_IMAGE_HOSTS` for the display path.

## Variant separability

Measured cosine similarity between SigLIP embeddings of the six ASH Darth Vader
printings:

| Pair | Similarity |
| --- | --- |
| Prestige ↔ Serialized | 0.9929 |
| Prestige ↔ Prestige Foil | 0.9898 |
| Prestige Foil ↔ Serialized | 0.9848 |
| Hyperspace ↔ Hyperspace Foil | 0.9784 |
| Standard ↔ Hyperspace | 0.9596 |

The three Prestige tiers cluster at 0.985–0.993, much tighter than the gap to any
other printing, so nearest-neighbour will not reliably separate them — and the
price spread is real (Standard Prestige $9.41, Prestige Foil $17.13, Serialized
unlisted).

**No code needed for this.** The scan route already returns the top 5 matches
within distance 0.3, and the tiers sit 0.007–0.015 apart, so all three arrive in
that list and `card-select-dialog.tsx` lets the user pick. Treat the tier as a
confirmation step, not something the camera settles.

Standard vs Hyperspace is the clearest split: Standard has the dark border frame,
Hyperspace is full-bleed art to the card edge.

One caveat: these embeddings come from the publisher's flat renders, where foil
appears as painted-on starburst marks and the serialized card shows a `000 / 250`
stamp. A real foil card under the scanner produces actual glare, and a real
serialized card shows its own number, so live scans will not match these renders
as cleanly as the renders match each other.
