import { Hono } from "hono";
import { getSorterState } from "../../lib/serial-events";
import { requireAuth, requireOrg, type AppEnv } from "../../middleware/auth";

// GET /notifications/serial-events - the org's current sorter stage, last
// failure, and the last ten reported serial events (process memory only).
export const serialEventsRoute = new Hono<AppEnv>().get(
  "/serial-events",
  requireAuth,
  requireOrg,
  (c) => c.json({ success: true, data: getSorterState(c.get("orgId")) }),
);
