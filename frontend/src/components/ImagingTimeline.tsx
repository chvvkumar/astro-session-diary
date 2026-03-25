import { Component, For } from "solid-js";
import type { TimelineEntry } from "../types";

const ImagingTimeline: Component<{ timeline: TimelineEntry[] }> = (props) => {
  const maxVal = () => Math.max(...props.timeline.map((t) => t.integration_seconds), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Imaging Timeline</h3>
      <div class="flex items-end gap-1 h-32">
        <For each={props.timeline}>
          {(entry) => (
            <div class="flex-1 flex flex-col items-center gap-1" title={`${entry.month}: ${(entry.integration_seconds / 3600).toFixed(1)}h`}>
              <div
                class="w-full bg-astro-accent rounded-t transition-all min-h-[2px]"
                style={{ height: `${(entry.integration_seconds / maxVal()) * 100}%` }}
              />
              <span class="text-[8px] text-astro-muted rotate-45 origin-left whitespace-nowrap">
                {entry.month.slice(2)}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ImagingTimeline;
