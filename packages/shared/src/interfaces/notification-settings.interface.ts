export type SerialCommand =
  | "connect"
  | "test"
  | "feeder"
  | "auto-feed"
  | "bin"
  | "jam";

// Connect-sequence checkpoints the web client reports so anything outside the
// browser tab (the menu-bar plugin, a future monitor view) can see where a
// device connection is: the tab is the only place that talks to the sorter.
export type SerialStage =
  | "connected"
  | "status"
  | "calibrating"
  | "testing"
  | "ready"
  | "test_failed"
  | "disconnected";

export interface SerialEventReport {
  command: SerialCommand;
  sent: boolean;
  response: unknown;
  stage?: SerialStage;
  cardName?: string;
  binNumber?: number;
  collectionGuid?: string;
}
