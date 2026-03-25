import { createSignal } from "solid-js";
import { api } from "../api/client";
import type { ScanResult, ScanStatus } from "../types";

const [scanStatus, setScanStatus] = createSignal<ScanStatus>({ running: false, total: 0, queued: 0 });
const [lastScanResult, setLastScanResult] = createSignal<ScanResult | null>(null);
const [isScanning, setIsScanning] = createSignal(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function useScan() {
  return {
    scanStatus,
    lastScanResult,
    isScanning,

    startScan: async () => {
      setIsScanning(true);
      try {
        const result = await api.triggerScan();
        setLastScanResult(result);
      } finally {
        setIsScanning(false);
      }
    },

    pollStatus: () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        const status = await api.getScanStatus();
        setScanStatus(status);
        if (!status.running && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }, 2000);
    },

    stopPolling: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}
