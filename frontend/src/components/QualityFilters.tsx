import { Component, createSignal, createEffect } from "solid-js";
import { useCatalog } from "../store/catalog";

const QualityFilters: Component = () => {
  const { filters, updateQualityFilters } = useCatalog();
  const [hfrMin, setHfrMin] = createSignal<string>("");
  const [hfrMax, setHfrMax] = createSignal<string>("");

  let debounceTimer: ReturnType<typeof setTimeout>;
  let initialized = false;

  // Sync from store on init only
  createEffect(() => {
    const qf = filters().qualityFilters;
    if (!initialized) {
      initialized = true;
      if (qf.hfrMin != null) setHfrMin(String(qf.hfrMin));
      if (qf.hfrMax != null) setHfrMax(String(qf.hfrMax));
    }
  });

  const applyFilters = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const min = hfrMin() ? parseFloat(hfrMin()) : undefined;
      const max = hfrMax() ? parseFloat(hfrMax()) : undefined;
      updateQualityFilters({
        hfrMin: min && !isNaN(min) ? min : undefined,
        hfrMax: max && !isNaN(max) ? max : undefined,
      });
    }, 500);
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">Quality (HFR)</label>
      <div class="flex gap-2 items-center">
        <input
          type="number"
          step="0.1"
          min="0"
          value={hfrMin()}
          onInput={(e) => {
            setHfrMin(e.currentTarget.value);
            applyFilters();
          }}
          placeholder="Min"
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white placeholder-astro-muted focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <span class="text-astro-muted text-xs">&ndash;</span>
        <input
          type="number"
          step="0.1"
          min="0"
          value={hfrMax()}
          onInput={(e) => {
            setHfrMax(e.currentTarget.value);
            applyFilters();
          }}
          placeholder="Max"
          class="w-full px-2 py-1.5 bg-astro-dark border border-gray-700 rounded text-xs text-white placeholder-astro-muted focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
      </div>
    </div>
  );
};

export default QualityFilters;
