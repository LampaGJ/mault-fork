import { Hono } from "hono";
import type { AppEnv } from "../../middleware/auth";
import { serialEventNotificationRoute } from "./serial-event";
import { serialEventsRoute } from "./serial-events";
import { testNotificationRoute } from "./test";

const router = new Hono<AppEnv>()
  .route("/", testNotificationRoute)
  .route("/", serialEventNotificationRoute)
  .route("/", serialEventsRoute);

export { router as notificationsRouter };
