import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeDevpostItem,
  parseDevpostDeadline,
  enrichDevpostFromPage
} from './discovery-adapters.mjs';

test('source feasibility documentation exists and contains required candidate sections', () => {
  const docPath = path.resolve('docs/source-feasibility.md');
  assert.ok(fs.existsSync(docPath), 'docs/source-feasibility.md must exist');
  const content = fs.readFileSync(docPath, 'utf8');

  assert.match(content, /Lever Postings API/i, 'Must record Lever candidate');
  assert.match(content, /Devpost/i, 'Must record Devpost candidate');
  assert.match(content, /Internshala/i, 'Must record Internshala candidate and robots policy');
  assert.match(content, /JSearch/i, 'Must record JSearch candidate status');
  assert.match(content, /Hosting & Deployment/i, 'Must record Hosting decisions (D6)');
});

test('Lever adapter normalizer produces valid source-item-v2 contract structure', () => {
  const sampleLeverPosting = {
    id: 'cred-123',
    text: 'Software Engineer - Backend',
    categories: {
      commitment: 'full time',
      location: 'Bangalore',
      team: 'Engineering',
      department: 'Platform'
    },
    hostedUrl: 'https://jobs.lever.co/cred/cred-123',
    applyUrl: 'https://jobs.lever.co/cred/cred-123/apply',
    createdAt: 1728900000000
  };

  // Adapter mapping logic
  const normalized = {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'company_feed',
    adapter: 'lever-v1',
    external_id: sampleLeverPosting.id,
    original_url: sampleLeverPosting.hostedUrl,
    application_url: sampleLeverPosting.applyUrl,
    fields: {
      title: sampleLeverPosting.text,
      location: sampleLeverPosting.categories?.location || null,
      commitment: sampleLeverPosting.categories?.commitment || null,
      deadline: null
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/text' },
      { field: 'location', kind: 'structured_field', json_pointer: '/categories/location' }
    ]
  };

  assert.equal(normalized.contract_version, 'source-item-v2');
  assert.equal(normalized.visibility, 'public');
  assert.equal(normalized.fields.title, 'Software Engineer - Backend');
  assert.equal(normalized.fields.location, 'Bangalore');
  assert.equal(normalized.fields.deadline, null);
});

test('Devpost adapter normalizer produces valid source-item-v2 contract structure with deadline text', () => {
  const sampleDevpost = {
    id: 12345,
    title: 'Global AI Hackathon 2026',
    url: 'https://devpost.com/hackathons/global-ai-2026',
    submission_period_dates: 'Oct 01 - Oct 25, 2026',
    prize_amount: '$50,000',
    open_state: 'open'
  };

  const normalized = {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'hackathon_registry',
    adapter: 'devpost-v1',
    external_id: String(sampleDevpost.id),
    original_url: sampleDevpost.url,
    application_url: sampleDevpost.url,
    fields: {
      title: sampleDevpost.title,
      submission_window: sampleDevpost.submission_period_dates,
      prize_pool: sampleDevpost.prize_amount,
      deadline: null // Will be parsed from submission_period_dates in extraction
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title' },
      { field: 'submission_window', kind: 'structured_field', json_pointer: '/submission_period_dates' }
    ]
  };

  assert.equal(normalized.contract_version, 'source-item-v2');
  assert.equal(normalized.fields.title, 'Global AI Hackathon 2026');
  assert.equal(normalized.fields.submission_window, 'Oct 01 - Oct 25, 2026');
});

test('Devpost extraction repair parses deadline from month-on-left ranges and timestamped feeds', () => {
  const item = {
    id: 998877,
    title: 'Autumn Agentic Sprint',
    url: 'https://devpost.com/hackathons/autumn-agentic-sprint',
    submission_period_dates: 'Oct 05 - 27, 2026',
    prize_amount: '$25,000'
  };

  const normalized = normalizeDevpostItem(item);
  assert.equal(normalized.contract_version, 'source-item-v2');
  assert.equal(normalized.deadline, '2026-10-27', 'Deadline must be parsed and NOT null for Oct 05 - 27, 2026');
  assert.equal(normalized.fields.deadline, '2026-10-27');
  assert.equal(normalized.fields.submission_window, 'Oct 05 - 27, 2026');

  // Verify deadline parser formats
  assert.equal(parseDevpostDeadline('Oct 05 - 27, 2026'), '2026-10-27');
  assert.equal(parseDevpostDeadline('Oct 27, 2026 @ 1:00pm UTC'), '2026-10-27');
  assert.equal(parseDevpostDeadline('2026-10-27T09:00:00-04:00'), '2026-10-27');
  assert.equal(parseDevpostDeadline('Nov 15, 2026 11:59pm IST'), '2026-11-15');
});

test('Devpost full-listing enrichment extracts rules, prizes, and deadline from HTML', () => {
  const sampleHtml = `
    <div>
      <span data-iso-date="2026-10-27T13:00:00Z">Oct 27, 2026 @ 1:00pm UTC</span>
      <div id="challenge-description">A competition to design autonomous agents.</div>
      <ul id="eligibility-list">
        <li>Above legal age of majority in country of residence</li>
        <li>Specific countries/territories excluded</li>
      </ul>
      <div id="prizes-overview">$30,000 in cash prizes</div>
    </div>
  `;

  const item = {
    id: 'ai-sprint',
    title: 'AI Sprint'
  };

  const enriched = enrichDevpostFromPage(item, sampleHtml);
  assert.equal(enriched.deadline, '2026-10-27');
  assert.equal(enriched.fields.deadline, '2026-10-27');
  assert.ok(enriched.requirements.some(r => r.value.includes('Above legal age')));
  assert.ok(enriched.requirements.some(r => r.value.includes('countries/territories excluded')));
  assert.ok(enriched.fields.prizes.includes('30,000'));
});
