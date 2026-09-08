# Star Wars Unlimited Setup & Testing Summary

**Date:** 2026-09-08
**Branch:** `feature/swu-support`
**Status:** COMPLETE ✓ (software-verified tier on physical scanning; see #127)

## Setup Checklist

- [x] **Environment fixed** (#116-120): sharp native postinstall failure diagnosed and fixed (`pnpm.neverBuiltDependencies`), local Docker stack (postgres+pgvector, server, web) running via docker-compose, admin UI access confirmed (first-account-is-admin flow on fresh local DB).
- [x] **SWU game record created** (#121): key='swu', 5 field definitions (type_name, rarity, aspects, cost, expansion), raw JSON paths cross-checked against actual API schema rather than guessed.
- [x] **Full sync completed** (#122): **9,185 / 9,185 cards** — the complete catalog, every printing/variant tracked separately (Standard, Hyperspace, Hyperspace Foil, Showcase, Prestige, promos, etc.), zero errors.
- [x] **Synced data verified** (#123): admin UI card count matches DB exactly, spot-checks show correct names/set codes, image-proxy tested end-to-end.

## QA Test Results

- [x] **#111/#124 — Search Query:** PASS. Exact match, partial match, and non-match all behave correctly. See `reports/manual-tests/swu-search-query.md`.
- [x] **#112/#125 — SearchById:** PASS (with one documented acceptance-criteria correction — mault's actual HTTP status-code convention differs from what was originally assumed; flagged on the issue, not a defect). See `reports/manual-tests/swu-search-by-id.md`.
- [x] **#113/#126 — Full Sync Verification:** PASS. 9,185/9,185, zero errors, spot-checks and post-sync search regression all correct. See `reports/manual-tests/swu-full-sync.md`.
- [x] **#114/#127 — End-to-End Scanning:** PASS, **software-verified tier**. Two real card images identified with **distance=0** exact matches; variant printings of the same card correctly cluster nearby; negative case (unrelated MTG card) correctly rejected, no false positive. **Physical card handling, camera capture, and servo/bin routing were NOT verified** — no hardware available in this environment. See `reports/manual-tests/swu-e2e-scan.md`.

Per `CLAUDE.md:22`, all of the above are manual/scripted tests — there is no automated test suite in this repo.

## Scope change during this epic

Mid-epic, the user asked whether printings (Standard/Foil/Hyperspace/Showcase/Prestige/promo) could be tracked. Investigation confirmed each printing is a distinct API record with its own art. Since mault physically scans cards and matches by visual embedding, and different printings look meaningfully different, the sync was changed (commit `cce2bff`) from "one canonical printing per card" to "every printing tracked separately" — validated end-to-end in #127's scan test, where variant printings of the same card correctly cluster together in embedding space while remaining distinguishable.

## Real bugs found and fixed (this epic)

1. **No pagination** in the initial sync implementation (returned only the API's default 25-card page).
2. **ID collision**: 98% of cards have `cardId: null`; the fallback to `cardNumber` collided across sets. Fixed to use `serialCode` (globally unique per printing).
3. **Filter-bypass bug**: unwrapped query params (`?title=X`, `?cardId=X`) were silently ignored by the upstream Strapi API, returning its default unfiltered page — meant search and searchById never actually filtered anything before the fix.
4. **Missing `expansion.code` schema field** — Zod was silently stripping it, leading to an earlier incorrect conclusion that no short set code existed in the API.
5. **Image-proxy CDN allowlist gap**: `cdn.starwarsunlimited.com` was missing, meaning every SWU card image would render broken in the actual app despite successful sync.
6. **#129 — missing `requireOrg` middleware on `/cards` routes** (application-wide, not SWU-specific): broke the core scan-and-identify endpoint for every game and organization. Confirmed to reproduce through the real web frontend, not just direct API testing. Fixed with explicit user approval since it directly blocked completing #127.

## Environment/performance findings (not code bugs, but relevant)

- `VECTORIZE_CONCURRENCY` was misconfigured to 1 in the generated `.env` (code's actual default is 10) — fixed.
- Local Docker VM (colima) was capped at 4 of 16 available host CPU cores — bumped to 12 CPUs / 24GB RAM per user direction, which dramatically sped up the remaining vectorization work.
- Vectorization runs on CPU only (ONNX Runtime via `onnxruntime-node`, no GPU/Metal acceleration path exists for this library in a Node/Docker context) — core count is the real performance lever for this workload.

## Open gaps carried forward

- **Sharp build root cause** (#118): a user-space fix (`pnpm.neverBuiltDependencies`) was found and applied; the underlying `check.js` false-negative bug in sharp itself was not root-caused further (not necessary once the workaround was in place).
- **#127's hardware-verified tier**: physical scanning, camera capture, and servo/bin routing remain unverified pending real SWU cards and scanning hardware.
- **#112's HTTP status-code convention**: `/search`/`search/:id` return 200 with `success:false` rather than 404/400 — a pre-existing, cross-game convention, flagged on #112 for whoever owns cross-game API design to decide if it's worth standardizing.
- **#129's broader impact**: confirmed to affect SWU; not independently re-verified against every other game (MTG, Gundam, Pokémon, etc.) in this session, though the fix is generic (middleware chain, not game-specific) and should apply equally.
- **Expansion short-code mapping**: SWU's raw API only exposes `expansion.name` (full name) and `expansion.code` (short code like "SOR") directly on the card record — both are now captured, but no admin-facing "graduate from provisional" pass was done on the field-definitions doc beyond what's in this summary.

## Files added/changed (all on `feature/swu-support`, all local, nothing pushed)

- `packages/server/src/lib/swu/{api-types.ts,search.ts,sync.ts}` — adapter implementation, evolved through 4 rounds of bug fixes
- `packages/server/src/routes/card.ts` — image-proxy allowlist + requireOrg fixes
- `packages/server/package.json` — sharp build workaround
- `docs/games/swu-field-definitions.md`, `docs/superpowers/{plans,specs}/` — planning artifacts
- `reports/manual-tests/swu-*.md` — this epic's 4 QA test logs
- `.gitignore` — hygiene additions (`.claude/`, `package-lock.json`, `docker-compose.override.yml`, `.env.bak`)

Every commit on this branch has been reviewed and applied by `agent-git-guardian` with explicit-path staging — no `git add -A` used anywhere in this epic's history.
