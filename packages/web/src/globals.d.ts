declare const __APP_VERSION__: string;

interface MaultScannerBridge {
  state(): {
    status: string;
    autoFeed: boolean;
    canForceScan: boolean;
    isConnected: boolean;
    isReady: boolean;
    scanningBlocked: boolean;
  };
  scanNow(): void;
  pause(): void;
  resume(): void;
  feed(): Promise<void>;
  clearDevice(): Promise<void>;
  setAutoFeed(on: boolean): void;
  toggleAutoFeed(): boolean;
}

interface MaultBridge {
  version: 1;
  isConnected: boolean;
  isReady: boolean;
  firmwareVersion: string | null;
  board: "esp32" | "uno_r4" | null;
  transport: "serial" | "bluetooth" | null;
  last: { command: string; response: string | null; at: string } | null;
  command(json: string, timeoutMs?: number): Promise<{ sent: boolean; response: string | null }>;
  test(): Promise<{ ok: boolean; error?: string }>;
  route(module: number, direction: "left" | "right" | "bottom", binNumber?: number): Promise<unknown | null>;
  scanner?: MaultScannerBridge;
}

interface Window {
  __mault?: MaultBridge;
}
