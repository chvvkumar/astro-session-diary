import { Component, For, createMemo } from "solid-js";
import type { TimelineEntry } from "../types";

const ImagingTimeline: Component<{ timeline: TimelineEntry[] }> = (props) => {
  const maxVal = () => Math.max(...props.timeline.map((t) => t.integration_seconds), 1);

  // Show a label every ~3 months to avoid crowding
  const labelInterval = createMemo(() => {
    const len = props.timeline.length;
    if (len <= 12) return 1;
    if (len <= 24) return 2;
    return 3;
  });

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Imaging Timeline</h3>
      <div class="flex items-end gap-[2px] h-40">
        <For each={props.timeline}>
          {(entry, i) => {
            const pct = () => (entry.integration_seconds / maxVal()) * 100;
            return (
              <div
                class="flex-1 flex flex-col items-center justify-end h-full"
                title={`${entry.month}: ${(entry.integration_seconds / 3600).toFixed(1)}h`}
              >
                <div class="w-full flex-1 flex items-end">
                  <div
                    class="w-full bg-astro-accent rounded-t min-h-[2px]"
                    style={{ height: `${pct()}%` }}
                  />
                </div>
                <span class="text-[7px] text-astro-muted mt-1 leading-none">
                  {i() % labelInterval() === 0 ? entry.month.slice(2) : ""}
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default ImagingTimeline;
