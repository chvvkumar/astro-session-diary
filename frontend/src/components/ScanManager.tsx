import { Component, Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { useScan } from "../store/scan";
import { useSettingsContext } from "./SettingsProvider";
import { api } from "../api/client";

type FrameFilter = "all" | "light_only";

const ScanManager: Component = () => {
  const { scanStatus, scanError, isActive, startScan, startRegeneration, resetScan, stopPolling } = useScan();
  const { settings } = useSettingsContext();
  const [expanded, setExpanded] = createSignal(true);
  const [frameFilter, setFrameFilter] = createSignal<FrameFilter>("all");
  const [dbSummary, setDbSummary] = createSignal<import("../types").DbSummary | null>(null);

  const refreshDbSummary = async () => {
    try { setDbSummary(await api.getDbSummary()); } catch { /* ignore */ }
  };
  refreshDbSummary();

  // Refresh DB summary when scan completes or goes idle
  createEffect(() => {
    const s = scanStatus().state;
    if (s === "complete" || s === "idle") refreshDbSummary();
  });

  // Sync frameFilter from server settings once loaded
  createEffect(() => {
    const s = settings();
    if (s) {
      setFrameFilter(s.general.include_calibration ? "all" : "light_only");
    }
  });

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
      case "stalled": return "Stalled";
      default: return "Ready";
    }
  };

  const lostCount = () => {
    const s = scanStatus();
    return s.total - s.completed - s.failed;
  };

  const handleResetAndRescan = async () => {
    await resetScan();
    startScan({ includeCalibration: frameFilter() === "all" });
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium">Scan & Ingest</h3>
        <div class="flex gap-2">
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

      {/* Stalled state — explain what happened and offer remediation */}
      <Show when={scanStatus().state === "stalled"}>
        <div class="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 space-y-2">
          <div class="flex items-start gap-2">
            <span class="text-yellow-400 text-sm font-medium">Scan stalled</span>
          </div>
          <p class="text-xs text-yellow-200/80">
            {scanStatus().completed + scanStatus().failed} of {scanStatus().total} files were processed
            ({scanStatus().completed} ingested, {scanStatus().failed} failed)
            but {lostCount()} tasks stopped responding — likely due to a container restart or worker crash.
          </p>
          <p class="text-xs text-yellow-200/60">
            Already-ingested files are safe. A rescan will pick up the {lostCount()} remaining files.
          </p>
          <div class="flex gap-2 pt-1">
            <button
              onClick={handleResetAndRescan}
              class="px-3 py-1.5 bg-astro-accent text-white rounded text-xs font-medium hover:bg-astro-accent/80 transition-colors"
            >
              Reset & Rescan
            </button>
            <button
              onClick={resetScan}
              class="px-3 py-1.5 border border-gray-600 text-gray-300 rounded text-xs hover:border-astro-accent hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
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
          <span class="text-astro-muted">
            {scanStatus().completed} ingested
            {scanStatus().csv_enriched > 0 ? ` \u00b7 ${scanStatus().csv_enriched} with CSV metrics` : ""}
            {scanStatus().completed_at ? ` \u00b7 ${new Date(scanStatus().completed_at! * 1000).toLocaleString()}` : ""}
          </span>
        </div>
      </Show>

      <Show when={!isActive() && scanStatus().state === "idle" && scanStatus().completed_at}>
        <div class="text-xs text-astro-muted">
          Last scan: {new Date(scanStatus().completed_at! * 1000).toLocaleString()}
          {scanStatus().completed > 0 ? ` \u00b7 ${scanStatus().completed} ingested` : ""}
          {scanStatus().csv_enriched > 0 ? ` \u00b7 ${scanStatus().csv_enriched} with CSV` : ""}
        </div>
      </Show>

      <Show when={scanStatus().state !== "idle" && scanStatus().state !== "stalled"}>
        <button onClick={() => setExpanded((v) => !v)} class="text-xs text-astro-accent hover:underline w-full text-left">
          {expanded() ? "Hide details" : "Show details"}
        </button>
      </Show>

      <Show when={expanded() && scanStatus().state !== "idle" && scanStatus().state !== "stalled"}>
        <div class="border-t border-gray-700 pt-3 space-y-2 text-xs">
          <div class="grid grid-cols-2 gap-y-1.5 gap-x-4">
            <span class="text-astro-muted">Status</span><span class="text-white">{stateLabel()}</span>
            <span class="text-astro-muted">Total</span><span class="text-white">{scanStatus().total}</span>
            <span class="text-astro-muted">Completed</span><span class="text-green-400">{scanStatus().completed}</span>
            <span class="text-astro-muted">Failed</span><span class={scanStatus().failed > 0 ? "text-red-400" : "text-astro-muted"}>{scanStatus().failed}</span>
            <Show when={scanStatus().csv_enriched > 0}>
              <span class="text-astro-muted">CSV Enriched</span><span class="text-blue-400">{scanStatus().csv_enriched}</span>
            </Show>
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
          <Show when={(scanStatus().failed_files?.length ?? 0) > 0}>
            <div class="mt-2 space-y-1">
              <span class="text-red-400 font-medium">Failed files:</span>
              <div class="max-h-40 overflow-y-auto space-y-1">
                <For each={scanStatus().failed_files}>
                  {(f) => (
                    <div class="border border-[#2d2d2d] rounded px-2 py-1">
                      <div class="text-astro-muted break-all">{f.file}</div>
                      <div class="text-red-400/70 truncate" title={f.error}>{f.error}</div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Database Summary */}
      <Show when={dbSummary()}>
        <div class="border-t border-gray-700 pt-3 mt-1">
          <div class="grid grid-cols-5 gap-2 text-center">
            <div>
              <div class="text-sm font-medium text-white">{dbSummary()!.total_images.toLocaleString()}</div>
              <div class="text-xs text-astro-muted">Total Images</div>
            </div>
            <div>
              <div class="text-sm font-medium text-white">{dbSummary()!.light_frames.toLocaleString()}</div>
              <div class="text-xs text-astro-muted">Light Frames</div>
            </div>
            <div>
              <div class="text-sm font-medium text-white">{dbSummary()!.resolved_targets}</div>
              <div class="text-xs text-astro-muted">Targets</div>
            </div>
            <div>
              <div class={`text-sm font-medium ${dbSummary()!.unresolved_images > 0 ? "text-yellow-400" : "text-white"}`}>
                {dbSummary()!.unresolved_images}
              </div>
              <div class="text-xs text-astro-muted">Unresolved</div>
            </div>
            <div>
              <div class="text-sm font-medium text-blue-400">{dbSummary()!.csv_enriched.toLocaleString()}</div>
              <div class="text-xs text-astro-muted">CSV Enriched</div>
            </div>
          </div>
          <Show when={dbSummary()!.cached_simbad > 0 || dbSummary()!.pending_merges > 0}>
            <div class="flex gap-4 mt-2 text-xs text-astro-muted justify-center">
              <Show when={dbSummary()!.cached_simbad > 0}>
                <span>{dbSummary()!.cached_simbad} SIMBAD cached ({dbSummary()!.cached_negative} negative)</span>
              </Show>
              <Show when={dbSummary()!.pending_merges > 0}>
                <span class="text-yellow-400">{dbSummary()!.pending_merges} pending merges</span>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Database Maintenance */}
      <RebuildTargetsSection disabled={isActive()} onRegenThumbnails={startRegeneration} onRefreshSummary={refreshDbSummary} />

    </div>
  );
};


