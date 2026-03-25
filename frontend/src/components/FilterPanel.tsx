import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";

const FilterPanel: Component = () => {
  const { filters, updateFilter, resetFilters } = useCatalog();

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

      {/* Filter type */}
      <div>
        <label class="text-xs text-astro-muted block mb-1">Filter</label>
        <select
          value={filters().filter_used || ""}
          onChange={(e) => updateFilter("filter_used", e.currentTarget.value || undefined)}
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-white text-sm"
        >
          <option value="">All Filters</option>
          <option value="L">Luminance</option>
          <option value="R">Red</option>
          <option value="G">Green</option>
          <option value="B">Blue</option>
          <option value="Ha">H-alpha</option>
          <option value="OIII">OIII</option>
          <option value="SII">SII</option>
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
