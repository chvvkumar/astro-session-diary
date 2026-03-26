import { Component, For } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";

const FilterUsageChart: Component<{ usage: Record<string, number> }> = (props) => {
  const { filterColorMap, filterAliasMap } = useSettingsContext();

  function getColor(name: string): string {
    const colorMap = filterColorMap();
    const aliasMap = filterAliasMap();
    const canonical = aliasMap[name] || name;
    return colorMap[canonical] || colorMap[name] || "#6b7280";
  }

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
                class="h-4 rounded-full transition-all"
                style={{ width: `${(seconds / maxVal()) * 100}%`, "background-color": getColor(name) }}
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
