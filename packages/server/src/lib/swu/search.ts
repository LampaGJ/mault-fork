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
  const id = String(attrs.cardId ?? attrs.cardNumber ?? "");

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

  const url = `${baseUrl}?title=${encodeURIComponent(query)}`;
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

export async function SearchById(
  id: string,
  baseUrl: string = SWU_DEFAULT_URL,
): Promise<Result<PlayingCard>> {
  const response = await fetchCardApi(`${baseUrl}?cardId=${encodeURIComponent(id)}`, {
    headers: CARD_API_HEADERS,
  });

  if (!response.ok) {
    return {
      success: false,
      message: `Star Wars Unlimited API error: ${response.status} for card ${id}`,
    };
  }

  const data = await response.json();
  const rows = extractRows(data);

  if (!rows || rows.length === 0) {
    return { success: false, message: `Card ${id} not found.` };
  }

  const raw = rows[0];
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
