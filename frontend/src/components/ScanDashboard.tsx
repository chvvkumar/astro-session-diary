import { Component, Show, createSignal, onCleanup } from "solid-js";
import { useScan } from "../store/scan";
import { useCatalog } from "../store/catalog";

const ScanDashboard: Component = () => {
  const { scanStatus, scanError, isActive, startScan, stopPolling } = useScan();
  const { refetchImages } = useCatalog();
  const [expanded, setExpanded] = createSignal(false);

  onCleanup(stopPolling);

  const handleScan = async () => {
    await startScan();
  };

  // Auto-refetch images when scan transitions to complete
  let prevState = scanStatus().state;
  const checkRefetch = () => {
    const cur = scanStatus().state;
    if (prevState === "ingesting" && cur === "complete") {
      refetchImages();
    }
    prevState = cur;
  };

  const progressPct = () => {
    const s = scanStatus();
    if (s.total === 0) return 0;
    return Math.round(((s.completed + s.failed) / s.total) * 100);
  };

  const elapsed = () => {
    const s = scanStatus();
    if (!s.started_at) return null;
    const end = s.completed_at || Date.now() / 1000;
    return Math.round(end - s.started_at);
  };

  const throughput = () => {
    const s = scanStatus();
    const el = elapsed();
    if (!el || el === 0 || s.completed === 0) return null;
    return (s.completed / el).toFixed(1);
  };

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const stateLabel = () => {
    checkRefetch();
    const s = scanStatus().state;
    switch (s) {
      case "scanning": return "Discovering files...";
      case "ingesting": return "Ingesting";
      case "complete": return "Complete";
      default: return "Ready";
    }
  };

  const stateColor = () => {
    const s = scanStatus().state;
    switch (s) {
      case "scanning":
      case "ingesting": return "text-yellow-400";
      case "complete": return "text-green-400";
      default: return "text-astro-muted";
    }
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium text-sm">Scan & Ingest</h3>
        <button
          onClick={handleScan}
          disabled={isActive()}
          class="px-4 py-1.5 bg-astro-accent text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-astro-accent/80 transition-colors"
        >
          {isActive() ? "Scanning..." : "Scan Directory"}
        </button>
      </div>

      {/* Error */}
      <Show when={scanError()}>
        <p class="text-xs text-red-400">{scanError()}</p>
      </Show>

      {/* Progress bar — visible when active */}
      <Show when={isActive()}>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-astro-muted">
            <span>{stateLabel()}</span>
            <span>{scanStatus().completed + scanStatus().failed} / {scanStatus().total}</span>
          </div>
          <div class="w-full bg-astro-dark rounded-full h-2">
            <div
              class="bg-astro-accent h-2 rounded-full transition-all"
              style={{ width: `${progressPct()}%` }}
            />
          </div>
        </div>
      </Show>

      {/* Compact status when not active but has results */}
      <Show when={!isActive() && scanStatus().state === "complete"}>
        <div class="flex justify-between items-center text-xs">
          <span class={stateColor()}>{stateLabel()}</span>
          <span class="text-astro-muted">{scanStatus().completed} ingested</span>
        </div>
      </Show>

      {/* Expand toggle — only show when there's something to show */}
      <Show when={scanStatus().state !== "idle"}>
        <button
          onClick={() => setExpanded((v) => !v)}
          class="text-xs text-astro-accent hover:underline w-full text-left"
        >
          {expanded() ? "Hide details" : "Show details"}
        </button>
      </Show>

      {/* Expanded detail panel */}
      <Show when={expanded() && scanStatus().state !== "idle"}>
        <div class="border-t border-gray-700 pt-3 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-y-1.5 gap-x-4">
            <DetailRow label="Status" value={stateLabel()} valueClass={stateColor()} />
            <DetailRow label="Total files" value={String(scanStatus().total)} />
            <DetailRow label="Completed" value={String(scanStatus().completed)} valueClass="text-green-400" />
            <DetailRow label="Failed" value={String(scanStatus().failed)} valueClass={scanStatus().failed > 0 ? "text-red-400" : "text-astro-muted"} />
            <Show when={elapsed() != null}>
              <DetailRow label="Elapsed" value={formatDuration(elapsed()!)} />
            </Show>
            <Show when={throughput() != null}>
              <DetailRow label="Throughput" value={`${throughput()} files/s`} />
            </Show>
          </div>

          {/* Progress breakdown bar */}
          <Show when={scanStatus().total > 0}>
            <div class="w-full bg-astro-dark rounded-full h-3 overflow-hidden flex">
              <div
                class="bg-green-500 h-3 transition-all"
                style={{ width: `${(scanStatus().completed / scanStatus().total) * 100}%` }}
              />
              <div
                class="bg-red-500 h-3 transition-all"
                style={{ width: `${(scanStatus().failed / scanStatus().total) * 100}%` }}
              />
            </div>
            <div class="flex justify-between text-astro-muted">
              <span>{progressPct()}% complete</span>
              <Show when={scanStatus().failed > 0}>
                <span class="text-red-400">{scanStatus().failed} failed</span>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

function DetailRow(props: { label: string; value: string; valueClass?: string }) {
  return (
    <>
      <span class="text-astro-muted">{props.label}</span>
      <span class={props.valueClass || "text-white"}>{props.value}</span>
    </>
  );
}

export default ScanDashboard;
