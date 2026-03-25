import { Component, For, Show } from "solid-js";
import type { HfrBucket } from "../types";

const DataQuality: Component<{
  avgHfr: number | null;
  avgEccentricity: number | null;
  bestHfr: number | null;
  hfrDistribution: HfrBucket[];
}> = (props) => {
  const maxCount = () => Math.max(...props.hfrDistribution.map((b) => b.count), 1);

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Data Quality</h3>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Avg HFR</div>
          <div class="text-white font-semibold text-sm">{props.avgHfr?.toFixed(2) ?? "—"}</div>
        </div>
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Avg Ecc.</div>
          <div class="text-white font-semibold text-sm">{props.avgEccentricity?.toFixed(2) ?? "—"}</div>
        </div>
        <div class="bg-astro-dark rounded p-2">
          <div class="text-[10px] text-astro-muted">Best HFR</div>
          <div class="text-green-400 font-semibold text-sm">{props.bestHfr?.toFixed(2) ?? "—"}</div>
        </div>
      </div>
      <Show when={props.hfrDistribution.length > 0}>
        <div class="space-y-1">
          <h4 class="text-xs text-astro-muted">HFR Distribution</h4>
          <div class="flex items-end gap-1 h-16">
            <For each={props.hfrDistribution}>
              {(bucket) => (
                <div class="flex-1 flex flex-col items-center" title={`${bucket.bucket}: ${bucket.count}`}>
                  <div
                    class="w-full bg-astro-accent/70 rounded-t min-h-[2px]"
                    style={{ height: `${(bucket.count / maxCount()) * 100}%` }}
                  />
                  <span class="text-[7px] text-astro-muted mt-0.5">{bucket.bucket}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default DataQuality;
