import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway } from './webhook-gateway.mjs';

test('Public gateway protects the editor and preserves authenticated webhook traffic', async t => {
  let calls = 0;
  const upstream = http.createServer((req, res) => {
    calls++;
    if (req.url === '/webhook/redirect') { res.writeHead(302, { location: '/rest/settings' }).end(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ secret: req.headers['x-foundation-key'], proxy: req.headers['x-forwarded-for'], method: req.method }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ targetPort: upstream.address().port, maxBytes: 20 });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const base = 'http://127.0.0.1:' + gateway.address().port;
  for (const path of ['/', '/rest/settings', '/webhook-test/example', '/webhook/%2e%2e/rest', '/webhook/a/../../rest']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal(calls, 0);
  const response = await fetch(base + '/webhook/example', { method: 'POST', body: '{}', headers: { 'X-Foundation-Key': 'test-only', 'X-Forwarded-For': 'spoofed' } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.secret, 'test-only');
  assert.notEqual(data.proxy, 'spoofed');
  assert.equal((await fetch(base + '/webhook/example', { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(base + '/webhook/example', { method: 'POST', body: 'x'.repeat(21) })).status, 413);
  assert.equal((await fetch(base + '/webhook/redirect', { redirect: 'manual' })).status, 502);
  assert.equal((await fetch(base + '/webhook-waiting/123')).status, 200);
});
