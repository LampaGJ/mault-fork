# Magic Vault (LampaGJ fork)

This is a fork of [dishwasher-detergent/mault](https://github.com/dishwasher-detergent/mault), the TCG card scanner and physical sorter. Everything about what Magic Vault is, how the hardware works, how to deploy it, and how to contribute lives in the [upstream README](https://github.com/dishwasher-detergent/mault#readme) and is not repeated here. This file covers only what this fork changes.

Integration branch: `feature/swu-support`. Upstream `master` is merged in periodically; the last merge point is recorded in the branch history (`merge: upstream master v1.0.65 into feature/swu-support`).

## What this fork adds

### Star Wars Unlimited support

Upstream supports eight games. This fork adds a ninth, `swu`, as a pluggable adapter in the same shape as the others.

- Search and sync adapter under `packages/server/src/lib/adapters/swu/` (`search.ts`, `sync.ts`, `api-types.ts`), syncing every printing and variant rather than canonical cards only, with real pagination and id-collision fixes.
- Field definitions for the game, documented in `docs/games/swu-field-definitions.md`, expanded from the five upstream bin-rule fields to the full set the game needs.
- Sorting presets for a seven-bin machine keyed on aspect, in the order the `swu-labels` project uses, with a replace mode. Seeded by `packages/server/scripts/seed-swu-bin-sets.ts`.
- Card pricing via the TCGCSV daily price dump, foil stored as a second price. Design and follow-ups: `docs/superpowers/specs/2026-09-20-swu-tcgcsv-pricing.spec.md` and `docs/superpowers/specs/2026-09-20-swu-pricing-followups.spec.md`.
- The SWU image CDN host is allowed through the image proxy.

### One-command self-hosted bootstrap

`pnpm --filter @magic-vault/server bootstrap:swu` (`packages/server/scripts/bootstrap-swu.ts`) creates the bootstrap admin, configures the `swu` game with its field definitions, and, when `data/seed/swu-cards.csv.gz` is present, restores the pre-vectorized catalog through Postgres `COPY` instead of running the live fetch and SigLIP pass. Idempotent; safe to re-run. Environment overrides: `SERVER_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.

If port `8080` or `5432` is taken on your machine, add a gitignored `docker-compose.override.yml` remapping only the conflicting port, then `docker compose up -d` as usual.

### Server

- Structured logging through pino; every request is logged with method, path, status, and duration.
- `requireOrg` middleware added to the card routes.
- Local auth mode grants the `authenticated` role access to `devices`, `unmatched_cards`, `org_billing`, and `announcements`, which upstream's local bootstrap left out.

### Scanner and calibration

- The device connect stage is reported to the server and exposed, so a stuck "Testing card sorter connection" state can be diagnosed. Runbook: `docs/runbooks/sorter-connection-troubleshooting.md`.
- A calibration export can be imported from the command line through the device API: `packages/server/scripts/import-calibration.ts`.

### Firmware

- The feeder always applies `settleDuration` after the module 1 sensor trips, not only when the hopper is empty.
- Full-size commands parse on a classic Arduino Uno R3 through a static JSON arena. Build with `firmware/build-uno-r3.sh`.

### Development conveniences

- `sharp` build and postinstall scripts are skipped so `pnpm install` works on machines without its native toolchain.
- `docker-compose.override.yml`, `.env` backups, and a local `WORK-STATE.md` handoff file are gitignored.

## Documentation added by this fork

- `docs/superpowers/specs/2026-09-08-swu-support.spec.md`: the SWU support spec.
- `docs/superpowers/plans/2026-09-08-swu-e2e-setup-testing.md`: setup and end-to-end QA plan, with manual QA logs committed alongside.
- `docs/games/swu-field-definitions.md`: field reference for bin rules and sorting.
- `docs/runbooks/sorter-connection-troubleshooting.md`: connection-stage diagnosis.

## Related

- [mault-mcp](https://github.com/LampaGJ/mault-mcp): an optional MCP server that drives a Magic Vault instance and its sorter from an MCP client. It vendors this fork as a git submodule.

## Everything else

Setup for Neon or self-hosted mode, database commands, deployment, hardware build guide, webcam settings, and licensing are unchanged from upstream. See the [upstream README](https://github.com/dishwasher-detergent/mault#readme).
