/**
 * SWU pricing via TCGCSV, a free no-key daily mirror of TCGplayer prices
 * (TCGplayer itself no longer grants new API access).
 *
 * Join key is (expansion code, card number), NOT serialCode, which TCGplayer
 * does not carry. Every visually distinct printing has its own card number in
 * both catalogs and the ranges agree exactly, so this matched 100% of sampled
 * cards across SOR/JTL/ASH.
 *
 * Foil is the one axis a scan cannot resolve - same art and frame, different
 * surface - so both prices are stored and the UI chooses via its existing
 * isFoil toggle. Hyperspace/Showcase/Prestige/promos are separately numbered
 * printings with their own art and their own image vector, so those come out
 * of the scan itself.
 */
import type { PlayingCard } from "@magic-vault/shared";

import { CARD_API_HEADERS } from "../card-search/constants";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const SWU_CATEGORY_ID = 79;
// TCGCSV regenerates once a day, so anything shorter just re-fetches the same
// numbers. Cache is per-process; a restart re-warms on first search.
const TTL_MS = 24 * 60 * 60 * 1000;

export interface CardPrice {
  normal: number | null;
  foil: number | null;
}

interface TcgProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
}

interface TcgPrice {
  productId: number;
  marketPrice: number | null;
  subTypeName: string;
}

interface TcgGroup {
  groupId: number;
  abbreviation: string | null;
}

type PriceIndex = Map<string, CardPrice>;

const setCache = new Map<string, { at: number; index: PriceIndex }>();
let groupCache: { at: number; groups: TcgGroup[] } | null = null;

async function getJson<T>(url: string): Promise<{ results?: T[] } | null> {
  // TCGCSV answers 401 to a request with no explicit User-Agent, which is what
  // node's fetch sends by default - CARD_API_HEADERS supplies one.
  const res = await fetch(url, { headers: CARD_API_HEADERS });
  if (!res.ok) return null;
  return res.json() as Promise<{ results?: T[] }>;
}

async function getGroups(): Promise<TcgGroup[]> {
  if (groupCache && Date.now() - groupCache.at < TTL_MS) return groupCache.groups;
  const json = await getJson<TcgGroup>(`${TCGCSV_BASE}/${SWU_CATEGORY_ID}/groups`);
  const groups = json?.results ?? [];
  if (groups.length > 0) groupCache = { at: Date.now(), groups };
  return groups;
}

/**
 * "94/264" -> "94", "265" -> "265". Base-set cards carry a `/total` suffix and
 * variant printings do not, so only the leading digits are comparable.
 */
function normalizeNumber(raw: string | undefined): string | null {
  const match = /^(\d+)/.exec(raw ?? "");
  return match ? String(Number(match[1])) : null;
}

function extended(product: TcgProduct, field: string): string | undefined {
  return product.extendedData?.find((entry) => entry.name === field)?.value;
}

async function buildIndex(setCode: string): Promise<PriceIndex> {
  const index: PriceIndex = new Map();
  // An expansion can span several TCGplayer groups (a set plus its weekly-play
  // promo group share an abbreviation), so merge every group that matches.
  const groups = (await getGroups()).filter((g) => g.abbreviation === setCode);

  for (const group of groups) {
    const [products, prices] = await Promise.all([
      getJson<TcgProduct>(`${TCGCSV_BASE}/${SWU_CATEGORY_ID}/${group.groupId}/products`),
      getJson<TcgPrice>(`${TCGCSV_BASE}/${SWU_CATEGORY_ID}/${group.groupId}/prices`),
    ]);
    if (!products?.results || !prices?.results) continue;

    const bySubType = new Map<number, Map<string, number | null>>();
    for (const price of prices.results) {
      const entry = bySubType.get(price.productId) ?? new Map();
      entry.set(price.subTypeName, price.marketPrice);
      bySubType.set(price.productId, entry);
    }

    for (const product of products.results) {
      const number = normalizeNumber(extended(product, "Number"));
      const subTypes = bySubType.get(product.productId);
      // Sealed product (booster boxes, displays) has no card number - skip it.
      if (!number || !subTypes || index.has(number)) continue;
      index.set(number, {
        normal: subTypes.get("Normal") ?? null,
        foil: subTypes.get("Foil") ?? null,
      });
    }
  }

  return index;
}

async function getIndex(setCode: string): Promise<PriceIndex> {
  const cached = setCache.get(setCode);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;

  const index = await buildIndex(setCode);
  // Cache even an empty result, so a set TCGplayer does not carry is not
  // re-fetched on every scan. TTL still lets it recover later.
  setCache.set(setCode, { at: Date.now(), index });
  return index;
}

/**
 * Fills in price/priceFoil in place. Never throws and never rejects: a pricing
 * outage must not fail a card search, it just leaves the prices null.
 */
export async function attachPrices(cards: PlayingCard[]): Promise<void> {
  const setCodes = [...new Set(cards.map((c) => c.set).filter(Boolean))];
  if (setCodes.length === 0) return;

  try {
    const indexes = new Map(
      await Promise.all(
        setCodes.map(async (code) => [code, await getIndex(code)] as const),
      ),
    );

    for (const card of cards) {
      const price = indexes.get(card.set)?.get(card.collectorNumber);
      if (!price) continue;
      // Inherently-foil printings (Showcase, Serialized, Hyperspace Foil) are
      // only listed as Foil, so fall back to it for the plain price rather than
      // showing nothing for a card that has exactly one real market value.
      card.price = price.normal ?? price.foil;
      card.priceFoil = price.foil;
    }
  } catch {
    // Leave prices as-is.
  }
}

/** Test seam - lets the self-check run without hitting the network twice. */
export function __primeCacheForTest(setCode: string, index: PriceIndex): void {
  setCache.set(setCode, { at: Date.now(), index });
}
