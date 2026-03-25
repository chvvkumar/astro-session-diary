import { Component, For } from "solid-js";

const COLOR_MAP: Record<string, string> = {
  Ha: "bg-filter-ha",
  OIII: "bg-filter-oiii",
  SII: "bg-filter-sii",
  L: "bg-filter-l text-gray-900",
  R: "bg-filter-r",
  G: "bg-filter-g",
  B: "bg-filter-b",
};

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const FilterBadges: Component<{ distribution: Record<string, number> }> = (props) => {
  const entries = () =>
    Object.entries(props.distribution).sort(([, a], [, b]) => b - a);

  return (
    <div class="flex gap-1.5 flex-wrap">
      <For each={entries()}>
        {([name, seconds]) => (
          <span class={`px-2 py-0.5 rounded-full text-[11px] font-medium ${COLOR_MAP[name] || "bg-gray-600"} text-white`}>
            {name}&middot;{formatHours(seconds)}
          </span>
        )}
      </For>
    </div>
  );
};

export default FilterBadges;
