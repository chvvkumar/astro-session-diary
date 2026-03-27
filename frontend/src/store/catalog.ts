import { createSignal, createResource, createEffect } from "solid-js";
import { api } from "../api/client";
import type { ActiveFilters, TargetAggregationResponse, EquipmentList } from "../types";

const STORAGE_KEY = "dashboard_filters";

const defaultFilters: ActiveFilters = {
  searchQuery: "",
  camera: null,
  telescope: null,
  opticalFilters: [],
  dateRange: { start: null, end: null },
  fitsQueries: [],
};

// ---------------------------------------------------------------------------
// URL param serialization (reuses buildTargetQuery param names)
// ---------------------------------------------------------------------------

function filtersToParams(f: ActiveFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.searchQuery) p.search = f.searchQuery;
  if (f.camera) p.camera = f.camera;
  if (f.telescope) p.telescope = f.telescope;
  if (f.opticalFilters.length > 0) p.filters = f.opticalFilters.join(",");
  if (f.dateRange.start) p.date_from = f.dateRange.start;
  if (f.dateRange.end) p.date_to = f.dateRange.end;
  if (f.fitsQueries.length > 0) {
    p.fits_key = f.fitsQueries.map((q) => q.key).join(",");
    p.fits_op = f.fitsQueries.map((q) => q.operator).join(",");
    p.fits_val = f.fitsQueries.map((q) => q.value).join(",");
  }
  return p;
}

function paramsToFilters(params: URLSearchParams): ActiveFilters | null {
  // Return null if no filter params are present
  const keys = ["search", "camera", "telescope", "filters", "date_from", "date_to", "fits_key"];
  if (!keys.some((k) => params.has(k))) return null;

  const fitsKeys = params.get("fits_key")?.split(",") ?? [];
  const fitsOps = params.get("fits_op")?.split(",") ?? [];
  const fitsVals = params.get("fits_val")?.split(",") ?? [];
  const fitsQueries = fitsKeys.map((key, i) => ({
    key,
    operator: fitsOps[i] ?? "eq",
    value: fitsVals[i] ?? "",
  }));

  return {
    searchQuery: params.get("search") ?? "",
    camera: params.get("camera") || null,
    telescope: params.get("telescope") || null,
    opticalFilters: params.get("filters")?.split(",").filter(Boolean) ?? [],
    dateRange: {
      start: params.get("date_from") || null,
      end: params.get("date_to") || null,
    },
    fitsQueries,
  };
}

function loadFromSession(): ActiveFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Merge with defaults to handle missing keys from stale data
    return { ...defaultFilters, ...parsed };
  } catch {
    return null;
  }
}

function saveToSession(f: ActiveFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [filters, setFilters] = createSignal<ActiveFilters>({ ...defaultFilters });
const [targetData, { refetch: refetchTargets }] = createResource(filters, (f) => api.getTargets(f));
const [equipment] = createResource(() => api.getEquipment());

const [expandedTargets, setExpandedTargets] = createSignal<Set<string>>(new Set());

// Persist to sessionStorage on every filter change
let initialized = false;
createEffect(() => {
  const f = filters();
  if (initialized) {
    saveToSession(f);
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Call once from DashboardPage onMount with the current URL search params. */
export function initFiltersFromUrl(searchParams: URLSearchParams): void {
  if (initialized) return;
  initialized = true;

  // Priority: URL params > sessionStorage > defaults
  const fromUrl = paramsToFilters(searchParams);
  if (fromUrl) {
    setFilters(fromUrl);
    saveToSession(fromUrl);
    return;
  }

  const fromSession = loadFromSession();
  if (fromSession) {
    setFilters(fromSession);
    return;
  }

  // defaults already set
}

export function useCatalog() {
  return {
    filters,
    setFilters,
    targetData,
    equipment,
    expandedTargets,
    refetchTargets,

    /** Returns current filters as URL-safe key-value pairs for setSearchParams. */
    filtersAsParams: () => filtersToParams(filters()),

    updateFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },

    toggleOpticalFilter: (f: string) => {
      setFilters((prev) => {
        const current = prev.opticalFilters;
        const next = current.includes(f)
          ? current.filter((x) => x !== f)
          : [...current, f];
        return { ...prev, opticalFilters: next };
      });
    },

    toggleExpanded: (targetId: string) => {
      setExpandedTargets((prev) => {
        const next = new Set(prev);
        if (next.has(targetId)) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
    },

    resetFilters: () => {
      clearSession();
      setFilters({ ...defaultFilters });
    },
  };
}
