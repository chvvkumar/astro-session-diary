import { Component, Show, createSignal, onCleanup } from "solid-js";
import { useScan } from "../store/scan";

type FrameFilter = "all" | "light_only";

const ScanManager: Component = () => {
  const { scanStatus, scanError, isActive, startScan, startRegeneration, stopPolling } = useScan();
  const [expanded, setExpanded] = createSignal(false);
  const [frameFilter, setFrameFilter] = createSignal<FrameFilter>("all");

  onCleanup(stopPolling);

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
    const el = elapsed();
    if (!el || el === 0 || scanStatus().completed === 0) return null;
    return (scanStatus().completed / el).toFixed(1);
  };

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const stateLabel = () => {
    switch (scanStatus().state) {
      case "scanning": return "Discovering files...";
      case "ingesting": return "Ingesting";
      case "complete": return "Complete";
      default: return "Ready";
    }
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium">Scan & Ingest</h3>
        <div class="flex gap-2">
          <button
            onClick={() => startRegeneration()}
            disabled={isActive()}
            class="px-3 py-1.5 border border-[#2d2d2d] text-astro-muted rounded text-sm disabled:opacity-50 hover:text-white hover:border-astro-accent transition-colors"
          >
            Regen Thumbnails
          </button>
          <button
            onClick={() => startScan({ includeCalibration: frameFilter() === "all" })}
            disabled={isActive()}
            class="px-4 py-1.5 bg-astro-accent text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-astro-accent/80 transition-colors"
          >
            {isActive() ? "Scanning..." : "Scan Directory"}
          </button>
        </div>
      </div>

      <div class="flex items-center gap-4 text-sm">
        <span class="text-astro-muted text-xs">Include:</span>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="frame-filter"
            checked={frameFilter() === "all"}
            onChange={() => setFrameFilter("all")}
            disabled={isActive()}
            class="accent-astro-accent"
          />
          <span class={`text-xs ${frameFilter() === "all" ? "text-white" : "text-astro-muted"}`}>All frames</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="frame-filter"
            checked={frameFilter() === "light_only"}
            onChange={() => setFrameFilter("light_only")}
            disabled={isActive()}
            class="accent-astro-accent"
          />
          <span class={`text-xs ${frameFilter() === "light_only" ? "text-white" : "text-astro-muted"}`}>Light frames only</span>
        </label>
      </div>

      <Show when={scanError()}>
        <p class="text-xs text-red-400">{scanError()}</p>
      </Show>

      <Show when={isActive()}>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-astro-muted">
            <span>{stateLabel()}</span>
            <span>{scanStatus().completed + scanStatus().failed} / {scanStatus().total}</span>
          </div>
          <div class="w-full bg-astro-dark rounded-full h-2">
            <div class="bg-astro-accent h-2 rounded-full transition-all" style={{ width: `${progressPct()}%` }} />
          </div>
        </div>
      </Show>

      <Show when={!isActive() && scanStatus().state === "complete"}>
        <div class="flex justify-between items-center text-xs">
          <span class="text-green-400">Complete</span>
          <span class="text-astro-muted">{scanStatus().completed} ingested</span>
        </div>
      </Show>

      <Show when={scanStatus().state !== "idle"}>
        <button onClick={() => setExpanded((v) => !v)} class="text-xs text-astro-accent hover:underline w-full text-left">
          {expanded() ? "Hide details" : "Show details"}
        </button>
      </Show>

      <Show when={expanded() && scanStatus().state !== "idle"}>
        <div class="border-t border-gray-700 pt-3 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-y-1.5 gap-x-4">
            <span class="text-astro-muted">Status</span><span class="text-white">{stateLabel()}</span>
            <span class="text-astro-muted">Total</span><span class="text-white">{scanStatus().total}</span>
            <span class="text-astro-muted">Completed</span><span class="text-green-400">{scanStatus().completed}</span>
            <span class="text-astro-muted">Failed</span><span class={scanStatus().failed > 0 ? "text-red-400" : "text-astro-muted"}>{scanStatus().failed}</span>
            <Show when={elapsed() != null}>
              <span class="text-astro-muted">Elapsed</span><span class="text-white">{formatDuration(elapsed()!)}</span>
            </Show>
            <Show when={throughput() != null}>
              <span class="text-astro-muted">Throughput</span><span class="text-white">{throughput()} files/s</span>
            </Show>
          </div>
          <Show when={scanStatus().total > 0}>
            <div class="w-full bg-astro-dark rounded-full h-3 overflow-hidden flex">
              <div class="bg-green-500 h-3 transition-all" style={{ width: `${(scanStatus().completed / scanStatus().total) * 100}%` }} />
              <div class="bg-red-500 h-3 transition-all" style={{ width: `${(scanStatus().failed / scanStatus().total) * 100}%` }} />
            </div>
          </Show>
        </div>
      </Show>

    </div>
  );
};

export default ScanManager;
