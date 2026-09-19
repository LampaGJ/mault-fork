import pino from "pino";

// Single structured logger for the server (LampaGJ/mault#4 tracks moving the
// remaining console.* call sites onto it). JSON lines to stdout; LOG_LEVEL
// selects verbosity (default "info"). Child loggers carry a `module` field so
// a log line can be filtered by subsystem without grepping message text.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "mault-server" },
});

export function moduleLogger(module: string) {
  return logger.child({ module });
}
