// === Target Aggregation ===

export interface SessionSummary {
  session_date: string;
  integration_seconds: number;
  frame_count: number;
  filters_used: string[];
}

export interface TargetAggregation {
  target_id: string;
  primary_name: string;
  aliases: string[];
  total_integration_seconds: number;
  total_frames: number;
  filter_distribution: Record<string, number>;
  equipment: string[];
  sessions: SessionSummary[];
}

export interface AggregateStats {
  total_integration_seconds: number;
  target_count: number;
  total_frames: number;
  disk_usage_bytes: number;
}

export interface TargetAggregationResponse {
  targets: TargetAggregation[];
  aggregates: AggregateStats;
}

// === Session Detail ===

export interface SessionDetail {
  target_name: string;
  session_date: string;
  thumbnail_url: string | null;
  frame_count: number;
  integration_seconds: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  filters_used: Record<string, number>;
  equipment: { camera: string | null; telescope: string | null };
  raw_reference_header: Record<string, unknown> | null;
}

// === Equipment ===

export interface EquipmentList {
  cameras: string[];
  telescopes: string[];
}

// === Filters ===

export interface ActiveFilters {
  searchQuery: string;
  camera: string | null;
  telescope: string | null;
  opticalFilters: string[];
  dateRange: { start: string | null; end: string | null };
  fitsQueries: { key: string; operator: string; value: string }[];
}

// === Scan (unchanged) ===

export interface ScanResult {
  status: string;
  new_files_queued: number;
  already_known: number;
  state?: string;
  total?: number;
  completed?: number;
  failed?: number;
}

export interface ScanStatus {
  state: "idle" | "scanning" | "ingesting" | "complete";
  total: number;
  completed: number;
  failed: number;
  started_at: number | null;
  completed_at: number | null;
}

// === Search ===

export interface TargetSearchResult {
  id: string;
  primary_name: string;
  object_type: string | null;
}

// === Stats (Admin) ===

export interface EquipmentItem {
  name: string;
  frame_count: number;
}

export interface TimelineEntry {
  month: string;
  integration_seconds: number;
}

export interface TopTarget {
  name: string;
  integration_seconds: number;
}

export interface HfrBucket {
  bucket: string;
  count: number;
}

export interface StatsResponse {
  overview: AggregateStats;
  equipment: {
    cameras: EquipmentItem[];
    telescopes: EquipmentItem[];
  };
  filter_usage: Record<string, number>;
  timeline: TimelineEntry[];
  top_targets: TopTarget[];
  data_quality: {
    avg_hfr: number | null;
    avg_eccentricity: number | null;
    best_hfr: number | null;
    hfr_distribution: HfrBucket[];
  };
  storage: {
    fits_bytes: number;
    thumbnail_bytes: number;
    database_bytes: number;
  };
  ingest_history: { date: string; files_added: number }[];
}
