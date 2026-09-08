import type { PlayingCard, Result } from "@magic-vault/shared";
import { CARD_API_HEADERS } from "../card-search/constants";
import { fetchCardApi } from "../card-search/fetch";
import type { CardSearchAdapter } from "../card-search/types";
import { validateQuery } from "../card-search/validate";
import { SwuCardListResponse, SwuCard } from "./api-types";

export const SWU_DEFAULT_URL = "https://admin.starwarsunlimited.com/api/card-list";

function proxiedImageUrl(url: string): string {
  return `/api/cards/image-proxy?url=${encodeURIComponent(url)}`;
}

function normalizeSwuCard(raw: SwuCard): PlayingCard {
  const attrs = raw.attributes;
  // cardId is null for the vast majority of cards (~9,050 of 9,185 on the
  // live API) - cardNumber is NOT a safe fallback since it's only unique
  // within a single set (small integers that collide across expansions).
  // serialCode is present on every card and is unique per printing.
  const id = String(attrs.cardId ?? attrs.serialCode ?? "");

  // Get image URL from artFront
  const imageUrl = attrs.artFront?.data?.attributes?.formats?.card?.url;
  const image = imageUrl ? { small: proxiedImageUrl(imageUrl), normal: proxiedImageUrl(imageUrl) } : null;

  // Normalize rarity to lowercase
  const rarity = (attrs.rarity?.data?.attributes?.name ?? "").toLowerCase();

  // Get card type
  const typeName = attrs.type?.data?.attributes?.name ?? "";

  // Get aspect(s) - join multiple if present
  const aspects = attrs.aspects?.data?.map(a => a.attributes?.name ?? "").filter(Boolean) ?? [];

  // Combine type and aspects into typeLine
  const typeLine = [typeName, ...aspects].filter(Boolean).join(" - ");

  return {
    id,
    name: attrs.title ?? "",
    image,
    set: attrs.serialCode ?? "",
    setName: attrs.serialCode ?? "",
    collectorNumber: String(attrs.cardNumber ?? id),
    rarity,
    typeLine,
    text: attrs.text || attrs.deployBox || attrs.epicAction || undefined,
    power: attrs.power != null ? String(attrs.power) : undefined,
    toughness: attrs.hp != null ? String(attrs.hp) : undefined,
    colorIdentity: aspects,
    artist: attrs.artist || undefined,
    price: null,
    priceFoil: null,
    sourceUrl: undefined,
    cmc: typeof attrs.cost === "number" ? attrs.cost : undefined,
    raw,
  };
}

function extractRows(json: unknown): SwuCard[] {
  const parsed = SwuCardListResponse.safeParse(json);
  if (parsed.success) {
    return parsed.data.data;
  }
  // Fallback: if json is array
  if (Array.isArray(json)) {
    return json as SwuCard[];
  }
  return [];
}

function extractOne(json: unknown): SwuCard | null {
  const parsed = SwuCard.safeParse(json);
  if (parsed.success) {
    return parsed.data;
  }
  return null;
}

export async function Search(
  query: string,
  baseUrl: string = SWU_DEFAULT_URL,
  _lang: string = "en",
): Promise<Result<PlayingCard[]>> {
  const invalid = validateQuery(query);
  if (invalid) return invalid;

  // filters[title][$containsi] is required - a bare `?title=X` (no filters[]
  // wrapper) is silently ignored by Strapi and returns the unfiltered
  // default page instead of erroring, so this must never be simplified back
  // to a bare param. $containsi = case-insensitive substring match.
  const url = `${baseUrl}?filters[title][$containsi]=${encodeURIComponent(query)}`;
  const response = await fetchCardApi(url, { headers: CARD_API_HEADERS });

  if (response.status === 404) {
    return {
      message: `No cards were found with the query: ${query}`,
      success: false,
    };
  }

  if (!response.ok) {
    return {
      message: "Failed to fetch from the Star Wars Unlimited API.",
      success: false,
    };
  }

  const rows = extractRows(await response.json());

  return {
    message: "Cards successfully retrieved.",
    data: rows.map(normalizeSwuCard),
    success: true,
  };
}

async function fetchByFilter(
  baseUrl: string,
  field: "cardId" | "serialCode",
  value: string,
): Promise<SwuCard | null> {
  // Strapi silently ignores an unrecognized bare query param instead of
  // erroring - `?cardId=X` (no filters[] wrapper) is a no-op that returns
  // the default unfiltered page, not a 0-result response. Always use the
  // filters[...] wrapper or this returns whatever the first default-listed
  // card happens to be, not the requested one.
  const response = await fetchCardApi(
    `${baseUrl}?filters[${field}]=${encodeURIComponent(value)}`,
    { headers: CARD_API_HEADERS },
  );
  if (!response.ok) return null;
  const rows = extractRows(await response.json());
  return rows[0] ?? null;
}

export async function SearchById(
  id: string,
  baseUrl: string = SWU_DEFAULT_URL,
): Promise<Result<PlayingCard>> {
  // `id` may be a real cardId, or the serialCode fallback used when cardId
  // is null (the majority of cards - see normalizeSwuCard/sync.ts comments).
  // Try cardId first, fall back to serialCode.
  let raw: SwuCard | null;
  try {
    raw = await fetchByFilter(baseUrl, "cardId", id);
    if (!raw) raw = await fetchByFilter(baseUrl, "serialCode", id);
  } catch (err) {
    return {
      success: false,
      message: `Star Wars Unlimited API error fetching card ${id}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!raw) {
    return { success: false, message: `Card ${id} not found.` };
  }

  return {
    success: true,
    message: "Successfully fetched card by id.",
    data: normalizeSwuCard(raw),
  };
}

export const swuAdapter: CardSearchAdapter = {
  defaultUrl: SWU_DEFAULT_URL,
  search: Search,
  searchById: SearchById,
};
