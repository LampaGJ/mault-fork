---
type: spec
status: draft
title: SWU card value from the TCGCSV daily price dump
goal: Every Star Wars Unlimited card mault identifies carries a TCGplayer market price (normal and foil) so bin rules and the scan UI can sort and show value.
items:
  - id: tcgcsv-client
    title: TCGCSV price index client for the SWU adapter
    tier: architecture
    needs: []
  - id: swu-attach-prices
    title: Fill price and priceFoil on every SWU search and searchById result
    tier: feature
    needs: [tcgcsv-client]
  - id: swu-price-fields
    title: Price bin fields and a Value preset for the Home org
    tier: feature
    needs: [swu-attach-prices]
  - id: price-replay-check
    title: Committed replay check against a pinned TCGCSV snapshot
    tier: polish
    needs: [swu-attach-prices]
  - id: rule-summary-price-label
    title: Rule summary renders any numeric price field, not only price_usd
    tier: polish
    needs: [swu-price-fields]
constraints:
  - Source is TCGCSV (https://tcgcsv.com/tcgplayer/79/...), the free no-key daily mirror of TCGplayer prices. The official TCGplayer API is out of scope because its Getting Started page states "We are no longer granting new API access at this time" (checked 2026-09-20).
  - Every TCGCSV response is parsed with a Zod v4 schema at the fetch boundary (groups, products, prices); nothing downstream reads unparsed JSON. Run agent-zod-zealot on each new schema before merge.
  - Every new data-artifact producer carries the @displayName / @strategicPurpose / @tacticalObjective TSDoc trio (user CLAUDE.md, data doctrine rule 2).
  - A pricing failure never fails a search or a scan: prices stay null and the failure is logged through the pino module logger, not console.
  - The price join and index build are deterministic over their inputs: no Date.now, Math.random, or locale-sensitive sorting inside the transform; the TTL clock lives only in the cache wrapper (reproducible-data-manipulation doctrine).
  - Follow the existing adapter pattern: prices are embedded while normalizing the source card inside the adapter, so withCache and withErrorHandling wrap them for free; no new route-level hook.
  - Target branch is feature/swu-support on LampaGJ/mault; Jon Loss's PR #1 (branch feature/swu-bin-rule-fields) is the reference implementation to port, not merge, because it predates the v1.0.65 upstream merge and conflicts on 11 paths.
tracker: github
---

# SWU card value from the TCGCSV daily price dump

How mault prices cards today, for context: there is no pricing service. Each
adapter copies whatever price its source API embeds while normalizing to
`PlayingCard.price` / `priceFoil` (Scryfall `prices.usd`, Pokémon TCG API's
`tcgplayer.normal.marketPrice`, Lorcana `prices.usd`, One Piece
`market_price`, Yu-Gi-Oh `card_prices`). Gundam, FAB, Riftbound and SWU return
null because their sources carry no price; FAB and Riftbound only link to a
TCGplayer product page. Prices are never persisted; they live on the
`PlayingCard` returned by `search` / `searchById` and are read by the scan UI
(`scanned-card-list-item.tsx:35`, `isFoil ? priceFoil : price`) and by bin
rules through the game's `FieldMeta` path. SWU is the first game whose source
has no price, so it is the first to need a second upstream.

The reference implementation is `packages/server/src/lib/swu/prices.ts` on
Jon Loss's branch `feature/swu-bin-rule-fields` (LampaGJ/mault#1): TCGCSV
category 79, per-set index keyed on `(expansion code, leading digits of card
number)`, 24 h per-set cache, `normal ?? foil` fallback for foil-only
printings, `User-Agent` required because TCGCSV answers 401 without one.
Verified live in that PR: SOR Snowspeeder #244 = 0.05 / 0.23, #502 = 0.18 /
0.35, ASH Moff Jerjerrod #94 = 2.94 / null.

## tcgcsv-client — TCGCSV price index client for the SWU adapter

**Goal**: Provide one module that turns a set code into a `Map<cardNumber,
{normal, foil}>` from TCGCSV, parsed at the boundary, cached per set for the
mirror's daily cadence, and safe to call from a hot search path. This is the
only place that knows TCGCSV's URL shape and JSON.

**Acceptance**:
- `packages/server/src/lib/adapters/swu/prices.ts` exports `getPriceIndex(setCode)` and `attachPrices(cards)`; `attachPrices` resolves without throwing when TCGCSV returns 401, 500, malformed JSON, or times out, and leaves `price` / `priceFoil` untouched in that case.
- Zod v4 schemas for the groups, products and prices responses live in `packages/server/src/lib/adapters/swu/tcgcsv-types.ts`; a response missing `results` or with a non-numeric `marketPrice` fails parse and is logged once at `warn` with the URL, never silently coerced.
- Requests send `CARD_API_HEADERS` from `packages/server/src/lib/constants/card-search.ts`; a request without a User-Agent is proven to 401 by the replay check, so the header is not optional.
- Group matching covers promo groups: the live group list has `ASH` and `ASHWPP`, `LAW` and `LAW-WPP`, `SOR` and `SOR-WPP`. The index for a set merges every group whose abbreviation equals the set code or equals it plus a `WPP` / `-WPP` suffix, and the acceptance run shows a weekly-play promo card priced.
- Cache: per-set entry with a 24 h TTL, empty results cached too, TTL clock only in the cache wrapper; a process restart re-warms on first search.
- Module logger is `moduleLogger("swu-prices")`; every fetch failure and every parse failure produces exactly one log line.
- Each exported producer carries `@displayName`, `@strategicPurpose`, `@tacticalObjective`.

**Touches**: `packages/server/src/lib/adapters/swu/prices.ts` (new), `packages/server/src/lib/adapters/swu/tcgcsv-types.ts` (new), `packages/server/src/lib/logger.ts` (child logger only), `packages/server/src/lib/constants/urls.ts` (TCGCSV base URL)

**Open gaps**:
- What `expansion.code` the SWU admin API reports for a weekly-play promo (base set code, or its own code) decides whether promo groups merge into the base set's index or get their own; check three promo serial codes against the live API before implementing the merge rule.
- Two live groups have an empty abbreviation (GenCon 2023 Promos, Gamegenic Promos); decide whether to skip them or index them under a synthetic code.

## swu-attach-prices — Fill price and priceFoil on every SWU search and searchById result

**Goal**: Make SWU behave like Scryfall and Pokémon from the caller's point of
view: a card that comes back from `search` or `searchById` already carries its
market prices, so the scan UI's foil toggle and bin rules work with no further
plumbing.

**Acceptance**:
- `normalizeSwuCard` output is passed through `attachPrices` inside `Search` and `SearchById` in `packages/server/src/lib/adapters/swu/search.ts` before the `Result` is returned; `withCache` therefore caches priced cards for its 15 min TTL.
- Join key is `(card.set, leading digits of card.collectorNumber)`; `"94/264"` and `"94"` both resolve to `"94"`.
- Foil-only printings (Showcase, Serialized, Hyperspace Foil) get `price = foil` and `priceFoil = foil`; dual-listed printings get both values distinct.
- Live check, run and pasted into the PR: `searchById` for SOR #244, SOR #502, ASH #94 and one JTL Hyperspace Foil returns non-null prices consistent with tcgcsv.com's current values on that day.
- A search for a card in a set TCGCSV does not carry returns the card with null prices and a single `warn` line, not an error result.
- Scan path: identifying a real SWU card through `POST /cards/search-by-image` shows a price in the scanner's scanned-card list on the MacBook instance.

**Touches**: `packages/server/src/lib/adapters/swu/search.ts`, `packages/server/src/lib/adapters/swu/prices.ts`

**Open gaps**: none

## swu-price-fields — Price bin fields and a Value preset for the Home org

**Goal**: Let the sorter act on value. Add `price` and `price_foil` as numeric
bin fields on the SWU game and ship a "Value" preset alongside Aspect, Set,
Alpha, Cost, Variant, Type and Rarity, so "bin 5 is anything over five
dollars" is a rule, not code.

**Acceptance**:
- `data/seed/swu-field-definitions.json` gains two `FieldMeta` entries: `field: price, path: price, type: numeric` and `field: price_foil, path: priceFoil, type: numeric`, each with the numeric operator set plus `is_null` / `is_not_null` (as in Jon's seed).
- `packages/server/scripts/seed-swu-bin-sets.ts` adds a `Value` preset for the seven-bin sorter: six threshold bins in ascending price order and bin 7 catch-all for unknown price; `SWU_PRESET_REPLACE=1` recreates it idempotently.
- `evaluateCardBin` with the new fields routes a fixture card priced 7.50 to the "over 5" bin and a card with null price to the catch-all; shown by the replay check.
- The bins UI lists the two fields under the SWU game after `PUT /games/:guid` runs from the seed script.

**Touches**: `data/seed/swu-field-definitions.json`, `packages/server/scripts/seed-swu-bin-sets.ts`, `docs/games/swu-field-definitions.md`

**Open gaps**: the six threshold values for the Value preset are not decided; propose 0.25 / 1 / 2.50 / 5 / 10 and let the user edit in the bins UI.

## price-replay-check — Committed replay check against a pinned TCGCSV snapshot

**Goal**: Prove the join and the fallback logic deterministically without
the network, per the reproducible-data-manipulation doctrine: the TCGCSV
response is captured once as a pinned fixture, and the check replays it to a
known output hash.

**Acceptance**:
- `data/fixtures/tcgcsv/` holds one captured groups, products and prices response for SOR with a `README` line giving the capture date and `sha256sum` of each file; the files are committed unmodified.
- `packages/server/scripts/check-swu-prices.ts` (script `check:swu-prices`) primes the index from the fixtures, runs `attachPrices` over a fixture card list, and asserts the expected `{price, priceFoil}` per card plus the `is_null` bin routing from `swu-price-fields`; it exits non-zero on any mismatch.
- A separate `--live` flag performs the three-card live comparison from `swu-attach-prices` and prints a diff; it is not run in the default check.
- The check runs clean on `feature/swu-support` and is listed in `CONTRIBUTING.md` next to the other manual checks.

**Touches**: `packages/server/scripts/check-swu-prices.ts` (new), `data/fixtures/tcgcsv/` (new), `packages/server/package.json`, `CONTRIBUTING.md`

**Open gaps**: none

## rule-summary-price-label — Rule summary renders any numeric price field, not only price_usd

**Goal**: The bins rule summary special-cases Scryfall's `price_usd` field
name to format a dollar value. With SWU adding `price` and `price_foil`, the
formatting should key on the field's `type` and a currency hint, not on one
game's field name.

**Acceptance**:
- `packages/web/src/features/bins/components/rule-summary.tsx` formats `price_usd`, `price` and `price_foil` conditions as `$x.xx`; other numeric fields are unchanged.
- The web build (`pnpm --filter @magic-vault/web build`) and lint pass.

**Touches**: `packages/web/src/features/bins/components/rule-summary.tsx`, `packages/web/src/locales/en/bins.json` (label if needed)

**Open gaps**: whether to add a `currency` hint to `FieldMeta` in `packages/shared/src/interfaces/sort-bins.interface.ts` or keep a field-name allowlist; allowlist is the smaller change and acceptable for this spec.

## Non-goals

- The official TCGplayer API (`api.tcgplayer.com`): closed to new applicants, so no key can be obtained; no code targets it.
- SKU-level or condition-level prices: TCGCSV publishes product-level market prices only.
- Persisting prices or price history in Postgres; prices stay request-time values on `PlayingCard`.
- Pricing for games other than SWU, and any change to how existing adapters source prices.
- The rest of Jon Loss's PR #1: the Next.js image workaround, keyword/trait/arena field recovery, themes and bins UI changes are separate work.
- A user-facing "prices as of" indicator beyond a log line.
