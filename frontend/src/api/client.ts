import type {
  TargetAggregationResponse,
  SessionDetail,
  EquipmentList,
  TargetSearchResult,
  ScanResult,
  ScanStatus,
  ActiveFilters,
  StatsResponse,
  TargetDetailResponse,
  SettingsResponse,
  GeneralSettings,
  FilterConfig,
  EquipmentConfig,
  SuggestionsResponse,
  DiscoveredResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

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

  getTargetDetail: (targetId: string) =>
    fetchJson<TargetDetailResponse>(`/targets/${encodeURIComponent(targetId)}/detail`),

  getEquipment: () =>
    fetchJson<EquipmentList>("/targets/equipment"),

  getFitsKeys: () =>
    fetchJson<string[]>("/targets/fits-keys"),

  searchTargets: (query: string) =>
    fetchJson<TargetSearchResult[]>(`/targets/search?q=${encodeURIComponent(query)}`),

  getStats: () =>
    fetchJson<StatsResponse>("/stats"),

  triggerScan: (options?: { includeCalibration?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.includeCalibration === false) {
      params.set("include_calibration", "false");
    }
    const qs = params.toString();
    return fetchJson<ScanResult>(`/scan${qs ? `?${qs}` : ""}`, { method: "POST" });
  },

  getScanStatus: () =>
    fetchJson<ScanStatus>("/scan/status"),

  regenerateThumbnails: () =>
    fetchJson<ScanResult>("/scan/regenerate-thumbnails", { method: "POST" }),

  getAutoScan: () =>
    fetchJson<{ enabled: boolean; interval_minutes: number }>("/scan/autoscan"),

  setAutoScan: (enabled: boolean, interval_minutes: number) =>
    fetchJson<{ enabled: boolean; interval_minutes: number }>(
      `/scan/autoscan?enabled=${enabled}&interval_minutes=${interval_minutes}`,
      { method: "PUT" }
    ),

  thumbnailUrl: (path: string) => {
    const filename = path.split("/").pop();
    return `/thumbnails/${filename}`;
  },

  // Settings
  getSettings: () =>
    fetchJson<SettingsResponse>("/settings"),

  updateGeneral: (body: GeneralSettings) =>
    fetchJson<SettingsResponse>("/settings/general", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  updateFilters: (body: Record<string, FilterConfig>) =>
    fetchJson<SettingsResponse>("/settings/filters", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  updateEquipment: (body: EquipmentConfig) =>
    fetchJson<SettingsResponse>("/settings/equipment", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getFilterSuggestions: () =>
    fetchJson<SuggestionsResponse>("/settings/suggestions/filters"),

  getEquipmentSuggestions: () =>
    fetchJson<SuggestionsResponse>("/settings/suggestions/equipment"),

  getDiscovered: (section: "filters" | "cameras" | "telescopes") =>
    fetchJson<DiscoveredResponse>(`/settings/discovered/${section}`),

  updateDismissedSuggestions: (dismissed: string[][]) =>
    fetchJson<SettingsResponse>("/settings/dismissed-suggestions", {
      method: "PUT",
      body: JSON.stringify(dismissed),
    }),
};
