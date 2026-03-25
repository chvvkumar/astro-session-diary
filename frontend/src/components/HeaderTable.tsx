import { Component, For } from "solid-js";

interface Props {
  headers: Record<string, unknown>;
}

const HeaderTable: Component<Props> = (props) => {
  const entries = () =>
    Object.entries(props.headers)
      .filter(([k]) => k.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div class="max-h-96 overflow-y-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 bg-astro-panel">
          <tr class="text-astro-muted">
            <th class="text-left py-1 px-2 font-medium">Key</th>
            <th class="text-left py-1 px-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          <For each={entries()}>
            {([key, value]) => (
              <tr class="border-t border-gray-800 hover:bg-astro-dark/50">
                <td class="py-1 px-2 text-astro-accent font-mono">{key}</td>
                <td class="py-1 px-2 text-white font-mono break-all">
                  {String(value)}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};

export default HeaderTable;
