// Runs unchanged inside n8n Code nodes and in behavioral tests.
export function prepareDiscoveryBatch(source, response, normalize, collection) {
  const base = {run_id: source.run_id, lease_token: source.lease_token};
  const body = response?.body ?? response;
  const failed = response?.error || Number(response?.statusCode || 200) >= 400;
  const list = collection === 'array' ? body : body?.[collection];
  if (failed || !Array.isArray(list)) {
    return [{json: {...base, scan_error: 'SOURCE_FETCH_OR_FORMAT_FAILED', next_cursor: source.cursor_state || {offset: 0}}}];
  }
  const sorted = [...list].sort((a, b) => {
    const intern = x => /\b(intern|internship|trainee|apprentice)\b/i.test(`${x.title || x.text || ''} ${x.categories?.commitment || ''}`);
    return Number(intern(b)) - Number(intern(a));
  });
  const cursor = Math.max(0, Number(source.cursor_state?.offset) || 0);
  const offset = cursor >= sorted.length ? 0 : cursor;
  const batch = sorted.slice(offset, offset + 10);
  const next_cursor = {offset: offset + batch.length >= sorted.length ? 0 : offset + batch.length};
  if (!batch.length) return [{json: {...base, empty: true, next_cursor}}];
  try {
    return batch.map(item => ({json: {...base, item: normalize(item), next_cursor}}));
  } catch {
    // Keep the cursor so a malformed batch is retryable, never silently successful.
    return [{json: {...base, scan_error: 'SOURCE_ITEM_INVALID', next_cursor: source.cursor_state || {offset: 0}}}];
  }
}

export function summarizeDiscoveryBatch(results, batch) {
  const first = batch[0]?.json || {};
  const values = results.map(r => r.json.result);
  const rejected = values.some(r => !r?.saved && !r?.ignored_reason);
  return {
    run_id: first.run_id, lease_token: first.lease_token,
    status: first.scan_error || rejected ? 'error' : 'ok',
    error: first.scan_error || (rejected ? 'CATALOG_SAVE_REJECTED' : null),
    found: batch.filter(i => i.json.item).length,
    added: values.filter(r => r?.saved && r.was_created).length,
    updated: values.filter(r => r?.saved && r.was_updated).length,
    next_cursor: first.scan_error || rejected ? null : first.next_cursor,
  };
}
