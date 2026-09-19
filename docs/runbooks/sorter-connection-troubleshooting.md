---
type: runbook
status: active
related: [firmware/PROTOCOL.md, firmware/build-uno-r3.sh]
---

# Troubleshooting "Testing card sorter connection…"

The scanner overlay shows this pill whenever the serial port is open but the device has not yet said the self-test passed. It is a state, not an error, and the app never replaces it with the failure reason (that only appears as a toast), so it looks like a hang. The pill clears only on a `{"status":"test_complete"}` line from the device (`packages/web/src/features/scanner/api/use-serial.tsx:413-415`, rendered by `packages/web/src/features/scanner/components/scanner-overlay.tsx:146-150`).

## What the app does on connect

1. Sends `{"getStatus":true}` and reads the boot line for `version` and `board`.
2. Sends the org's calibration: `setFeederConfig`, `setChannelOffset`, then one `setConfig` per module.
3. Sends `{"test":true}` and waits up to 10 s for a reply (`use-serial.tsx:164-181`).

Every step is visible in the Communication Log (the "copy communication" action on the connect toast). Read that log before touching hardware.

## Diagnose from the log

| Line in the log | Meaning | Fix |
|---|---|---|
| `{"error":"module N sensor is blocked - clear the device before testing"}` | Module N's IR gate sensor reads LOW (card present), so the firmware refuses the test (`firmware/main/main.ino:201-208`, `:708`). | Clear anything in module N's gate. Sensors are `INPUT_PULLUP` (`main.ino:908`) on D2/D3/D4/D6/D7 for modules 1-5 (`main.ino:152`); an unconnected pin reads clear, so a stray wire or a misaligned sensor also produces this. A power cycle has cleared it before. |
| `{"error":"jam","module":N}` arriving unprompted | Same sensor has read LOW for 20 s while idle (`main.ino:163`). Informational, but the next `test` will be refused. | As above. |
| `{"error":"invalid JSON","reason":"NoMemory",...}` on `setConfig` or `setFeederConfig` | The board ran out of RAM parsing the command. Seen on a classic Uno R3 with stock firmware. | Flash the R3 build: `firmware/build-uno-r3.sh <port>`. It gives ArduinoJson a fixed arena (`main.ino:20-25`) and trims core buffers. Calibration is silently lost otherwise, even though `test` may still pass. |
| No reply at all to `test` for 10 s | Servo sweep stalled (PCA9685 unpowered or not on I2C), or the board reset mid-test. | Check the servo board's power and I2C wiring; watch for an unsolicited boot line in the log, which means a reset. |
| `Blocked request. This host is not allowed` in the browser instead of a log | Vite refused the tailnet hostname. | Add `allowedHosts: [".ts.net"]` to `server` in `packages/web/vite.config.ts`. |
| No serial port offered at all | Chrome is the only browser with Web Serial, and only one process may hold the port. | Close other tabs or terminal tools using the port; `lsof /dev/cu.usbmodem*` shows the holder. |

## Talk to the board without the app

Useful when the browser holds nothing and you want ground truth. Replace the port name with yours.

```bash
D=/dev/cu.usbmodem12101
stty -f $D 9600 cs8 -cstopb -parenb raw -echo
(cat $D > /tmp/serial.txt &)
sleep 3.5                                # the Uno resets when the port opens
printf '%s\n' '{"getStatus":true}' > $D
printf '%s\n' '{"test":true}'      > $D
sleep 12; pkill -f "cat $D"; cat /tmp/serial.txt
```

A healthy board prints the boot line, then `{"status":"test_complete"}`. On the R3 build the boot line also carries `arenaPeak`, the largest JSON parse so far, for sizing checks.

## Board identity

The firmware reports `"board":"uno_r4"` for any non-ESP32 build, including a classic Uno R3 (`main.ino` `BOARD_TYPE`). The R3 (USB 2341:0043) is not an official firmware target; only the build script above produces a working image for it.
