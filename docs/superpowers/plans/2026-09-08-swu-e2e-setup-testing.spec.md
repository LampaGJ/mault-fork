---
type: spec
status: active
title: SWU local setup, environment fix, and end-to-end testing
goal: Get a working local mault dev environment with Star Wars Unlimited configured, synced, and verified end-to-end via the app UI.
items:
  - id: fix-sharp-native-build
    title: Diagnose and fix sharp native postinstall failure blocking pnpm install
    tier: architecture
    needs: []
  - id: verify-dev-server-startup
    title: Start mault dev server and verify health
    tier: architecture
    needs: [fix-sharp-native-build]
  - id: admin-ui-access
    title: Open browser and authenticate to admin UI
    tier: architecture
    needs: [verify-dev-server-startup]
  - id: create-swu-game-record
    title: Create SWU game record with field definitions via admin UI
    tier: feature
    needs: [admin-ui-access]
  - id: trigger-full-sync
    title: Trigger and monitor full SWU catalog sync
    tier: feature
    needs: [create-swu-game-record]
  - id: verify-synced-cards
    title: Verify synced cards in admin UI (count, spot-checks)
    tier: feature
    needs: [trigger-full-sync]
  - id: qa-test-search-query
    title: "QA test #111: search query returns normalized cards"
    tier: feature
    needs: [verify-synced-cards]
  - id: qa-test-search-by-id
    title: "QA test #112: searchById matches search results"
    tier: feature
    needs: [qa-test-search-query]
  - id: qa-test-full-sync-verification
    title: "QA test #113: full sync count and field-mapping verification"
    tier: feature
    needs: [verify-synced-cards]
  - id: qa-test-e2e-scanning
    title: "QA test #114: end-to-end card scanning and routing"
    tier: feature
    needs: [qa-test-search-by-id, qa-test-full-sync-verification]
  - id: final-verification-report
    title: Compile final setup and testing summary report
    tier: polish
    needs: [qa-test-e2e-scanning]
