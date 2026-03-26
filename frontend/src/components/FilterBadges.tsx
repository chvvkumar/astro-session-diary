import { Component, For, Show } from "solid-js";

const COLOR_MAP: Record<string, string> = {
  Ha: "bg-filter-ha",
  OIII: "bg-filter-oiii",
  SII: "bg-filter-sii",
  L: "bg-filter-l text-gray-900",
  R: "bg-filter-r",
  G: "bg-filter-g",
  B: "bg-filter-b",
};

const SHORT_LABEL: Record<string, string> = {
  Ha: "H",
  OIII: "O",
  SII: "S",
  L: "L",
  R: "R",
  G: "G",
  B: "B",
  OSC: "OSC",
};

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const FilterBadges: Component<{ distribution: Record<string, number>; compact?: boolean }> = (props) => {
  const entries = () =>
    Object.entries(props.distribution).sort(([, a], [, b]) => b - a);

  return (
    <div class="flex gap-1.5 flex-wrap">
      <For each={entries()}>
        {([name, seconds]) => (
          <Show
            when={props.compact}
            fallback={
              <span class={`px-2 py-0.5 rounded-full text-[11px] font-medium ${COLOR_MAP[name] || "bg-gray-600"} text-white`}>
                {name}&middot;{formatHours(seconds)}
              </span>
            }
          >
            <span class={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center ${COLOR_MAP[name] || "bg-gray-600"} text-white`}>
              {SHORT_LABEL[name] || name}
            </span>
          </Show>
        )}
      </For>
    </div>
  );
};

export default FilterBadges;
