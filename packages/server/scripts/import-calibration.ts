// Imports a calibration export (the JSON the app's Calibration page
// downloads: modules, feeder, bin routes, module count, channel layout)
// into one device of one org, through the same device-scoped API the app
// uses. Creates the device if the org has none. Idempotent: every write is
// an upsert keyed on device + module/bin number.
//
// Boundaries: the file is parsed with Zod (mirrors
// packages/web/src/schemas/calibration-export.schema.ts) and every API
// response is parsed before use.
//
// Usage: pnpm --filter @magic-vault/server import:calibration <file.json>
// Env: SERVER_URL (default http://localhost:3001), BOOTSTRAP_ADMIN_EMAIL,
//      BOOTSTRAP_ADMIN_PASSWORD (bootstrap-swu.ts defaults),
//      SWU_PRESET_ORG (org name, default "Home"),
//      CALIBRATION_DEVICE (device name to create/target, default "Card Sorter").
import { readFileSync } from "node:fs";
import { z } from "zod";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";
const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@mault.local";
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "change-me-bootstrap-1";
const ORG_NAME = process.env.SWU_PRESET_ORG ?? "Home";
const DEVICE_NAME = process.env.CALIBRATION_DEVICE ?? "Card Sorter";

const Servo = z.object({
  bottomClosed: z.number().int(),
  bottomOpen: z.number().int(),
  paddleClosed: z.number().int(),
  paddleOpen: z.number().int(),
  pusherLeft: z.number().int(),
  pusherNeutral: z.number().int(),
  pusherRight: z.number().int(),
  paddleCloseDelay: z.number().int(),
});
const CalibrationExport = z.object({
  formatVersion: z.literal(1),
  moduleCount: z.number().int().min(1).max(5),
  channelLayout: z.enum(["standard", "legacy"]),
  modules: z.array(z.object({ moduleNumber: z.number().int().min(1), calibration: Servo })).min(1),
  feeder: z.object({
    speed: z.number().int(),
    duration: z.number().int(),
    pulseDuration: z.number().int(),
    pauseDuration: z.number().int(),
    settleDuration: z.number().int(),
  }),
  binRoutes: z.array(z.object({
    binNumber: z.number().int().min(1),
    module: z.number().int().min(1),
    direction: z.enum(["left", "right", "bottom"]),
  })).min(1),
});

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.boolean(), data: data.optional(), message: z.string().optional() });
const SignInResponse = envelope(z.object({ token: z.string().min(1) }));
const OrgsResponse = envelope(z.array(z.object({ id: z.string(), name: z.string() })));
const DeviceSchema = z.object({ guid: z.string(), name: z.string(), moduleCount: z.number().int().optional() });
const DevicesResponse = envelope(z.array(DeviceSchema));
const DeviceResponse = envelope(DeviceSchema);
const OkResponse = envelope(z.unknown());

function log(msg: string) {
  console.log(`[import-calibration] ${msg}`);
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
  const value = parsed.data as { success: boolean; message?: string };
  if (!value.success) throw new Error(`${init.method ?? "GET"} ${path} failed: ${value.message ?? "unknown"}`);
  return parsed.data;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: import-calibration.ts <calibration-export.json>");
  const data = CalibrationExport.parse(JSON.parse(readFileSync(file, "utf8")));

  const signIn = await api(SignInResponse, "/local-auth/sign-in", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = signIn.data!.token;

  const orgs = await api(OrgsResponse, "/local-auth/organizations", { token });
  const orgList = orgs.data ?? [];
  const org = orgList.find((o) => o.name === ORG_NAME) ?? orgList[0];
  if (!org) throw new Error("no organisation found for the bootstrap admin");
  const ctx = { token, orgId: org.id };
  log(`Target org: ${org.name} (${org.id})`);

  const devices = await api(DevicesResponse, "/devices", ctx);
  let device = (devices.data ?? []).find((d) => d.name === DEVICE_NAME) ?? devices.data?.[0];
  if (!device) {
    device = (await api(DeviceResponse, "/devices", { ...ctx, method: "POST", body: { name: DEVICE_NAME } })).data!;
    log(`Created device "${device.name}" (${device.guid}).`);
  } else {
    log(`Using device "${device.name}" (${device.guid}).`);
  }
  const base = `/devices/${device.guid}`;

  await api(OkResponse, base, {
    ...ctx,
    method: "PUT",
    body: { moduleCount: data.moduleCount, channelLayout: data.channelLayout },
  });
  log(`Device: ${data.moduleCount} modules, ${data.channelLayout} channel layout.`);

  for (const m of data.modules) {
    await api(OkResponse, `${base}/modules/${m.moduleNumber}`, { ...ctx, method: "PUT", body: m.calibration });
    log(`Module ${m.moduleNumber}: ${JSON.stringify(m.calibration)}`);
  }

  await api(OkResponse, `${base}/feeder`, { ...ctx, method: "PUT", body: data.feeder });
  log(`Feeder: ${JSON.stringify(data.feeder)}`);

  for (const r of data.binRoutes) {
    await api(OkResponse, `${base}/bin-routes/${r.binNumber}`, { ...ctx, method: "PUT", body: r });
  }
  log(`Bin routes: ${data.binRoutes.map((r) => `${r.binNumber}→m${r.module}/${r.direction}`).join(", ")}`);
  log("Done.");
}

main().catch((err) => {
  console.error(`[import-calibration] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
