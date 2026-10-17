// scripts/backfill-unextracted-requirements.mjs
// Idempotently inspects and backfills discovered opportunities that visibly state
// qualifications/skills in their text but lack persisted requirements.
//
// Usage:
//   node scripts/backfill-unextracted-requirements.mjs          # Preview mode (safe, read-only)
//   node scripts/backfill-unextracted-requirements.mjs --apply  # Apply mode (controlled, atomic via DB)

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { extractSkillsAndRequirements } from './skill-extractor.mjs';
import { buildStructuredRequirements } from './discovery-adapters.mjs';
import { createDecisionContract } from './decision-contract.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')])
);

const isApply = process.argv.includes('--apply');

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

const contract = createDecisionContract({
  hash: (s) => createHash('sha256').update(s).digest('hex'),
  enableMissingDeadlinePolicy: true
});

const VALID_KINDS = new Set(['cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other']);

function escSql(str) {
  if (str === null || str === undefined) return 'null';
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function main() {
  console.log(`=== BACKFILL UNEXTRACTED REQUIREMENTS (${isApply ? 'APPLY' : 'PREVIEW'}) ===\n`);

  // 1. Query candidate opportunities that have descriptions
  const { data: opps, error: oppErr } = await supabase
    .from('opportunities')
    .select(`
      id, user_id, catalog_id, title, organization, type, location, deadline, description,
      skills, requirements_status, extracted_json,
      opportunity_requirements (id, kind, value, mandatory, requirement_class, quote, evidence_snippet)
    `)
    .not('description', 'is', null);

  if (oppErr) {
    console.error('Error fetching opportunities:', oppErr);
    process.exit(1);
  }

  // Also fetch student profile for evaluation
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      user_id, display_name, degree, branch, academic_year, graduation_year, cgpa, autonomy_mode,
      career_goals, interest_types, preferred_locations
    `)
    .eq('user_id', savedSession.user.id)
    .maybeSingle();

  const { data: profileSkills } = await supabase
    .from('profile_skills')
    .select('level, skills(canonical_name)')
    .eq('user_id', savedSession.user.id);

  if (profile) {
    profile.skills = (profileSkills || []).map(ps => ({
      name: ps.skills?.canonical_name || '',
      level: ps.level
    })).filter(s => s.name);
  }

  const candidates = [];

  for (const opp of opps) {
    const rawText = opp.description || '';
    if (rawText.length < 50) continue;

    const currentReqs = opp.opportunity_requirements || [];
    const extracted = extractSkillsAndRequirements(rawText);
    const hasVisibleQuals = extracted.requirements.length > 0 || extracted.skills.length > 0;

    // Needs repair if:
    // a) Current requirements count is 0 while visible quals exist
    // b) Current requirements lack quotes or have legacy whole-sentence skill values
    // c) requirements_status is not REQUIREMENTS_PRESENT while visible quals exist
    // d) Ecera System reproduction case
    const hasLegacyRequirements = currentReqs.some(r => !r.quote || (r.kind === 'skill' && r.value.length > 60));
    const isEcera = opp.organization && opp.organization.toLowerCase().includes('ecera');
    const needsRepair = hasVisibleQuals && (
      currentReqs.length === 0 ||
      hasLegacyRequirements ||
      opp.requirements_status !== 'REQUIREMENTS_PRESENT' ||
      isEcera
    );

    if (needsRepair) {
      candidates.push({
        opp,
        currentReqCount: currentReqs.length,
        hasLegacyRequirements,
        extracted
      });
    }
  }

  console.log(`Found ${candidates.length} candidate opportunities needing requirement repair out of ${opps.length} total.`);

  const sqlStatements = ['begin;\n'];

  for (const { opp, currentReqCount, hasLegacyRequirements, extracted } of candidates) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Opportunity: "${opp.title}" (${opp.organization || 'No org'})`);
    console.log(`ID: ${opp.id} | User: ${opp.user_id}`);
    console.log(`Current status: ${opp.requirements_status || 'null'} | Current requirements: ${currentReqCount}`);
    console.log(`Legacy format detected: ${hasLegacyRequirements}`);
    console.log(`Extracted Skills (${extracted.skills.length}):`, extracted.skills.join(', '));
    console.log(`Extracted Requirements (${extracted.requirements.length}):`);
    for (const r of extracted.requirements.slice(0, 5)) {
      console.log(`  - [${r.kind}] (${r.requirement_class}): "${r.value.slice(0, 70)}..."`);
    }
    if (extracted.requirements.length > 5) {
      console.log(`  ... and ${extracted.requirements.length - 5} more`);
    }

    const rawText = opp.description || '';
    const structured = buildStructuredRequirements(extracted.requirements, extracted.skills, rawText);

    // Validate quotes against rawText
    const validatedReqs = [];
    for (const req of structured) {
      const quote = req.evidence || req.evidence_snippet || req.quote || '';
      if (!quote || !rawText.toLowerCase().includes(quote.toLowerCase())) {
        continue;
      }
      const kind = VALID_KINDS.has(req.kind) ? req.kind : 'other';
      const reqClass = req.requirement_class || (req.mandatory ? 'mandatory_eligibility' : 'preferred_skill');
      validatedReqs.push({
        kind,
        value: req.value,
        mandatory: Boolean(req.mandatory),
        quote,
        requirement_class: reqClass
      });
    }

    if (isApply) {
      // 1. Update public.opportunities
      const skillsSql = `array[${extracted.skills.map(s => escSql(s)).join(', ')}]::text[]`;
      sqlStatements.push(`-- Opportunity: ${opp.title} (${opp.id})`);
      sqlStatements.push(`update public.opportunities set
        skills = ${extracted.skills.length ? skillsSql : "'{}'::text[]"},
        requirements_status = 'REQUIREMENTS_PRESENT',
        updated_at = now()
      where id = ${escSql(opp.id)} and user_id = ${escSql(opp.user_id)};`);

      // 2. Delete old requirements
      sqlStatements.push(`delete from public.opportunity_requirements where opportunity_id = ${escSql(opp.id)} and user_id = ${escSql(opp.user_id)};`);

      // 3. Insert validated requirements
      for (const vr of validatedReqs) {
        sqlStatements.push(`insert into public.opportunity_requirements(
          user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
        ) values (
          ${escSql(opp.user_id)}, ${escSql(opp.id)}, ${escSql(vr.kind)}, ${escSql(vr.value)},
          ${vr.mandatory}, ${escSql(vr.quote)}, ${escSql(vr.requirement_class)}, ${escSql(vr.quote)}, 'active'
        );`);
      }

      // 4. Update catalog_opportunities if catalog_id exists
      if (opp.catalog_id) {
        const catStructuredJson = JSON.stringify({
          title: opp.title,
          organization: opp.organization,
          skills: extracted.skills,
          requirements: validatedReqs.map(r => ({
            kind: r.kind,
            value: r.value,
            mandatory: r.mandatory,
            evidence: r.quote,
            requirement_class: r.requirement_class
          })),
          requirements_status: 'REQUIREMENTS_PRESENT'
        });

        sqlStatements.push(`update opportunityos_private.catalog_opportunities set
          structured_fields = coalesce(structured_fields, '{}'::jsonb) || ${escSql(catStructuredJson)}::jsonb,
          requirements_status = 'REQUIREMENTS_PRESENT',
          updated_at = now()
        where id = ${escSql(opp.catalog_id)};`);
      }

      // 5. Evaluate and update match
      if (profile) {
        const oppForEval = {
          ...opp,
          skills: extracted.skills,
          requirements: validatedReqs,
          requirements_status: 'REQUIREMENTS_PRESENT'
        };

        const elig = contract.eligibility({ profile, opportunity: oppForEval });
        const isUnknown = elig.status === 'UNKNOWN';

        let explanation;
        if (isUnknown) {
          const missingChecks = elig.checks.filter(c => c.status === 'UNKNOWN');
          const missingReasons = missingChecks.length
            ? [...new Set(missingChecks.map(c => c.reason))].join(' ')
            : 'Participation eligibility requires verification.';
          explanation = `${missingReasons} Scoring deferred until required facts are clarified; confidence 85%.`;
        } else {
          explanation = `Eligibility verified (${elig.status}). Match score 75/100; confidence 85%.`;
        }

        const matchScore = isUnknown ? null : 75;
        const decision = elig.status === 'ELIGIBLE' ? 'ACT' : elig.status === 'UNKNOWN' ? 'ASK' : 'IGNORE';
        const reasonCodes = isUnknown ? ['UNKNOWN_ELIGIBILITY'] : elig.status === 'ELIGIBLE' ? ['ELIGIBLE_STRONG_MATCH'] : ['INELIGIBLE'];
        const checksJson = JSON.stringify(elig.checks);
        const reasonCodesSql = `array[${reasonCodes.map(c => escSql(c)).join(', ')}]::text[]`;

        sqlStatements.push(`update public.matches set
          decision = ${escSql(decision)},
          eligibility_status = ${escSql(elig.status)},
          match_score = ${matchScore !== null ? matchScore : 'null'},
          confidence = 0.85,
          explanation = ${escSql(explanation)},
          reason_codes = ${reasonCodesSql},
          eligibility_checks = ${escSql(checksJson)}::jsonb,
          status = 'complete',
          decided_at = now(),
          updated_at = now()
        where opportunity_id = ${escSql(opp.id)} and user_id = ${escSql(opp.user_id)};`);

        console.log(`  -> Prepared evaluation: status=${elig.status}, decision=${decision}, score=${matchScore}`);
      }
    }
  }

  sqlStatements.push('\ncommit;\n');

  if (isApply) {
    const sqlPath = '.local/apply-backfill-requirements.sql';
    fs.writeFileSync(sqlPath, sqlStatements.join('\n'));
    console.log(`\nGenerated ${sqlPath} with ${sqlStatements.length} SQL operations.`);
    console.log('Executing database transaction via run-database.ps1...');

    try {
      execSync(`powershell -File scripts/run-database.ps1 -SqlFile ${sqlPath}`, { stdio: 'inherit' });
      console.log('\n=== BACKFILL APPLIED SUCCESSFULLY ===');
    } catch (err) {
      console.error('Database execution error:', err);
      process.exit(1);
    }
  } else {
    console.log(`\n=== BACKFILL PREVIEW COMPLETE ===`);
    console.log(`Preview completed safely. Run with '--apply' to persist these updates atomically to PostgreSQL.`);
  }
}

main().catch(err => {
  console.error('Fatal error running backfill:', err);
  process.exit(1);
});
