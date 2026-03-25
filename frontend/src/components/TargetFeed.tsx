import { Component, For, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import TargetCard from "./TargetCard";

const TargetFeed: Component = () => {
  const { targetData } = useCatalog();

  return (
    <div class="space-y-3 p-4">
      <Show when={targetData.loading}>
        <div class="text-center text-astro-muted py-8">Loading targets...</div>
      </Show>
      <Show when={targetData.error}>
        <div class="text-center text-red-400 py-8">
          Failed to load targets: {String(targetData.error)}
        </div>
      </Show>
      <Show when={targetData()}>
        {(data) => (
          <Show
            when={data().targets.length > 0}
            fallback={<div class="text-center text-astro-muted py-8">No targets match your filters</div>}
          >
            <For each={data().targets}>
              {(target) => <TargetCard target={target} />}
            </For>
          </Show>
        )}
      </Show>
    </div>
  );
};

export default TargetFeed;
