import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {normalizeLeverItem, normalizeDevpostItem, normalizeJSearchItem} from './discovery-adapters.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

export async function runAutonomousDiscovery({supabaseClient, fetchFn = fetch, dryRun = false} = {}) {
  let supabase = supabaseClient;
  if (!supabase) {
    const envText = fs.readFileSync(path.resolve('.env'), 'utf8') + '\n' + fs.readFileSync(path.resolve('web/.env.local'), 'utf8');
    const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1] || envText.match(/SUPABASE_URL=([^\r\n]+)/)?.[1];
    const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1];
    if (!url || !key) throw new Error('Supabase URL or Service Role Key missing in environment.');
    supabase = createClient(url, key);
  }

  // 1. Claim due source
  const {data: claimResult, error: claimErr} = await supabase.rpc('worker_claim_due_discovery');
  if (claimErr) throw new Error(`Claim discovery failed: ${claimErr.message}`);
  if (!claimResult || !claimResult.claimed) {
    return {claimed: false, message: 'No sources due for discovery scan.'};
  }

  const {run_id, source_id, adapter, config, name} = claimResult;
  console.log(`[Discovery] Claimed source: ${name} (Adapter: ${adapter}, Run: ${run_id})`);

  let rawItems = [];
  let fetchError = null;

  try {
    if (adapter === 'lever-v1') {
      const company = config?.company || 'cred';
      const endpoint = `https://api.lever.co/v0/postings/${company}?mode=json`;
      const res = await fetchFn(endpoint, {headers: {'User-Agent': 'OpportunityOS/1.0'}});
      if (!res.ok) throw new Error(`Lever HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      rawItems = (json || []).map(p => normalizeLeverItem(company, p));
    } else if (adapter === 'devpost-v1') {
      const endpoint = config?.url || 'https://devpost.com/api/hackathons';
      const res = await fetchFn(endpoint, {headers: {'User-Agent': 'OpportunityOS/1.0'}});
      if (!res.ok) throw new Error(`Devpost HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      rawItems = (json?.hackathons || []).map(h => normalizeDevpostItem(h));
    } else if (adapter === 'jsearch-v1') {
      // If awaiting credentials, stop honestly
      throw new Error('JSearch provider key not configured. Discovery awaiting valid credentials.');
    } else {
      throw new Error(`Unsupported discovery adapter: ${adapter}`);
    }
  } catch (err) {
    fetchError = err.message;
    console.error(`[Discovery] Fetch failed for ${name}: ${fetchError}`);
  }

  if (fetchError) {
    await supabase.rpc('worker_finish_discovery_run', {
      p_run_id: run_id,
      p_status: 'error',
      p_found: 0,
      p_new: 0,
      p_updated: 0,
      p_error: fetchError
    });
    return {claimed: true, success: false, error: fetchError};
  }

  // 2. Bound run: at most 10 items saved per dispatch
  const boundedItems = rawItems.slice(0, 10);
  let newCount = 0;
  let updatedCount = 0;

  for (const item of boundedItems) {
    if (dryRun) continue;
    const {data: saveRes, error: saveErr} = await supabase.rpc('worker_save_discovery_item', {
      p_run_id: run_id,
      p_item: item
    });
    if (saveErr) {
      console.error(`[Discovery] Item save failed: ${saveErr.message}`);
    } else if (saveRes?.saved) {
      if (saveRes.was_created) newCount++;
      else updatedCount++;
    }
  }

  // 3. Complete run
  await supabase.rpc('worker_finish_discovery_run', {
    p_run_id: run_id,
    p_status: 'ok',
    p_found: rawItems.length,
    p_new: newCount,
    p_updated: updatedCount,
    p_error: null
  });

  console.log(`[Discovery] Completed run ${run_id}: found ${rawItems.length}, saved ${newCount} new, ${updatedCount} updated.`);
  return {
    claimed: true,
    success: true,
    run_id,
    source: name,
    found: rawItems.length,
    saved_new: newCount,
    saved_updated: updatedCount
  };
}

if (process.argv[1] && process.argv[1].endsWith('execute-discovery.mjs')) {
  runAutonomousDiscovery().then(r => console.log('Result:', JSON.stringify(r, null, 2))).catch(e => {
    console.error('Fatal discovery error:', e);
    process.exit(1);
  });
}
