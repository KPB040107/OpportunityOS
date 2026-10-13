import test from 'node:test';
import assert from 'node:assert/strict';
import { signupErrorMessage } from '../web/src/lib/auth-errors.ts';

test('signup errors distinguish user corrections, throttling, and server configuration', () => {
  assert.match(signupErrorMessage({code:'email_address_invalid',status:422}), /real email address/);
  assert.match(signupErrorMessage({code:'weak_password',status:422}), /stronger password/);
  assert.match(signupErrorMessage({code:'over_request_rate_limit',status:429}), /wait a few minutes/);
  assert.match(signupErrorMessage({code:'over_email_send_rate_limit',status:429}), /confirmation emails/);
  assert.match(signupErrorMessage({code:'email_address_not_authorized',status:403}), /not configured/);
  assert.match(signupErrorMessage({code:'unexpected_failure',status:500}), /project owner/);
});

test('provider diagnostics and credentials never appear in the signup message', () => {
  const error={code:'unexpected_failure',status:500,message:'SMTP password SECRET and user email private@example.com'};
  const message=signupErrorMessage(error);
  assert.doesNotMatch(message, /SECRET|private@example.com|SMTP password/);
  assert.doesNotMatch(signupErrorMessage({code:'SECRET'}), /SECRET/);
});
