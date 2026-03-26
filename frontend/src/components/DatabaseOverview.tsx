import { Component } from "solid-js";
import type { AggregateStats } from "../types";

function formatHours(s: number): string { return (s / 3600).toFixed(1) + "h"; }
function formatBytes(b: number): string {
  if (b < 1e9) return (b / 1e6).toFixed(0) + " MB";
  if (b < 1e12) return (b / 1e9).toFixed(1) + " GB";
  return (b / 1e12).toFixed(2) + " TB";
}

const DatabaseOverview: Component<{
  overview: AggregateStats;
  avgHfr: number | null;
  avgEccentricity: number | null;
  bestHfr: number | null;
}> = (props) => {
  const cards = () => [
    { label: "Total Integration", value: formatHours(props.overview.total_integration_seconds) },
    { label: "Targets", value: String(props.overview.target_count) },
    { label: "Total Frames", value: props.overview.total_frames.toLocaleString() },
    { label: "Total Storage", value: formatBytes(props.overview.disk_usage_bytes) },
    { label: "Avg HFR", value: props.avgHfr?.toFixed(2) ?? "—" },
    { label: "Avg Ecc", value: props.avgEccentricity?.toFixed(2) ?? "—" },
    { label: "Best HFR", value: props.bestHfr?.toFixed(2) ?? "—" },
  ];

  return (
    <div class="grid grid-cols-7 gap-3">
      {cards().map((c) => (
        <div class="bg-astro-panel rounded-lg p-4 text-center">
          <div class="text-xs text-astro-muted mb-1">{c.label}</div>
          <div class="text-white font-bold text-xl">{c.value}</div>
        </div>
      ))}
    </div>
  );
};

export default DatabaseOverview;
