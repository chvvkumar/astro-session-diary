import { Component, Show, For, createSignal, createEffect } from "solid-js";
import type { SessionOverview, SessionDetail, FrameRecord } from "../types";
import ReferenceThumbnail from "./ReferenceThumbnail";
import RawHeaderAccordion from "./RawHeaderAccordion";
import FilterBadges from "./FilterBadges";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}


const INSIGHT_STYLES: Record<string, string> = {
  good: "text-green-400",
  warning: "text-amber-400",
  info: "text-astro-muted",
};

const INSIGHT_ICONS: Record<string, string> = {
  good: "✓",
  warning: "⚠",
  info: "•",
};

const SessionAccordionCard: Component<{
  session: SessionOverview;
  isExpanded: boolean;
  onToggle: () => void;
  detail: SessionDetail | null;
  autoScroll?: boolean;
}> = (props) => {
  let cardRef: HTMLDivElement | undefined;
  const [showFrames, setShowFrames] = createSignal(false);
  const [sortColumn, setSortColumn] = createSignal<keyof FrameRecord>("timestamp");
  const [sortAsc, setSortAsc] = createSignal(true);

  createEffect(() => {
    if (props.autoScroll && props.isExpanded && cardRef) {
      cardRef.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  const sortedFrames = () => {
    if (!props.detail) return [];
    const col = sortColumn();
    const asc = sortAsc();
    return [...props.detail.frames].sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  };

  const toggleSort = (col: keyof FrameRecord) => {
    if (sortColumn() === col) {
      setSortAsc(!sortAsc());
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  };

  const isOutlier = (frame: FrameRecord): boolean => {
    if (!props.detail?.median_hfr || !frame.median_hfr) return false;
    return frame.median_hfr > props.detail.median_hfr * 1.5;
  };

  return (
    <div
      ref={cardRef}
      class={`bg-astro-panel rounded-lg border ${
        props.isExpanded ? "border-astro-accent" : "border-[#2d2d2d]"
      } transition-colors`}
    >
      {/* Collapsed header — always visible */}
      <div
        class="px-4 py-3 grid cursor-pointer hover:bg-[#2a2a2a] transition-colors rounded-lg items-center text-xs"
        style={{ "grid-template-columns": "1fr auto auto auto" }}
        onClick={props.onToggle}
      >
        {/* Left: date + equipment */}
        <div>
          <span class="font-bold text-white text-sm">{props.session.session_date}</span>
          <span class="text-astro-muted ml-3">
            {props.session.camera ?? ""} · {props.session.telescope ?? ""}
          </span>
        </div>
        {/* Middle: fixed-width metrics */}
        <div class="flex items-center whitespace-nowrap">
          <span class="text-blue-400 tabular-nums w-12 text-right">{formatHours(props.session.integration_seconds)}</span>
          <span class="text-[#333] mx-1.5">|</span>
          <span class="text-green-400 tabular-nums w-12 text-right">{props.session.frame_count} fr</span>
          <span class="text-[#333] mx-1.5">|</span>
          <span class="text-amber-400 tabular-nums w-16 text-right">HFR {props.session.median_hfr?.toFixed(1) ?? "—"}</span>
          <span class="text-[#333] mx-1.5">|</span>
          <span class="text-purple-400 tabular-nums w-[4.5rem] text-right">Ecc {props.session.median_eccentricity?.toFixed(2) ?? "—"}</span>
        </div>
        {/* Right: filter badges */}
        <div class="flex justify-end ml-4">
          <FilterBadges distribution={Object.fromEntries(props.session.filters_used.map(f => [f, 0]))} compact nowrap />
        </div>
        {/* Expand toggle */}
        <span class="text-astro-muted ml-3">{props.isExpanded ? "▼" : "▶"}</span>
      </div>

      {/* Expanded content */}
      <Show when={props.isExpanded}>
        <div class="px-4 pb-4 border-t border-[#2d2d2d]">
          <Show when={!props.detail}>
            <div class="py-4 text-astro-muted text-sm">Loading session data...</div>
          </Show>

          <Show when={props.detail}>
            {(detail) => (
              <div class="space-y-5 pt-4">
                {/* Row 1: Thumbnail + Quality Metrics */}
                <div class="flex gap-4">
                  <div class="w-48 flex-shrink-0">
                    <ReferenceThumbnail url={detail().thumbnail_url} />
                  </div>
                  <div class="flex-1 grid grid-cols-4 gap-2">
                    <MetricCard label="Integration" value={formatHours(detail().integration_seconds)} color="text-blue-400" />
                    <MetricCard label="Frames" value={String(detail().frame_count)} color="text-green-400" />
                    <MetricCard
                      label="Median HFR"
                      value={detail().median_hfr?.toFixed(2) ?? "—"}
                      color="text-amber-400"
                      subtitle={detail().min_hfr !== null ? `min ${detail().min_hfr?.toFixed(1)} · max ${detail().max_hfr?.toFixed(1)}` : undefined}
                    />
                    <MetricCard
                      label="Median Ecc"
                      value={detail().median_eccentricity?.toFixed(2) ?? "—"}
                      color="text-purple-400"
                      subtitle={detail().min_eccentricity !== null ? `min ${detail().min_eccentricity?.toFixed(2)} · max ${detail().max_eccentricity?.toFixed(2)}` : undefined}
                    />
                    <MetricCard
                      label="Sensor Temp"
                      value={detail().sensor_temp !== null ? `${detail().sensor_temp?.toFixed(0)}°C` : "—"}
                      color="text-sky-300"
                      subtitle={detail().sensor_temp_min !== null ? `range: ${detail().sensor_temp_min?.toFixed(0)} to ${detail().sensor_temp_max?.toFixed(0)}°C` : undefined}
                    />
                    <MetricCard label="Gain" value={detail().gain !== null ? String(detail().gain) : "—"} color="text-green-300" />
                    <MetricCard label="Exposure" value={detail().exposure_time !== null ? `${detail().exposure_time}s` : "—"} color="text-yellow-300" />
                    <MetricCard
                      label="Time Span"
                      value={detail().first_frame_time ? formatTime(detail().first_frame_time!) : "—"}
                      color="text-red-300"
                      subtitle={detail().last_frame_time ? `→ ${formatTime(detail().last_frame_time!)}` : undefined}
                    />
                  </div>
                </div>

                {/* Row 2: Filter Breakdown */}
                <Show when={detail().filter_details.length > 0}>
                  <div>
                    <h4 class="text-xs font-bold text-white mb-2">Filter Breakdown</h4>
                    <div class="flex gap-3">
                      <For each={detail().filter_details}>
                        {(fd) => (
                          <div class="flex-1 bg-astro-dark rounded-lg p-3 border border-[#2d2d2d]">
                            <div class="flex justify-between text-xs">
                              <span class="font-bold">{fd.filter_name}</span>
                              <span class="text-astro-muted">{fd.frame_count} frames · {formatHours(fd.integration_seconds)}</span>
                            </div>
                            <div class="text-[11px] text-astro-muted mt-1">
                              HFR {fd.median_hfr?.toFixed(1) ?? "—"} · Ecc {fd.median_eccentricity?.toFixed(2) ?? "—"} · {fd.exposure_time ?? "—"}s subs
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Row 3: Session Insights */}
                <Show when={detail().insights.length > 0}>
                  <div>
                    <h4 class="text-xs font-bold text-white mb-2">Session Insights</h4>
                    <div class="bg-astro-dark rounded-lg p-3 space-y-1">
                      <For each={detail().insights}>
                        {(insight) => (
                          <div class={`text-xs ${INSIGHT_STYLES[insight.level]}`}>
                            {INSIGHT_ICONS[insight.level]} {insight.message}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Row 4: Per-Frame Table (collapsed) */}
                <div>
                  <button
                    class="flex justify-between items-center w-full text-xs mb-2"
                    onClick={() => setShowFrames(!showFrames())}
                  >
                    <span class="font-bold text-white">
                      Per-Frame Data <span class="text-astro-muted font-normal">({detail().frames.length} frames)</span>
                    </span>
                    <span class="text-astro-muted">{showFrames() ? "▼ Collapse" : "▶ Expand"}</span>
                  </button>
                  <Show when={showFrames()}>
                    <div class="bg-astro-dark rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
                      <table class="w-full text-[11px]">
                        <thead class="sticky top-0 bg-astro-dark">
                          <tr class="text-astro-muted border-b border-[#2d2d2d]">
                            <SortHeader label="Time" column="timestamp" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="Filter" column="filter_used" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="Exp" column="exposure_time" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="HFR" column="median_hfr" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="Ecc" column="eccentricity" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="Temp" column="sensor_temp" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <SortHeader label="Gain" column="gain" current={sortColumn()} asc={sortAsc()} onSort={toggleSort} />
                            <th class="text-left py-1.5 px-2 font-normal">File</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={sortedFrames()}>
                            {(frame) => (
                              <tr class={`border-b border-[#2d2d2d]/30 ${isOutlier(frame) ? "bg-red-900/20" : ""}`}>
                                <td class="py-1 px-2 text-white">{formatTime(frame.timestamp)}</td>
                                <td class="py-1 px-2 text-white">{frame.filter_used ?? "—"}</td>
                                <td class="py-1 px-2 text-white text-right">{frame.exposure_time ?? "—"}s</td>
                                <td class={`py-1 px-2 text-right ${isOutlier(frame) ? "text-red-400 font-bold" : "text-white"}`}>
                                  {frame.median_hfr?.toFixed(2) ?? "—"}
                                </td>
                                <td class="py-1 px-2 text-white text-right">{frame.eccentricity?.toFixed(2) ?? "—"}</td>
                                <td class="py-1 px-2 text-white text-right">{frame.sensor_temp?.toFixed(0) ?? "—"}°C</td>
                                <td class="py-1 px-2 text-white text-right">{frame.gain ?? "—"}</td>
                                <td class="py-1 px-2 text-astro-muted truncate max-w-[150px]">{frame.file_name}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </div>

                {/* Row 5: FITS Headers */}
                <RawHeaderAccordion headers={detail().raw_reference_header} />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
};

// --- Helper components ---

const MetricCard: Component<{
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}> = (props) => (
  <div class="bg-astro-dark rounded-lg p-2.5 text-center">
    <div class={`text-base font-bold ${props.color}`}>{props.value}</div>
    <div class="text-[10px] text-astro-muted">{props.label}</div>
    <Show when={props.subtitle}>
      <div class="text-[9px] text-astro-muted/60 mt-0.5">{props.subtitle}</div>
    </Show>
  </div>
);

const SortHeader: Component<{
  label: string;
  column: keyof FrameRecord;
  current: keyof FrameRecord;
  asc: boolean;
  onSort: (col: keyof FrameRecord) => void;
}> = (props) => (
  <th
    class="text-left py-1.5 px-2 font-normal cursor-pointer hover:text-white transition-colors"
    onClick={() => props.onSort(props.column)}
  >
    {props.label}
    {props.current === props.column ? (props.asc ? " ↑" : " ↓") : ""}
  </th>
);

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default SessionAccordionCard;
