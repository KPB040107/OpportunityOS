export type Skill = { name: string; level: 'beginner' | 'intermediate' | 'advanced' };
export type Profile = { display_name: string; degree: string; branch: string; academic_year: number | null; graduation_year: number | null; cgpa: number | null; career_goals: string; interest_types: string[]; preferred_locations: string[]; autonomy_mode: string; notifications_enabled?: boolean; revision?: number };
export type RawItem = { id: string; source_type: 'text' | 'url' | 'email' | 'discovery' | 'capture'; raw_content: string; status: string; error_code: string | null; created_at: string; is_opportunity: boolean | null; duplicate_of: string | null; retry_count: number; metadata?: Record<string, unknown> };

export type ProfileDraftField = {
  field: string;
  value: string | number;
  state: string;
  evidence: { page: number; quote: string };
};

export type ProfileDraftSkill = {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  state: string;
  evidence: { page: number; quote: string };
};

export type ProfileDraft = {
  id: string;
  user_id: string;
  resume_upload_id: string | null;
  base_profile_revision: number;
  contract_version: string;
  proposed_fields: ProfileDraftField[];
  proposed_skills: ProfileDraftSkill[];
  missing_fields: string[];
  status: 'draft_ready' | 'confirmed' | 'discarded' | 'expired';
  created_at: string;
  confirmed_at: string | null;
};

export type ResumeUpload = {
  id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  file_sha256: string;
  status: 'uploaded' | 'validating' | 'extracting' | 'draft_ready' | 'confirmed' | 'failed' | 'deleted' | 'expired';
  page_count: number | null;
  created_at: string;
  deleted_at: string | null;
};

export type Activity = { id: string; stage: string; level: string; message: string; ts: string; metadata: Record<string, unknown> };
export type FormState = { error?: string; success?: string };

export type ApplicationStatus = 'saved' | 'to_apply' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected';

export type Application = {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: ApplicationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  opportunity?: {
    id: string;
    title: string;
    organization: string;
    deadline: string | null;
    application_url: string | null;
    location: string | null;
    type: string;
  };
};

export type Approval = {
  id: string;
  user_id: string;
  match_id: string;
  reason: string;
  missing_info: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'stale';
  match_revision: number;
  expires_at: string;
  requires_information: boolean;
  resume_status: string;
  decided_at: string | null;
  created_at: string;
  opportunity?: {
    id: string;
    title: string;
    organization: string;
    deadline: string | null;
  };
  match?: {
    match_score: number | null;
    confidence: number | null;
  };
};

export type Followup = {
  id: string;
  user_id: string;
  application_id: string;
  due_at: string;
  kind: string;
  status: 'pending' | 'done' | 'overdue';
  created_at: string;
};

export type Source = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  type: 'page' | 'rss' | 'email_forward';
  frequency: 'hourly' | '6hours' | 'daily' | 'weekly';
  enabled: boolean;
  keywords: string[];
  last_scan_at: string | null;
  last_status: 'pending' | 'ok' | 'error';
  last_error: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type AgentRun = {
  id: string;
  user_id: string | null;
  ts: string;
  workflow: string;
  status: 'running' | 'ok' | 'error';
  items_processed: number;
  next_run_at: string | null;
  error_message: string | null;
  details?: Record<string, unknown>;
};
