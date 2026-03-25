import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import AggregateWidgets from "./AggregateWidgets";

const CommandBar: Component = () => {
  const { targetData, resetFilters } = useCatalog();

  return (
    <div class="sticky top-0 z-10 bg-astro-dark/95 backdrop-blur border-b border-[#2d2d2d] px-4 py-3 flex items-center justify-between">
      <Show when={targetData()}>
        {(data) => <AggregateWidgets aggregates={data().aggregates} />}
      </Show>
      <button
        onClick={resetFilters}
        class="text-xs text-astro-muted hover:text-white transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );
};

export default CommandBar;
