import type { SyncSource, SyncSourceCard } from "../../card-search/sync-types";
import { CARD_API_HEADERS } from "../../constants/card-search";
import { SWU_DEFAULT_URL } from "../../constants/urls";
import { SwuCardListResponse, type SwuCard } from "./api-types";

function extractRows(json: unknown) {
  const parsed = SwuCardListResponse.safeParse(json);
  if (parsed.success) {
    return parsed.data.data;
  }
  // Fallback: if json is array
  if (Array.isArray(json)) {
    return json;
  }
  return [];
}

const PAGE_SIZE = 100;

function buildPageUrl(baseUrl: string, page: number): string {
  return `${baseUrl}?pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}`;
}

async function fetchCards(
  baseUrl: string,
  addLog: (msg: string) => void,
  _lang?: string,
  signal?: AbortSignal,
): Promise<SyncSourceCard[]> {
  addLog("Fetching Star Wars Unlimited catalog...");

  const all: SwuCard[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const res = await fetch(buildPageUrl(baseUrl, page), { headers: CARD_API_HEADERS, signal });
    if (!res.ok) {
      throw new Error(`Star Wars Unlimited card list fetch failed: ${res.status} (page ${page})`);
    }

    const parsed = SwuCardListResponse.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(`Star Wars Unlimited card list response failed schema validation (page ${page}): ${parsed.error.message}`);
    }

    all.push(...parsed.data.data);
    pageCount = parsed.data.meta?.pagination.pageCount ?? page;
    addLog(`Fetched page ${page}/${pageCount} (${all.length} cards so far)...`);
    page += 1;
  } while (page <= pageCount);

  addLog(`Fetched ${all.length} total cards. Every printing (Standard, Hyperspace, Foil, Showcase, Prestige, promos, etc.) is synced as its own distinct card.`);

  return all.map((c) => ({
    // cardId identifies the card CONCEPT and is shared across all of a
    // card's printings/variants - serialCode is the only field that's both
    // present on every card and unique per printing. See search.ts's
    // matching comment on normalizeSwuCard.
    id: c.attributes?.serialCode ?? "",
    name: c.attributes?.title ?? "",
    setCode: c.attributes?.expansion?.data?.attributes?.code ?? c.attributes?.serialCode ?? "",
    imageUrl: c.attributes?.artFront?.data?.attributes?.formats?.card?.url,
  }));
}

async function fetchByFilter(baseUrl: string, serialCode: string) {
  // Strapi silently ignores an unrecognized bare query param (`?serialCode=X`
  // with no filters[] wrapper is a no-op returning the default unfiltered
  // page) - always use filters[...] or this returns the wrong card. See
  // search.ts's matching comment.
  const url = `${baseUrl}?filters[serialCode]=${encodeURIComponent(serialCode)}`;
  const res = await fetch(url, { headers: CARD_API_HEADERS });
  if (!res.ok) return null;
  const rows = extractRows(await res.json());
  return rows[0] ?? null;
}

async function fetchOne(id: string, baseUrl: string) {
  // id is always a serialCode (unique per printing) - see search.ts's
  // normalizeSwuCard comment.
  const raw = await fetchByFilter(baseUrl, id);
  if (!raw) return null;

  return {
    name: raw.attributes?.title ?? "",
    setCode: raw.attributes?.expansion?.data?.attributes?.code ?? raw.attributes?.serialCode ?? "",
    imageUrl: raw.attributes?.artFront?.data?.attributes?.formats?.card?.url,
  };
}

export const swuSyncSource: SyncSource = {
  gameKey: "swu",
  label: "Star Wars Unlimited",
  defaultUrl: SWU_DEFAULT_URL,
  fetchHeaders: CARD_API_HEADERS,
  languages: ["en"],
  fetchCards,
  fetchOne,
};
