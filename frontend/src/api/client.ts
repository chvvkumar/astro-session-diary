import type {
  TargetAggregationResponse,
  SessionDetail,
  EquipmentList,
  TargetSearchResult,
  ScanResult,
  ScanStatus,
  ActiveFilters,
  StatsResponse,
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

function buildTargetQuery(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.searchQuery) params.set("search", filters.searchQuery);
  if (filters.camera) params.set("camera", filters.camera);
  if (filters.telescope) params.set("telescope", filters.telescope);
  if (filters.opticalFilters.length > 0) {
    params.set("filters", filters.opticalFilters.join(","));
  }
  if (filters.dateRange.start) params.set("date_from", filters.dateRange.start);
  if (filters.dateRange.end) params.set("date_to", filters.dateRange.end);
  for (const fq of filters.fitsQueries) {
    params.append("fits_key", fq.key);
    params.append("fits_op", fq.operator);
    params.append("fits_val", fq.value);
  }
  return params.toString();
}

export const api = {
  getTargets: (filters: ActiveFilters) =>
    fetchJson<TargetAggregationResponse>(`/targets?${buildTargetQuery(filters)}`),

  getSessionDetail: (targetId: string, date: string) =>
    fetchJson<SessionDetail>(`/targets/${encodeURIComponent(targetId)}/sessions/${date}`),

  getEquipment: () =>
    fetchJson<EquipmentList>("/targets/equipment"),

  searchTargets: (query: string) =>
    fetchJson<TargetSearchResult[]>(`/targets/search?q=${encodeURIComponent(query)}`),

  getStats: () =>
    fetchJson<StatsResponse>("/stats"),

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
