import { Component, Show, onCleanup } from "solid-js";
import { useScan } from "../store/scan";
import { useCatalog } from "../store/catalog";

const ScanDashboard: Component = () => {
  const { scanStatus, lastScanResult, isScanning, startScan, pollStatus, stopPolling } = useScan();
  const { refetchImages } = useCatalog();

  onCleanup(stopPolling);

  const handleScan = async () => {
    pollStatus();
    await startScan();
    refetchImages();
  };

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-white font-medium text-sm">Scan & Ingest</h3>
        <button
          onClick={handleScan}
          disabled={isScanning()}
          class="px-4 py-1.5 bg-astro-accent text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-astro-accent/80 transition-colors"
        >
          {isScanning() ? "Scanning..." : "Scan Directory"}
        </button>
      </div>

      <Show when={isScanning()}>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-astro-muted">
            <span>Processing...</span>
            <span>{scanStatus().queued} / {scanStatus().total}</span>
          </div>
          <div class="w-full bg-astro-dark rounded-full h-2">
            <div
              class="bg-astro-accent h-2 rounded-full transition-all"
              style={{
                width: scanStatus().total > 0
                  ? `${(scanStatus().queued / scanStatus().total) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      </Show>

      <Show when={lastScanResult()}>
        {(result) => (
          <div class="text-xs text-astro-muted space-y-0.5">
            <p>Status: <span class="text-green-400">{result().status}</span></p>
            <p>New files queued: {result().new_files_queued}</p>
            <p>Already cataloged: {result().already_known}</p>
          </div>
        )}
      </Show>
    </div>
  );
};

export default ScanDashboard;
