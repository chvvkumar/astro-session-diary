import { Component, For } from "solid-js";
import { useCatalog } from "../store/catalog";

const FILTER_COLORS: Record<string, string> = {
  Ha: "bg-filter-ha",
  OIII: "bg-filter-oiii",
  SII: "bg-filter-sii",
  L: "bg-filter-l text-gray-900",
  R: "bg-filter-r",
  G: "bg-filter-g",
  B: "bg-filter-b",
};

const BROADBAND = ["L", "R", "G", "B"];
const NARROWBAND = ["Ha", "OIII", "SII"];

const FilterToggles: Component = () => {
  const { filters, toggleOpticalFilter } = useCatalog();

  const isActive = (f: string) => filters().opticalFilters.includes(f);

  const renderPill = (name: string) => {
    const active = isActive(name);
    const colorClass = FILTER_COLORS[name] || "bg-gray-600";
    return (
      <button
        onClick={() => toggleOpticalFilter(name)}
        class={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          active ? `${colorClass} text-white ring-2 ring-white/30` : "bg-gray-700/50 text-astro-muted"
        }`}
      >
        {name}
      </button>
    );
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Optical Filters</label>
      <div class="space-y-1.5">
        <div class="flex gap-1.5 flex-wrap">
          <span class="text-[10px] text-astro-muted w-full">Broadband</span>
          <For each={BROADBAND}>{(f) => renderPill(f)}</For>
        </div>
        <div class="flex gap-1.5 flex-wrap">
          <span class="text-[10px] text-astro-muted w-full">Narrowband</span>
          <For each={NARROWBAND}>{(f) => renderPill(f)}</For>
        </div>
      </div>
    </div>
  );
};

export default FilterToggles;
