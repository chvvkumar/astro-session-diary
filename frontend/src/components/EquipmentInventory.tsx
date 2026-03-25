import { Component, For } from "solid-js";
import type { EquipmentItem } from "../types";

const EquipmentInventory: Component<{ cameras: EquipmentItem[]; telescopes: EquipmentItem[] }> = (props) => {
  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Equipment Inventory</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <h4 class="text-xs text-astro-muted mb-2">Cameras</h4>
          <For each={props.cameras}>{(c) => (
            <div class="flex justify-between text-xs py-1 border-b border-[#2d2d2d]/30">
              <span class="text-white">{c.name}</span>
              <span class="text-astro-muted">{c.frame_count.toLocaleString()} frames</span>
            </div>
          )}</For>
        </div>
        <div>
          <h4 class="text-xs text-astro-muted mb-2">Telescopes</h4>
          <For each={props.telescopes}>{(t) => (
            <div class="flex justify-between text-xs py-1 border-b border-[#2d2d2d]/30">
              <span class="text-white">{t.name}</span>
              <span class="text-astro-muted">{t.frame_count.toLocaleString()} frames</span>
            </div>
          )}</For>
        </div>
      </div>
    </div>
  );
};

export default EquipmentInventory;
