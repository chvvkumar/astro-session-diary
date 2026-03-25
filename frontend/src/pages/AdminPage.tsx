import { Component, Show } from "solid-js";
import { useStats } from "../store/stats";
import ScanManager from "../components/ScanManager";
import DatabaseOverview from "../components/DatabaseOverview";
import EquipmentInventory from "../components/EquipmentInventory";
import FilterUsageChart from "../components/FilterUsageChart";
import ImagingTimeline from "../components/ImagingTimeline";
import TopTargets from "../components/TopTargets";
import DataQuality from "../components/DataQuality";
import StorageBreakdown from "../components/StorageBreakdown";
import IngestHistory from "../components/IngestHistory";

const AdminPage: Component = () => {
  const { stats } = useStats();

  return (
    <div class="p-4 space-y-4 max-w-7xl mx-auto">
      <ScanManager />

      <Show when={stats.loading}>
        <div class="text-center text-astro-muted py-8">Loading analytics...</div>
      </Show>

      <Show when={stats.error}>
        <div class="text-center text-red-400 py-8">Failed to load stats</div>
      </Show>

      <Show when={stats()}>
        {(data) => (
          <>
            <DatabaseOverview overview={data().overview} />

            <div class="grid grid-cols-2 gap-4">
              <FilterUsageChart usage={data().filter_usage} />
              <EquipmentInventory cameras={data().equipment.cameras} telescopes={data().equipment.telescopes} />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <ImagingTimeline timeline={data().timeline} />
              <TopTargets targets={data().top_targets} />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <DataQuality
                avgHfr={data().data_quality.avg_hfr}
                avgEccentricity={data().data_quality.avg_eccentricity}
                bestHfr={data().data_quality.best_hfr}
                hfrDistribution={data().data_quality.hfr_distribution}
              />
              <StorageBreakdown
                fitsBytes={data().storage.fits_bytes}
                thumbnailBytes={data().storage.thumbnail_bytes}
                databaseBytes={data().storage.database_bytes}
              />
            </div>

            <IngestHistory history={data().ingest_history} />
          </>
        )}
      </Show>
    </div>
  );
};

export default AdminPage;
