type SignupError = { code?: string; status?: number };

// Never show provider messages, request details, or credentials to the browser.
export function signupErrorMessage(error: SignupError): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Too many confirmation emails. Please wait before trying again.';
    case 'over_request_rate_limit':
      return 'Too many signup attempts. Please wait a few minutes before trying again.';
    case 'email_address_invalid':
      return 'Use a real email address that can receive your confirmation email.';
    case 'email_address_not_authorized':
      return 'Confirmation emails are not configured for new users yet. Please contact the project owner.';
    case 'weak_password':
      return 'Choose a stronger password with uppercase and lowercase letters, a number, and a symbol.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New email accounts are currently disabled. Please contact the project owner.';
    case 'email_exists':
    case 'user_already_exists':
      return 'Unable to create an account with these details. If you already registered, try signing in.';
    case 'request_timeout':
      return 'Signup timed out. Please check your connection and try again shortly.';
  }
  if (error.status === 429) return 'Too many signup attempts. Please wait a few minutes before trying again.';
  if (error.status && error.status >= 500) {
    return 'The signup service could not complete your request. Please contact the project owner to check authentication and confirmation-email settings.';
  }
  return 'Could not create your account. Please try again or contact the project owner.';
}
