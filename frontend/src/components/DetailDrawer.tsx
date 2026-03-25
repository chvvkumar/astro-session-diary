import { Component, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import ReferenceThumbnail from "./ReferenceThumbnail";
import QualityMetrics from "./QualityMetrics";
import RawHeaderAccordion from "./RawHeaderAccordion";

const DetailDrawer: Component = () => {
  const { drawerContext, sessionDetail, closeDrawer } = useCatalog();

  return (
    <Show when={drawerContext()}>
      {/* Backdrop */}
      <div class="fixed inset-0 z-40 bg-black/50" onClick={closeDrawer} />

      {/* Drawer panel */}
      <div class="fixed inset-y-0 right-0 z-50 w-96 bg-astro-panel border-l border-[#2d2d2d] overflow-y-auto">
        <div class="p-4 space-y-4">
          {/* Header */}
          <div class="flex justify-between items-center">
            <h2 class="text-white font-semibold">Session Detail</h2>
            <button onClick={closeDrawer} class="text-astro-muted hover:text-white text-xl">&times;</button>
          </div>

          <Show when={sessionDetail.loading}>
            <div class="text-astro-muted text-sm py-4">Loading session data...</div>
          </Show>

          <Show when={sessionDetail.error}>
            <div class="text-red-400 text-sm py-4">Failed to load session detail</div>
          </Show>

          <Show when={sessionDetail()}>
            {(detail) => (
              <>
                <div>
                  <h3 class="text-white font-medium">{detail().target_name}</h3>
                  <p class="text-xs text-astro-muted">{detail().session_date}</p>
                </div>

                <ReferenceThumbnail url={detail().thumbnail_url} />

                <QualityMetrics
                  hfr={detail().median_hfr}
                  eccentricity={detail().median_eccentricity}
                  frameCount={detail().frame_count}
                  integrationSeconds={detail().integration_seconds}
                />

                {/* Filter breakdown */}
                <div class="space-y-1">
                  <h4 class="text-xs text-astro-muted">Filters Used</h4>
                  <div class="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(detail().filters_used).map(([name, count]) => (
                      <div class="flex justify-between bg-astro-dark rounded px-2 py-1">
                        <span class="text-white">{name}</span>
                        <span class="text-astro-muted">{count} frames</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equipment */}
                <div class="space-y-1">
                  <h4 class="text-xs text-astro-muted">Equipment</h4>
                  <div class="text-xs text-white">
                    <Show when={detail().equipment.camera}>
                      <div>Camera: {detail().equipment.camera}</div>
                    </Show>
                    <Show when={detail().equipment.telescope}>
                      <div>Telescope: {detail().equipment.telescope}</div>
                    </Show>
                  </div>
                </div>

                <RawHeaderAccordion headers={detail().raw_reference_header} />
              </>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default DetailDrawer;
