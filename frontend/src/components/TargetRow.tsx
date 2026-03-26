import { Component, Show, createMemo } from "solid-js";
import type { TargetAggregation } from "../types";
import { useCatalog } from "../store/catalog";
import FilterBadges from "./FilterBadges";
import SessionTable from "./SessionTable";

function formatIntegration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`;
}

const TargetRow: Component<{
  target: TargetAggregation;
}> = (props) => {
  const { expandedTargets, toggleExpanded, openDrawer } = useCatalog();

  const isOpen = () => expandedTargets().has(props.target.target_id);

  const displayName = () =>
    props.target.aliases[0] || props.target.primary_name;

  const lastSession = createMemo(() => {
    const sorted = [...props.target.sessions].sort(
      (a, b) => b.session_date.localeCompare(a.session_date)
    );
    return sorted[0]?.session_date ?? "—";
  });

  return (
    <>
      <tr
        class="border-b border-[#2d2d2d] cursor-pointer hover:bg-[#2a2a2a] transition-colors"
        onClick={() => toggleExpanded(props.target.target_id)}
      >
        <td class="py-2.5 px-3 font-bold text-white">{displayName()}</td>
        <td class="py-2.5 px-3 font-mono text-astro-muted text-xs">
          {props.target.primary_name}
        </td>
        <td class="py-2.5 px-3">
          <FilterBadges distribution={props.target.filter_distribution} compact />
        </td>
        <td class="py-2.5 px-3 text-white text-xs">
          {formatIntegration(props.target.total_integration_seconds)}
        </td>
        <td class="py-2.5 px-3 text-astro-accent text-xs">
          {props.target.equipment.join(" \u00b7 ")}
        </td>
        <td class="py-2.5 px-3 text-astro-accent text-xs">{lastSession()}</td>
      </tr>
      <Show when={isOpen()}>
        <tr class="bg-[#1a1a1a]">
          <td colspan="6" class="px-3 py-2">
            <SessionTable
              sessions={props.target.sessions}
              onDeepDive={(date) => openDrawer(props.target.target_id, date)}
            />
          </td>
        </tr>
      </Show>
    </>
  );
};

export default TargetRow;
