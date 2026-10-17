================================================================================
OPPORTUNITYOS
The Autonomous Student Opportunity Intelligence & Action Operating System
================================================================================

OpportunityOS is an autonomous agentic platform designed to help students discover,
evaluate, track, and act on Internships, Jobs, and Hackathons without missing
deadlines, falling for predatory listings, or wasting hours on manual tracking.

Built with:
- Next.js 15 App Router (React 19, TypeScript, Tailwind CSS)
- Supabase PostgreSQL with strict Row-Level Security (RLS) & PL/pgSQL Triggers
- n8n Workflow Automation (Docker container)
- Dual-Engine AI Architecture (Google Gemini 2.5 + Groq Cloud failover)


--------------------------------------------------------------------------------
1. CORE PILLARS & ARCHITECTURE
--------------------------------------------------------------------------------

1. Three Focused Opportunity Categories:
   - Internships: Student-tailored work-experience roles with branch, degree,
     CGPA, and technical skill matching.
   - Jobs: Graduate roles, associate software engineer openings, technical roles.
   - Hackathons: Developer builds and competitions evaluated strictly on
     participation criteria (legal age of majority, eligible countries/regions,
     verified submission deadlines) with ZERO academic bias.

2. Autonomous Multi-Source Discovery:
   - Continuous scanning of Lever (CRED, Meesho), Greenhouse, Ashby, and Devpost.
   - JSearch adapter for LinkedIn, Indeed, and Glassdoor searches.
   - Tiered Trust System: Corroborated, Attributed, Unverified.

3. Automatic Full-Listing Reading & Extraction Pipeline:
   - Automated safe public listing page fetching when structured feeds are shallow.
   - SSRF-fenced reader: DNS pinning, public IPv4/IPv6 validation, redirect limits,
     robots.txt compliance, OpportunityOS/0.2 User-Agent.
   - Bounded multi-section chunking for long descriptions (>20,000 characters).
   - Explicit submission deadline extraction with time and timezone.
   - 4-way requirement classification: mandatory_eligibility, required_skill,
     preferred_skill, other_requirement/benefit.
   - Grounded quote validation and flexible retry heuristics.

4. Deterministic Decision & Policy Engine:
   - Three-tier policy routing: ACT, ASK, IGNORE.
   - Non-contradictory UI state: When facts are incomplete, scores are suppressed
     and missing rules are explicitly named.
   - Autonomy modes: Cautious (80/0.85), Balanced (70/0.75), Autopilot (60/0.65).

5. Consent & Calendar Sync Architecture:
   - Separated consents: email_notifications_enabled and calendar_sync_enabled.
   - Bidirectional database triggers maintain synchronization across UI and worker.
   - Google Calendar sync for opted-in demo accounts; universal .ICS for all users.

6. Resume-First Onboarding:
   - PDF resume parser extracts education, CGPA, projects, GitHub links, and
     suggested skill levels with verbatim evidence quotes.
   - Physical resume files purged from storage upon profile confirmation (Privacy D9).

7. Weekly Plan Retirement:
   - Weekly Plan feature retired per PRD specifications; /plan redirects to
     /applications and /api/plan/* returns HTTP 410 FEATURE_RETIRED.


--------------------------------------------------------------------------------
2. REPOSITORY STRUCTURE
--------------------------------------------------------------------------------

OpportunityOS/
|-- web/                             Next.js 15 web application
|   |-- src/app/                     App Router pages
|   |-- src/components/              UI components, decision panels, cards
|   `-- src/lib/                     Supabase SSR, schemas, contracts
|-- workflows/                       Exported n8n workflows
|   |-- 01-ingest.json               Intake, hashing, authentication
|   |-- 02-understand.json           Bounded fact extraction
|   |-- 03-evaluate.json             Deterministic decision & matching
|   |-- 04-act.json                  Calendar, tracking, notifications
|   |-- 05-ask-and-approve.json      Student approvals & clarifications
|   |-- 08-discovery.json            Autonomous discovery feeder
|   `-- 10-resume.json               PDF resume parsing
|-- scripts/                         Core contracts, test suites, deployment
|   |-- decision-contract.mjs        Decision engine logic
|   |-- discovery-adapters.mjs       Source normalizers (Lever, Devpost, etc.)
|   |-- safe-source.mjs              SSRF-fenced page fetcher & HTML cleaner
|   |-- skill-extractor.mjs          Section chunking & skill parser
|   |-- resume-contract.mjs          Resume text extraction & skill levels
|   |-- smoke-tests.mjs              Deployment smoke test suite (8 gates)
|   |-- test-primary-acceptance-journey.mjs  Live primary journey verification
|   `-- run-database.ps1             Database migration runner
|-- supabase/
|   `-- migrations/                  Migrations 0001 through 0066
|-- extension/                       Chrome Extension (Manifest V3)
`-- docs/                            PRDs, specifications, progress logs


--------------------------------------------------------------------------------
3. GETTING STARTED & SETUP
--------------------------------------------------------------------------------

Prerequisites:
- Node.js v20.9.0 or higher
- Docker & Docker Compose
- Supabase PostgreSQL account

Setup Steps:
1. Environment variables:
   cp .env.example .env
   cp web/.env.example web/.env.local
   Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.

2. Database migrations:
   Apply migrations 0001 through 0066 using your Supabase SQL editor or:
   powershell -File scripts/run-database.ps1 -SqlFile supabase/migrations/<file>.sql

3. n8n workflow deployment:
   docker compose up -d
   powershell -File scripts/deploy-discovery-workflow.ps1
   powershell -File scripts/deploy-understand-workflow.ps1
   powershell -File scripts/deploy-evaluate-workflow.ps1

4. Launch web application:
   cd web
   npm install
   npm run build
   npm start
   Open http://localhost:3000 in your browser.


--------------------------------------------------------------------------------
4. VERIFICATION & TESTING
--------------------------------------------------------------------------------

Run all automated verification suites:

1. Unit & Contract Test Suite (241 passing tests):
   node --test scripts/*.test.mjs

2. Deployment Smoke Test Suite (8 gates):
   node scripts/smoke-tests.mjs

3. Live Primary Acceptance Journey:
   node scripts/test-primary-acceptance-journey.mjs

4. Production Build:
   npm --prefix web run build


--------------------------------------------------------------------------------
5. LICENSE
--------------------------------------------------------------------------------

Licensed under the MIT License. See LICENSE for details.
