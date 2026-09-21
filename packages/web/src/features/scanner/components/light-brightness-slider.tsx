import { Slider } from "@/components/ui/slider";
import { useDevice } from "@/features/calibration/api/use-device";
import { useSerial } from "@/features/scanner/api/use-serial";
import {
  DEFAULT_LIGHT_BRIGHTNESS_PERCENT,
  LIGHT_MAX_BRIGHTNESS,
} from "@/lib/constants/scanner";
import { CALIBRATION_PREVIEW_DEBOUNCE_MS } from "@/lib/constants/timing";
import { LIGHT_BRIGHTNESS_STORAGE_KEY_PREFIX } from "@/lib/constants/storage-keys";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function lightBrightnessCommand(percent: number): string {
  if (percent <= 0) return JSON.stringify({ light: false });
  return JSON.stringify({
    light: { brightness: Math.round((percent / 100) * LIGHT_MAX_BRIGHTNESS) },
  });
}

function readStoredBrightness(deviceGuid: string): number {
  try {
    const raw = localStorage.getItem(
      `${LIGHT_BRIGHTNESS_STORAGE_KEY_PREFIX}.${deviceGuid}`,
    );
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
      ? parsed
      : DEFAULT_LIGHT_BRIGHTNESS_PERCENT;
  } catch {
    return DEFAULT_LIGHT_BRIGHTNESS_PERCENT;
  }
}

function writeStoredBrightness(deviceGuid: string, percent: number): void {
  try {
    localStorage.setItem(
      `${LIGHT_BRIGHTNESS_STORAGE_KEY_PREFIX}.${deviceGuid}`,
      String(percent),
    );
  } catch {}
}

interface LightBrightnessSliderProps {
  className?: string;
}

export function LightBrightnessSlider({
  className,
}: LightBrightnessSliderProps) {
  const { t } = useTranslation("scanner");
  const device = useDevice();
  const { isConnected, isReady, sendCommand } = useSerial();
  const [brightness, setBrightness] = useState(
    DEFAULT_LIGHT_BRIGHTNESS_PERCENT,
  );
  const brightnessRef = useRef(brightness);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const deviceGuid = device?.guid;

  useEffect(() => {
    if (!deviceGuid) return;
    const stored = readStoredBrightness(deviceGuid);
    brightnessRef.current = stored;
    setBrightness(stored);
  }, [deviceGuid]);

  // Re-applies the last known level once the connect sequence's self-test
  // completes, so the strip comes back up after every reconnect.
  useEffect(() => {
    if (!isReady || !deviceGuid) return;
    void sendCommand(lightBrightnessCommand(brightnessRef.current));
  }, [isReady, deviceGuid, sendCommand]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (value: number) => {
      setBrightness(value);
      brightnessRef.current = value;
      if (!deviceGuid) return;
      writeStoredBrightness(deviceGuid, value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void sendCommand(lightBrightnessCommand(value));
      }, CALIBRATION_PREVIEW_DEBOUNCE_MS);
    },
    [deviceGuid, sendCommand],
  );

  if (!isConnected || !deviceGuid) return null;

  return (
    <div className={cn("flex flex-col gap-1.5 px-1", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("lightBrightnessSlider.label")}
        </span>
        <span className="text-sm font-bold">{brightness}%</span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={brightness}
        onValueChange={handleChange}
        aria-label={t("lightBrightnessSlider.label")}
      />
    </div>
  );
}
