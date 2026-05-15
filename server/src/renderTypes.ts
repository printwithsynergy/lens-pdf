export interface Branding {
  name?: string;
  logo_url?: string | null;
  primary_color?: string;
  accent_color?: string;
  footer_text?: string | null;
  pdf_download_url?: string | null;
  report_url?: string | null;
  viewer_url?: string | null;
  anonymous?: boolean;
}

export interface Finding {
  inspection_id: string;
  severity: "error" | "warning" | "advisory";
  message: string;
  page_num?: number | null;
  bbox?: [number, number, number, number] | null;
  object_id?: string | null;
  object_type?: string | null;
  source?: string;
  category?: string | null;
  details?: Record<string, unknown>;
  friendly_name?: string;
  friendly_description?: string;
  ai_explanation?: string | null;
  thumbnail_base64?: string;
}

export interface Summary {
  passed: boolean;
  error_count: number;
  warning_count: number;
  advisory_count: number;
  total_findings: number;
  page_count: number;
  file_size_bytes: number;
}

export interface Metadata {
  pdf_version?: string;
  page_count?: number;
  is_encrypted?: boolean;
  conformance?: string | null;
  workflow?: string;
  ai_enabled?: boolean;
  ai_findings_count?: number;
  color_quality_score?: number | null;
  color_quality_grade?: string | null;
  file_name?: string;
  color_score_breakdown?: Record<string, number>;
}

export interface EpmVerdict {
  tier: string;
  rejection_drivers: string[];
  advisories: string[];
  recommends_indichrome: boolean;
  legacy_codes_fired: string[];
  epm_findings_count: number;
}

export interface ResultJson {
  job_id?: string;
  profile_id?: string;
  duration_ms?: number;
  summary: Summary;
  metadata: Metadata;
  findings: Finding[];
  file_name?: string;
  epm?: EpmVerdict | null;
}

export interface RenderContext {
  result_json: ResultJson;
  branding?: Branding;
  detail_level?: "executive" | "standard" | "comprehensive";
  summary_page?: "prepend" | "only" | "off";
  format: "html" | "pdf" | "annotated_pdf" | "markup_pdf";
  // For annotated_pdf and markup_pdf only:
  annotations?: ViewerAnnotation[];
  comments_by_annotation?: Record<string, ViewerComment[]>;
}

export interface ViewerAnnotation {
  id: string;
  page_num: number;
  kind: string;
  geometry: unknown;
  color?: string;
  text?: string;
  author_email?: string;
  created_at?: string;
}

export interface ViewerComment {
  author_email?: string;
  body: string;
  created_at?: string;
}

export interface AnnotatedPage {
  page_num: number;
  image_base64: string;
  width: number;
  height: number;
  callouts: Callout[];
}

export interface Callout {
  number: number;
  severity: string;
  inspection_id: string;
  message: string;
  bbox_present: boolean;
}
