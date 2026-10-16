import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { extractSkillsAndRequirements } from './skill-extractor.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

export async function generateBackfillSql() {
  const env = Object.fromEntries(
    fs.readFileSync('web/.env.local', 'utf8')
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );

  let session = JSON.parse(fs.readFileSync('.local/repair-live-session.json', 'utf8'));
  let sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + session.access_token } }
  });

  // Test session validity
  let { data: opps, error } = await sb
    .from('opportunities')
    .select('id, user_id, title, organization, description, skills, extracted_json');

  if (error && error.message?.includes('JWT expired')) {
    console.log('[Backfill] Refreshing expired session token...');
    const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    const { data: refreshData, error: refreshErr } = await authClient.auth.refreshSession({
      refresh_token: session.refresh_token
    });
    if (refreshErr) throw new Error(`Token refresh failed: ${refreshErr.message}`);
    session = {
      access_token: refreshData.session.access_token,
      refresh_token: refreshData.session.refresh_token,
      user: refreshData.user
    };
    fs.writeFileSync('.local/repair-live-session.json', JSON.stringify(session, null, 2));
    sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: 'Bearer ' + session.access_token } }
    });
    const retry = await sb
      .from('opportunities')
      .select('id, user_id, title, organization, description, skills, extracted_json');
    opps = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(`Query failed: ${error.message}`);
  console.log(`[Backfill] Analyzing ${opps.length} opportunities...`);

  const sqlStatements = [
    '-- Automatic backfill of skills and requirements for opportunities',
    'DO $$',
    'BEGIN'
  ];

  let skillsUpdated = 0;
  let reqsAdded = 0;

  for (const opp of opps) {
    const rawText = opp.description || opp.extracted_json?.raw_text || '';
    if (!rawText.trim()) continue;

    const { skills, requirements } = extractSkillsAndRequirements(rawText);
    const existingSkills = Array.isArray(opp.skills) ? opp.skills : [];
    const mergedSkills = Array.from(new Set([...existingSkills, ...skills]));

    let oppNeedsUpdate = false;
    if (mergedSkills.length > 0 && mergedSkills.length !== existingSkills.length) {
      oppNeedsUpdate = true;
    }

    if (oppNeedsUpdate) {
      skillsUpdated++;
      const skillsArrayLiteral = 'ARRAY[' + mergedSkills.map(s => escapeSqlString(s)).join(', ') + ']::text[]';
      sqlStatements.push(`  UPDATE public.opportunities SET skills = ${skillsArrayLiteral}, updated_at = now() WHERE id = '${opp.id}';`);
    }

    if (requirements.length > 0) {
      reqsAdded += requirements.length;
      sqlStatements.push(`  DELETE FROM public.opportunity_requirements WHERE opportunity_id = '${opp.id}';`);
      for (const req of requirements) {
        const kind = escapeSqlString(req.kind);
        const val = escapeSqlString(req.value);
        const mandatory = req.mandatory ? 'true' : 'false';
        const evidence = escapeSqlString(req.evidence || req.value);
        sqlStatements.push(`  INSERT INTO public.opportunity_requirements (user_id, opportunity_id, kind, value, mandatory, evidence_snippet) VALUES ('${opp.user_id}', '${opp.id}', ${kind}, ${val}, ${mandatory}, ${evidence});`);
      }
    }

    // Re-enqueue evaluation if skills or requirements were extracted
    if (oppNeedsUpdate || requirements.length > 0) {
      sqlStatements.push(`  PERFORM public.enqueue_evaluation('${opp.user_id}', '${opp.id}');`);
    }
  }

  sqlStatements.push('END $$;');

  const sqlContent = sqlStatements.join('\n');
  const outFile = path.resolve('.local/backfill-skills.sql');
  fs.writeFileSync(outFile, sqlContent, 'utf8');

  console.log(`[Backfill] Generated SQL with ${skillsUpdated} opportunities updated and ${reqsAdded} requirements populated.`);
  console.log(`[Backfill] Wrote SQL to ${outFile}`);
  return { skillsUpdated, reqsAdded, outFile };
}

generateBackfillSql()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
