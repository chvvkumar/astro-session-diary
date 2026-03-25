export interface Target {
  id: string;
  primary_name: string;
  aliases: string[];
  ra: number | null;
  dec: number | null;
  object_type: string | null;
}

export interface Image {
  id: string;
  file_path: string;
  file_name: string;
  capture_date: string | null;
  thumbnail_path: string | null;
  resolved_target_id: string | null;
  exposure_time: number | null;
  filter_used: string | null;
  sensor_temp: number | null;
  camera_gain: number | null;
  raw_headers: Record<string, unknown> | null;
}

export interface ImageDetail extends Image {
  target: Target | null;
}

export interface ImageListResponse {
  items: Image[];
  total: number;
  page: number;
  page_size: number;
}

export interface TargetSearchResult {
  id: string;
  primary_name: string;
  object_type: string | null;
}

export interface ScanResult {
  status: string;
  new_files_queued: number;
  already_known: number;
}

export interface ScanStatus {
  running: boolean;
  total: number;
  queued: number;
}

export interface ImageFilters {
  target_name?: string;
  filter_used?: string;
  date_from?: string;
  date_to?: string;
  min_exposure?: number;
  max_exposure?: number;
  header_key?: string;
  header_value?: string;
  page: number;
  page_size: number;
}