const RebuildTargetsSection: Component<{ disabled: boolean; onRegenThumbnails: () => void; onRefreshSummary: () => void }> = (props) => {
  const [showFullConfirm, setShowFullConfirm] = createSignal(false);
  const [rebuildState, setRebuildState] = createSignal<import("../types").RebuildStatus>({
    state: "idle", mode: "", message: "", started_at: null, completed_at: null, details: {},
  });
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const fetchRebuildStatus = async () => {
    try {
      const status = await api.getRebuildStatus();
      const prev = rebuildState().state;
      setRebuildState(status);
      if (status.state !== "running") {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (prev === "running" && status.state === "complete") props.onRefreshSummary();
      }
    } catch { /* ignore */ }
  };

  // Check on mount if a rebuild is running
  onCleanup(() => { if (pollTimer) clearInterval(pollTimer); });
  fetchRebuildStatus();

  const startPolling = () => {
    if (pollTimer) return;
    fetchRebuildStatus();
    pollTimer = setInterval(fetchRebuildStatus, 2000);
  };

  const isRunning = () => rebuildState().state === "running";

  const runAction = async (action: () => Promise<any>) => {
    setShowFullConfirm(false);
    try {
      await action();
      startPolling();
    } catch (e: any) {
      setRebuildState((prev) => ({
        ...prev, state: "error" as const, message: e?.message || "Failed to start",
      }));
    }
  };

  const detailEntries = () => {
    const d = rebuildState().details;
    if (!d || Object.keys(d).length === 0) return [];
    const labels: Record<string, string> = {
      resolved: "Targets resolved",
      failed: "Failed to resolve",
      total: "Total object names",
      redirected_merged: "Orphaned images fixed",
      linked_unresolved: "Unresolved images linked",
      aliases_updated: "Target aliases updated",
      rederived: "Targets re-derived from cache",
      names_rebuilt: "Names rebuilt",
      stale_candidates_removed: "Stale candidates removed",
    };
    return Object.entries(d)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: labels[k] || k, value: v }));
  };

  return (
    <div class="border-t border-gray-700 pt-3 mt-3 space-y-3">
      <h4 class="text-white text-sm font-medium">Target Database Maintenance</h4>

      {/* Quick Fix */}
      <div class="flex justify-between items-center">
        <div>
          <p class="text-xs text-white">Quick Fix</p>
          <p class="text-xs text-astro-muted">
            Re-links orphaned images to existing targets by matching OBJECT headers against known aliases.
            Updates target names and aliases from SIMBAD cache. Does not contact SIMBAD or create new targets.
          </p>
        </div>
        <button
          onClick={() => runAction(api.smartRebuildTargets)}
          disabled={props.disabled || isRunning()}
          class="px-3 py-1.5 border border-gray-600 text-astro-muted rounded text-sm disabled:opacity-50 hover:text-white hover:border-astro-accent transition-colors"
        >
          {isRunning() && rebuildState().mode === "smart" ? "Running..." : "Quick Fix"}
        </button>
      </div>

      {/* Regenerate Thumbnails */}
      <div class="flex justify-between items-center">
        <div>
          <p class="text-xs text-white">Regenerate Thumbnails</p>
          <p class="text-xs text-astro-muted">
            Re-creates all image thumbnails using current stretch settings.
            Does not affect targets, resolution status, or any database records.
          </p>
        </div>
        <button
          onClick={() => props.onRegenThumbnails()}
          disabled={props.disabled || isRunning()}
          class="px-3 py-1.5 border border-gray-600 text-astro-muted rounded text-sm disabled:opacity-50 hover:text-white hover:border-astro-accent transition-colors"
        >
          Regenerate
        </button>
      </div>

      {/* Full Rebuild */}
      <div class="flex justify-between items-center">
        <div>
          <p class="text-xs text-white">Full Rebuild</p>
          <p class="text-xs text-astro-muted">
            Deletes all targets, merge history, and suggested merges, then re-resolves every unique
            OBJECT name from FITS headers via SIMBAD. Uses cached results when available.
          </p>
        </div>
        <button
          onClick={() => setShowFullConfirm(true)}
          disabled={props.disabled || isRunning()}
          class="px-3 py-1.5 border border-red-600/50 text-red-400 rounded text-sm disabled:opacity-50 hover:bg-red-600/20 hover:text-red-300 transition-colors"
        >
          {isRunning() && rebuildState().mode === "full" ? "Running..." : "Full Rebuild"}
        </button>
      </div>

      <Show when={showFullConfirm()}>
        <div class="bg-red-900/30 border border-red-600/50 rounded-lg p-3 space-y-2">
          <p class="text-sm text-red-300 font-medium">Are you sure?</p>
          <p class="text-xs text-red-200/70">
            This will delete all target records, merge history, and suggested merges.
            All targets will be re-resolved from scratch using SIMBAD. Fast if results
            are cached from a previous run. First run may take 30 minutes or more
            depending on the number of unique targets and SIMBAD response times.
          </p>
          <div class="flex gap-2 pt-1">
            <button
              onClick={() => runAction(api.rebuildTargets)}
              class="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
            >
              Yes, rebuild everything
            </button>
            <button
              onClick={() => setShowFullConfirm(false)}
              class="px-3 py-1.5 border border-gray-600 text-gray-300 rounded text-xs hover:border-white hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      {/* Status / Progress */}
      <Show when={rebuildState().state === "running"}>
        <div class="bg-astro-dark rounded p-2 space-y-1">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 bg-astro-accent rounded-full animate-pulse" />
            <span class="text-xs text-white">{rebuildState().message || "Running..."}</span>
          </div>
        </div>
      </Show>

      {/* Results */}
      <Show when={rebuildState().state === "complete"}>
        <div class="bg-astro-dark rounded p-2 space-y-1">
          <div class="flex justify-between items-center">
            <span class="text-xs text-green-400">{rebuildState().message}</span>
            <span class="text-xs text-astro-muted">
              {rebuildState().completed_at
                ? new Date(rebuildState().completed_at! * 1000).toLocaleString()
                : ""}
            </span>
          </div>
          <Show when={detailEntries().length > 0}>
            <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
              <For each={detailEntries()}>
                {(e) => (
                  <>
                    <span class="text-xs text-astro-muted">{e.label}</span>
                    <span class="text-xs text-white">{e.value}</span>
                  </>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={rebuildState().state === "error"}>
        <p class="text-xs text-red-400">{rebuildState().message}</p>
      </Show>
    </div>
  );
};


export default ScanManager;
