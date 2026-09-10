import { AuditDrawer, type AuditEntry } from "@/components/audit-drawer";
import { DeleteDialog } from "@/components/delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DynamicDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  binsQueryOptions,
  getBinSetHistory,
  revertBinSet,
  type BinSetAuditEntry,
} from "@/features/bins/api/sort-bins";
import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { useOrg } from "@/features/companies/api/use-organization";
import { cn } from "@/lib/utils";
import {
  createSetSchema,
  type CreateSetFormValues,
} from "@/schemas/sort-bins.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { BinConfig, BinRuleGroup, BinSet } from "@magic-vault/shared";
import {
  IconClockHour3,
  IconCopy,
  IconDots,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function countConditions(group: BinRuleGroup): number {
  return group.conditions.reduce((n, c) => {
    if ("combinator" in c) return n + countConditions(c as BinRuleGroup);
    return n + 1;
  }, 0);
}

interface SetStats {
  configured: number;
  conditions: number;
}

function statsFor(set: BinSet): SetStats {
  return set.bins.reduce<SetStats>(
    (acc, bin) => {
      const count = countConditions(bin.rules);
      if (count > 0 || bin.isCatchAll) acc.configured += 1;
      acc.conditions += count;
      return acc;
    },
    { configured: 0, conditions: 0 },
  );
}

/**
 * The whole point of the panel: tell two saved setups apart without loading
 * them. One cell per bin, filled where that bin actually routes something.
 */
function BinStrip({ set }: { set: BinSet }) {
  const { t } = useTranslation("bins");
  const bins = [...set.bins].sort((a, b) => a.binNumber - b.binNumber);

  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {bins.map((bin) => {
        const count = countConditions(bin.rules);
        return (
          <Tooltip key={bin.binNumber}>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "h-4 w-3 rounded-[3px] border transition-colors",
                    bin.isCatchAll
                      ? "border-dashed border-muted-foreground/60 bg-transparent"
                      : count > 0
                        ? "border-primary/70 bg-primary/70"
                        : "border-border bg-muted",
                  )}
                />
              }
            />
            <TooltipContent>
              {t("presetSelector.binLabel", { number: bin.binNumber })}
              {" — "}
              {bin.isCatchAll
                ? t("presetSelector.catchAll")
                : count === 0
                  ? t("presetSelector.noRules")
                  : t("presetSelector.conditionCount", { count })}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function BinSnapshotSummary({ snapshot }: { snapshot: BinConfig[] }) {
  const { t } = useTranslation("bins");
  return (
    <div className="flex flex-col gap-0.5">
      {snapshot.map((bin) => {
        const count = countConditions(bin.rules);
        return (
          <div key={bin.binNumber} className="flex gap-2">
            <span className="w-10 shrink-0 text-muted-foreground">
              {t("presetSelector.binLabel", { number: bin.binNumber })}
            </span>
            <span>
              {bin.isCatchAll
                ? t("presetSelector.catchAll")
                : count === 0
                  ? t("presetSelector.noRules")
                  : t("presetSelector.conditionCount", { count })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SortingSetsPanel() {
  const { t } = useTranslation("bins");
  const {
    sets,
    activateSet,
    createSet,
    saveSet,
    renameSet,
    deleteSet,
    selectedSet,
    isActivating,
    isPresetMutating,
  } = useBinConfigs();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const { isLoading } = useQuery({ ...binsQueryOptions, enabled: !!activeOrg });

  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BinSet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BinSet | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Which row is mid-activation, so only that row shows a spinner.
  const [pendingGuid, setPendingGuid] = useState<string | null>(null);

  const { data: historyResult, isLoading: historyLoading } = useQuery({
    queryKey: ["bins", "history", selectedSet?.guid],
    queryFn: () => getBinSetHistory(selectedSet!.guid),
    enabled: historyOpen && !!selectedSet?.guid,
    staleTime: 0,
  });

  const revertMutation = useMutation({
    mutationFn: revertBinSet,
    onSuccess: (result) => {
      if (result.success && result.data) {
        queryClient.setQueryData<BinSet[]>(["bins"], result.data);
        queryClient.invalidateQueries({
          queryKey: ["bins", "history", selectedSet?.guid],
        });
        setHistoryOpen(false);
        toast.success(t("presetSelector.revertSuccess"));
      }
    },
    onError: () => toast.error(t("presetSelector.revertFailed")),
  });

  const historyEntries = useMemo((): AuditEntry[] => {
    return (historyResult?.data ?? []).map((entry: BinSetAuditEntry) => ({
      guid: entry.guid,
      createdAt: entry.createdAt,
      body: <BinSnapshotSummary snapshot={entry.snapshot} />,
    }));
  }, [historyResult]);

  const createForm = useForm<CreateSetFormValues>({
    resolver: zodResolver(createSetSchema),
    defaultValues: { name: "" },
    mode: "onChange",
  });
  const duplicateForm = useForm<CreateSetFormValues>({
    resolver: zodResolver(createSetSchema),
    defaultValues: { name: "" },
    mode: "onChange",
  });
  const renameForm = useForm<CreateSetFormValues>({
    resolver: zodResolver(createSetSchema),
    defaultValues: { name: "" },
    mode: "onChange",
  });

  const handleActivate = useCallback(
    async (set: BinSet) => {
      if (set.isActive || isActivating) return;
      setPendingGuid(set.guid);
      try {
        await activateSet(set.guid);
      } finally {
        setPendingGuid(null);
      }
    },
    [activateSet, isActivating],
  );

  const handleCreate = useCallback(
    async (values: CreateSetFormValues) => {
      await createSet(values.name);
      createForm.reset();
      setCreateOpen(false);
    },
    [createSet, createForm],
  );

  // Copies the active set - that is what /api/bins/copies duplicates - so the
  // action is offered on the active row only.
  const handleDuplicate = useCallback(
    async (values: CreateSetFormValues) => {
      await saveSet(values.name);
      duplicateForm.reset();
      setDuplicateOpen(false);
    },
    [saveSet, duplicateForm],
  );

  const handleRename = useCallback(
    async (values: CreateSetFormValues) => {
      if (!renameTarget) return;
      await renameSet(renameTarget.guid, values.name);
      setRenameTarget(null);
    },
    [renameTarget, renameSet],
  );

  const openRename = useCallback(
    (set: BinSet) => {
      setRenameTarget(set);
      renameForm.reset({ name: set.name });
    },
    [renameForm],
  );

  const openDuplicate = useCallback(
    (set: BinSet) => {
      duplicateForm.reset({ name: t("sortingSets.copyName", { name: set.name }) });
      setDuplicateOpen(true);
    },
    [duplicateForm, t],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteSet(deleteTarget.guid);
    setDeleteTarget(null);
  }, [deleteTarget, deleteSet]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[4.5rem] w-full rounded-lg" />
        <Skeleton className="h-[4.5rem] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className="text-sm font-medium">
          {t("sortingSets.title")}
        </FieldLabel>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={isPresetMutating}
        >
          <IconPlus />
          {t("sortingSets.newSet")}
        </Button>
      </div>

      {sets.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {t("sortingSets.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sets.map((set) => {
            const { configured, conditions } = statsFor(set);
            const isPending = pendingGuid === set.guid;
            return (
              <li key={set.guid}>
                <div
                  className={cn(
                    "relative rounded-lg border bg-card p-3 transition-colors",
                    set.isActive
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* One activation target spanning the card. The action row
                        is overlaid rather than sharing the row, so the name can
                        truncate and the stats line stays on one line in a
                        narrow sidebar. */}
                    <button
                      type="button"
                      onClick={() => handleActivate(set)}
                      disabled={set.isActive || isActivating}
                      className="flex w-full min-w-0 flex-col items-start gap-1.5 text-left disabled:cursor-default"
                    >
                      <span className="flex min-w-0 max-w-full items-center gap-2 pr-9">
                        {isPending && (
                          <IconLoader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        )}
                        <span className="truncate font-medium">{set.name}</span>
                        {set.isActive && (
                          <Badge variant="default" className="shrink-0">
                            {t("sortingSets.active")}
                          </Badge>
                        )}
                      </span>
                      <BinStrip set={set} />
                      <span className="text-xs text-muted-foreground">
                        {t("sortingSets.binSummary", {
                          configured,
                          total: set.bins.length,
                        })}
                        {" · "}
                        {t("presetSelector.conditionCount", {
                          count: conditions,
                        })}
                      </span>
                    </button>

                    <div className="absolute right-2 top-2 shrink-0">
                      {/* One labelled menu instead of a row of bare icons: the
                          names are what made these actions findable, and a
                          narrow sidebar has no room for four icon buttons
                          beside a set name. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "size-7",
                          )}
                          aria-label={t("sortingSets.actionsFor", {
                            name: set.name,
                          })}
                        >
                          <IconDots className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {set.isActive && (
                            <>
                              <DropdownMenuItem
                                onClick={() => openDuplicate(set)}
                                disabled={isPresetMutating}
                              >
                                <IconCopy />
                                {t("sortingSets.duplicate")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setHistoryOpen(true)}
                              >
                                <IconClockHour3 />
                                {t("presetSelector.viewHistory")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => openRename(set)}
                            disabled={isPresetMutating}
                          >
                            <IconEdit />
                            {t("presetSelector.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(set)}
                            disabled={isPresetMutating || sets.length === 1}
                          >
                            <IconTrash />
                            {sets.length === 1
                              ? t("sortingSets.cannotDeleteLast")
                              : t("sortingSets.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <DynamicDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
        title={t("presetSelector.newSetTitle")}
        description={t("presetSelector.newSetDescription")}
      >
        <form
          onSubmit={createForm.handleSubmit(handleCreate)}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel>{t("presetSelector.setNameLabel")}</FieldLabel>
            <Input
              autoFocus
              placeholder={t("presetSelector.setNamePlaceholder")}
              {...createForm.register("name")}
            />
            {createForm.formState.errors.name && (
              <FieldError>
                {createForm.formState.errors.name.message}
              </FieldError>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              {t("presetSelector.cancel")}
            </Button>
            <Button type="submit" disabled={!createForm.formState.isValid}>
              {t("presetSelector.create")}
            </Button>
          </div>
        </form>
      </DynamicDialog>

      <DynamicDialog
        open={duplicateOpen}
        onOpenChange={(open) => {
          setDuplicateOpen(open);
          if (!open) duplicateForm.reset();
        }}
        title={t("sortingSets.duplicateTitle")}
        description={t("sortingSets.duplicateDescription")}
      >
        <form
          onSubmit={duplicateForm.handleSubmit(handleDuplicate)}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel>{t("presetSelector.setNameLabel")}</FieldLabel>
            <Input
              autoFocus
              placeholder={t("presetSelector.setNamePlaceholder")}
              {...duplicateForm.register("name")}
            />
            {duplicateForm.formState.errors.name && (
              <FieldError>
                {duplicateForm.formState.errors.name.message}
              </FieldError>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicateOpen(false)}
            >
              {t("presetSelector.cancel")}
            </Button>
            <Button type="submit" disabled={!duplicateForm.formState.isValid}>
              {t("sortingSets.duplicate")}
            </Button>
          </div>
        </form>
      </DynamicDialog>

      <DynamicDialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={t("presetSelector.renameSetTitle")}
        description={t("presetSelector.renameSetDescription")}
      >
        <form
          onSubmit={renameForm.handleSubmit(handleRename)}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel>{t("presetSelector.setNameLabel")}</FieldLabel>
            <Input
              autoFocus
              placeholder={t("presetSelector.setNamePlaceholder")}
              {...renameForm.register("name")}
            />
            {renameForm.formState.errors.name && (
              <FieldError>
                {renameForm.formState.errors.name.message}
              </FieldError>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
            >
              {t("presetSelector.cancel")}
            </Button>
            <Button type="submit" disabled={!renameForm.formState.isValid}>
              {t("presetSelector.rename")}
            </Button>
          </div>
        </form>
      </DynamicDialog>

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("presetSelector.deleteSetTitle")}
        description={t("presetSelector.deleteSetDescription", {
          name: deleteTarget?.name ?? "",
        })}
        onConfirm={handleDelete}
      />

      <AuditDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={t("presetSelector.historyTitle")}
        entries={historyEntries}
        isLoading={historyLoading}
        onRevert={(guid) => revertMutation.mutate(guid)}
        isReverting={revertMutation.isPending}
      />
    </div>
  );
}
