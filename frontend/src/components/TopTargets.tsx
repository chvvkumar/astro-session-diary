import { Component, For } from "solid-js";
import type { TopTarget } from "../types";

const TopTargets: Component<{ targets: TopTarget[] }> = (props) => {
  const maxVal = () => Math.max(...props.targets.map((t) => t.integration_seconds), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Top Targets</h3>
      <For each={props.targets.slice(0, 10)}>
        {(target, i) => (
          <div class="flex items-center gap-2 text-xs">
            <span class="w-4 text-astro-muted text-right">{i() + 1}</span>
            <span class="w-24 text-white truncate">{target.name}</span>
            <div class="flex-1 bg-astro-dark rounded-full h-3 overflow-hidden">
              <div
                class="bg-astro-accent h-3 rounded-full"
                style={{ width: `${(target.integration_seconds / maxVal()) * 100}%` }}
              />
            </div>
            <span class="w-12 text-right text-astro-muted">{(target.integration_seconds / 3600).toFixed(1)}h</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default TopTargets;
