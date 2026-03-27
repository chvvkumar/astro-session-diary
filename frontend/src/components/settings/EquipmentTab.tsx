// frontend/src/components/settings/EquipmentTab.tsx
import { createSignal, createEffect, For, onMount, type Component } from "solid-js";
import { useSettingsContext } from "../SettingsProvider";
import { showToast } from "../Toast";
import { SuggestionsBanner } from "./SuggestionsBanner";
import type { EquipmentConfig, SuggestionsResponse } from "../../types";
import { api } from "../../api/client";

export const EquipmentTab: Component = () => {
  const { settings, saveEquipment } = useSettingsContext();
  const [local, setLocal] = createSignal<EquipmentConfig>({ cameras: {}, telescopes: {} });
  const [suggestions, setSuggestions] = createSignal<SuggestionsResponse>({ suggestions: [] });
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    const s = settings();
    if (s) setLocal({ ...s.equipment });
  });

  onMount(async () => {
    try {
      const data = await api.getEquipmentSuggestions();
      setSuggestions(data);
    } catch {
      // Optional
    }
  });

  const handleMerge = (canonical: string, aliases: string[], section?: string) => {
    setLocal((prev) => {
      const updated = { cameras: { ...prev.cameras }, telescopes: { ...prev.telescopes } };
      // Use the section tag from the suggestion, or fall back to searching both sections
      const targetSection: "cameras" | "telescopes" =
        section === "cameras" || section === "telescopes"
          ? section
          : canonical in (prev.cameras || {}) || aliases.some((a) => a in (prev.cameras || {}))
            ? "cameras"
            : "telescopes";
      if (!updated[targetSection][canonical]) {
        updated[targetSection][canonical] = { aliases: [] };
      }
      const existing = new Set(updated[targetSection][canonical].aliases);
      for (const alias of aliases) {
        existing.add(alias);
        delete updated[targetSection][alias];
      }
      updated[targetSection][canonical] = { aliases: [...existing] };
      return updated;
    });
    setSuggestions((prev) => ({
      suggestions: prev.suggestions.filter(
        (g) => !g.group.includes(canonical) || g.group.every((n) => n === canonical),
      ),
    }));
  };

  const removeAlias = (section: "cameras" | "telescopes", name: string, alias: string) => {
    setLocal((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [name]: {
          aliases: prev[section][name].aliases.filter((a) => a !== alias),
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEquipment(local());
      showToast("Equipment settings saved");
      const data = await api.getEquipmentSuggestions();
      setSuggestions(data);
    } catch {
      showToast("Failed to save equipment settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (title: string, section: "cameras" | "telescopes") => (
    <div class="space-y-2">
      <h3 class="text-sm text-astro-muted font-medium uppercase tracking-wide">{title}</h3>
      <For each={Object.entries(local()[section] || {})}>
        {([name, conf]) => (
          <div class="flex items-center gap-3 bg-astro-dark/50 rounded px-3 py-2">
            <span class="text-sm text-white font-medium min-w-[140px]">{name}</span>
            <div class="flex flex-wrap gap-1 flex-1">
              <For each={conf.aliases}>
                {(alias) => (
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                    {alias}
                    <button
                      onClick={() => removeAlias(section, name, alias)}
                      class="text-gray-500 hover:text-red-400"
                    >
                      x
                    </button>
                  </span>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );

  return (
    <div class="space-y-6">
      <SuggestionsBanner suggestions={suggestions().suggestions} onMerge={handleMerge} />
      {renderSection("Cameras", "cameras")}
      {renderSection("Telescopes", "telescopes")}
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
