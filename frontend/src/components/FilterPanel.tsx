import { Component, createResource, For } from "solid-js";
import { useCatalog } from "../store/catalog";
import { api } from "../api/client";

const FilterPanel: Component = () => {
  const { filters, updateFilter, resetFilters } = useCatalog();
  const [availableFilters] = createResource(() => api.getAvailableFilters());

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium text-sm">Filters</h3>
        <button
          onClick={resetFilters}
          class="text-xs text-astro-accent hover:underline"
        >
          Reset
        </button>
      </div>

      {/* Image type */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Image Type</label>
        <select
          value={filters().image_type || ""}
          onChange={(e) => updateFilter("image_type", e.currentTarget.value || undefined)}
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
        >
          <option value="">All Types</option>
          <option value="LIGHT">Light</option>
          <option value="DARK">Dark</option>
          <option value="FLAT">Flat</option>
          <option value="BIAS">Bias</option>
        </select>
      </div>

      {/* Filter type */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Filter</label>
        <select
          value={filters().filter_used || ""}
          onChange={(e) => updateFilter("filter_used", e.currentTarget.value || undefined)}
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
        >
          <option value="">All Filters</option>
          <For each={availableFilters() ?? []}>
            {(f) => <option value={f}>{f}</option>}
          </For>
        </select>
      </div>

      {/* Date range */}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-astro-muted block mb-1">From</label>
          <input
            type="date"
            value={filters().date_from || ""}
            onChange={(e) => updateFilter("date_from", e.currentTarget.value || undefined)}
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label class="text-xs text-astro-muted block mb-1">To</label>
          <input
            type="date"
            value={filters().date_to || ""}
            onChange={(e) => updateFilter("date_to", e.currentTarget.value || undefined)}
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>

      {/* Exposure range */}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-astro-muted block mb-1">Min Exp (s)</label>
          <input
            type="number"
            value={filters().min_exposure ?? ""}
            onChange={(e) =>
              updateFilter("min_exposure", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
            }
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label class="text-xs text-astro-muted block mb-1">Max Exp (s)</label>
          <input
            type="number"
            value={filters().max_exposure ?? ""}
            onChange={(e) =>
              updateFilter("max_exposure", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
            }
            class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>

      {/* JSONB header search */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Header Search</label>
        <div class="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Key (e.g. TELESCOP)"
            value={filters().header_key || ""}
            onChange={(e) => updateFilter("header_key", e.currentTarget.value || undefined)}
            class="px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
          <input
            type="text"
            placeholder="Value"
            value={filters().header_value || ""}
            onChange={(e) => updateFilter("header_value", e.currentTarget.value || undefined)}
            class="px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
