import { CARD_API_HEADERS } from "../card-search/constants";
import type { SyncSource, SyncSourceCard } from "../card-search/sync-types";
import { SWU_DEFAULT_URL } from "./search";
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

// Canonical printing = variantOf is null. Kept even when reprintOf is set
// (a reprint is still the correct printing to associate with its own set) -
// see ../swu-labels/src/ingest.ts:111-130 for the empirically-verified
// rationale this mirrors.
function isCanonical(card: SwuCard): boolean {
  return card.attributes.variantOf?.data == null;
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

  const canonical = all.filter(isCanonical);
  addLog(`Fetched ${all.length} total cards, ${canonical.length} canonical.`);

  return canonical.map((c) => ({
    // cardId is null for the vast majority of cards - cardNumber is NOT a
    // safe fallback (only unique within one set); serialCode is unique per
    // printing and present on every card. See search.ts's matching comment.
    id: String(c.attributes?.cardId ?? c.attributes?.serialCode ?? ""),
    name: c.attributes?.title ?? "",
    setCode: c.attributes?.serialCode ?? "",
    imageUrl: c.attributes?.artFront?.data?.attributes?.formats?.card?.url,
  }));
}

async function fetchByFilter(
  baseUrl: string,
  field: "cardId" | "serialCode",
  value: string,
) {
  // Strapi silently ignores an unrecognized bare query param (`?cardId=X`
  // with no filters[] wrapper is a no-op returning the default unfiltered
  // page) - always use filters[...] or this returns the wrong card. See
  // search.ts's matching comment.
  const url = `${baseUrl}?filters[${field}]=${encodeURIComponent(value)}`;
  const res = await fetch(url, { headers: CARD_API_HEADERS });
  if (!res.ok) return null;
  const rows = extractRows(await res.json());
  return rows[0] ?? null;
}

async function fetchOne(id: string, baseUrl: string) {
  // `id` may be a real cardId, or the serialCode fallback used when cardId
  // is null (the majority of cards). Try cardId first, fall back to serialCode.
  const raw = (await fetchByFilter(baseUrl, "cardId", id)) ?? (await fetchByFilter(baseUrl, "serialCode", id));
  if (!raw) return null;

  return {
    name: raw.attributes?.title ?? "",
    setCode: raw.attributes?.serialCode ?? "",
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
