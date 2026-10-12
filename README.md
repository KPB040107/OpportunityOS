# OpportunityOS

A student opportunity agent orchestrated by n8n. AI extracts evidence; deterministic code evaluates eligibility and authorizes actions.

## Current status

Slices 0–3 are implemented. The website supports authentication, profile editing, text/URL intake, validated opportunity cards, requirements, evidence, controlled retries, activity, eligibility, match scores, confidence and ACT/ASK/IGNORE decisions. n8n visibly runs Ingest, Understand, and Evaluate and Decide. ACT/ASK are saved decisions; permitted actions and authenticated approvals are Slice 4. See docs/progress.md for acceptance evidence and known limitations. The foundation includes persistent local n8n, a temporary webhook-only tunnel, Supabase, Gemini and tested demo email/calendar credentials; some foundation tests are user-reported. Gemini free-tier limits were inspected on October 10, 2026: 15 RPM, 250,000 input TPM and 500 RPD.

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

The local website is in `web`. Sign-in, profile save, text/URL intake, ownership isolation, and overlapping duplicate requests have been verified. Slice 1 is accepted with user-reported signup confirmation; see docs/progress.md. Slice 2 adds structured extraction; decisions remain Slice 3 work.

1. Apply `supabase/migrations/0002_website_base.sql` after the foundation migration. The checked schema restricts reads by owner and uses transactional functions for writes. Run `supabase/tests/0002_website_base.test.sql` to verify isolation; its temporary data is rolled back.
2. Copy `web/.env.example` to `web/.env.local` and set the public Supabase project URL and publishable key. No service-role key is used in the website. The local builder's configuration is already set and is ignored by Git.
3. Configure `workflows/01-ingest.json`: select the existing Postgres credential, set the fixed Supabase Auth project URL and public API key in the verification node, then publish it in n8n. No client-provided ownership claim or remote Auth URL is accepted. Leave execution-data retention disabled. Slice 2 adds only the builtin modules required for safe public-page fetching and hashing; filesystem, process and arbitrary external modules remain unavailable.
4. In `web`, run `pnpm install --frozen-lockfile`, then `pnpm build`. Use Node 20.9+ and pnpm 11.25.0. Run `scripts/start-website.ps1` from the repository to open a background server at http://localhost:3000. For development, use `pnpm dev --hostname 127.0.0.1` in `web` instead.
5. Sign in with the Supabase test user, or create an account and confirm its email. For signup, set the Auth Site URL to http://localhost:3000 and allow http://localhost:3000/auth/callback in Supabase Auth redirect settings. Configure custom SMTP to deliver confirmations beyond Supabase organization members. For the controlled demo, use the dedicated mailbox, smtp.gmail.com port 465, and its app password entered directly in Supabase. Gmail delivery limits still apply; delivery must be verified. The website uses a separate account password.
6. Save a profile, paste an opportunity and verify the saved item plus its activity entry. A rejected/uncertain workflow response is shown as an error, never a confirmed save. Retrying unchanged content keeps the same request ID.

Workflow generation: `node scripts/generate-ingest-workflow.mjs` exports a portable JSON with placeholders. `--runtime` creates an ignored `.local/01-ingest.runtime.json` using the public settings and credential references in `web/.env.local`; review this file locally before importing. Never commit runtime exports or execution payloads.

