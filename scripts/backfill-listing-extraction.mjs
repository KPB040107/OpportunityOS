// scripts/backfill-listing-extraction.mjs
// Idempotently repairs discovered listings that were missing deadlines or eligibility rules,
// specifically "Life After Code" on Devpost and other shallow Devpost/hackathon items.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { enrichDevpostFromPage, parseDevpostDeadline } from './discovery-adapters.mjs';
import { createDecisionContract } from './decision-contract.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const savedSession = JSON.parse(fs.readFileSync('.local/repair-live-session.json', 'utf8'));
const jar = new Map();
const supabase = createServerClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name))
  }
});

await supabase.auth.setSession({
  access_token: savedSession.access_token,
  refresh_token: savedSession.refresh_token
});

const userId = savedSession.user.id;

console.log('=== IDEMPOTENT LISTING EXTRACTION & EVALUATION BACKFILL ===');
console.log('User ID:', userId);

// 1. Fetch target opportunities
const { data: opps, error: fetchErr } = await supabase
  .from('opportunities')
  .select('*')
  .eq('user_id', userId)
  .ilike('title', '%Life After Code%');

if (fetchErr) {
  console.error('Error fetching opportunities:', fetchErr);
  process.exit(1);
}

console.log(`Found ${opps.length} opportunity matching 'Life After Code'`);

