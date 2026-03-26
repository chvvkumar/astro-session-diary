// frontend/src/components/settings/SuggestionsBanner.tsx
import { For, Show, createSignal, type Component } from "solid-js";
import type { SuggestionGroup } from "../../types";

interface Props {
  suggestions: SuggestionGroup[];
  onMerge: (canonical: string, aliases: string[]) => void;
}

export const SuggestionsBanner: Component<Props> = (props) => {
  return (
    <Show when={props.suggestions.length > 0}>
      <div class="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 space-y-3">
        <p class="text-sm text-yellow-200">
          Found {props.suggestions.length} possible duplicate{props.suggestions.length > 1 ? "s" : ""}
        </p>
        <For each={props.suggestions}>
          {(group) => <MergeGroup group={group} onMerge={props.onMerge} />}
        </For>
      </div>
    </Show>
  );
};

const MergeGroup: Component<{ group: SuggestionGroup; onMerge: (canonical: string, aliases: string[]) => void }> = (
  props,
) => {
  const [selected, setSelected] = createSignal(
    // Default to the variant with the highest count
    props.group.group.reduce((a, b) => ((props.group.counts[a] || 0) >= (props.group.counts[b] || 0) ? a : b)),
  );

  const handleMerge = () => {
    const canonical = selected();
    const aliases = props.group.group.filter((n) => n !== canonical);
    props.onMerge(canonical, aliases);
  };

  return (
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <For each={props.group.group}>
        {(name) => (
          <button
            onClick={() => setSelected(name)}
            class={`px-2 py-1 rounded border text-xs transition-colors ${
              selected() === name
                ? "border-astro-accent bg-astro-accent/20 text-white"
                : "border-gray-600 text-gray-400 hover:border-gray-400"
            }`}
          >
            {name}
            <span class="ml-1 text-gray-500">({props.group.counts[name] || 0})</span>
          </button>
        )}
      </For>
      <button
        onClick={handleMerge}
        class="px-2 py-1 bg-astro-accent text-white text-xs rounded hover:opacity-90"
      >
        Merge
      </button>
    </div>
  );
};