Validation: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` in `web`, and `node --test scripts/ingest-contract.test.mjs scripts/webhook-gateway.test.mjs` from the repository. The initial quota observations are in `config/ai-quota.json`.

## Understand (Slice 2)

1. Apply migrations `0003_understand.sql` and `0004_source_ambiguities.sql`, once each, in order. Run `supabase/tests/0003_understand.test.sql`; disposable users and rows are rolled back.
2. Import `workflows/02-understand.json` into the same n8n project. Select the existing Postgres credential on its database nodes and Gemini credential on its model node. Publish it, then import/configure the updated Ingest workflow. Its child workflow reference must point to Understand. The 30-second queue checker also recovers a missed dispatch.
3. Run `docker compose up -d` after changing the Compose module allowlist. After CLI import/publish, restart n8n to reload its published revision. The editor draft and published revision must match.
4. Paste an announcement. The worker claims it atomically, prepares text, hashes it before AI, checks its per-user cache, reserves the free budget, extracts through a Basic LLM Chain and Structured Output Parser, validates literal evidence, normalizes facts, and saves cards with provenance. Exact repeated content reuses analysis. Complete identity fingerprints merge different sources while preserving each original submission. Incomplete identities conservatively stay separate.
5. Open a card to inspect stated requirements, quotes, original text and missing facts. Failures remain visible and require an explicit retry, at most twice; no automatic retry of failed analysis. A source instruction cannot authorize an action.

The reader supports public static HTML/text only, with robots checks, pinned public DNS, revalidated redirects, a 10-second fetch limit, 350 KB raw/decoded response limit and 20,000 prepared characters. Login-only, JavaScript-rendered, PDF, oversized and blocked pages need pasted text. A valid schema can still fail literal-evidence validation; such failures never create unchecked cards. At most five opportunities are extracted per submission. Source citations prove where text came from, not that a posting is genuine or still open.

Real URL acceptance was verified on October 12, 2026: a Python.org job posting became a validated card through authenticated website intake, and repeating the URL reused the same card without another AI reservation. AI skills now require paired source quotes; explicit job headings supply type evidence, publication dates cannot substitute for labelled application deadlines, and opposing remote-work statements remain visible. The earlier slice-2 tag is preserved; slice-2-real-url records the follow-up. Detailed evidence and remaining limitations are in docs/progress.md.

One extraction runs at a time, at least 60 seconds apart. The installed Gemini SDK may retry up to six times internally, so each extraction reserves seven attempts, capped at 350 reservations per Pacific day (50 extraction starts). This is conservative budgeting, not a provider usage meter. Other users of the same API project can exhaust quota independently; there is no paid fallback. Waiting items remain queued, and failures are preserved for review.

Reproducible generators: `node scripts/generate-understand-workflow.mjs` and `node scripts/generate-ingest-workflow.mjs`. Their `--runtime` variants create ignored local imports using credential references, never credential secrets. `scripts/export-prototype-workflows.mjs` verifies current published snapshots in `.local/ingest-export.json` and `.local/understand-export.json`, strips credential references and replaces account settings with placeholders before writing portable exports.

Checks: `node --test scripts/ingest-contract.test.mjs scripts/understand-contract.test.mjs scripts/safe-source.test.mjs scripts/webhook-gateway.test.mjs`, the SQL test above, and the website checks. `scripts/test-content-race.ps1` uses two overlapping manual executions to verify exactly one content-cache owner; its explicitly disposable fixture is removed afterward. Database helpers require Docker and the existing credential/project references in ignored `web/.env.local`. Full execution logs and database snapshots must stay in ignored `.local` files.

## Evaluate and Decide (Slice 3)

Apply migrations 0005 through 0009 in order after Slice 2. They add owned matches, a private fenced queue/cache, shared AI reservations and consistent source comparison. Run supabase/tests/0005_evaluate.test.sql; its users, results and budget changes roll back. Earlier website and Understand SQL tests must still pass.

Import workflows/03-evaluate.json in the existing n8n project, select the existing Postgres and Gemini credentials, and publish it. Import the updated Understand workflow with its Execute Workflow reference to Evaluate and Decide. Restart n8n after CLI publication. The 30-second evaluation checker recovers missed dispatches, profile edits and daily deadline changes.

The shared scripts/decision-contract.mjs factory runs in n8n Code nodes and tests. Basic LLM Chain and Structured Output Parser propose semantic evidence only. Both sides of each quote are checked; code computes eligibility, fixed weighted scores, confidence, reasons and policy. The visible Switch routes saved current ACT, ASK and IGNORE decisions. No action or approval workflow is wired yet. Detailed frozen formulas and conservative UNKNOWN cases are in docs/decision-policy.md.

The profile lets users choose Cautious, Balanced or Autopilot. Comma-separated skills are saved individually with the selected level; each academic fact remains user-entered. Cards show a decision and reason; details show eligibility checks, score components, confidence inputs and matching quotes. Simulated submissions are labelled. Failed evaluation is visible and supports at most two explicit retries. Profile corrections reevaluate their own opportunities; old in-flight results cannot overwrite newer facts.

Matching uses a per-owner cache of minimal facts, profile and model/prompt version. Identity and credentials are excluded from model input. Mode/date-only changes reuse evidence. Missing score components contribute zero without redistributing weights. Expired and ineligible cases skip matching. Extraction and matching share one in-flight AI job, 60-second spacing, and seven conservative attempt reservations per call, capped at 350 per Pacific day (50 combined starts, roughly 25 fresh extraction/matching pairs). There is no paid fallback; reservations are not an actual provider usage meter.

Generate a portable export with node scripts/generate-evaluate-workflow.mjs; --runtime writes ignored credential references. The product exporter also requires .local/evaluate-export.json and checks its current published version. Do not commit runtime imports, logs or private caches.

For the full test suite use Node 24+ (the profile parsing test uses native TypeScript loading) and run node --test scripts/decision-contract.test.mjs scripts/profile-skills.test.mjs scripts/understand-contract.test.mjs scripts/safe-source.test.mjs scripts/ingest-contract.test.mjs scripts/webhook-gateway.test.mjs. Website runtime remains Node 20.9+; run its lint/build checks in web.

The 15 fictional fixtures in testdata/slice3-fixtures.json freeze deterministic decisions. For live matching diagnostics, scripts/prepare-slice3-demo.mjs generates a disposable guide profile and five validated fictional sources with no seeded AI result or decision. Apply its ignored seed SQL using scripts/run-database.ps1. After recording live results, the ignored cleanup SQL removes that exact disposable profile while retaining honest global AI reservations. scripts/run-evaluation-check.ps1 runs the same product nodes in an inactive fixture-only workflow to inspect Switch outputs. It requires completed live fixture proof and the Cautious test mode; diagnostics are excluded from product exports. Automatic email forwarding, real actions, approvals and event additions remain later work.

## Public tunnel lifecycle

The tunnel and gateway run in the background; logs and process IDs are in ignored `.local` files. Keep Docker and your computer awake while testing. Run the start helper again after a reboot; it verifies the executable and command line before reusing a PID. If Cloudflare has expired the tunnel with "Tunnel not found", it restarts that verified tunnel and obtains a fresh URL. Always apply any changed URL with `docker compose up -d` before testing.

The executable in ignored `.tools/cloudflared.exe` is Cloudflare release `2026.10.0`, verified against SHA256 `86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c`. On another computer, obtain that executable from the official Cloudflare GitHub release and verify its checksum before starting it. Quick Tunnels are temporary development endpoints with no uptime guarantee.

Gateway checks: `node --test scripts/webhook-gateway.test.mjs`. These verify that restricted routes are blocked, authentication headers are preserved, spoofed proxy headers are replaced, oversized requests are rejected, and upstream redirects cannot expose administrative routes.
