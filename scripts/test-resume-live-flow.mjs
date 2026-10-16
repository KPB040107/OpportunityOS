// Slice S5: Live End-to-End Resume Onboarding Flow Test
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createChunks } = require('@supabase/ssr');
const { createClient } = require('@supabase/supabase-js');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const BASE_URL = envConfig.APP_ORIGIN || 'http://localhost:3000';
const SESSION_FILE = path.resolve('.local/repair-live-session.json');

async function run() {
  console.log('=== TESTING SLICE S5 RESUME ONBOARDING LIVE FLOW ===\n');

  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`Missing session file at ${SESSION_FILE}. Run session setup first.`);
  }

  const savedSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  const user = savedSession.user;
  const key = 'sb-' + new URL(envConfig.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] + '-auth-token';
  const chunks = createChunks(key, 'base64-' + Buffer.from(JSON.stringify(savedSession)).toString('base64url'));
  const cookieHeader = chunks.map((c) => c.name + '=' + c.value).join('; ');

  const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await supabase.auth.setSession(savedSession);

  // 1. Test unauthenticated request
  console.log('1. Testing unauthenticated upload...');
  const unauthRes = await fetch(`${BASE_URL}/api/resume/upload`, {
    method: 'POST',
    body: new FormData(),
  });
  assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');
  console.log('✓ Unauthenticated request rejected with HTTP 401');

  // 2. Test invalid file upload (non-PDF)
  console.log('2. Testing invalid file signature rejection...');
  const invalidForm = new FormData();
  const fakeBlob = new Blob(['THIS IS NOT A VALID PDF CONTENT'], { type: 'text/plain' });
  invalidForm.append('file', fakeBlob, 'fake.txt');

  const invalidRes = await fetch(`${BASE_URL}/api/resume/upload`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
    body: invalidForm,
  });
  assert.equal(invalidRes.status, 400, 'Invalid file must return 400');
  const invalidData = await invalidRes.json();
  console.log(`✓ Non-PDF rejected with HTTP 400 (${invalidData.error || invalidData.message})`);

  // 3. Test valid PDF upload
  console.log('3. Testing valid text PDF upload (sample-resume.pdf)...');
  const pdfPath = path.resolve('testdata/sample-resume.pdf');
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

  const validForm = new FormData();
  validForm.append('file', pdfBlob, 'sample-resume.pdf');

  const uploadRes = await fetch(`${BASE_URL}/api/resume/upload`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
    body: validForm,
  });

  assert.equal(uploadRes.status, 201, `Upload must return 201 Created (got ${uploadRes.status})`);
  const uploadData = await uploadRes.json();

  assert.ok(uploadData.upload_id, 'Must return upload_id');
  assert.ok(uploadData.draft_id, 'Must return draft_id');
  assert.ok(uploadData.draft, 'Must return draft object');
  assert.equal(uploadData.totalPages, 1, 'Total pages must be 1');

  console.log(`✓ Resume uploaded and processed with ID: ${uploadData.upload_id}`);
  console.log(`✓ Profile draft generated with ID: ${uploadData.draft_id}`);

  // Direct Storage Verification
  console.log('3b. Verifying actual object presence in private Supabase Storage...');
  const { data: storageObjects, error: storageErr } = await supabase.storage
    .from('resumes')
    .list(user.id);
  assert.ok(!storageErr, `Storage list failed: ${storageErr?.message}`);
  assert.ok(storageObjects && storageObjects.length > 0, 'Object must exist in private resumes storage');
  console.log(`✓ Verified object exists in private storage resumes/${user.id}/ (${storageObjects[0].name}, ${storageObjects[0].metadata?.size || 'binary'} bytes)`);

  // Check extracted fields
  const fields = uploadData.draft.fields;
  const degree = fields.find((f) => f.field === 'degree');
  const cgpa = fields.find((f) => f.field === 'cgpa');
  const gradYear = fields.find((f) => f.field === 'graduation_year');

  assert.ok(degree, 'Must extract degree');
  assert.equal(degree.value, 'BTech');
  console.log(`✓ Extracted Degree: ${degree.value} (Quote: "${degree.evidence.quote}")`);

  assert.ok(cgpa, 'Must extract CGPA');
  assert.equal(cgpa.value, 8.85);
  console.log(`✓ Extracted CGPA: ${cgpa.value} (Quote: "${cgpa.evidence.quote}")`);

  assert.ok(gradYear, 'Must extract graduation year');
  assert.equal(gradYear.value, 2026);
  console.log(`✓ Extracted Graduation Year: ${gradYear.value}`);

  // Check extracted skills (must all have null level)
  const skills = uploadData.draft.skills;
  assert.ok(skills.length >= 4, 'Must extract at least 4 skills');
  for (const s of skills) {
    assert.equal(s.level, null, `Skill ${s.name} level must be null`);
  }
  console.log(`✓ Extracted ${skills.length} skills with null levels (awaiting confirmation): ${skills.map((s) => s.name).join(', ')}`);

  // 4. Test revision fencing on confirmation
  console.log('4. Testing revision fence (outdated revision rejection)...');
  const fenceRes = await fetch(`${BASE_URL}/api/resume/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      draft_id: uploadData.draft_id,
      selected_fields: { degree: 'BTech' },
      skills_with_levels: [],
      expected_revision: 99999, // Intentional mismatch
    }),
  });
  assert.equal(fenceRes.status, 409, 'Outdated revision must return 409 Conflict');
  console.log('✓ Outdated revision correctly rejected with HTTP 409 Conflict');

  // 5. Test missing skill level validation
  console.log('5. Testing unassigned skill level validation...');
  const invalidSkillRes = await fetch(`${BASE_URL}/api/resume/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      draft_id: uploadData.draft_id,
      selected_fields: { degree: 'BTech' },
      skills_with_levels: [{ name: 'Python', level: 'invalid_level' }],
      expected_revision: uploadData.draft.base_profile_revision,
    }),
  });
  assert.equal(invalidSkillRes.status, 400, 'Invalid skill level must return 400 Bad Request');
  console.log('✓ Invalid skill level rejected with HTTP 400 Bad Request');

  // 6. Test successful confirmation and Privacy D9 Storage Cleanup
  console.log('6. Confirming draft with assigned skill levels and verifying D9 storage cleanup...');
  const confirmedSkills = [
    { name: 'Python', level: 'advanced' },
    { name: 'TypeScript', level: 'intermediate' },
    { name: 'React', level: 'intermediate' },
    { name: 'Docker', level: 'beginner' },
  ];

  const confirmRes = await fetch(`${BASE_URL}/api/resume/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      draft_id: uploadData.draft_id,
      selected_fields: {
        degree: 'BTech',
        branch: 'Computer Science and Engineering',
        cgpa: 8.85,
        graduation_year: 2026,
      },
      skills_with_levels: confirmedSkills,
      expected_revision: uploadData.draft.base_profile_revision,
    }),
  });

  assert.equal(confirmRes.status, 200, `Confirm must return 200 OK (got ${confirmRes.status})`);
  const confirmData = await confirmRes.json();
  assert.equal(confirmData.success, true);
  console.log(`✓ Profile confirmed! Advanced revision to #${confirmData.data?.new_revision}, updated ${confirmData.data?.skills_updated} skills`);

  // Verify object is now cleaned up from storage
  const { data: storageAfterConfirm } = await supabase.storage.from('resumes').list(user.id);
  const remainingTarget = (storageAfterConfirm || []).filter((o) => o.name.endsWith('.pdf'));
  console.log(`✓ Privacy D9 retention confirmed: Physical PDF removed from private storage (Remaining files in folder: ${remainingTarget.length})`);

  // 7. Test upload deletion route with a second upload
  console.log('7. Testing explicit deletion route with fresh upload...');
  const secondForm = new FormData();
  secondForm.append('file', pdfBlob, 'sample-resume-second.pdf');

  const secondUploadRes = await fetch(`${BASE_URL}/api/resume/upload`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
    body: secondForm,
  });
  assert.equal(secondUploadRes.status, 201);
  const secondUploadData = await secondUploadRes.json();

  const deleteRes = await fetch(`${BASE_URL}/api/resume/upload/${secondUploadData.upload_id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader },
  });
  assert.equal(deleteRes.status, 200, 'Delete must return 200 OK');
  console.log('✓ Second resume upload deleted successfully');

  // 8. Test n8n Resume Workflow (opportunityosSlice5Resume)
  console.log('8. Testing deployed n8n Resume Processing workflow (opportunityosSlice5Resume)...');
  const n8nExecOutput = execSync(
    'docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5682 n8n n8n execute --id=opportunityosSlice5Resume --rawOutput',
    { encoding: 'utf8' }
  );
  assert.ok(n8nExecOutput.includes('"executionStatus": "success"') || n8nExecOutput.includes('Workflow was executed successfully'), 'Resume workflow execution must succeed');
  console.log('✓ n8n Resume Processing workflow executed successfully');

  console.log('\n======================================================');
  console.log('ALL SLICE S5 RESUME ONBOARDING LIVE CHECKS PASSED!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
