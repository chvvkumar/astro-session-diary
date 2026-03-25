import { Component } from "solid-js";
import type { AggregateStats } from "../types";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

function formatBytes(bytes: number): string {
  if (bytes < 1e9) return (bytes / 1e6).toFixed(0) + " MB";
  if (bytes < 1e12) return (bytes / 1e9).toFixed(1) + " GB";
  return (bytes / 1e12).toFixed(2) + " TB";
}

const AggregateWidgets: Component<{ aggregates: AggregateStats }> = (props) => {
  const widgets = () => [
    { label: "Integration", value: formatHours(props.aggregates.total_integration_seconds) },
    { label: "Targets", value: String(props.aggregates.target_count) },
    { label: "Frames", value: props.aggregates.total_frames.toLocaleString() },
    { label: "Disk", value: formatBytes(props.aggregates.disk_usage_bytes) },
  ];

  return (
    <div class="flex gap-4">
      {widgets().map((w) => (
        <div class="bg-astro-panel rounded px-3 py-2">
          <div class="text-xs text-astro-muted">{w.label}</div>
          <div class="text-white font-semibold text-sm">{w.value}</div>
        </div>
      ))}
    </div>
  );
};

export default AggregateWidgets;
