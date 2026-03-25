import { Component, For } from "solid-js";

const IngestHistory: Component<{ history: { date: string; files_added: number }[] }> = (props) => {
  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-2">
      <h3 class="text-white font-medium text-sm">Ingest History</h3>
      <div class="max-h-48 overflow-y-auto">
        <For each={props.history}>
          {(entry) => (
            <div class="flex justify-between text-xs py-1 border-b border-gray-800/30">
              <span class="text-white">{entry.date}</span>
              <span class="text-astro-muted">+{entry.files_added} files</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default IngestHistory;
