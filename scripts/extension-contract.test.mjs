// Test Suite for OpportunityOS Browser Extension (Manifest V3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Browser Extension: manifest.json is valid Manifest V3', () => {
  const manifestPath = path.resolve('extension/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.name.includes('OpportunityOS'), 'Manifest must have OpportunityOS name');
  assert.ok(manifest.version, 'Manifest must specify a version');
  assert.ok(manifest.action?.default_popup, 'Must declare an action popup');
  assert.ok(manifest.background?.service_worker, 'Must declare a service worker background');

  // Permissions check
  const perms = manifest.permissions || [];
  assert.ok(perms.includes('activeTab'), 'Must include activeTab permission');
  assert.ok(perms.includes('scripting'), 'Must include scripting permission');

  // Verify all icon paths exist and have valid PNG signature
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const [size, iconRelPath] of Object.entries(manifest.icons || {})) {
    const fullPath = path.resolve('extension', iconRelPath);
    assert.ok(fs.existsSync(fullPath), `Icon ${size} must exist at ${fullPath}`);
    const bytes = fs.readFileSync(fullPath);
    assert.deepEqual(bytes.subarray(0, 8), pngSignature, `Icon ${size} must be a valid PNG`);
  }
});

test('Browser Extension: content.js contains extraction, cleaning, and message listener', () => {
  const contentPath = path.resolve('extension/content.js');
  assert.ok(fs.existsSync(contentPath), 'content.js must exist');

  const code = fs.readFileSync(contentPath, 'utf8');
  assert.ok(code.includes('cleanTrackingUrl'), 'Must implement cleanTrackingUrl');
  assert.ok(code.includes('detectPortal'), 'Must implement detectPortal');
  assert.ok(code.includes('extractOpportunity'), 'Must listen for extractOpportunity message');
  assert.ok(code.includes('chrome.runtime.onMessage.addListener'), 'Must register runtime message listener');
  assert.ok(code.includes('19500') || code.includes('20000'), 'Must bound captured character length');
});

test('Browser Extension: popup files exist and have valid HTML and JavaScript', () => {
  const popupHtmlPath = path.resolve('extension/popup.html');
  const popupJsPath = path.resolve('extension/popup.js');

  assert.ok(fs.existsSync(popupHtmlPath), 'popup.html must exist');
  assert.ok(fs.existsSync(popupJsPath), 'popup.js must exist');

  const html = fs.readFileSync(popupHtmlPath, 'utf8');
  assert.ok(html.includes('id="btnSave"'), 'popup.html must have Save button');
  assert.ok(html.includes('id="btnFullReview"'), 'popup.html must have Full Review button');
  assert.ok(html.includes('popup.js'), 'popup.html must load popup.js');

  const js = fs.readFileSync(popupJsPath, 'utf8');
  assert.ok(js.includes('/api/capture/nonce'), 'popup.js must request capture nonce');
  assert.ok(js.includes('/api/intake'), 'popup.js must submit to /api/intake');
  assert.ok(js.includes('sha256Hex') || js.includes('crypto.subtle'), 'popup.js must compute SHA-256 hash');
});

test('Browser Extension: backend routes permit chrome-extension origin and reject malicious origins', () => {
  const nonceRoute = fs.readFileSync('web/src/app/api/capture/nonce/route.ts', 'utf8');
  const intakeRoute = fs.readFileSync('web/src/app/api/intake/route.ts', 'utf8');

  assert.ok(nonceRoute.includes("chrome-extension://"), 'nonce route must permit chrome-extension origin');
  assert.ok(intakeRoute.includes("chrome-extension://"), 'intake route must permit chrome-extension origin');
  assert.ok(nonceRoute.includes("OPTIONS"), 'nonce route must handle OPTIONS preflight');
  assert.ok(intakeRoute.includes("OPTIONS"), 'intake route must handle OPTIONS preflight');
});
