#!/usr/bin/env bash
# Build (and optionally flash) the firmware for a classic Arduino Uno R3
# (ATmega328P, 2 KB SRAM). Not an official target (see firmware-release.yml:
# Uno R4 Minima/WiFi and ESP32-S3), but it fits when the core's buffers are
# trimmed: the serial ring buffers drop from 64 to 32 bytes each and the
# TWI buffers from 32 to 16 (the PCA9685 driver never writes more than 5
# bytes per transaction). main.ino's AVR-only JsonArena is sized against
# exactly these flags. Wire.h's BUFFER_LENGTH is not overridable, so its
# two 32-byte buffers stay.
#
# Usage: firmware/build-uno-r3.sh [serial-port]
#   no port  -> compile only, hex under firmware/main/build/arduino.avr.uno/
#   port     -> compile, then flash with avrdude (e.g. /dev/cu.usbmodem12101)
#
# The Arduino AVR toolchain is x86_64-only; on an Apple Silicon Mac without
# Rosetta, run the compile on a machine that has it and flash with a native
# avrdude (brew install avrdude).
set -euo pipefail
cd "$(dirname "$0")"

FLAGS="-DSERIAL_RX_BUFFER_SIZE=32 -DSERIAL_TX_BUFFER_SIZE=32 -DTWI_BUFFER_LENGTH=16"
# --clean matters: arduino-cli reuses cached core objects and silently drops
# changed build.extra_flags, so the buffer trims never reach HardwareSerial.
arduino-cli compile --clean --fqbn arduino:avr:uno --export-binaries \
  --build-property "build.extra_flags=$FLAGS" \
  main

if [ "${1:-}" != "" ]; then
  avrdude -c arduino -p atmega328p -P "$1" -b 115200 -D \
    -U "flash:w:main/build/arduino.avr.uno/main.ino.hex:i"
fi
