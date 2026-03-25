import { Component, For } from "solid-js";

const COLOR_MAP: Record<string, string> = {
  Ha: "bg-filter-ha", OIII: "bg-filter-oiii", SII: "bg-filter-sii",
  L: "bg-filter-l", R: "bg-filter-r", G: "bg-filter-g", B: "bg-filter-b",
};

const FilterUsageChart: Component<{ usage: Record<string, number> }> = (props) => {
  const entries = () => Object.entries(props.usage).sort(([, a], [, b]) => b - a);
  const maxVal = () => Math.max(...Object.values(props.usage), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Filter Usage</h3>
      <For each={entries()}>
        {([name, seconds]) => (
          <div class="flex items-center gap-2 text-xs">
            <span class="w-10 text-right text-astro-muted">{name}</span>
            <div class="flex-1 bg-astro-dark rounded-full h-4 overflow-hidden">
              <div
                class={`h-4 rounded-full transition-all ${COLOR_MAP[name] || "bg-gray-500"}`}
                style={{ width: `${(seconds / maxVal()) * 100}%` }}
              />
            </div>
            <span class="w-14 text-right text-white">{(seconds / 3600).toFixed(1)}h</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default FilterUsageChart;
