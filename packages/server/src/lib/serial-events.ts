import type {
  SerialCommand,
  SerialEventReport,
  SerialStage,
} from "@magic-vault/shared";
import { moduleLogger } from "./logger";

// Last few serial events per org, in process memory like the sync job's
// state: enough for "what is the sorter doing right now" without a table.
// Lost on restart, which is the right lifetime - a stage from before a
// server restart says nothing about the device now.
export interface RecordedSerialEvent extends SerialEventReport {
  at: string;
}

const RING_SIZE = 50;
const recent = new Map<string, RecordedSerialEvent[]>();
const log = moduleLogger("serial-events");

export function recordSerialEvent(orgId: string, event: SerialEventReport): void {
  const list = recent.get(orgId) ?? [];
  list.push({ ...event, at: new Date().toISOString() });
  if (list.length > RING_SIZE) list.splice(0, list.length - RING_SIZE);
  recent.set(orgId, list);
  log.info(
    { orgId, command: event.command, stage: event.stage, sent: event.sent, response: event.response },
    event.stage ? `sorter stage: ${event.stage}` : `serial event: ${event.command}`,
  );
}

export function getSorterState(orgId: string): {
  stage: SerialStage | null;
  stageAt: string | null;
  lastError: RecordedSerialEvent | null;
  events: RecordedSerialEvent[];
} {
  const events = recent.get(orgId) ?? [];
  const lastStage = [...events].reverse().find((e) => e.stage);
  const lastError = [...events].reverse().find((e) => classifySerialEvent(e)) ?? null;
  return {
    stage: lastStage?.stage ?? null,
    stageAt: lastStage?.at ?? null,
    lastError,
    events: events.slice(-10),
  };
}

const COMMAND_LABELS: Record<SerialCommand, string> = {
  connect: "Connection",
  test: "Device Test",
  feeder: "Feed",
  "auto-feed": "Auto-Feed",
  bin: "Sorter",
  jam: "Sorter",
};

function contextLines(event: SerialEventReport): string[] {
  const lines: string[] = [];
  if (event.cardName) lines.push(`**Card:** ${event.cardName}`);
  if (event.binNumber !== undefined) lines.push(`**Bin:** ${event.binNumber}`);
  return lines;
}

export function classifySerialEvent(
  event: SerialEventReport,
): { title: string; description: string } | null {
  const label = COMMAND_LABELS[event.command];
  const lines = contextLines(event);

  if (!event.sent) {
    return {
      title: `${label} Failed`,
      description: [
        ...lines,
        "**Error:** Could not send command to the device.",
      ].join("\n"),
    };
  }

  if (!event.response) {
    return {
      title: `${label} Timeout`,
      description: [
        ...lines,
        "**Error:** No response from the device in time.",
      ].join("\n"),
    };
  }

  if (typeof event.response !== "object") {
    return {
      title: `${label} Error`,
      description: [
        ...lines,
        `**Error:** Unexpected response: ${String(event.response)}`,
      ].join("\n"),
    };
  }

  const res = event.response as Record<string, unknown>;

  if (res.error === "jam") {
    return {
      title: "Card Jam Detected",
      description: `Card stuck at module ${res.module}${res.bin ? ` (heading to bin ${res.bin})` : ""}. Check the sorter and resume.`,
    };
  }

  if (res.empty) {
    return {
      title: "Feeder Empty",
      description: [
        ...lines,
        "No cards remaining in the hopper. Add more cards to continue.",
      ].join("\n"),
    };
  }

  if (res.error) {
    return {
      title: `${label} Error`,
      description: [...lines, `**Error:** ${String(res.error)}`].join("\n"),
    };
  }

  return null;
}
