import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createGateway({ targetPort = 5678, timeoutMs = 30000, maxBytes = 1048576 } = {}) {
  return http.createServer((req, res) => {
    const path = req.url.split('?')[0].replace(/\/$/, '');
    // Only the two public intake interfaces cross this boundary. Wait resumes
    // stay on the internal bridge; diagnostic/new webhook paths stay private.
    if (!['/webhook/opportunityos-foundation', '/webhook/opportunityos-ingest'].includes(path)) {
      res.writeHead(404).end('Not found'); return;
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (Number(req.headers['content-length'] || 0) > maxBytes) { res.writeHead(413).end(); req.resume(); return; }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { if (!res.writableEnded) res.writeHead(413).end(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const headers = { ...req.headers };
      // Do not let caller-controlled proxy headers establish trust in n8n.
      for (const key of Object.keys(headers)) {
        if (key.startsWith('x-forwarded-') || ['forwarded', 'connection', 'transfer-encoding', 'upgrade', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer'].includes(key)) delete headers[key];
      }
      for (const key of (req.headers.connection || '').split(',').map(s => s.trim().toLowerCase())) delete headers[key];
      headers.host = 'localhost:' + targetPort;
      headers['x-forwarded-host'] = req.headers.host;
      headers['x-forwarded-proto'] = 'https';
      headers['x-forwarded-for'] = req.socket.remoteAddress;
      headers['content-length'] = size;
      const upstream = http.request({ hostname: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          response.resume(); res.writeHead(502).end('Upstream redirect blocked'); return;
        }
        const responseHeaders = { ...response.headers };
        delete responseHeaders.connection;
        res.writeHead(response.statusCode, responseHeaders);
        response.on('error', () => res.destroy());
        response.pipe(res);
      });
      upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('Timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502).end('Webhook service unavailable'); else res.destroy();
      });
      res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
      upstream.end(Buffer.concat(chunks));
    });
    req.on('error', () => res.destroy());
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createGateway();
  server.listen(5680, '127.0.0.1', () => console.log('Webhook gateway ready on localhost:5680'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
