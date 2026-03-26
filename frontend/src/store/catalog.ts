import { createSignal, createResource } from "solid-js";
import { api } from "../api/client";
import type { ActiveFilters, TargetAggregationResponse, EquipmentList } from "../types";

const defaultFilters: ActiveFilters = {
  searchQuery: "",
  camera: null,
  telescope: null,
  opticalFilters: [],
  dateRange: { start: null, end: null },
  fitsQueries: [],
};

const [filters, setFilters] = createSignal<ActiveFilters>({ ...defaultFilters });
const [targetData, { refetch: refetchTargets }] = createResource(filters, (f) => api.getTargets(f));
const [equipment] = createResource(() => api.getEquipment());

const [expandedTargets, setExpandedTargets] = createSignal<Set<string>>(new Set());

export function useCatalog() {
  return {
    filters,
    setFilters,
    targetData,
    equipment,
    expandedTargets,
    refetchTargets,

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

    resetFilters: () => setFilters({ ...defaultFilters }),
  };
}
