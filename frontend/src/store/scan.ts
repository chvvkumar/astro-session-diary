import { createSignal, onMount } from "solid-js";
import { api } from "../api/client";
import type { ScanStatus } from "../types";

const defaultStatus: ScanStatus = {
  state: "idle",
  total: 0,
  completed: 0,
  failed: 0,
  started_at: null,
  completed_at: null,
};

const [scanStatus, setScanStatus] = createSignal<ScanStatus>({ ...defaultStatus });
const [scanError, setScanError] = createSignal<string | null>(null);

let pollInterval: ReturnType<typeof setInterval> | null = null;

async function fetchStatus() {
  try {
    const status = await api.getScanStatus();
    setScanStatus(status);
    setScanError(null);

    // Stop polling when no longer active
    if (status.state !== "scanning" && status.state !== "ingesting") {
      stopPolling();
    }
  } catch {
    setScanError("Failed to reach API");
    stopPolling();
  }
}

function startPolling() {
  if (pollInterval) return;
  fetchStatus(); // immediate first fetch
  pollInterval = setInterval(fetchStatus, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function useScan() {
  // On first mount, check server state — resume polling if scan is active
  onMount(async () => {
    await fetchStatus();
    const s = scanStatus();
    if (s.state === "scanning" || s.state === "ingesting") {
      startPolling();
    }
  });

  return {
    scanStatus,
    scanError,

    isActive: () => {
      const s = scanStatus().state;
      return s === "scanning" || s === "ingesting";
    },

    startScan: async () => {
      setScanError(null);
      try {
        await api.triggerScan();
        startPolling();
      } catch (e: unknown) {
        setScanError(e instanceof Error ? e.message : "Scan failed");
      }
    },

    stopPolling,
  };
}
