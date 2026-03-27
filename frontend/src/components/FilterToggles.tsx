import { Component, For } from "solid-js";
import { useCatalog } from "../store/catalog";
import { useSettingsContext } from "./SettingsProvider";

const BROADBAND = ["L", "R", "G", "B"];
const NARROWBAND = ["Ha", "OIII", "SII"];

const FilterToggles: Component = () => {
  const { filters, toggleOpticalFilter } = useCatalog();
  const { filterColorMap, filterAliasMap } = useSettingsContext();

  const isActive = (f: string) => filters().opticalFilters.includes(f);

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    return colorMap[canonical] || colorMap[name] || "#4b5563";
  }

  const renderPill = (name: string) => {
    const active = isActive(name);
    return (
      <button
        onClick={() => toggleOpticalFilter(name)}
        class={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          active ? "ring-2 ring-white/30" : "bg-gray-700/50 text-astro-muted"
        }`}
        style={active ? { "background-color": getColor(name), color: "black" } : {}}
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
