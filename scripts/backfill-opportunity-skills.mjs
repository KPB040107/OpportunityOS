import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { extractSkillsAndRequirements } from './skill-extractor.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const envText = (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '') + '\n' +
                  (fs.existsSync('web/.env.local') ? fs.readFileSync('web/.env.local', 'utf8') : '');
  const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1] || envText.match(/SUPABASE_URL=([^\r\n]+)/)?.[1];
  const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1];
  if (!url || !key) throw new Error('Supabase URL or Service Role Key missing in environment.');
  return createClient(url.trim(), key.trim(), { auth: { persistSession: false } });
}

export async function backfillOpportunitySkillsAndRequirements() {
  const supabase = getSupabaseAdmin();
  console.log('[Backfill] Fetching opportunities from database...');

  const { data: opportunities, error } = await supabase
    .from('opportunities')
    .select('id, user_id, title, organization, description, skills, extracted_json');

  if (error) {
    throw new Error(`Failed to fetch opportunities: ${error.message}`);
  }

  console.log(`[Backfill] Found ${opportunities.length} total opportunities.`);
  let updatedCount = 0;
  let requirementsCount = 0;

  for (const opp of opportunities) {
    const rawText = opp.description || opp.extracted_json?.raw_text || '';
    if (!rawText.trim()) continue;

    const { skills, requirements } = extractSkillsAndRequirements(rawText);
    const existingSkills = Array.isArray(opp.skills) ? opp.skills : [];
    const mergedSkills = Array.from(new Set([...existingSkills, ...skills]));

    let needsOppUpdate = false;
    if (mergedSkills.length !== existingSkills.length || (existingSkills.length === 0 && mergedSkills.length > 0)) {
      needsOppUpdate = true;
    }

    const updatedExtracted = {
      ...(opp.extracted_json || {}),
      skills: mergedSkills,
      requirements: requirements
    };

    if (needsOppUpdate) {
      const { error: updateErr } = await supabase
        .from('opportunities')
        .update({
          skills: mergedSkills,
          extracted_json: updatedExtracted,
          updated_at: new Date().toISOString()
        })
        .eq('id', opp.id);

      if (updateErr) {
        console.error(`[Backfill] Error updating opportunity ${opp.id}: ${updateErr.message}`);
      } else {
        updatedCount++;
        console.log(`[Backfill] Updated skills for "${opp.title}" (${opp.organization}): [${mergedSkills.join(', ')}]`);
      }
    }

    // Check opportunity_requirements
    const { data: existingReqs, error: reqsErr } = await supabase
      .from('opportunity_requirements')
      .select('id')
      .eq('opportunity_id', opp.id);

    if (!reqsErr && (!existingReqs || existingReqs.length === 0) && requirements.length > 0) {
      const rows = requirements.map(r => ({
        user_id: opp.user_id,
        opportunity_id: opp.id,
        kind: r.kind,
        value: r.value,
        normalized_value: r.normalized_value || null,
        mandatory: Boolean(r.mandatory),
        evidence_snippet: r.evidence || r.value
      }));

      const { error: insErr } = await supabase
        .from('opportunity_requirements')
        .insert(rows);

      if (insErr) {
        console.error(`[Backfill] Error inserting requirements for ${opp.id}: ${insErr.message}`);
      } else {
        requirementsCount += rows.length;
        console.log(`[Backfill] Inserted ${rows.length} requirements for "${opp.title}" (${opp.organization})`);
      }
    }

    // Re-enqueue evaluation so match scoring reflects extracted skills & requirements
    try {
      await supabase.rpc('enqueue_evaluation', {
        p_user: opp.user_id,
        p_opportunity: opp.id
      });
    } catch (e) {
      // Non-fatal if already queued
    }
  }

  console.log(`\n[Backfill Complete] Updated ${updatedCount} opportunities with skills. Populated ${requirementsCount} requirements.`);
  return { updatedCount, requirementsCount };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  backfillOpportunitySkillsAndRequirements()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
