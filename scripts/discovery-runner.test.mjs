import test from 'node:test';
import assert from 'node:assert/strict';
import {runAutonomousDiscovery} from './execute-discovery.mjs';

const runId = '00000000-0000-4000-8000-000000000001';
const lease = '00000000-0000-4000-8000-000000000002';

function fakeClient({finishError = null} = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({name, args});
      if (name === 'worker_claim_due_discovery') return {data: {
        claimed: true, run_id: runId, source_id: 'source', adapter: 'lever-v1',
        config: {company: 'example'}, name: 'Example', lease_token: lease,
        cursor_state: {offset: 0}
      }, error: null};
      if (name === 'worker_save_discovery_item') return {data: {saved: true, was_created: true}, error: null};
      if (name === 'worker_finish_discovery_run') return {data: !finishError, error: finishError};
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
}

test('discovery runner finishes with the deployed database parameter names', async () => {
  const client = fakeClient();
  const result = await runAutonomousDiscovery({
    supabaseClient: client,
    fetchFn: async () => ({ok: true, json: async () => [{id: 'one', text: 'Engineering Intern'}]})
  });
  assert.equal(result.saved_new, 1);
  const finish = client.calls.find((call) => call.name === 'worker_finish_discovery_run');
  assert.deepEqual(Object.keys(finish.args).sort(), [
    'p_error', 'p_found', 'p_lease_token', 'p_new', 'p_next_cursor',
    'p_run_id', 'p_status', 'p_updated'
  ]);
  assert.equal(finish.args.p_found, 1);
  assert.equal(finish.args.p_new, 1);
  assert.equal(finish.args.p_updated, 0);
});

test('discovery runner reports failure if completion is not saved', async () => {
  const client = fakeClient({finishError: {message: 'database unavailable'}});
  await assert.rejects(() => runAutonomousDiscovery({
    supabaseClient: client,
    fetchFn: async () => ({ok: true, json: async () => []})
  }), /Could not finish discovery run: database unavailable/);
});
