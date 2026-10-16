import { workflowBuilder } from './workflow-builder.mjs';
import fs from 'node:fs';

const resumeJsCode = fs.readFileSync('scripts/resume-contract.mjs', 'utf8')
  .replace(/^export\s+/gm, '');

const embeddedResume = `
// Embedded Deterministic Resume Contract
${resumeJsCode}
`;

const b = workflowBuilder('opportunityosSlice5Resume', 'OpportunityOS 10 Resume Processing');
const { add, pg, code, link } = b;

// 1. Triggers
add('trigger', 'Execute resume processing', 'executeWorkflowTrigger', 1.1, 0, 0, { inputSource: 'passthrough' });
add('manual', 'Manual resume processing', 'manualTrigger', 1, 0, 160, {});

// 2. Query Postgres: fetch pending upload, user profile revision, and existing skills
const queryUpload = `
select
  u.id as upload_id,
  u.user_id,
  u.storage_path,
  u.file_name,
  u.file_sha256,
  u.extracted_text,
  coalesce(p.revision, 1) as base_profile_revision,
  coalesce(to_jsonb(p), '{}'::jsonb) as current_profile,
  coalesce(
    (select jsonb_agg(jsonb_build_object('name', s.name, 'level', ps.level))
     from public.profile_skills ps
     join public.skills s on s.id = ps.skill_id
     where ps.user_id = u.user_id),
    '[]'::jsonb
  ) as current_skills
from public.resume_uploads u
left join public.profiles p on p.user_id = u.user_id
where (u.id = $1::uuid or ($1::uuid is null and u.status in ('uploaded', 'validating', 'draft_ready')))
order by u.created_at desc
limit 1;
`;

pg('upload', 'Load pending resume upload', 240, 0, queryUpload, '={{ [$json.upload_id || null] }}');

// 3. Deterministic Extraction Code Node
const extractCode = `
${embeddedResume}

const rawItem = $input.first().json;
if (!rawItem || !rawItem.upload_id || !rawItem.user_id) {
  return [];
}

const text = rawItem.extracted_text || '';
const draft = extractDraftFromText(text, 1, rawItem.base_profile_revision);
validateProfileDraft(draft);

const profileWithSkills = {
  ...rawItem.current_profile,
  skills: rawItem.current_skills || []
};
const reconciled = reconcileDraftWithProfile(profileWithSkills, draft);

return [{
  json: {
    upload_id: rawItem.upload_id,
    user_id: rawItem.user_id,
    storage_path: rawItem.storage_path,
    contract_version: draft.contract_version,
    base_profile_revision: draft.base_profile_revision,
    proposed_fields: draft.fields,
    proposed_skills: draft.skills,
    missing_fields: draft.missing_fields,
    reconciled
  }
}];
`;

code('extract', 'Extract and reconcile profile draft', 480, 0, extractCode);

// 4. Save Draft in public.profile_drafts
const saveDraftSql = `
insert into public.profile_drafts (
  user_id,
  resume_upload_id,
  base_profile_revision,
  contract_version,
  proposed_fields,
  proposed_skills,
  missing_fields,
  status
)
values (
  $1::uuid,
  $2::uuid,
  $3::integer,
  $4::text,
  $5::jsonb,
  $6::jsonb,
  $7::jsonb,
  'draft_ready'
)
returning id as draft_id, user_id, resume_upload_id, status, created_at;
`;

pg('save', 'Store profile draft in database', 720, 0, saveDraftSql,
  '={{ [$json.user_id, $json.upload_id, $json.base_profile_revision, $json.contract_version, JSON.stringify($json.proposed_fields), JSON.stringify($json.proposed_skills), JSON.stringify($json.missing_fields)] }}'
);

// 5. Update public.resume_uploads status to draft_ready
const updateUploadSql = `
update public.resume_uploads
set status = 'draft_ready', updated_at = now()
where id = $1::uuid
returning id, status, updated_at;
`;

pg('update_status', 'Mark upload draft ready', 960, 0, updateUploadSql,
  '={{ [$json.resume_upload_id] }}'
);

// Wiring
link('Execute resume processing', 'Load pending resume upload');
link('Manual resume processing', 'Load pending resume upload');
link('Load pending resume upload', 'Extract and reconcile profile draft');
link('Extract and reconcile profile draft', 'Store profile draft in database');
link('Store profile draft in database', 'Mark upload draft ready');

add('note', 'Resume Processing Boundary', 'stickyNote', 1, 240, -320, {
  content: '## Slice S5 Resume Processing Workflow\\nExtracts academic facts, degree, graduation year, CGPA and detected skills with literal page evidence. Skill proficiency is strictly set to null for student confirmation. Raw file subject to Privacy D9 retention cleanup upon confirmation.',
  width: 740,
  height: 200
});

b.save('10-resume.json');
console.log('✓ Generated workflows/10-resume.json and runtime variant successfully.');
