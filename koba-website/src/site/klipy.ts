// Klipy's own integration terms require requests to originate from the
// end-user's browser, not a partner-operated server/proxy (see
// https://docs.klipy.com/stickers-api/stickers-search-api, "Integration
// Requirements" -> "Send requests from the end-user client"). That's why
// this calls api.klipy.com directly from client code instead of going
// through a server route, and why the app key is a VITE_-prefixed env var
// (reaches the browser bundle by design, same as every other VITE_ var in
// this project) rather than a server-only secret like STRIPE_SECRET_KEY.
// Klipy's own key design embeds it in the URL path, so it was never meant
// to be a hidden secret the way a Stripe key is - it's a rate-limited,
// revocable client identifier, same model as a Tenor/Giphy client key.

const KLIPY_BASE = "https://api.klipy.com/api/v1";

export interface KlipyItem {
  id: string;
  title: string;
  previewUrl: string;
  fullUrl: string;
}

interface KlipyFileVariant {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface KlipyFileSize {
  gif?: KlipyFileVariant;
  webp?: KlipyFileVariant;
  webm?: KlipyFileVariant;
  png?: KlipyFileVariant;
}

interface KlipyRawItem {
  id: number;
  slug: string;
  title: string;
  file: {
    hd?: KlipyFileSize;
    md?: KlipyFileSize;
    sm?: KlipyFileSize;
    xs?: KlipyFileSize;
  };
}

interface KlipyResponse {
  result: boolean;
  data: {
    data: KlipyRawItem[];
    current_page: number;
    per_page: number;
    has_next: boolean;
  };
}

export function klipyConfigured() {
  return Boolean(appKey());
}

function appKey() {
  return (import.meta.env.VITE_KLIPY_APP_KEY as string | undefined)?.trim();
}

function normalize(raw: KlipyRawItem): KlipyItem | null {
  const preview = raw.file.sm?.webp ?? raw.file.sm?.gif ?? raw.file.xs?.webp ?? raw.file.xs?.gif;
  const full = raw.file.md?.webp ?? raw.file.md?.gif ?? preview;
  if (!preview || !full) return null;
  return { id: String(raw.id), title: raw.title, previewUrl: preview.url, fullUrl: full.url };
}

async function call(kind: "gifs" | "stickers", op: "search" | "trending", query: string): Promise<KlipyItem[]> {
  const key = appKey();
  if (!key) return [];
  const params = new URLSearchParams({ page: "1", per_page: "24", content_filter: "medium" });
  if (op === "search") {
    if (!query.trim()) return [];
    params.set("q", query.trim());
  }
  const url = `${KLIPY_BASE}/${key}/${kind}/${op}?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const body = (await response.json()) as KlipyResponse;
  if (!body.result) return [];
  return body.data.data.map(normalize).filter((item): item is KlipyItem => item !== null);
}

export const klipySearchGifs = (query: string) => call("gifs", "search", query);
export const klipyTrendingGifs = () => call("gifs", "trending", "");
export const klipySearchStickers = (query: string) => call("stickers", "search", query);
export const klipyTrendingStickers = () => call("stickers", "trending", "");
