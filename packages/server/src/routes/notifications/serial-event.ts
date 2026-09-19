import type { SerialEventReport } from "@magic-vault/shared";
import { Hono } from "hono";
import { z } from "zod";
import { sendDiscordNotification } from "../../lib/discord";
import { classifySerialEvent, recordSerialEvent } from "../../lib/serial-events";
import { requireAuth, requireOrg, type AppEnv } from "../../middleware/auth";

const SerialEventReportSchema = z.object({
  command: z.enum(["connect", "test", "feeder", "auto-feed", "bin", "jam"]),
  sent: z.boolean(),
  response: z.unknown(),
  stage: z
    .enum(["connected", "status", "calibrating", "testing", "ready", "test_failed", "disconnected"])
    .optional(),
  cardName: z.string().optional(),
  binNumber: z.number().int().optional(),
  collectionGuid: z.string().optional(),
});

export const serialEventNotificationRoute = new Hono<AppEnv>().post(
  "/serial-event",
  requireAuth,
  requireOrg,
  async (c) => {
    const parsed = SerialEventReportSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ success: false, message: "Invalid serial event." }, 400);
    }
    const event: SerialEventReport = parsed.data;
    const orgId = c.get("orgId");
    recordSerialEvent(orgId, event);

    // Stage checkpoints are progress, not failures; only the existing
    // failure-shaped reports reach Discord.
    const classified = event.stage ? null : classifySerialEvent(event);
    if (classified) {
      void sendDiscordNotification(
        orgId,
        {
          title: `Magic Vault — ${classified.title}`,
          description: classified.description,
          color: 0xed4245,
          timestamp: new Date().toISOString(),
        },
        "error",
        undefined,
        undefined,
        event.collectionGuid,
      );
    }
    return c.json({ success: true, message: "Serial event reported." });
  },
);
