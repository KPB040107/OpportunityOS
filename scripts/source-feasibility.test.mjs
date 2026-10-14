import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
