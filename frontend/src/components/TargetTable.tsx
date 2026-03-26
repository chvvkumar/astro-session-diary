import { Component, For, createMemo } from "solid-js";
import type { TargetAggregation } from "../types";
import TargetRow from "./TargetRow";

const TargetTable: Component<{ targets: TargetAggregation[] }> = (props) => {
  const maxIntegration = createMemo(() =>
    Math.max(1, ...props.targets.map((t) => t.total_integration_seconds))
  );

  return (
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-astro-muted text-[11px] uppercase tracking-wider border-b border-[#2d2d2d]">
          <th class="text-left py-2 px-3 font-medium">Target Name</th>
          <th class="text-left py-2 px-3 font-medium">Designation</th>
          <th class="text-left py-2 px-3 font-medium">Palette</th>
          <th class="text-left py-2 px-3 font-medium">Integration Time</th>
          <th class="text-left py-2 px-3 font-medium">Equipment Profile</th>
          <th class="text-left py-2 px-3 font-medium">Last Session</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.targets}>
          {(target) => (
            <TargetRow target={target} maxIntegration={maxIntegration()} />
          )}
        </For>
      </tbody>
    </table>
  );
};

export default TargetTable;