constraints:
  - No automated test suite exists in mault; all QA tests (#111-#114) are manual/scripted verification, not CI-gated (CLAUDE.md:22).
  - Card identification depends on the live SigLIP vectorization pipeline; no mocking of the embedding search.
  - This work happens on feature/swu-support, never directly on master (git-discipline: branch-confirm before cross-workstream work).
tracker: github
---

# SWU local setup, environment fix, and end-to-end testing

## fix-sharp-native-build — Diagnose and fix sharp native postinstall failure blocking pnpm install

**Goal**: `sharp@0.34.5`'s postinstall script fails its node-gyp build-from-source
step on 3 consecutive `pnpm install` attempts (plain, `pnpm rebuild sharp`,
`pnpm install --force`), even though the correct prebuilt
`@img/sharp-darwin-arm64@0.34.5` binary is already present in the pnpm
store. This blocks `node_modules/.bin/turbo` and `.bin/tsc` from being
linked at all, which blocks every downstream task in this spec (dev server
won't start, no typecheck, no build). Root-caused before any other item
proceeds.

**Acceptance**:
- `pnpm install` completes with exit code 0 and no `ELIFECYCLE` failure in
  the sharp postinstall step.
- `node -e "require('sharp')"` runs without error.
- `node_modules/.bin/turbo` and `node_modules/.bin/tsc` both exist.
- `pnpm build` runs past the `turbo: command not found` failure (may still
  surface unrelated TypeScript errors — those are a separate concern from
  this item, which only closes the install/link gap).

**Touches**: repo-root `node_modules/`, possibly `.npmrc` (none currently
exists) if a `SHARP_IGNORE_GLOBAL_LIBVIPS` / `npm_config_build_from_source`
override proves to be the fix; possibly requires system-level Xcode Command
Line Tools installation, which is outside safe autonomous scope and needs
explicit user confirmation before running.

**Open gaps**: root cause not yet identified — three retries (plain
install, `pnpm rebuild sharp`, `--force`) produced the identical failure
signature (`sharp: Attempting to build from source via node-gyp` →
`Please add node-addon-api to your dependencies` → `Failed`), which rules
out a transient network flake but doesn't yet explain why sharp's own
binary-detection in `install/check.js` isn't finding the prebuilt package
that's demonstrably present in the pnpm store. Needs either a node-gyp/pnpm
resolution deep-dive or a system Xcode Command Line Tools check.

## verify-dev-server-startup — Start mault dev server and verify health

**Goal**: Confirm the dev server actually starts and serves both the Hono
API (port 3001) and Vite frontend (port 5173) once the install is
unblocked, so every later browser-automation step has something real to
talk to.

**Acceptance**:
- `.env` has `AUTH_PROVIDER` and `DATABASE_URL` set to valid values.
- `pnpm dev` starts both processes without crashing.
- `curl -s http://localhost:3001/public/games` returns HTTP 200.

**Touches**: `.env` (read-only verification), `pnpm dev` process

**Open gaps**: none

## admin-ui-access — Open browser and authenticate to admin UI

**Goal**: Get an authenticated browser session at `/app/admin` so the
Games Manager is reachable for the next item.

**Acceptance**:
- Browser navigates to `http://localhost:5173/app/admin` successfully.
- Sign-in completes (existing admin account, or the auto-provisioned
  first-account-is-admin flow for a fresh local-mode instance).
- Games Manager UI is visible with existing games listed and an "Add Game"
  control present.

**Touches**: browser session (claude-in-chrome), no repo files

**Open gaps**: which admin credentials to use is unresolved — depends on
whether this is a fresh local-mode DB (first signup becomes admin
automatically) or an existing DB with a known admin account.

## create-swu-game-record — Create SWU game record with field definitions via admin UI

**Goal**: Create the `games` table row for SWU (`key: 'swu'`, `name: 'Star
Wars Unlimited'`) with the 5 field definitions already documented in
`docs/games/swu-field-definitions.md`, so search/sync/bin-rules have a
game to attach to.

**Acceptance**:
- New game row visible in Games Manager list with key='swu', Active=ON.
- All 5 fields (type_name, rarity, aspects, cost, expansion_code) present
  in the Field Definitions editor with correct type (enum/set/numeric) and
  options populated.

**Touches**: `games` DB table (via admin UI, not code)

**Open gaps**: none — field values are already fully specified in
`docs/games/swu-field-definitions.md`.

## trigger-full-sync — Trigger and monitor full SWU catalog sync

**Goal**: Run the sync job for the newly-created SWU game so the card
catalog (~4,674 canonical cards per the sync source implementation) is
vectorized and searchable.

**Acceptance**:
- Sync job reaches terminal "success" status.
- No unhandled exceptions in the sync log stream.
- Final canonical card count falls in the 3,500–5,000 range.

**Touches**: sync job admin panel, `cardImageVectors` DB table (via app,
not direct SQL)

**Open gaps**: expected sync duration (5–10 minutes per the original plan)
is an estimate, not yet measured against a real run.

## verify-synced-cards — Verify synced cards in admin UI (count, spot-checks)

**Goal**: Confirm the synced data is actually correct, not just present —
spot-check a handful of cards against known SWU card names/sets/rarities.

**Acceptance**:
- Admin Cards list filtered to `gameKey=swu` shows the expected count.
- 3 spot-checked cards show correct name, set/expansion code, rarity, and
  a loading image URL.

**Touches**: admin Cards list UI

**Open gaps**: none

## qa-test-search-query — QA test #111: search query returns normalized cards

**Goal**: Execute the already-synthesized GitHub issue #111 test plan
against the real running app: search "Luke Skywalker", verify PlayingCard
shape, partial-match behavior, and non-match behavior.

**Acceptance**:
- Exact-name search returns the target card.
- Partial-name search ("Luke") returns the target card in results.
- Non-matching query returns zero results, no error.
- At least one image URL loads via `/api/cards/image-proxy`.
- Test log written to `reports/manual-tests/swu-search-query.md`.

**Touches**: `reports/manual-tests/swu-search-query.md` (create)

**Open gaps**: none — full test steps already specified in issue #111's
synthesized body.

## qa-test-search-by-id — QA test #112: searchById matches search results

**Goal**: Execute GitHub issue #112's test plan: verify SearchById returns
a card matching the #111 search result, and that error cases (nonexistent
id, malformed id) return proper HTTP status codes.

**Acceptance**:
- Known cardId returns exactly one card matching the #111 search result.
- Nonexistent cardId returns HTTP 404.
- Malformed cardId returns HTTP 400-class error.
- Test log written to `reports/manual-tests/swu-search-by-id.md`.

**Touches**: `reports/manual-tests/swu-search-by-id.md` (create)

**Open gaps**: none

## qa-test-full-sync-verification — QA test #113: full sync count and field-mapping verification

**Goal**: Execute GitHub issue #113's test plan: confirm the sync from
`trigger-full-sync` produced a correct card count and unmangled field
mapping, and that post-sync search reflects the new data.

**Acceptance**:
- Sync status is "success" with zero unhandled exceptions.
- Card count is 3,500–5,000.
- ≥3 spot-checked cards match reference data on name and image URL.
- Re-running the #111 search after sync returns results.
- Test log written to `reports/manual-tests/swu-full-sync.md`.

**Touches**: `reports/manual-tests/swu-full-sync.md` (create)

**Open gaps**: none — this item largely re-verifies `trigger-full-sync` and
`verify-synced-cards` output against issue #113's formal acceptance
criteria, rather than re-running the sync itself.

## qa-test-e2e-scanning — QA test #114: end-to-end card scanning and routing

**Goal**: Execute GitHub issue #114's test plan: scan/simulate 2 physical
SWU cards, verify correct identification and downstream routing, and
confirm graceful failure on a negative case (non-SWU or degraded image).

**Acceptance**:
- Card #1 scan identifies the exact correct card.
- Card #2 (or photo-substitute fallback) scan identifies correctly.
- Identified card routes through downstream flow with correct metadata
  (name, set, image, cost, aspect).
- Negative-case scan fails gracefully — no crash, no false-positive match.
- Test log with evidence written to `reports/manual-tests/swu-e2e-scan.md`.

**Touches**: `reports/manual-tests/swu-e2e-scan.md` (create)

**Open gaps**: no physical SWU cards or scanning hardware confirmed
available in this environment — this item may need to run as a simulated
image-based identification test rather than a true hardware scan, per the
single-card fallback already noted in issue #114's synthesized body.

## final-verification-report — Compile final setup and testing summary report

**Goal**: Roll up all prior items into one summary document confirming the
full SWU setup-through-testing chain succeeded, as an audit trail.

**Acceptance**:
- `SETUP_SUMMARY.md` exists at repo root with setup checklist and QA test
  results table.
- All 4 QA test logs are referenced and their PASS/FAIL status stated.
- Committed to `feature/swu-support` (not `master`).

**Touches**: `SETUP_SUMMARY.md` (create)

**Open gaps**: none

## Non-goals

- Fixing the sharp build issue via system-level changes (installing Xcode
  Command Line Tools) without explicit user confirmation — `fix-sharp-native-build`'s
  acceptance criteria stop at diagnosis plus any user-space fix; a
  system-level fix is a flagged open gap, not something this spec's
  execution performs unprompted.
- Pushing `feature/swu-support` or opening a pull request — that decision
  is still open with the user as of this spec's authoring and is explicitly
  out of scope for the issue tree this spec produces.
- Production deployment of the SWU feature.
- Physical hardware scanning if no real scanner/cards are available in this
  environment — see `qa-test-e2e-scanning`'s open gap for the fallback.
</content>
