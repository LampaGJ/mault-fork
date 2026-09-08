// Self-bootstraps Star Wars Unlimited support after `docker compose up -d`
// (or any running local instance). Every step is idempotent - safe to
// re-run at any time.
//
// What it does, in order:
// 1. Waits for the server to answer health checks.
// 2. Signs up (or signs in, if a prior run already created it) a bootstrap
//    admin account. The first-ever account on a fresh local instance
//    auto-becomes platform admin (see routes/local-auth.ts) - so this is
//    also how a brand-new instance gets its first admin, not just SWU's.
// 3. Creates the 'swu' Game record with its 5 field definitions via the
//    normal admin API (POST /games) - NOT a direct DB insert, per this
//    repo's stated convention (CLAUDE.md: "creating a Game row via the
//    in-app Games Manager, not a code seed"). Skips if the game already
//    exists (the API returns 409).
// 4. Bulk-imports the pre-vectorized SWU card embeddings from
//    data/seed/swu-cards.csv.gz directly into the `cards` table via
//    Postgres COPY. This is a data-cache restore (skipping ~9,185 live API
//    fetches + SigLIP inferences that would otherwise take significant
//    time), not a business-config seed - a direct DB bulk-load is the
//    right tool for this step, unlike step 3. Skips if SWU cards already
//    exist in the DB.
//
// Usage: pnpm --filter @magic-vault/server bootstrap:swu
// Env: SERVER_URL (default http://localhost:3001), BOOTSTRAP_ADMIN_EMAIL,
//      BOOTSTRAP_ADMIN_PASSWORD (defaults below - change for anything but
//      a throwaway local dev instance), DATABASE_URL/DATABASE_SSL (for the
//      direct COPY step, same as migrate-local.ts).
import { createReadStream } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Pool } from "pg";
import { from as copyFrom } from "pg-copy-streams";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";
const BOOTSTRAP_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@mault.local";
const BOOTSTRAP_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "change-me-bootstrap-1";
const DATA_DIR = join(__dirname, "..", "..", "..", "data", "seed");

function log(msg: string): void {
  console.log(`[bootstrap-swu] ${msg}`);
}

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${SERVER_URL}/public/games`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server at ${SERVER_URL} did not become healthy within ${timeoutMs}ms`);
}

async function getBootstrapToken(): Promise<string> {
  const signUp = await fetch(`${SERVER_URL}/local-auth/sign-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      name: "Bootstrap Admin",
    }),
  });
  const signUpBody = await signUp.json();
  if (signUp.ok && signUpBody.success) {
    log(`Created bootstrap admin account (${BOOTSTRAP_EMAIL}).`);
    return signUpBody.data.token;
  }

  log(`Account ${BOOTSTRAP_EMAIL} already exists, signing in instead.`);
  const signIn = await fetch(`${SERVER_URL}/local-auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD }),
  });
  const signInBody = await signIn.json();
  if (!signIn.ok || !signInBody.success) {
    throw new Error(
      `Could not sign up or sign in bootstrap admin account: ${signInBody.message ?? signIn.statusText}`,
    );
  }
  return signInBody.data.token;
}

async function ensureSwuGame(token: string): Promise<void> {
  const fieldDefinitions = JSON.parse(
    readFileSync(join(DATA_DIR, "swu-field-definitions.json"), "utf-8"),
  );

  const res = await fetch(`${SERVER_URL}/games`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      key: "swu",
      name: "Star Wars Unlimited",
      fieldDefinitions,
      isActive: true,
    }),
  });

  if (res.status === 409) {
    log("Game 'swu' already exists, skipping creation.");
    return;
  }
  const body = await res.json();
  if (!res.ok || !body.success) {
    // POST /games's own duplicate-key detection (routes/games.ts) checks
    // `/unique/i.test(err.message)`, but Drizzle wraps the raw pg driver
    // error under `.cause` - the outer error's own .message doesn't
    // contain "unique", so a duplicate key never actually reaches the
    // intended 409 path and surfaces as a generic 500 "Database error"
    // instead (confirmed via server logs: pg code 23505, constraint
    // games_key_idx, nested under `cause`). Filed separately as a bug -
    // this script treats any creation failure as potentially-already-
    // exists and re-checks via GET rather than depending on the 409.
    const check = await fetch(`${SERVER_URL}/public/games`);
    const checkBody = await check.json();
    const alreadyExists = checkBody?.data?.some((g: { key: string }) => g.key === "swu");
    if (alreadyExists) {
      log("Game 'swu' already exists (detected via GET after a POST error - see known issue on the 409 path), skipping creation.");
      return;
    }
    throw new Error(`Failed to create 'swu' game: ${body.message ?? res.statusText}`);
  }
  log("Created 'swu' game with 5 field definitions.");
}

async function importSeedCards(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false",
  });

  try {
    const existing = await pool.query(
      "SELECT COUNT(*) FROM cards WHERE game_key = 'swu'",
    );
    const existingCount = Number(existing.rows[0].count);
    if (existingCount > 0) {
      log(`Found ${existingCount} existing SWU cards in DB, skipping seed import.`);
      return;
    }

    log("Importing pre-vectorized SWU card embeddings from data/seed/swu-cards.csv.gz...");
    const client = await pool.connect();
    try {
      const copyStream = client.query(
        copyFrom(
          "COPY cards (card_id, game_key, lang, name, set_code, embedding) FROM STDIN WITH CSV",
        ),
      );
      const source = createReadStream(join(DATA_DIR, "swu-cards.csv.gz")).pipe(createGunzip());
      await pipeline(source, copyStream);
    } finally {
      client.release();
    }

    const after = await pool.query("SELECT COUNT(*) FROM cards WHERE game_key = 'swu'");
    log(`Imported ${after.rows[0].count} SWU card embeddings.`);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  log(`Waiting for server at ${SERVER_URL}...`);
  await waitForHealth();

  log("Ensuring bootstrap admin account exists...");
  const token = await getBootstrapToken();

  log("Ensuring 'swu' game is configured...");
  await ensureSwuGame(token);

  log("Ensuring SWU card catalog is populated...");
  await importSeedCards();

  log("Done. SWU is ready to scan.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
