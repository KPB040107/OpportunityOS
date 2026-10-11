# OpportunityOS

A student opportunity agent orchestrated by n8n. AI extracts evidence; deterministic code evaluates eligibility and authorizes actions.

## Current status

Slices 0 and 1 are accepted. The website supports authentication, profile editing, text/URL intake, a saved-submission inbox, and activity; the user reported completing signup confirmation. n8n runs locally with persistent storage and a public webhook-only tunnel. The user reported successful Supabase writes, restart persistence, Gemini generation, outgoing and incoming email, and a Calendar test event. The private GitHub backup is verified. Gemini free-tier limits were inspected in AI Studio on October 10, 2026: 15 requests/minute, 250,000 input tokens/minute, and 500 requests/day. See docs/progress.md for verification details. Structured opportunity understanding is next.

## Start locally

1. Run `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` once. It creates a private `.env` and preserves existing encryption keys on subsequent runs.
2. Run `docker compose up -d` and open http://localhost:5678. Create the n8n owner account through the editor.
3. Pin `N8N_IMAGE` in `.env` to the downloaded image digest before the demo. Do not upgrade mid-build.
4. Keep `.env` and a backup of the `opportunityos_n8n_data` volume together. Restarting the container retains workflows and credentials; deleting the volume does not.

## Complete the foundation

1. Create a free Supabase project. Run `supabase/migrations/0001_foundation.sql` in its SQL Editor. Create a test Auth user and copy its UUID.
2. Create an n8n Postgres credential using Supabase's session-pooler connection details and SSL. Keep the password only in n8n credentials.
3. Create an n8n Header Auth credential: name `X-Foundation-Key`, value a randomly generated secret. This is a restricted setup endpoint, not the future app ingestion endpoint.
4. Import `workflows/00-foundation.json`. Select your Header Auth credential on the webhook and Postgres credential on the database node. Publish/activate the workflow.
5. Run `powershell -ExecutionPolicy Bypass -File scripts/start-public-tunnel.ps1`, then `docker compose up -d`. The helper starts a webhook-only gateway on loopback port 5680 and a Cloudflare Quick Tunnel, updates `WEBHOOK_URL`, and prints the public URL. The editor stays at localhost:5678. Requests to editor, administrative, and test-webhook paths are blocked. Do not tunnel port 5678 directly.
6. Run `scripts/verify-foundation.ps1 -BaseUrl https://YOUR-TUNNEL/ -UserId YOUR-AUTH-USER-UUID`. Enter the secret at the protected prompt. Verify the returned event in Supabase.
7. Restart n8n, verify the owner account and workflow remain, and repeat the public webhook check. Test an incorrect secret and confirm it is rejected without a new event.
8. Obtain a Gemini free-tier API key; record the enabled model and actual quotas locally. Configure IMAP/SMTP credentials for the dedicated mailbox and verify plus-address routing. Connect the demo calendar and test a disposable calendar entry. Never commit credentials or send them in chat.
9. Create the GitHub repository and push only tracked source files after reviewing them for secrets.

## Slice gate

Do not start Slice 1 until the public authenticated webhook persists an event and the restart check passes. Tag `slice-0` only after acceptance; later tag `prototype-v1` after three clean rehearsals.

## Planned slices

1. Auth, profile, text/URL intake, processing inbox, activity.
2. Validated extraction, evidence, provenance, deduplication before AI calls.
3. Deterministic eligibility, scoring, confidence, ACT/ASK/IGNORE.
4. Idempotent actions, tracker, confirmation-based approvals and Wait resume.
5. Email forwarding, autopilot, error workflow, fixtures and rehearsals.

Standing rules, weekly plan, and constrained AI Agent tools remain event additions.

## Website base (Slice 1)

The local website is in `web`. It includes sign-in/sign-up, an editable profile, text or website-link intake, a saved-submission inbox, and activity. Sign-in, profile save, text/URL intake, ownership isolation, and overlapping duplicate requests have been verified. Slice 1 is accepted with user-reported signup confirmation; see docs/progress.md. Structured extraction and decisions arrive in later slices.

1. Apply `supabase/migrations/0002_website_base.sql` after the foundation migration. The checked schema restricts reads by owner and uses transactional functions for writes. Run `supabase/tests/0002_website_base.test.sql` to verify isolation; its temporary data is rolled back.
2. Copy `web/.env.example` to `web/.env.local` and set the public Supabase project URL and publishable key. No service-role key is used in the website. The local builder's configuration is already set and is ignored by Git.
3. Configure `workflows/01-ingest.json`: select the existing Postgres credential, set the fixed Supabase Auth project URL and public API key in the verification node, then publish it in n8n. The Compose configuration allows only the `url` builtin for the workflow's URL parser. No client-provided ownership claim or remote Auth URL is accepted. Leave execution-data retention disabled.
4. In `web`, run `pnpm install --frozen-lockfile`, then `pnpm build`. Use Node 20.9+ and pnpm 11.25.0. Run `scripts/start-website.ps1` from the repository to open a background server at http://localhost:3000. For development, use `pnpm dev --hostname 127.0.0.1` in `web` instead.
5. Sign in with the Supabase test user, or create an account and confirm its email. For signup, set the Auth Site URL to http://localhost:3000 and allow http://localhost:3000/auth/callback in Supabase Auth redirect settings. Configure custom SMTP to deliver confirmations beyond Supabase organization members. For the controlled demo, use the dedicated mailbox, smtp.gmail.com port 465, and its app password entered directly in Supabase. Gmail delivery limits still apply; delivery must be verified. The website uses a separate account password.
6. Save a profile, paste an opportunity and verify the saved item plus its activity entry. A rejected/uncertain workflow response is shown as an error, never a confirmed save. Retrying unchanged content keeps the same request ID.

Workflow generation: `node scripts/generate-ingest-workflow.mjs` exports a portable JSON with placeholders. `--runtime` creates an ignored `.local/01-ingest.runtime.json` using the public settings and credential references in `web/.env.local`; review this file locally before importing. Never commit runtime exports or execution payloads.

Validation: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` in `web`, and `node --test scripts/ingest-contract.test.mjs scripts/webhook-gateway.test.mjs` from the repository. The initial quota observations are in `config/ai-quota.json`.

## Public tunnel lifecycle

The tunnel and gateway run in the background; logs and process IDs are in ignored `.local` files. Keep Docker and your computer awake while testing. Run the start helper again after a reboot; it preserves running processes and generates a fresh URL when the tunnel must restart. Always apply any changed URL with `docker compose up -d` before testing.

The executable in ignored `.tools/cloudflared.exe` is Cloudflare release `2026.10.0`, verified against SHA256 `86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c`. On another computer, obtain that executable from the official Cloudflare GitHub release and verify its checksum before starting it. Quick Tunnels are temporary development endpoints with no uptime guarantee.

Gateway checks: `node --test scripts/webhook-gateway.test.mjs`. These verify that restricted routes are blocked, authentication headers are preserved, spoofed proxy headers are replaced, oversized requests are rejected, and upstream redirects cannot expose administrative routes.
