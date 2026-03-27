import { Component, Show, createMemo } from "solid-js";
import { A } from "@solidjs/router";
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
  const { expandedTargets, toggleExpanded } = useCatalog();

  const isOpen = () => expandedTargets().has(props.target.target_id);

  const displayName = () =>
    props.target.aliases[0] || props.target.primary_name;

  const lastSession = createMemo(() => {
    const sorted = [...props.target.sessions].sort(
      (a, b) => b.session_date.localeCompare(a.session_date)
    );
    return sorted[0]?.session_date ?? "\u2014";
  });

  return (
    <>
      <tr
        class="border-b border-[#2d2d2d] cursor-pointer hover:bg-[#2a2a2a] transition-colors"
        onClick={() => toggleExpanded(props.target.target_id)}
      >
        <td class="py-2.5 px-3 font-bold text-white">
          <A
            href={`/targets/${encodeURIComponent(props.target.target_id)}`}
            class="hover:text-astro-accent transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {displayName()}
          </A>
        </td>
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
        <Show when={props.target.matched_sessions != null}>
          <td class="py-2.5 px-3 text-xs text-yellow-400">
            {props.target.matched_sessions} of {props.target.total_sessions} sessions
          </td>
        </Show>
      </tr>
      <Show when={isOpen()}>
        <tr class="bg-[#1a1a1a]">
          <td colspan="6" class="px-3 py-2">
            <SessionTable
              sessions={props.target.sessions}
              onDeepDive={(date) => {
                window.location.href = `/targets/${encodeURIComponent(props.target.target_id)}?session=${date}`;
              }}
            />
          </td>
        </tr>
      </Show>
    </>
  );
};

export default TargetRow;
