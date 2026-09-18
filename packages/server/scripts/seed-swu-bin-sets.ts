// Installs the default Star Wars Unlimited sorting presets for one org as
// bin sets, through the normal bins API (never a direct DB write). Also
// pushes the current data/seed/swu-field-definitions.json onto the 'swu'
// game via PUT /games/:guid so the presets' fields exist. Idempotent: a
// preset whose name already exists in the org is left untouched.
//
// Every preset is built for a 6-bin sorter (3 modules x left/right) with
// bin 6 as the catch-all. Rules evaluate first-match-wins in bin order
// (shared/evaluate-bin.ts), which the Aspect preset relies on.
//
// Boundaries: the seed JSON and every API response are parsed with Zod
// before use; rule shapes come from @magic-vault/shared's own contracts.
//
// Usage: pnpm --filter @magic-vault/server seed:swu-bins
// Env: SERVER_URL (default http://localhost:3001), BOOTSTRAP_ADMIN_EMAIL,
//      BOOTSTRAP_ADMIN_PASSWORD (same defaults as bootstrap-swu.ts),
//      SWU_PRESET_ORG (org name to target, default "Home").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  BinCondition,
  BinRuleGroup,
  DefaultBinInit,
  FieldMeta,
} from "@magic-vault/shared";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";
const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@mault.local";
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "change-me-bootstrap-1";
const ORG_NAME = process.env.SWU_PRESET_ORG ?? "Home";
const BIN_COUNT = 6;
const CARD_LIMIT = 250;
const FIELD_DEFS_PATH = join(__dirname, "..", "..", "..", "data", "seed", "swu-field-definitions.json");

const Operator = z.enum([
  "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
  "gt", "gte", "lt", "lte", "in", "not_in", "contains_any", "contains_all",
  "contains_none", "is_null", "is_not_null",
]);
const FieldMetaSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["string", "numeric", "enum", "set"]),
  path: z.string().min(1),
  operators: z.array(z.object({ value: Operator, label: z.string() })).min(1),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
const FieldDefsFile = z.array(FieldMetaSchema).min(1);

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.boolean(), data: data.optional(), message: z.string().optional() });
const SignInResponse = envelope(z.object({ token: z.string().min(1) }));
const OrgsResponse = envelope(z.array(z.object({ id: z.string(), name: z.string() })));
const GamesResponse = envelope(z.array(z.object({ guid: z.string(), key: z.string() })));
const BinSetsResponse = envelope(z.array(z.object({ guid: z.string(), name: z.string() })));
const OkResponse = envelope(z.unknown());

const cond = (field: string, operator: BinCondition["operator"], value: BinCondition["value"]): BinCondition => ({
  id: randomUUID(),
  field,
  operator,
  value,
});
const all = (...conditions: (BinCondition | BinRuleGroup)[]): BinRuleGroup => ({ id: randomUUID(), combinator: "and", conditions });
const any = (...conditions: (BinCondition | BinRuleGroup)[]): BinRuleGroup => ({ id: randomUUID(), combinator: "or", conditions });
const empty = (): BinRuleGroup => ({ id: randomUUID(), combinator: "and", conditions: [] });
const alpha = (...letters: string[]) => any(...letters.map((l) => cond("name", "starts_with", l)));

// Bins 1..5 carry rules; bin 6 is the catch-all. Fewer than 5 rule bins
// leaves the remaining bins empty (unused) rather than shifting numbers.
const PRESETS: { name: string; bins: BinRuleGroup[] }[] = [
  {
    // Colour aspects first so a Heroism/Villainy + colour card lands on its
    // colour; bin 5 then only sees mono-Heroism/Villainy cards; neutral
    // (no aspect) falls through to the catch-all.
    name: "SWU · Aspect",
    bins: [
      all(cond("aspects", "contains_any", ["Vigilance"])),
      all(cond("aspects", "contains_any", ["Command"])),
      all(cond("aspects", "contains_any", ["Aggression"])),
      all(cond("aspects", "contains_any", ["Cunning"])),
      all(cond("aspects", "contains_any", ["Heroism", "Villainy"])),
    ],
  },
  {
    name: "SWU · Set A (SOR–LOF)",
    bins: [
      all(cond("set_code", "equals", "SOR")),
      all(cond("set_code", "equals", "SHD")),
      all(cond("set_code", "equals", "TWI")),
      all(cond("set_code", "equals", "JTL")),
      all(cond("set_code", "equals", "LOF")),
    ],
  },
  {
    name: "SWU · Set B (SEC–HMW)",
    bins: [
      all(cond("set_code", "equals", "SEC")),
      all(cond("set_code", "equals", "LAW")),
      all(cond("set_code", "equals", "ASH")),
      all(cond("set_code", "equals", "HMW")),
      all(cond("set_code", "in", ["SOR", "SHD", "TWI", "JTL", "LOF"])),
    ],
  },
  {
    name: "SWU · Alpha",
    bins: [
      alpha("a", "b", "c", "d"),
      alpha("e", "f", "g", "h"),
      alpha("i", "j", "k", "l"),
      alpha("m", "n", "o", "p"),
      alpha("q", "r", "s", "t"),
    ],
  },
  {
    // No-cost cards (leaders, bases, tokens) fall through to the catch-all.
    name: "SWU · Cost",
    bins: [
      all(cond("cost", "lte", 2)),
      all(cond("cost", "equals", 3)),
      all(cond("cost", "equals", 4)),
      all(cond("cost", "equals", 5)),
      all(cond("cost", "gte", 6)),
    ],
  },
  {
    // Showcase, promos, and printings with no variant record fall through.
    name: "SWU · Variant",
    bins: [
      all(cond("variant", "equals", "Standard")),
      all(cond("variant", "equals", "Standard Foil")),
      all(cond("variant", "equals", "Hyperspace")),
      all(cond("variant", "equals", "Hyperspace Foil")),
      all(cond("variant", "in", ["Standard Prestige", "Foil Prestige", "Serialized Prestige"])),
    ],
  },
  {
    name: "SWU · Type",
    bins: [
      all(cond("type_name", "equals", "Unit")),
      all(cond("type_name", "equals", "Event")),
      all(cond("type_name", "equals", "Upgrade")),
      all(cond("type_name", "equals", "Leader")),
      all(cond("type_name", "equals", "Base")),
    ],
  },
  {
    name: "SWU · Rarity",
    bins: [
      all(cond("rarity", "equals", "Common")),
      all(cond("rarity", "equals", "Uncommon")),
      all(cond("rarity", "equals", "Rare")),
      all(cond("rarity", "equals", "Legendary")),
      all(cond("rarity", "equals", "Special")),
    ],
  },
];

