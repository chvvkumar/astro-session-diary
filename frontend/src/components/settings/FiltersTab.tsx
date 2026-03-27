// frontend/src/components/settings/FiltersTab.tsx
import { createSignal, createEffect, createMemo, For, Show, onMount, type Component } from "solid-js";
import { useSettingsContext } from "../SettingsProvider";
import { showToast } from "../Toast";
import { SuggestionsBanner } from "./SuggestionsBanner";
import type { FilterConfig, SuggestionsResponse } from "../../types";
import { api } from "../../api/client";

export const FiltersTab: Component = () => {
  const { settings, saveFilters } = useSettingsContext();
  const [local, setLocal] = createSignal<Record<string, FilterConfig>>({});
  const [suggestions, setSuggestions] = createSignal<SuggestionsResponse>({ suggestions: [] });
  const [saving, setSaving] = createSignal(false);
  const [newFilterName, setNewFilterName] = createSignal("");

  createEffect(() => {
    const s = settings();
    if (s) setLocal({ ...s.filters });
  });

  const filterNames = createMemo(() => Object.keys(local()));

  onMount(async () => {
    try {
      const data = await api.getFilterSuggestions();
      setSuggestions(data);
    } catch {
      // Suggestions are optional — don't block the tab
    }
  });

  const handleMerge = (canonical: string, aliases: string[], _section?: string) => {
    setLocal((prev) => {
      const updated = { ...prev };
      // Ensure canonical entry exists
      if (!updated[canonical]) {
        updated[canonical] = { color: "#808080", aliases: [] };
      }
      // Add new aliases (deduplicated)
      const existing = new Set(updated[canonical].aliases);
      for (const alias of aliases) {
        existing.add(alias);
        // Remove alias if it was its own entry
        delete updated[alias];
      }
      updated[canonical] = { ...updated[canonical], aliases: [...existing] };
      return updated;
    });
    // Remove merged group from suggestions
    setSuggestions((prev) => ({
      suggestions: prev.suggestions.filter(
        (g) => !g.group.includes(canonical) || g.group.every((n) => n === canonical),
      ),
    }));
  };

  const updateColor = (name: string, color: string) => {
    setLocal((prev) => ({
      ...prev,
      [name]: { ...prev[name], color },
    }));
  };

  const removeAlias = (filterName: string, alias: string) => {
    setLocal((prev) => ({
      ...prev,
      [filterName]: {
        ...prev[filterName],
        aliases: prev[filterName].aliases.filter((a) => a !== alias),
      },
    }));
  };

  const addFilter = () => {
    const name = newFilterName().trim();
    if (!name || local()[name]) return;
    setLocal((prev) => ({
      ...prev,
      [name]: { color: "#808080", aliases: [] },
    }));
    setNewFilterName("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFilters(local());
      showToast("Filter settings saved");
      // Refresh suggestions
      const data = await api.getFilterSuggestions();
      setSuggestions(data);
    } catch {
      showToast("Failed to save filter settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-6">
      <SuggestionsBanner suggestions={suggestions().suggestions} onMerge={handleMerge} />

      <div class="space-y-3">
        <For each={filterNames()}>
          {(name) => {
            const conf = () => local()[name] || { color: "#808080", aliases: [] };
            return (
              <div class="flex items-center gap-3 bg-astro-dark/50 rounded px-3 py-2">
                <input
                  type="color"
                  value={conf().color}
                  onInput={(e) => updateColor(name, e.currentTarget.value)}
                  class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
                <span class="text-sm text-white font-medium min-w-[60px]">{name}</span>
                <div class="flex flex-wrap gap-1 flex-1">
                  <For each={conf().aliases}>
                    {(alias) => (
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                        {alias}
                        <button
                          onClick={() => removeAlias(name, alias)}
                          class="text-gray-500 hover:text-red-400"
                        >
                          x
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* Add filter */}
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="New filter name"
          value={newFilterName()}
          onInput={(e) => setNewFilterName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && addFilter()}
          class="px-3 py-2 bg-astro-dark border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-astro-accent"
        />
        <button
          onClick={addFilter}
          class="px-3 py-2 border border-gray-600 text-gray-300 rounded text-sm hover:border-astro-accent hover:text-white transition-colors"
        >
          Add Filter
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving()}
        class="px-4 py-2 bg-astro-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving() ? "Saving..." : "Save"}
      </button>
    </div>
  );
};
