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
  // New fields
  min_hfr: number | null;
  max_hfr: number | null;
  min_eccentricity: number | null;
  max_eccentricity: number | null;
  sensor_temp: number | null;
  sensor_temp_min: number | null;
  sensor_temp_max: number | null;
  gain: number | null;
  exposure_time: number | null;
  first_frame_time: string | null;
  last_frame_time: string | null;
  filter_details: FilterDetail[];
  insights: SessionInsight[];
  frames: FrameRecord[];
}

// === Target Detail (Deep Dive Page) ===

export interface SessionOverview {
  session_date: string;
  integration_seconds: number;
  frame_count: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  filters_used: string[];
  camera: string | null;
  telescope: string | null;
}

export interface TargetDetailResponse {
  target_id: string;
  primary_name: string;
  aliases: string[];
  object_type: string | null;
  ra: number | null;
  dec: number | null;
  total_integration_seconds: number;
  total_frames: number;
  avg_hfr: number | null;
  avg_eccentricity: number | null;
  filters_used: string[];
  equipment: string[];
  first_session_date: string;
  last_session_date: string;
  session_count: number;
  sessions: SessionOverview[];
}

export interface FilterDetail {
  filter_name: string;
  frame_count: number;
  integration_seconds: number;
  median_hfr: number | null;
  median_eccentricity: number | null;
  exposure_time: number | null;
}

export interface SessionInsight {
  level: "good" | "warning" | "info";
  message: string;
}

export interface FrameRecord {
  timestamp: string;
  filter_used: string | null;
  exposure_time: number | null;
  median_hfr: number | null;
  eccentricity: number | null;
  sensor_temp: number | null;
  gain: number | null;
  file_name: string;
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

// === Settings ===

export interface GeneralSettings {
  auto_scan_enabled: boolean;
  auto_scan_interval: number;
  thumbnail_width: number;
  default_page_size: number;
}

export interface FilterConfig {
  color: string;
  aliases: string[];
}

export interface EquipmentAliases {
  aliases: string[];
}

export interface EquipmentConfig {
  cameras: Record<string, EquipmentAliases>;
  telescopes: Record<string, EquipmentAliases>;
}

export interface SettingsResponse {
  general: GeneralSettings;
  filters: Record<string, FilterConfig>;
  equipment: EquipmentConfig;
}

export interface SuggestionGroup {
  group: string[];
  counts: Record<string, number>;
}

export interface SuggestionsResponse {
  suggestions: SuggestionGroup[];
}