function log(msg: string) {
  console.log(`[seed-swu-bins] ${msg}`);
}

async function api<T extends z.ZodTypeAny>(
  schema: T,
  path: string,
  init: { method?: string; body?: unknown; token?: string; orgId?: string } = {},
): Promise<z.infer<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.orgId) headers["x-org-id"] = init.orgId;
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`${init.method ?? "GET"} ${path} returned an unexpected shape (HTTP ${res.status}): ${parsed.error.message}`);
  }
  return parsed.data;
}

async function main() {
  const signIn = await api(SignInResponse, "/local-auth/sign-in", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!signIn.data) throw new Error(`sign-in failed: ${signIn.message ?? "no token"}`);
  const token = signIn.data.token;

  const orgs = await api(OrgsResponse, "/local-auth/organizations", { token });
  const orgList = orgs.data ?? [];
  const org = orgList.find((o) => o.name === ORG_NAME) ?? orgList[0];
  if (!org) throw new Error("no organisation found for the bootstrap admin");
  log(`Target org: ${org.name} (${org.id})`);

  const games = await api(GamesResponse, "/games", { token, orgId: org.id });
  const swu = (games.data ?? []).find((g) => g.key === "swu");
  if (!swu) throw new Error("'swu' game not found - run bootstrap:swu first");

  const fieldDefinitions: FieldMeta[] = FieldDefsFile.parse(JSON.parse(readFileSync(FIELD_DEFS_PATH, "utf8")));
  const put = await api(OkResponse, `/games/${swu.guid}`, {
    method: "PUT",
    token,
    orgId: org.id,
    body: { fieldDefinitions },
  });
  if (!put.success) throw new Error(`field definition update failed: ${put.message ?? "unknown"}`);
  log(`Updated 'swu' field definitions (${fieldDefinitions.length} fields).`);

  const listed = await api(BinSetsResponse, "/bins", { token, orgId: org.id });
  const existing = new Map((listed.data ?? []).map((s) => [s.name, s.guid]));

  let firstGuid: string | undefined;
  for (const preset of PRESETS) {
    if (existing.has(preset.name)) {
      log(`Preset "${preset.name}" already exists, skipping.`);
      firstGuid ??= existing.get(preset.name);
      continue;
    }
    const initialBins: DefaultBinInit[] = Array.from({ length: BIN_COUNT }, (_, i) => ({
      binNumber: i + 1,
      rules: preset.bins[i] ?? empty(),
      isCatchAll: i === BIN_COUNT - 1,
      cardLimit: CARD_LIMIT,
    }));
    const created = await api(BinSetsResponse, "/bins", {
      method: "POST",
      token,
      orgId: org.id,
      body: { name: preset.name, gameGuid: swu.guid, initialBins },
    });
    if (!created.success) throw new Error(`creating "${preset.name}" failed: ${created.message ?? "unknown"}`);
    firstGuid ??= (created.data ?? []).find((s) => s.name === preset.name)?.guid;
    log(`Created preset "${preset.name}" with ${preset.bins.length} rule bins + catch-all.`);
  }

  if (firstGuid) {
    await api(OkResponse, `/bins/${firstGuid}/active`, { method: "PUT", token, orgId: org.id, body: {} });
    log(`Active set: "${PRESETS[0].name}".`);
  }
  log("Done.");
}

main().catch((err) => {
  console.error(`[seed-swu-bins] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
