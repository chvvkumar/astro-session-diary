import { Component, For, Show, createSignal } from "solid-js";

const RawHeaderAccordion: Component<{ headers: Record<string, unknown> | null }> = (props) => {
  const [open, setOpen] = createSignal(false);

  const entries = () => {
    if (!props.headers) return [];
    return Object.entries(props.headers).sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <div class="border-t border-gray-800 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        class="text-xs text-astro-accent hover:underline w-full text-left"
      >
        {open() ? "Hide FITS Headers" : "Show FITS Headers"} ({entries().length} keys)
      </button>
      <Show when={open()}>
        <div class="mt-2 max-h-64 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-astro-panel">
              <tr class="text-astro-muted">
                <th class="text-left py-1 px-2 font-normal">Key</th>
                <th class="text-left py-1 px-2 font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              <For each={entries()}>
                {([key, value]) => (
                  <tr class="border-t border-gray-800/30">
                    <td class="py-1 px-2 text-astro-muted font-mono">{key}</td>
                    <td class="py-1 px-2 text-white font-mono break-all">{String(value)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default RawHeaderAccordion;
