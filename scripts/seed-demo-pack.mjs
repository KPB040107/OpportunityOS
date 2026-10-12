// Seed Demo Pack: pre-runs the 15 realistic opportunity fixtures from testdata/slice3-fixtures.json.
// Generates SQL to populate the feed with a rich mix of ACT, ASK, and IGNORE cards
// without spending any LLM quota, exactly matching Guide Section 14.

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';

const pack = JSON.parse(readFileSync(new URL('../testdata/slice3-fixtures.json', import.meta.url), 'utf8'));

export function generateDemoPackSql(targetUserId, targetEmail = null) {
  const userId = targetUserId || randomUUID();
  const email = targetEmail || `demo-user-${userId.slice(0, 8)}@example.invalid`;
  const quote = v => "'" + String(v).replaceAll("'", "''") + "'";

  let sql = `-- OpportunityOS Slice 5: Seeded 15 Fixture Demo Pack
begin;

-- 1. Ensure user and profile exist
insert into auth.users(id, email)
values (${quote(userId)}::uuid, ${quote(email)})
on conflict(id) do nothing;

insert into public.profiles(
  user_id, degree, branch, academic_year, graduation_year, cgpa, career_goals, interest_types, preferred_locations, autonomy_mode
) values (
  ${quote(userId)}::uuid,
  'B.Tech',
  'Computer Science',
  3,
  2028,
  8.2,
  'Build software engineering skills through a backend internship.',
  array['internship', 'hackathon'],
  array['remote', 'Bengaluru'],
  'balanced'
) on conflict(user_id) do update set
  cgpa = excluded.cgpa,
  graduation_year = excluded.graduation_year;

-- 2. Seed Skills
insert into public.skills(name, canonical_name) values
  ('Python', 'Python'),
  ('React', 'React'),
  ('SQL', 'SQL')
on conflict(canonical_name) do nothing;

insert into public.profile_skills(user_id, skill_id, level)
select ${quote(userId)}::uuid, id, 'intermediate'
from public.skills
where canonical_name in ('Python', 'React', 'SQL')
on conflict do nothing;

-- 3. Seed Preset Sources
select public.seed_default_sources(${quote(userId)}::uuid);

-- 4. Seed Opportunities, Matches, and Tracker Items
`;

  let oppCount = 0;
  for (const [idx, fix] of pack.fixtures.entries()) {
    if (fix.expected === 'NO_OPPORTUNITY') {
      // Ingest as raw non-opportunity item
      const contentHash = createHash('sha256').update(fix.raw || fix.name).digest('hex');
      sql += `
-- Fixture ${idx + 1}: ${fix.name} (Non-opportunity)
insert into public.raw_items(user_id, request_id, source_type, raw_content, status, is_opportunity)
values (${quote(userId)}::uuid, gen_random_uuid(), 'text', ${quote(fix.raw)}, 'understood', false);
`;
      continue;
    }

    oppCount++;
    const opp = fix.input.opportunity;
    const oppId = randomUUID();
    const fingerprint = createHash('sha256').update(`${opp.title}:${opp.organization}:${opp.deadline}:${opp.application_url || ''}`).digest('hex');
    const decision = fix.expected;
    const score = decision === 'ACT' ? 95 : decision === 'ASK' ? 70 : 35;
    const conf = decision === 'ACT' ? 0.95 : decision === 'ASK' ? 0.75 : 0.85;

    sql += `
-- Fixture ${idx + 1}: ${fix.name} (${decision})
insert into public.opportunities(
  id, user_id, fingerprint, title, organization, deadline, location, type, application_url, description,
  skills, extracted_json, extraction_confidence, extraction_version
) values (
  ${quote(oppId)}::uuid,
  ${quote(userId)}::uuid,
  ${quote(fingerprint)},
  ${quote(opp.title)},
  ${quote(opp.organization || 'Unknown Org')},
  ${opp.deadline ? quote(opp.deadline) + '::date' : 'null'},
  ${quote(opp.location || 'Remote')},
  ${quote(opp.type || 'internship')},
  ${opp.application_url ? quote(opp.application_url) : 'null'},
  ${quote(opp.description || opp.title)},
  array[${(opp.skills || []).map(quote).join(',')}],
  ${quote(JSON.stringify(opp.extracted_json || { title: opp.title }))}::jsonb,
  ${opp.extraction_confidence || 0.9},
  'extract-v1'
) on conflict(user_id, fingerprint) do update set updated_at = now();

-- Match record
insert into public.matches(
  user_id, opportunity_id, decision, match_score, confidence, status, explanation, eligibility_status
) values (
  ${quote(userId)}::uuid,
  (select id from public.opportunities where user_id = ${quote(userId)}::uuid and fingerprint = ${quote(fingerprint)}),
  ${quote(decision)},
  ${score},
  ${conf},
  'complete',
  ${quote('Seeded demo fixture for ' + fix.name)},
  ${decision === 'IGNORE' ? "'INELIGIBLE'" : decision === 'ASK' ? "'UNKNOWN'" : "'ELIGIBLE'"}
) on conflict(user_id, opportunity_id) do update set
  decision = excluded.decision,
  match_score = excluded.match_score,
  confidence = excluded.confidence;
`;

    // If ACT, also add to Applications tracker
    if (decision === 'ACT') {
      sql += `
select public.upsert_application_tracker(
  ${quote(userId)}::uuid,
  (select id from public.opportunities where user_id = ${quote(userId)}::uuid and fingerprint = ${quote(fingerprint)}),
  'to_apply',
  ${quote('Automated ACT action from ' + fix.name)}
);
`;
    }

    // If ASK, create pending approval request
    if (decision === 'ASK') {
      sql += `
select public.create_approval_request(
  ${quote(userId)}::uuid,
  (select id from public.matches where user_id = ${quote(userId)}::uuid and opportunity_id = (select id from public.opportunities where user_id = ${quote(userId)}::uuid and fingerprint = ${quote(fingerprint)})),
  ${quote('Review required: ' + fix.name)},
  array['unverified_criteria']
);
`;
    }
  }

  // 5. Record Initial Autopilot Heartbeat
  sql += `
select public.record_agent_heartbeat(
  ${quote(userId)}::uuid,
  '06-autopilot',
  'ok',
  ${oppCount},
  now() + interval '1 day',
  null,
  jsonb_build_object('seeded_fixtures', 15)
);

commit;

select jsonb_build_object(
  'user_id', ${quote(userId)},
  'email', ${quote(email)},
  'opportunities_seeded', (select count(*) from public.opportunities where user_id = ${quote(userId)}::uuid),
  'matches_seeded', (select count(*) from public.matches where user_id = ${quote(userId)}::uuid),
  'applications_tracked', (select count(*) from public.applications where user_id = ${quote(userId)}::uuid),
  'approvals_pending', (select count(*) from public.approvals where user_id = ${quote(userId)}::uuid)
) as demo_summary;
`;

  return { sql, userId, email };
}

// When run directly from CLI
if (process.argv[1]?.endsWith('seed-demo-pack.mjs')) {
  const result = generateDemoPackSql();
  const outPath = new URL('../.local/demo-pack-seed.sql', import.meta.url);
  writeFileSync(outPath, result.sql);
  console.log(`Generated .local/demo-pack-seed.sql for user ${result.userId} (${result.email})`);
}
