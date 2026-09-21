declare const __APP_VERSION__: string;

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
}

interface Window {
  __mault?: MaultBridge;
}
