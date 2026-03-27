import { Component, For, Show, createResource } from "solid-js";
import { useCatalog } from "../store/catalog";
import { useSettingsContext } from "./SettingsProvider";
import { api } from "../api/client";

const FilterToggles: Component = () => {
  const { filters, toggleOpticalFilter } = useCatalog();
  const { settings, filterColorMap, filterAliasMap } = useSettingsContext();
  const [discovered] = createResource(() => api.getDiscovered("filters").then((r) => r.items));

  const isActive = (f: string) => filters().opticalFilters.includes(f);

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    return colorMap[canonical] || colorMap[name] || "#666666";
  }

  /** Canonical filter names from settings (the "groups") */
  const groupedFilters = () => {
    const s = settings();
    if (!s) return [];
    return Object.keys(s.filters);
  };

  /** Discovered filter names not covered by any group (not a canonical name or alias) */
  const ungroupedFilters = () => {
    const s = settings();
    const disc = discovered();
    if (!disc) return [];
    if (!s) return disc.map((d) => d.name);

    const covered = new Set<string>();
    for (const [canonical, cfg] of Object.entries(s.filters)) {
      covered.add(canonical);
      for (const alias of cfg.aliases) covered.add(alias);
    }
    return disc.map((d) => d.name).filter((name) => !covered.has(name));
  };

  const renderPill = (name: string) => {
    const active = isActive(name);
    const color = getColor(name);
    return (
      <button
        onClick={() => toggleOpticalFilter(name)}
        class={`h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
          active ? "ring-2 ring-white/40" : "opacity-40 hover:opacity-70"
        }`}
        classList={{ "w-6": name.length <= 1, "px-1.5": name.length > 1 }}
        style={{ "background-color": color, color: "black" }}
        title={name}
      >
        {name}
      </button>
    );
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Optical Filters</label>
      <div class="space-y-1.5">
        <Show when={groupedFilters().length > 0}>
          <div class="flex gap-1.5 flex-wrap">
            <For each={groupedFilters()}>{(f) => renderPill(f)}</For>
          </div>
        </Show>
        <Show when={ungroupedFilters().length > 0}>
          <span class="text-[10px] text-astro-muted">Other</span>
          <div class="flex gap-1.5 flex-wrap">
            <For each={ungroupedFilters()}>{(f) => renderPill(f)}</For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default FilterToggles;
