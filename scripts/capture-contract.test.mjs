import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTrackingUrl,
  detectPortal,
  validateCapturePayload,
  parseMultiListingAlert
} from './capture-contract.mjs';

test('cleanTrackingUrl: cleanly strips marketing & tracking parameters while preserving functional params', () => {
  const dirtyUrl = 'https://www.linkedin.com/jobs/view/123456789?utm_source=share&utm_medium=member_desktop&utm_campaign=job_alert&trk=public_jobs_job-result-card_result-card_full-click&trackingId=xyz789#apply';
  const clean = cleanTrackingUrl(dirtyUrl);
  assert.equal(clean, 'https://www.linkedin.com/jobs/view/123456789');

  const urlWithId = 'https://internshala.com/internship/detail/web-dev-intern?id=9876&utm_campaign=digest&ref=search';
  const cleanId = cleanTrackingUrl(urlWithId);
  assert.equal(cleanId, 'https://internshala.com/internship/detail/web-dev-intern?id=9876');

  const unstopUrl = 'https://unstop.com/hackathons/flipkart-grid-60?ref_id=1122&fbclid=abc_xyz';
  assert.equal(cleanTrackingUrl(unstopUrl), 'https://unstop.com/hackathons/flipkart-grid-60');
});

test('detectPortal: accurately identifies source platform from URL or content', () => {
  assert.equal(detectPortal('https://www.linkedin.com/jobs/view/123'), 'linkedin');
  assert.equal(detectPortal('https://unstop.com/competitions/code-sprint'), 'unstop');
  assert.equal(detectPortal('https://internshala.com/internship/detail/react-intern'), 'internshala');
  assert.equal(detectPortal('https://jobs.lever.co/cred/1234'), 'web');
});

test('validateCapturePayload: validates payload, enforces length bounds, and neutralizes injection', () => {
  const validPayload = {
    title: 'Frontend Engineer Intern',
    url: 'https://internshala.com/internship/detail/frontend-dev?utm_source=share',
    text: 'Looking for a React developer with at least 1 project in Next.js.',
    links: [
      { text: 'Apply now', url: 'https://internshala.com/apply/123?trk=btn' }
    ]
  };

  const validated = validateCapturePayload(validPayload);
  assert.equal(validated.title, 'Frontend Engineer Intern');
  assert.equal(validated.url, 'https://internshala.com/internship/detail/frontend-dev');
  assert.equal(validated.portal, 'internshala');
  assert.equal(validated.links.length, 1);
  assert.equal(validated.links[0].url, 'https://internshala.com/apply/123');
  assert.ok(validated.content_hash);

  // Rejects oversized content (> 20,000 characters)
  assert.throws(() => {
    validateCapturePayload({
      title: 'Oversized Posting',
      url: 'https://example.com/job',
      text: 'a'.repeat(20001)
    });
  }, /PAYLOAD_TOO_LARGE/);

  // Rejects malicious script injection or credential harvesting
  assert.throws(() => {
    validateCapturePayload({
      title: 'Malicious Posting',
      url: 'https://example.com/job',
      text: 'Apply here <script>document.cookie="stolen"</script>'
    });
  }, /SECURITY_VIOLATION/);
});

test('parseMultiListingAlert: splits multi-listing alerts into individual candidates with clean links', () => {
  const linkedInAlertText = `
Your daily Job Alert for Software Engineer Intern:

Role: Backend Platform Intern at Razorpay
Bengaluru, Karnataka
https://www.linkedin.com/jobs/view/1001?trk=email-alert&utm_source=li

Role: SDE Intern at Swiggy
Bengaluru, Karnataka
https://www.linkedin.com/jobs/view/1002?trk=email-alert&trackingId=99
  `;

  const candidates = parseMultiListingAlert(linkedInAlertText, 'jobalerts-noreply@linkedin.com');
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].portal, 'linkedin');
  assert.equal(candidates[0].type, 'internship');
  assert.equal(candidates[0].application_url, 'https://www.linkedin.com/jobs/view/1001');
  assert.equal(candidates[1].application_url, 'https://www.linkedin.com/jobs/view/1002');

  const unstopAlertText = `
Unstop Opportunity Alert:
Flipkart GRiD 6.0 organized by Flipkart
https://unstop.com/hackathons/flipkart-grid-60?utm_source=unstop_alert

Tata Imagination Challenge organized by Tata Sons
https://unstop.com/competitions/tata-imagination-challenge?ref=alert
  `;

  const unstopCandidates = parseMultiListingAlert(unstopAlertText, 'alerts@unstop.com');
  assert.equal(unstopCandidates.length, 2);
  assert.equal(unstopCandidates[0].portal, 'unstop');
  assert.equal(unstopCandidates[0].type, 'hackathon');
  assert.equal(unstopCandidates[0].application_url, 'https://unstop.com/hackathons/flipkart-grid-60');
  assert.equal(unstopCandidates[1].application_url, 'https://unstop.com/competitions/tata-imagination-challenge');
});
