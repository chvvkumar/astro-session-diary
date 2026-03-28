import { createSignal, createEffect, For, Show } from "solid-js";
import { useSettingsContext } from "./SettingsProvider";
import type { DisplaySettings, MetricGroupSettings } from "../types";

const GROUP_META: { key: keyof DisplaySettings; label: string; fieldLabels: Record<string, string> }[] = [
  { key: "quality", label: "Quality Metrics", fieldLabels: { hfr: "HFR", hfr_stdev: "HFR StDev", fwhm: "FWHM", eccentricity: "Eccentricity", detected_stars: "Detected Stars" } },
  { key: "guiding", label: "Guiding", fieldLabels: { rms_total: "RMS Total", rms_ra: "RMS RA", rms_dec: "RMS Dec" } },
  { key: "adu", label: "ADU Statistics", fieldLabels: { mean: "Mean", median: "Median", stdev: "StDev", min: "Min", max: "Max" } },
  { key: "focuser", label: "Focuser", fieldLabels: { position: "Position", temp: "Temperature" } },
  { key: "weather", label: "Weather", fieldLabels: { ambient_temp: "Temperature", dew_point: "Dew Point", humidity: "Humidity", pressure: "Pressure", wind_speed: "Wind Speed", wind_direction: "Wind Direction", wind_gust: "Wind Gust", cloud_cover: "Cloud Cover", sky_quality: "Sky Quality" } },
  { key: "mount", label: "Mount", fieldLabels: { airmass: "Airmass", pier_side: "Pier Side", rotator_position: "Rotator Position" } },
];

export default function DisplayTab() {
  const ctx = useSettingsContext();
  const [local, setLocal] = createSignal<DisplaySettings | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  createEffect(() => {
    const ds = ctx.settings()?.display;
    if (ds && !local()) setLocal(structuredClone(ds));
  });

  const toggleCollapsed = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleGroupEnabled = (key: keyof DisplaySettings) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const clone = structuredClone(prev);
      clone[key].enabled = !clone[key].enabled;
      return clone;
    });
  };

  const toggleField = (groupKey: keyof DisplaySettings, fieldKey: string) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const clone = structuredClone(prev);
      clone[groupKey].fields[fieldKey] = !clone[groupKey].fields[fieldKey];
      return clone;
    });
  };

  const handleSave = async () => {
    const data = local();
    if (!data) return;
    setSaving(true);
    try { await ctx.saveDisplay(data); } finally { setSaving(false); }
  };

  return (
    <div class="space-y-4">
      <p class="text-sm text-theme-text-secondary">Choose which metric groups and individual fields appear on target detail pages.</p>
      <Show when={local()} fallback={<p class="text-theme-text-secondary">Loading...</p>}>
        {(settings) => (
          <>
            <For each={GROUP_META}>
              {(group) => {
                const gs = (): MetricGroupSettings => settings()[group.key];
                const isCollapsed = () => !!collapsed()[group.key];
                return (
                  <div class="rounded-lg bg-theme-surface border border-theme-border">
                    <div class="flex items-center justify-between px-4 py-3">
                      <button type="button" class="flex items-center gap-2 text-sm font-medium text-theme-text-primary hover:text-theme-text-secondary" onClick={() => toggleCollapsed(group.key)}>
                        <svg class={`w-4 h-4 transition-transform ${isCollapsed() ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                        {group.label}
                      </button>
                      <button type="button" role="switch" aria-checked={gs().enabled} class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${gs().enabled ? "bg-theme-accent" : "bg-theme-text-tertiary"}`} onClick={() => toggleGroupEnabled(group.key)}>
                        <span class={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${gs().enabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                    <Show when={!isCollapsed()}>
                      <div class={`px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2 ${!gs().enabled ? "opacity-40" : ""}`}>
                        <For each={Object.entries(group.fieldLabels)}>
                          {([fieldKey, fieldLabel]) => (
                            <label class="flex items-center gap-2 text-sm text-theme-text-primary cursor-pointer">
                              <input type="checkbox" checked={gs().fields[fieldKey] ?? false} disabled={!gs().enabled} onChange={() => toggleField(group.key, fieldKey)} class="rounded border-theme-border bg-theme-base text-theme-accent focus:ring-theme-accent focus:ring-offset-0 h-4 w-4" />
                              {fieldLabel}
                            </label>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
            <div class="flex justify-end pt-2">
              <button type="button" class="px-4 py-2 text-sm font-medium rounded-lg bg-theme-accent hover:bg-theme-accent-hover text-theme-text-primary disabled:opacity-50" disabled={saving()} onClick={handleSave}>
                {saving() ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
