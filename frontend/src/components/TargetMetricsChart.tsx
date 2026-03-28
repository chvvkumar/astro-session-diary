import { createMemo, createEffect, onCleanup, Show } from "solid-js";
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip } from "chart.js";
import type { SessionOverview } from "../types";
import { useSettingsContext } from "./SettingsProvider";
import { METRIC_DEFINITIONS, getMetricColor, getMetricDef } from "../utils/chartConfig";
import MetricTogglePills from "./MetricTogglePills";
import FilterTogglePills from "./FilterTogglePills";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

const TARGET_METRICS = METRIC_DEFINITIONS.filter((m) => m.overviewField !== "");

interface Props {
  sessions: SessionOverview[];
  selectedDates: string[];
  expanded: boolean;
}

export default function TargetMetricsChart(props: Props) {
  const { graphSettings } = useSettingsContext();
  let canvasRef: HTMLCanvasElement | undefined;
  let chartInstance: Chart | null = null;

  const allFilters = createMemo(() => {
    const filterSet = new Set<string>();
    for (const s of props.sessions) {
      for (const f of s.filters_used) filterSet.add(f);
    }
    return [...filterSet].sort();
  });

  const selectedSessions = createMemo(() => {
    const dateSet = new Set(props.selectedDates);
    return [...props.sessions]
      .filter((s) => dateSet.has(s.session_date))
      .sort((a, b) => a.session_date.localeCompare(b.session_date));
  });

  const buildChart = () => {
    if (!canvasRef) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const enabledMetrics = graphSettings().enabled_metrics;
    const enabledFilters = graphSettings().enabled_filters;
    const sessions = selectedSessions();
    const labels = sessions.map((s) => s.session_date);

    const datasets: any[] = [];

    for (const metricKey of enabledMetrics) {
      const def = getMetricDef(metricKey);
      if (!def || !def.overviewField) continue;
      const color = getMetricColor(def.colorVar);
      const field = def.overviewField as keyof SessionOverview;

      if (enabledFilters.includes("overall")) {
        datasets.push({
          label: def.label,
          data: sessions.map((s) => (s[field] as number | null) ?? null),
          borderColor: color,
          backgroundColor: `${color}33`,
          borderWidth: 1.5,
          pointRadius: 3,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: true,
          yAxisID: def.yAxisId,
        });
      }

      for (const filterName of enabledFilters) {
        if (filterName === "overall") continue;
        const filterMedField = `median_${metricKey}` as string;
        datasets.push({
          label: `${def.label} (${filterName})`,
          data: sessions.map((s) => {
            const fm = s.filter_medians?.find((f) => f.filter_name === filterName);
            return fm ? ((fm as any)[filterMedField] ?? null) : null;
          }),
          borderColor: color,
          backgroundColor: `${color}33`,
          borderWidth: 1.5,
          pointRadius: 3,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: false,
          yAxisID: def.yAxisId,
          borderDash: [4, 2],
        });
      }
    }

    chartInstance = new Chart(canvasRef, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleFont: { size: 11 },
            bodyFont: { size: 10 },
            padding: 8,
          },
        },
        scales: {
          x: {
            ticks: { color: "#64748b", font: { size: 9 }, maxRotation: 45 },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          left: {
            type: "linear",
            position: "left",
            ticks: { color: "#64748b", font: { size: 9 } },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          right: {
            type: "linear",
            position: "right",
            ticks: { color: "#64748b", font: { size: 9 } },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  };

  createEffect(() => {
    // Track reactive dependencies
    selectedSessions();
    graphSettings();
    if (props.expanded) {
      // Defer to next microtask so canvas is mounted
      queueMicrotask(buildChart);
    }
  });

  onCleanup(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  const availableMetricKeys = () => TARGET_METRICS.map((m) => m.key);

  return (
    <Show when={props.expanded}>
      <div class="border border-theme-border rounded-lg p-3 bg-theme-base mb-4">
        <div class="flex justify-between items-start gap-4 mb-2">
          <div class="text-[9px] text-theme-text-tertiary uppercase tracking-wider">Target Metrics Across Sessions</div>
          <MetricTogglePills availableMetrics={availableMetricKeys()} />
        </div>
        <div class="mb-3">
          <FilterTogglePills filters={allFilters()} />
        </div>
        <div style={{ height: "200px" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </Show>
  );
}

export function MetricsTrendButton(props: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      class="px-3 py-1.5 border border-theme-border-em rounded-lg bg-theme-surface text-[11px] text-theme-text-secondary hover:text-theme-text-primary hover:border-theme-accent transition-colors cursor-pointer flex items-center gap-1.5"
      onClick={props.onToggle}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      Metrics Trend
      <span class="text-theme-text-tertiary text-[9px]">{props.expanded ? "\u25B2" : "\u25BC"}</span>
    </button>
  );
}
