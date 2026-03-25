import { Component } from "solid-js";

function formatBytes(b: number): string {
  if (b < 1e6) return (b / 1e3).toFixed(0) + " KB";
  if (b < 1e9) return (b / 1e6).toFixed(0) + " MB";
  if (b < 1e12) return (b / 1e9).toFixed(1) + " GB";
  return (b / 1e12).toFixed(2) + " TB";
}

const StorageBreakdown: Component<{
  fitsBytes: number;
  thumbnailBytes: number;
  databaseBytes: number;
}> = (props) => {
  const total = () => props.fitsBytes + props.thumbnailBytes + props.databaseBytes;
  const pct = (v: number) => total() > 0 ? ((v / total()) * 100).toFixed(1) : "0";

  return (
    <div class="bg-astro-panel rounded-lg p-4 space-y-3">
      <h3 class="text-white font-medium text-sm">Storage Breakdown</h3>
      {/* Stacked bar */}
      <div class="w-full h-4 bg-astro-dark rounded-full overflow-hidden flex">
        <div class="bg-blue-500 h-4" style={{ width: `${pct(props.fitsBytes)}%` }} title="FITS" />
        <div class="bg-green-500 h-4" style={{ width: `${pct(props.thumbnailBytes)}%` }} title="Thumbnails" />
        <div class="bg-yellow-500 h-4" style={{ width: `${pct(props.databaseBytes)}%` }} title="Database" />
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs text-center">
        <div><span class="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1" />FITS: {formatBytes(props.fitsBytes)}</div>
        <div><span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-1" />Thumbs: {formatBytes(props.thumbnailBytes)}</div>
        <div><span class="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1" />DB: {formatBytes(props.databaseBytes)}</div>
      </div>
    </div>
  );
};

export default StorageBreakdown;
