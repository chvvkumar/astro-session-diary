import type {
  ImageListResponse,
  ImageDetail,
  TargetSearchResult,
  ScanResult,
  ScanStatus,
  ImageFilters,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

function buildQuery(filters: ImageFilters): string {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.page_size));
  if (filters.target_name) params.set("target_name", filters.target_name);
  if (filters.filter_used) params.set("filter_used", filters.filter_used);
  if (filters.image_type) params.set("image_type", filters.image_type);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.min_exposure != null) params.set("min_exposure", String(filters.min_exposure));
  if (filters.max_exposure != null) params.set("max_exposure", String(filters.max_exposure));
  if (filters.header_key) params.set("header_key", filters.header_key);
  if (filters.header_value) params.set("header_value", filters.header_value);
  return params.toString();
}

export const api = {
  listImages: (filters: ImageFilters) =>
    fetchJson<ImageListResponse>(`/images?${buildQuery(filters)}`),

  getImage: (id: string) =>
    fetchJson<ImageDetail>(`/images/${id}`),

  getAvailableFilters: () =>
    fetchJson<string[]>("/images/filters/available"),

  searchTargets: (query: string) =>
    fetchJson<TargetSearchResult[]>(`/targets/search?q=${encodeURIComponent(query)}`),

  triggerScan: () =>
    fetchJson<ScanResult>("/scan", { method: "POST" }),

  getScanStatus: () =>
    fetchJson<ScanStatus>("/scan/status"),

  thumbnailUrl: (path: string) => {
    const base = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:8000";
    const filename = path.split("/").pop();
    return `${base}/thumbnails/${filename}`;
  },
};
