import { Component, createSignal, For, Show } from "solid-js";
import { api } from "../api/client";
import { useCatalog } from "../store/catalog";
import type { TargetSearchResult } from "../types";

const SearchBar: Component = () => {
  const { updateFilter } = useCatalog();
  const [query, setQuery] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<TargetSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  let debounceTimer: ReturnType<typeof setTimeout>;

  const onInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceTimer);
    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await api.searchTargets(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const selectTarget = (target: TargetSearchResult) => {
    setQuery(target.primary_name);
    setShowSuggestions(false);
    updateFilter("target_name", target.primary_name);
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    setShowSuggestions(false);
    updateFilter("target_name", query() || undefined);
  };

  return (
    <form onSubmit={onSubmit} class="relative w-full max-w-md">
      <input
        type="text"
        value={query()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={() => suggestions().length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Search targets (e.g., M31, NGC 7000)..."
        class="w-full px-4 py-2 bg-astro-panel border border-gray-700 rounded-lg text-white placeholder-astro-muted focus:outline-none focus:ring-2 focus:ring-astro-accent"
      />

      <Show when={showSuggestions()}>
        <div class="absolute z-50 w-full mt-1 bg-astro-panel border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <For each={suggestions()}>
            {(target) => (
              <button
                type="button"
                class="w-full text-left px-4 py-2 hover:bg-astro-accent/20 text-white text-sm"
                onMouseDown={() => selectTarget(target)}
              >
                <span class="font-medium">{target.primary_name}</span>
                <Show when={target.object_type}>
                  <span class="text-astro-muted ml-2">({target.object_type})</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </form>
  );
};

export default SearchBar;
