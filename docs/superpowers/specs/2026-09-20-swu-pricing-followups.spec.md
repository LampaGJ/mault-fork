---
type: spec
status: active
title: SWU pricing follow-ups and branch hygiene
goal: Close the gaps the TCGCSV pricing run surfaced so feature/swu-support is current with upstream, carries the SWU relation fields Jon's PR recovered, documents its field paths truthfully, and formats currency in one place.
items:
  - id: upstream-sync-v1-0-71
    title: Merge upstream v1.0.71 into feature/swu-support
    tier: architecture
    needs: []
  - id: swu-relation-fields
    title: Recover keywords, traits and arenas as SWU bin fields
    tier: feature
    needs: [upstream-sync-v1-0-71]
  - id: field-definitions-doc-paths
    title: Generate the SWU field-definitions doc from the seed
    tier: polish
    needs: [swu-relation-fields]
  - id: currency-format-sites
    title: Route the remaining hardcoded dollar formatting through the shared formatter
    tier: polish
    needs: []
constraints:
  - Target branch is feature/swu-support on LampaGJ/mault; the upstream merge is one merge commit, never a rebase of a pushed branch.
  - Every new or changed Zod schema is reviewed by agent-zod-zealot before merge; z.object strips unknown keys silently, so relation fields must be named in the schema or they never reach getByPath.
  - Hand-edited data is illegal: the field-definitions doc is derived from data/seed/swu-field-definitions.json by a committed script, not retyped.
  - No markdown tables in issue bodies; the generated doc may keep its existing table format because it is a committed file with its own standard.
  - packages/web/vite.config.ts carries an uncommitted allowedHosts edit that must be committed on its own before the upstream merge, so the merge diff stays clean.
tracker: github
---

# SWU pricing follow-ups and branch hygiene

