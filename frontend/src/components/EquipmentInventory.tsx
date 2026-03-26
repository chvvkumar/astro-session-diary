import { Component, For } from "solid-js";
import type { EquipmentItem } from "../types";

const EquipmentTable: Component<{ title: string; items: EquipmentItem[] }> = (props) => (
  <div>
    <h4 class="text-xs text-astro-muted mb-1">{props.title}</h4>
    <table class="w-full text-xs">
      <tbody>
        <For each={props.items}>{(item) => (
          <tr class="border-b border-[#2d2d2d]/30">
            <td class="text-left text-white py-1 pr-4">{item.name}</td>
            <td class="text-right text-astro-muted py-1 whitespace-nowrap">{item.frame_count.toLocaleString()}</td>
          </tr>
        )}</For>
      </tbody>
    </table>
  </div>
);

const EquipmentInventory: Component<{ cameras: EquipmentItem[]; telescopes: EquipmentItem[] }> = (props) => {
  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-4">
      <h3 class="text-white font-medium text-sm">Equipment Inventory</h3>
      <EquipmentTable title="Cameras" items={props.cameras} />
      <EquipmentTable title="Telescopes" items={props.telescopes} />
    </div>
  );
};

export default EquipmentInventory;
