import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";

const DateRangePicker: Component = () => {
  const { filters, updateFilter } = useCatalog();

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Date Range</label>
      <div class="flex gap-2">
        <input
          type="date"
          value={filters().dateRange.start || ""}
          onInput={(e) =>
            updateFilter("dateRange", { ...filters().dateRange, start: e.currentTarget.value || null })
          }
          class="flex-1 px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <input
          type="date"
          value={filters().dateRange.end || ""}
          onInput={(e) =>
            updateFilter("dateRange", { ...filters().dateRange, end: e.currentTarget.value || null })
          }
          class="flex-1 px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
      </div>
    </div>
  );
};

export default DateRangePicker;