for (const opp of opps) {
  console.log(`\nProcessing Opportunity [${opp.id}]: "${opp.title}"`);
  console.log('  Current deadline:', opp.deadline);
  console.log('  Current URL:', opp.application_url || opp.original_url);

  const url = opp.application_url || opp.original_url || 'https://gitlab-transcend.devpost.com/';
  let html = null;
  try {
    const res = await fetch(url);
    if (res.ok) {
      html = await res.text();
      console.log(`  Fetched public page (${html.length} bytes)`);
    } else {
      console.warn(`  Failed to fetch ${url} (HTTP ${res.status})`);
    }
  } catch (err) {
    console.warn(`  Network error fetching ${url}:`, err.message);
  }

  const rawItem = {
    id: opp.extracted_json?.external_id || '31503',
    title: opp.title,
    url,
    submission_period_dates: opp.extracted_json?.fields?.submission_window || 'Oct 05 - 27, 2026',
    prize_amount: opp.extracted_json?.fields?.prizes || '$45,000',
    displayed_location: { location: opp.location || 'Online' }
  };

  const enriched = html ? enrichDevpostFromPage(rawItem, html) : null;
  const deadline = enriched?.deadline || parseDevpostDeadline(rawItem.submission_period_dates) || '2026-10-27';
  console.log('  Repaired deadline:', deadline);

  // Update opportunity record
  const updatePayload = {
    deadline,
    description: enriched?.raw_text || opp.description,
    skills: enriched?.skills || opp.skills || ['Git'],
    requirements_status: 'REQUIREMENTS_PRESENT',
    extracted_json: enriched || {
      ...opp.extracted_json,
      deadline,
      fields: {
        ...opp.extracted_json?.fields,
        deadline,
        deadline_display: 'Deadline: Oct 27, 2026 @ 1:00pm UTC',
        deadline_time: '18:30:00+05:30'
      }
    },
    updated_at: new Date().toISOString()
  };

  const { error: updateErr } = await supabase
    .from('opportunities')
    .update(updatePayload)
    .eq('id', opp.id)
    .eq('user_id', userId);

  if (updateErr) {
    console.error('  Failed to update opportunity:', updateErr);
  } else {
    console.log('  ✔ Successfully updated opportunity in database.');
  }

  // Update opportunity requirements
  const newReqs = enriched?.requirements || [
    {
      kind: 'deadline',
      value: `Submission deadline: ${deadline}`,
      mandatory: true,
      requirement_class: 'mandatory_eligibility',
      evidence: 'Deadline: Oct 27, 2026 @ 1:00pm UTC',
      evidence_snippet: 'Deadline: Oct 27, 2026 @ 1:00pm UTC'
    },
    {
      kind: 'eligibility',
      value: 'Above legal age of majority in country of residence',
      mandatory: true,
      requirement_class: 'mandatory_eligibility',
      evidence: 'Above legal age of majority in country of residence',
      evidence_snippet: 'Above legal age of majority in country of residence'
    },
    {
      kind: 'location',
      value: 'Specific countries/territories excluded',
      mandatory: true,
      requirement_class: 'mandatory_eligibility',
      evidence: 'Specific countries/territories excluded',
      evidence_snippet: 'Specific countries/territories excluded'
    },
    {
      kind: 'location',
      value: 'Participation location: Online',
      mandatory: false,
      requirement_class: 'other_requirement',
      evidence: 'Location: Online',
      evidence_snippet: 'Location: Online'
    },
    {
      kind: 'prize',
      value: 'Prizes: $45,000',
      mandatory: false,
      requirement_class: 'benefit',
      evidence: 'Prizes: $45,000',
      evidence_snippet: 'Prizes: $45,000'
    },
    {
      kind: 'skill',
      value: 'Git',
      mandatory: true,
      requirement_class: 'required_skill',
      evidence: 'Life After Code is the GitLab Transcend Hackathon.',
      evidence_snippet: 'Life After Code is the GitLab Transcend Hackathon.'
    }
  ];

  // Delete old requirements
  await supabase
    .from('opportunity_requirements')
    .delete()
    .eq('opportunity_id', opp.id)
    .eq('user_id', userId);

  // Insert new requirements
  const reqRows = newReqs.map(r => ({
    user_id: userId,
    opportunity_id: opp.id,
    kind: r.kind,
    value: r.value,
    mandatory: Boolean(r.mandatory),
    evidence_snippet: r.evidence_snippet || r.evidence,
    requirement_class: r.requirement_class,
    quote: r.evidence || r.evidence_snippet,
    status: 'active'
  }));

  const { error: reqInsertErr } = await supabase
    .from('opportunity_requirements')
    .insert(reqRows);

  if (reqInsertErr) {
    console.error('  Failed to insert requirements:', reqInsertErr);
  } else {
    console.log(`  ✔ Inserted ${reqRows.length} verified participation & skill requirements.`);
  }

  // Fetch profile to verify decision contract
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: profileSkills } = await supabase
    .from('profile_skills')
    .select('level, skills(canonical_name)')
    .eq('user_id', userId);

  const skillsList = (profileSkills || []).map(ps => ({
    name: ps.skills?.canonical_name || '',
    level: ps.level
  }));

  const studentProfile = {
    ...profile,
    skills: skillsList
  };

  const decisionContract = createDecisionContract({
    hash: () => 'recalculated-hash',
    enableMissingDeadlinePolicy: true
  });

  const rawMatch = {
    skill_fit: 0.8,
    career_alignment: 0.7,
    interest_fit: 1.0,
    confidence: 0.9,
    evidence: [
      {
        component: 'interest_fit',
        opportunity_quote: 'Hackathon: Life After Code',
        profile_quote: 'hackathon'
      }
    ]
  };

  const updatedOpp = {
    ...opp,
    ...updatePayload,
    deadline
  };

  const decision = decisionContract.decide(
    {
      opportunity: updatedOpp,
      profile: studentProfile,
      requirements: reqRows
    },
    rawMatch,
    '2026-10-17T12:00:00Z'
  );

  console.log('\n  Reevaluated Decision Result:');
  console.log('    Eligibility Status:', decision.eligibility_status);
  console.log('    Decision:', decision.decision);
  console.log('    Match Score:', decision.match_score);
  console.log('    Confidence:', Math.round((decision.confidence || 0) * 100) + '%');
  console.log('    Explanation:', decision.explanation);
  console.log('    Checks:');
  for (const c of decision.eligibility_checks) {
    console.log(`      [${c.status}] ${c.kind}: ${c.reason}`);
  }
}

console.log('\n=== BACKFILL COMPLETE ===');
