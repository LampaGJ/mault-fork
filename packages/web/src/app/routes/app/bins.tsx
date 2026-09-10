import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  BinConfigsProvider,
  useBinConfigs,
} from "@/features/bins/api/use-bin-configs";
import { BinConfigPanel } from "@/features/bins/components/bin-config-panel";
import { BinList } from "@/features/bins/components/bin-list";
import { BinMachineLayout } from "@/features/bins/components/bin-machine-layout";
import { NoGameBanner } from "@/features/bins/components/no-game-banner";
import { NonEnglishRulesBanner } from "@/features/bins/components/non-english-rules-banner";
import { PresetSelector } from "@/features/bins/components/preset-selector";
import { SortingSetsPanel } from "@/features/bins/components/sorting-sets-panel";
import { useCollections } from "@/features/collections/api/use-collections";
import { CollectionSwitcher } from "@/features/collections/components/collection-switcher";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { IconLayoutGrid } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

function MobileBins() {
  const { t } = useTranslation("bins");
  const { selectedBin } = useBinConfigs();

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden">
      <div className="size-full overflow-y-auto @container p-4">
        <BinConfigPanel />
      </div>
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/90 backdrop-blur-sm border rounded-full px-4 py-2 text-sm font-medium shadow-lg"
          >
            <IconLayoutGrid size={16} />
            {t("binsPage.binLabel", { number: selectedBin })}
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <div className="overflow-y-auto p-4 flex flex-col gap-4 max-h-[calc(80vh-2rem)]">
            <CollectionSwitcher />
            <PresetSelector />
            <BinList />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default function BinsPage() {
  const isMobile = useIsMobile();
  const { collectionGuid } = useParams<{ collectionGuid: string }>();
  const { activeCollection } = useCollections();
  const navigate = useNavigate();

  const seenGuid = useRef(activeCollection?.guid);
  useEffect(() => {
    if (
      activeCollection &&
      activeCollection.guid !== seenGuid.current &&
      activeCollection.guid !== collectionGuid
    ) {
      navigate(`/app/collections/${activeCollection.guid}/bins`, {
        replace: true,
      });
    }
    seenGuid.current = activeCollection?.guid;
  }, [activeCollection, collectionGuid, navigate]);

  const content = isMobile ? (
    <MobileBins />
  ) : (
    <div className="grid grid-cols-12 flex-1 min-h-0 overflow-hidden">
      {/* Sidebar owns which setup is loaded; the machine diagram and the rule
          editor sit together, since picking a bin off the diagram is what
          drives the editor. Mobile keeps the flat BinList - a three-column
          machine does not fit a drawer. */}
      <section className="col-span-4 lg:col-span-3 overflow-y-auto flex flex-col h-full border-r p-2 gap-2 bg-sidebar/70">
        <CollectionSwitcher />
        <SortingSetsPanel />
      </section>
      <section className="col-span-8 lg:col-span-9 overflow-hidden max-h-full @container">
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          <div className="shrink-0 overflow-y-auto border-b p-3 lg:w-[26rem] lg:border-b-0 lg:border-r">
            <BinMachineLayout />
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <BinConfigPanel />
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <BinConfigsProvider collectionGuid={collectionGuid}>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <NoGameBanner />
        <NonEnglishRulesBanner />
        {content}
      </div>
    </BinConfigsProvider>
  );
}
