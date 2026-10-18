# OpportunityOS technical stack

_Codebase inventory, 18 October 2026. Versions below come from checked-in manifests/configuration; external service versions and quotas can change._

| Layer | Current implementation | Purpose |
|---|---|---|
| Web runtime | Next.js `16.4.0`, React/React DOM `19.3.0`, TypeScript `^5` | App Router pages, server actions, API routes, authenticated UI. |
| UI | Tailwind CSS `^4`, Radix Slot, Lucide, `clsx`, `tailwind-merge`, class-variance-authority | Styling and reusable components. |
| Validation/PDF | Zod `^4.6.5`, `unpdf` `^1.8.1` | Request/response validation and extractable resume PDF text. |
| Identity/data | Supabase JS `^2.117.3`, Supabase SSR `^0.12.7`, PostgreSQL with RLS | Auth sessions, owner-scoped data, database procedures, private storage. |
| Automation | Self-hosted n8n in Docker Compose; image pinned by digest in `.env.example` | Webhooks, scheduled discovery, extraction, evaluation, actions, mail, Calendar. |
| AI | Groq `openai/gpt-oss-120b` primary in current workflow generators; Gemini model from `config/ai-quota.json` as fallback | Structured extraction and bounded semantic matching evidence. Code makes final policy decisions. |
| Browser capture | Chrome Manifest V3 extension and bookmarklet | Authenticated capture from the student's current page. |
| External providers | Gmail/IMAP/SMTP, Google Calendar OAuth, public job/hackathon feeds, optional JSearch | Intake, notifications, demo calendar, discovery. |
| Tests | Node built-in test runner, Supabase SQL tests, ESLint, TypeScript, Next.js build, live smoke scripts | Contracts, security, integration and build validation. |

## Configuration locations

| File | Contains |
|---|---|
| `.env` from `.env.example` | Docker n8n image, encryption key, webhook/editor URL and timezone. Keep the real file private. |
| `web/.env.local` from `web/.env.example` | Supabase public URL/key, app origin, ingest endpoint, n8n credential **references**, demo calendar ID. Keep the real file private. |
| `config/ai-quota.json` | Observed free-tier Gemini model/limits, not a guarantee of current availability. |
| `config/*.schema.json`, `config/*-prompt.txt` | Required model output shape and bounded extraction/matching prompts. |
| `compose.yaml` | One persistent n8n container, loopback port binding, environment and restricted Code node modules. |

Credential contents are stored in n8n. The repository's runtime generators insert credential references into ignored `.local` workflow copies; sanitized exports in `workflows` are safe templates and cannot run against providers until configured.

## Key commands on the Windows host

From `C:\OpportunityOS`:

```powershell
# Start/inspect automation and website
docker compose up -d
powershell -File scripts/start-website.ps1

# Verify source contracts and local flows
node --test scripts/*.test.mjs
node scripts/smoke-tests.mjs
node scripts/test-primary-acceptance-journey.mjs

# Verify the web build in web/
pnpm lint
pnpm exec tsc --noEmit
$env:OPPORTUNITYOS_BUILD_THREADS='1'; pnpm build
```

Use the project-specific deployment scripts in `scripts/deploy-*-workflow.ps1` when a workflow generator changes. Apply new SQL migrations in numeric order, inspect their output, and avoid treating a successful build as proof of Google OAuth or inbox delivery.

## Source of truth for version claims

- `web/package.json` is authoritative for installed web dependencies. README text still says Next.js 15.
- `scripts/generate-understand-workflow.mjs` and `scripts/generate-evaluate-workflow.mjs` describe current model wiring; `config/ai-quota.json` supplies the Gemini fallback model (`models/gemini-3.5-flash-lite` at this snapshot). Workflow sticky notes and older pitch documents can disagree.
- `supabase/migrations` reaches `0072` in source at this snapshot. Check live migration application separately before assuming a given environment is current.
- `docs/progress.md` records dated tests and provider limitations. The last fresh Calendar read failed because the n8n credential needs reconnecting.
