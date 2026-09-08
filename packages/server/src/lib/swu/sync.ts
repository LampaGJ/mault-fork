import { CARD_API_HEADERS } from "../card-search/constants";
import type { SyncSource, SyncSourceCard } from "../card-search/sync-types";
import { SWU_DEFAULT_URL } from "./search";
import { SwuCardListResponse } from "./api-types";

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

async function fetchCards(
  baseUrl: string,
  addLog: (msg: string) => void,
  _lang?: string,
  signal?: AbortSignal,
): Promise<SyncSourceCard[]> {
  addLog("Fetching Star Wars Unlimited catalog...");

  const url = baseUrl;
  const res = await fetch(url, { headers: CARD_API_HEADERS, signal });
  if (!res.ok) {
    throw new Error(`Star Wars Unlimited card list fetch failed: ${res.status}`);
  }

  const rows = extractRows(await res.json());
  addLog(`Fetched ${rows.length} cards.`);

  return rows.map((c) => ({
    id: String(c.attributes?.cardId ?? c.attributes?.cardNumber ?? ""),
    name: c.attributes?.title ?? "",
    setCode: c.attributes?.serialCode ?? "",
    imageUrl: c.attributes?.artFront?.data?.attributes?.formats?.card?.url,
  }));
}

async function fetchOne(id: string, baseUrl: string) {
  const url = `${baseUrl}?cardId=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: CARD_API_HEADERS });
  if (!res.ok) {
    return null;
  }

  const rows = extractRows(await res.json());
  if (!rows || rows.length === 0) {
    return null;
  }

  const raw = rows[0];
  if (!raw) {
    return null;
  }

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
