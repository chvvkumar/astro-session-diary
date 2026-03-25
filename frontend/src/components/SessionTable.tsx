import { Component, For } from "solid-js";
import type { SessionSummary } from "../types";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const SessionTable: Component<{
  sessions: SessionSummary[];
  onDeepDive: (date: string) => void;
}> = (props) => {
  return (
    <div class="border-t border-gray-800 mt-2">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-astro-muted border-b border-gray-800">
            <th class="text-left py-1.5 px-2 font-normal">Date</th>
            <th class="text-right py-1.5 px-2 font-normal">Frames</th>
            <th class="text-right py-1.5 px-2 font-normal">Integration</th>
            <th class="text-left py-1.5 px-2 font-normal">Filters</th>
            <th class="py-1.5 px-2"></th>
          </tr>
        </thead>
        <tbody>
          <For each={props.sessions}>
            {(session) => (
              <tr class="border-b border-gray-800/50 hover:bg-astro-panel/50">
                <td class="py-1.5 px-2 text-white">{session.session_date}</td>
                <td class="py-1.5 px-2 text-right text-white">{session.frame_count}</td>
                <td class="py-1.5 px-2 text-right text-white">{formatHours(session.integration_seconds)}</td>
                <td class="py-1.5 px-2 text-astro-muted">{session.filters_used.join(", ")}</td>
                <td class="py-1.5 px-2 text-right">
                  <button
                    onClick={() => props.onDeepDive(session.session_date)}
                    class="text-astro-accent hover:underline text-[11px]"
                  >
                    Deep Dive
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};

export default SessionTable;
