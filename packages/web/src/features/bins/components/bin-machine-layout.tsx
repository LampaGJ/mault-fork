import { Badge } from "@/components/ui/badge";
import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { RuleSummary } from "@/features/bins/components/rule-summary";
import { useBinRoutes } from "@/features/calibration/api/use-bin-routes";
import { cn } from "@/lib/utils";
import type { BinConfig, BinDirection } from "@magic-vault/shared";
import { IconChevronDown } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Stage {
  module: number;
  left?: number;
  right?: number;
}

/**
 * Cards enter at the top and fall past one stage at a time; each stage can kick
 * a card left or right, and whatever survives every stage lands in the bin at
 * the bottom. That is the machine, so that is the layout - reading the screen
 * should tell you which physical bin to empty.
 *
 * Stages come from the calibration routes when they exist. Before an org has
 * calibrated there are none, so bins pair up by the same rule the firmware
 * defaults to (computeBinCount: module n owns bins 2n-1 and 2n, last bin is the
 * catch-all).
 */
function useStages(configs: BinConfig[]): { stages: Stage[]; bottomBin?: number } {
  const { routes } = useBinRoutes();

  return useMemo(() => {
    if (routes.length > 0) {
      const byModule = new Map<number, Stage>();
      let bottom: number | undefined;
      for (const route of routes) {
        if (route.direction === ("bottom" satisfies BinDirection)) {
          bottom = route.binNumber;
          continue;
        }
        const stage = byModule.get(route.module) ?? { module: route.module };
        stage[route.direction === "left" ? "left" : "right"] = route.binNumber;
        byModule.set(route.module, stage);
      }
      return {
        stages: [...byModule.values()].sort((a, b) => a.module - b.module),
        bottomBin: bottom,
      };
    }

    const numbers = configs.map((c) => c.binNumber).sort((a, b) => a - b);
    const catchAll = configs.find((c) => c.isCatchAll)?.binNumber;
    const paired = numbers.filter((n) => n !== catchAll);
    const stages: Stage[] = [];
    for (let i = 0; i < paired.length; i += 2) {
      stages.push({
        module: i / 2 + 1,
        left: paired[i],
        right: paired[i + 1],
      });
    }
    return { stages, bottomBin: catchAll ?? numbers.at(-1) };
  }, [routes, configs]);
}

function countConditions(config: BinConfig): number {
  const walk = (items: BinConfig["rules"]["conditions"]): number =>
    items.reduce(
      (n, item) => n + ("combinator" in item ? walk(item.conditions) : 1),
      0,
    );
  return walk(config.rules.conditions);
}

function BinSlot({
  config,
  side,
  active,
  onClick,
}: {
  config?: BinConfig;
  side: "left" | "right" | "bottom";
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("bins");
  if (!config) return <div aria-hidden="true" />;

  const count = countConditions(config);
  const empty = count === 0 && !config.isCatchAll;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-1 border p-2 text-left transition-colors",
        "rounded-md bg-card hover:border-primary/50",
        active && "border-primary bg-primary/10 ring-1 ring-primary/40",
        !active && empty && "border-dashed",
        side === "left" && "items-end text-right",
      )}
    >
      <span
        className={cn(
          "flex w-full items-center gap-1.5",
          side === "left" && "flex-row-reverse",
        )}
      >
        <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("binMachine.binLabel", { number: config.binNumber })}
        </span>
        {config.isCatchAll ? (
          <Badge variant="default" className="h-4 px-1.5 text-[10px]">
            {t("binMachine.catchAll")}
          </Badge>
        ) : (
          !empty && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {count}
            </Badge>
          )
        )}
      </span>
      <span className="line-clamp-2 w-full text-xs text-foreground/80">
        {config.isCatchAll ? (
          t("binMachine.allUnmatched")
        ) : empty ? (
          <span className="text-muted-foreground">{t("binMachine.empty")}</span>
        ) : (
          <RuleSummary rules={config.rules} />
        )}
      </span>
    </button>
  );
}

export function BinMachineLayout() {
  const { t } = useTranslation("bins");
  const { configs, selectedBin, setSelectedBin, hasCatchAll } = useBinConfigs();
  const { stages, bottomBin } = useStages(configs);
  const byNumber = useMemo(
    () => new Map(configs.map((c) => [c.binNumber, c])),
    [configs],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("binMachine.title")}
        </p>
        <p className="font-heading text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {t("binMachine.stageCount", { count: stages.length })}
        </p>
      </div>

      <div className="rounded-lg border bg-sidebar/40 p-3">
        {/* Cards are fed in at the top. */}
        <div className="mb-1 flex flex-col items-center gap-1">
          <span className="font-heading text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("binMachine.feed")}
          </span>
          <IconChevronDown className="size-3.5 text-muted-foreground/60" />
        </div>

        {stages.map((stage, index) => (
          <div key={stage.module}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <BinSlot
                config={stage.left ? byNumber.get(stage.left) : undefined}
                side="left"
                active={stage.left === selectedBin}
                onClick={() => stage.left && setSelectedBin(stage.left)}
              />

              {/* The stage itself: the chute the card falls through. */}
              <div className="flex w-16 flex-col items-center">
                <div className="flex h-full w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 px-1 py-2">
                  <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {t("binMachine.stage")}
                  </span>
                  <span className="font-heading text-base font-semibold leading-none text-foreground">
                    {stage.module}
                  </span>
                </div>
              </div>

              <BinSlot
                config={stage.right ? byNumber.get(stage.right) : undefined}
                side="right"
                active={stage.right === selectedBin}
                onClick={() => stage.right && setSelectedBin(stage.right)}
              />
            </div>

            {index < stages.length - 1 && (
              <div className="flex justify-center py-1">
                <IconChevronDown className="size-3.5 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ))}

        {/* Anything no stage claimed falls through to the bin underneath. */}
        {bottomBin !== undefined && (
          <>
            <div className="flex justify-center py-1">
              <IconChevronDown className="size-3.5 text-muted-foreground/50" />
            </div>
            <BinSlot
              config={byNumber.get(bottomBin)}
              side="bottom"
              active={bottomBin === selectedBin}
              onClick={() => setSelectedBin(bottomBin)}
            />
          </>
        )}
      </div>

      {!hasCatchAll && (
        <p className="text-xs text-destructive">{t("binList.needCatchAll")}</p>
      )}
    </div>
  );
}