Origin: the closing report of the /issues run for
`2026-09-20-swu-tcgcsv-pricing.spec.md` (epics LampaGJ/mault#6 and #7) and the
git guardian's routing consultation in that run. Four gaps were named and
not filed. This spec files them. Two other items from that report are not
here on purpose: the agent-zod-zealot pass is a step inside #8, and the
fixture size is an accepted cost stated in #10.

## upstream-sync-v1-0-71 — Merge upstream v1.0.71 into feature/swu-support

**Goal**: The branch last merged upstream at v1.0.65 and upstream is now at
v1.0.71 (`2f8dad6`), six releases ahead with firmware 2.0.13, a PWA package,
an admin page split, and locale changes. Landing the merge as its own
deliberate commit before the pricing work keeps #8 through #12 from
conflicting twice.

**Acceptance**:
- `git merge-base feature/swu-support upstream/master` prints `2f8dad6` after the merge.
- The pre-existing `allowedHosts: [".ts.net"]` hunk in `packages/web/vite.config.ts` is committed on its own first and survives the merge.
- `firmware/main/main.ino` carries both upstream's `wiggleModulePaddle` flap-and-paddle jiggle (2.0.13) and this branch's unconditional `settleDuration` overrun from `47358a4`; `FIRMWARE_VERSION` reads `2.0.13`; `firmware/build-uno-r3.sh` compiles clean on the Studio.
- `pnpm --filter @magic-vault/web build` and `pnpm --filter @magic-vault/web lint` exit 0.
- `pnpm --filter @magic-vault/server db:migrate` applies any new migrations on the MacBook database, and `~/bin/mault restart` followed by `mault status` shows postgres, server and web up.
- SWU search still returns priced-or-null cards: `searchById` for `0101244` returns the card, and the bootstrap script `pnpm --filter @magic-vault/server bootstrap:swu` is idempotent against the running instance.
- The Studio checkout and containers are not touched.

**Touches**: `packages/web/vite.config.ts`, `firmware/main/main.ino`, `packages/web/src/locales/*`, `pnpm-lock.yaml`, `CLAUDE.md`, `README.md`, whatever else the merge lists

**Open gaps**: upstream's PWA package may change the Vite config shape around the dev server block that holds the allowedHosts edit; the merge resolves that by hand and the acceptance line above proves the edit survived.

## swu-relation-fields — Recover keywords, traits and arenas as SWU bin fields

**Goal**: Jon Loss's PR #1 showed the SWU admin API carries 48 attributes
per card and the `SwuCard` Zod schema names 28, so keywords, traits and
arenas are stripped before any bin rule can see them. Sorting by keyword
today needs a text-contains rule that false-positives on reminder text. This
item ports that recovery onto the current adapter layout and then closes PR
#1 with a pointer, since it cannot merge.

**Acceptance**:
- `packages/server/src/lib/adapters/swu/api-types.ts` declares `keywords`, `traits` and `arenas` as Strapi relations (`data: [{ attributes: { name } }]`) and a live `searchById` for a card with a keyword (Darth Vader `0101010` has Overwhelm) shows them in `raw`.
- `packages/shared/src/evaluate-bin.ts`'s `getByPath` maps a path segment across an array, so `attributes.keywords.data.attributes.name` yields `string[]`, an empty relation yields `[]`, and no existing field-definition path changes behaviour (checked by grepping every seed for a path that crosses an array today: none).
- `data/seed/swu-field-definitions.json` gains `set`-type fields `keywords`, `traits`, `arenas` with `contains_any` / `contains_all` / `contains_none` operators and option lists built from the live API's distinct values by a committed script, not typed by hand.
- The seed script pushes the new fields via `PUT /games/:guid` and the bins UI offers them.
- The changed Zod schema passes an agent-zod-zealot review.
- PR #1 is closed with a comment naming the issues that ported its two findings (this one and the pricing epic #6) and stating why it could not merge.

**Touches**: `packages/server/src/lib/adapters/swu/api-types.ts`, `packages/shared/src/evaluate-bin.ts`, `data/seed/swu-field-definitions.json`, a new `packages/server/scripts/derive-swu-relation-options.ts`, `packages/server/scripts/seed-swu-bin-sets.ts`

**Open gaps**:
- Whether traits (over a hundred values) belong as an enum-style option list or as a free string with `contains` semantics; the drafter decides from the live count.
- Closing PR #1 is a courtesy to its author; the comment should be reviewed by the user before posting.

## field-definitions-doc-paths — Generate the SWU field-definitions doc from the seed

**Goal**: `docs/games/swu-field-definitions.md` records paths as
`properties.cost` while the seed says `attributes.cost`, and issue #11 adds
rows in the doc's stale convention. A doc retyped from data drifts; a doc
generated from the seed cannot.

**Acceptance**:
- A committed script (`pnpm --filter @magic-vault/server docs:swu-fields`) reads `data/seed/swu-field-definitions.json` and writes `docs/games/swu-field-definitions.md` deterministically; running it twice produces a byte-identical file.
- The generated doc's path column matches the seed's `path` values exactly, including the `price`, `price_foil`, `keywords`, `traits` and `arenas` entries.
- The doc carries a header line saying it is generated and naming the script, so nobody edits it by hand.
- Issue #11's third task (the hand-added doc rows) is superseded and noted as such on #11.

**Touches**: `docs/games/swu-field-definitions.md`, new `packages/server/scripts/generate-swu-field-docs.ts`, `packages/server/package.json`

**Open gaps**: none

## currency-format-sites — Route the remaining hardcoded dollar formatting through the shared formatter

**Goal**: Issue #12 moves the landing page's `Intl.NumberFormat` helper to
`packages/web/src/lib/format-currency.ts`. Two other sites still build a
dollar string by hand: `scan-stats.tsx:13` and the export module. One
formatter means one locale rule.

**Acceptance**:
- `grep -rn '\$\${' packages/web/src --include='*.ts' --include='*.tsx'` returns no hits outside `lib/format-currency.ts`.
- `packages/web/src/features/scanner/components/scan-stats.tsx` and the export module call the shared formatter with the current i18n language.
- `pnpm --filter @magic-vault/web build` and `lint` exit 0.
- Depends on LampaGJ/mault#12 landing first (external to this spec, recorded here because `needs` only names items in this file).

**Touches**: `packages/web/src/features/scanner/components/scan-stats.tsx`, `packages/web/src/features/cards/lib/export/` (base.ts, csv.ts and the vendor exporters that write a price column), `packages/web/src/lib/format-currency.ts`

**Open gaps**: the export module writes CSV, where a locale-formatted string with a currency symbol may be the wrong choice; the drafter checks what the current export emits and may keep a plain number there, documenting why.

## Non-goals

- The pricing pipeline and value presets themselves: those are epics #6 and #7.
- Merging PR #1 as a branch; it is ported by hand and closed.
- Keeping the Mac Studio checkout or containers in sync; the user retired that on 2026-09-18.
- Any Discord, camera, or sorter hardware work.
