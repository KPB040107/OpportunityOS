export type Skill = { name: string; level: 'beginner' | 'intermediate' | 'advanced' };
export type Profile = { display_name: string; degree: string; branch: string; academic_year: number | null; graduation_year: number | null; cgpa: number | null; career_goals: string; interest_types: string[]; preferred_locations: string[]; autonomy_mode: string };
export type RawItem = { id: string; source_type: 'text' | 'url'; raw_content: string; status: string; error_code: string | null; created_at: string };
export type Activity = { id: string; stage: string; level: string; message: string; ts: string; metadata: Record<string,unknown> };
export type FormState = { error?: string; success?: string };
