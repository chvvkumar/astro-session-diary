import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import { api } from "../api/client";
import HeaderTable from "./HeaderTable";

const ImageDetail: Component = () => {
  const { selectedImage, setSelectedImageId } = useCatalog();

  const close = () => setSelectedImageId(null);

  return (
    <Show when={selectedImage()}>
      {(detail) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div class="bg-astro-panel rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div class="flex justify-between items-center p-4 border-b border-gray-800">
              <h2 class="text-white font-bold text-lg truncate">
                {detail().file_name}
              </h2>
              <button
                onClick={close}
                class="text-astro-muted hover:text-white text-xl px-2"
              >
                x
              </button>
            </div>

            <div class="grid md:grid-cols-2 gap-4 p-4">
              {/* Thumbnail */}
              <div class="aspect-square bg-astro-dark rounded-lg overflow-hidden flex items-center justify-center">
                <Show
                  when={detail().thumbnail_path}
                  fallback={<span class="text-astro-muted">No thumbnail</span>}
                >
                  <img
                    src={api.thumbnailUrl(detail().thumbnail_path!)}
                    alt={detail().file_name}
                    class="w-full h-full object-contain"
                  />
                </Show>
              </div>

              {/* Metadata */}
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <MetaField label="Target" value={detail().target?.primary_name} />
                  <MetaField label="Object Type" value={detail().target?.object_type} />
                  <MetaField label="Filter" value={detail().filter_used} />
                  <MetaField label="Exposure" value={detail().exposure_time ? `${detail().exposure_time}s` : null} />
                  <MetaField label="Sensor Temp" value={detail().sensor_temp ? `${detail().sensor_temp}°C` : null} />
                  <MetaField label="Gain" value={detail().camera_gain?.toString()} />
                  <MetaField
                    label="Captured"
                    value={detail().capture_date ? new Date(detail().capture_date!).toLocaleString() : null}
                  />
                  <MetaField label="RA / Dec" value={
                    detail().target?.ra != null
                      ? `${detail().target!.ra!.toFixed(4)} / ${detail().target!.dec!.toFixed(4)}`
                      : null
                  } />
                </div>

                <div class="text-xs text-astro-muted break-all">
                  <span class="font-medium">Path:</span> {detail().file_path}
                </div>
              </div>
            </div>

            {/* Raw FITS Headers */}
            <Show when={detail().raw_headers}>
              <div class="border-t border-gray-800 p-4">
                <h3 class="text-white font-medium text-sm mb-2">FITS Headers</h3>
                <HeaderTable headers={detail().raw_headers!} />
              </div>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};

function MetaField(props: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span class="text-astro-muted text-xs">{props.label}</span>
      <p class="text-white">{props.value || "—"}</p>
    </div>
  );
}

export default ImageDetail;
