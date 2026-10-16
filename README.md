# OpportunityOS

> **The Autonomous Student Opportunity Intelligence & Action Operating System**  
> AI extracts grounded evidence; deterministic policy evaluates eligibility, enforces standing rules, and executes verified actions.

OpportunityOS is an autonomous agentic platform designed to help students discover, evaluate, track, and act on internships, hackathons, and research roles without missing deadlines or wasting hours on manual tracking. Built with **n8n workflow automation**, **Supabase PostgreSQL with strict Row-Level Security (RLS)**, **Next.js 15 App Router**, and a resilient **Dual-Engine AI architecture (Google Gemini + Groq LLM failover)**.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Capture["1. Ingestion & Discovery Layer"]
        EXT["Chrome Extension (Manifest V3)"] --> INTAKE["/api/capture & /api/intake"]
        BKM["JavaScript Bookmarklet"] --> INTAKE
        EML["Inbound Email (IMAP/Plus-Addressing)"] --> W1["01-ingest Workflow"]
        DISC["Discovery Feeds\n(Lever, Greenhouse, Ashby, JSearch, Devpost)"] --> W8["08-discovery Workflow"]
        INTAKE --> W1
    end

    subgraph Extraction["2. Extraction & Fact Normalization"]
        W1 --> W2["02-understand Workflow"]
        W8 --> W2
        W2 --> AI_EXT["Dual-Engine LLM Extraction\n(Gemini 2.5 Flash / Groq Llama-3.3)\n+ Canonical Skill & Requirement Extractor"]
        AI_EXT --> CAT["Deduplicated Catalog &\nOpportunity Projections"]
    end

    subgraph Decision["3. Deterministic Decision & Policy Engine"]
        CAT --> W3["03-evaluate Workflow"]
        W3 --> ELIG["Deterministic Eligibility Check\n(CGPA, Branch, Degree, Year, Deadlines)"]
        W3 --> FIELD["Field & Domain Relevance Filter\n(CS/IT & Data Science Intersections)"]
        W3 --> SCORE["Semantic Skill Fit & Match Scoring\n(Weighted Multi-Factor Formula)"]
        W3 --> RULES["Standing Rules & Learning Loop Engine"]
        RULES --> DECISION{"Policy Gate\nACT / ASK / IGNORE"}
    end

    subgraph Action["4. Action & Autonomy Layer"]
        DECISION -- "ACT" --> W4["04-act Workflow"]
        DECISION -- "ASK" --> W5["05-ask Workflow"]
        DECISION -- "IGNORE" --> ARCHIVE["Mute / Archive / Ignore"]
        W4 --> CAL["Google Calendar Sync (Deadlines)"]
        W4 --> NOTIF["Email Alerts & Digest"]
        W4 --> TRK["Application Tracker & Kanban"]
        W5 --> APPR["Student Clarification & Approval Queue"]
    end

    subgraph Planning["5. Strategy & Profile Acceleration"]
        RES["PDF Resume Upload"] --> W10["10-resume Workflow"]
        W10 --> PROF["Auto-Populated Profile & Skills"]
        TRK --> W9["09-plan Workflow"]
        W9 --> WEEK["Weekly Action Planner (Priority Sprints)"]
    end
```

---

## Key Features

### 1. Autonomous Multi-Source Discovery
- **Native ATS & Job Board Connectors**: Continuous autonomous discovery via Lever, Greenhouse, Ashby, JSearch (RapidAPI for LinkedIn/Indeed/Glassdoor), and Devpost.
- **Intelligent Field Relevance Filter**: Automatically filters non-technical roles (Sales, HR, Telecalling, Finance) for engineering students, while ensuring Data Science students receive both Data Science and core Computer Science opportunities.
- **Deduplication & Tiered Trust**: SHA-256 fingerprinting prevents repeated listings across feeds; risk signals flag non-standard compensation, upfront fees, or unverified claims.

### 2. Grounded Fact Extraction & Canonical Skill Recognition
- **Canonical Skill & Requirement Parser**: Recognizes over 80+ technology skills (HTML, CSS, JavaScript, React, Python, C/C++, Java, Android SDK, SQL, Docker, AWS, etc.) directly from job descriptions.
- **Grounded Qualification Criteria**: Extracts structured, verifiable requirements (mandatory vs. preferred) paired with verbatim evidence quotes from the source listing.
- **Zero Hallucination Policy**: Every extracted datum is bound to an exact snippet from the source text; unquoted or assumed qualifications are strictly blocked.

### 3. Deterministic & Semantic Decision Engine
- **Three-Tier Policy Routing**:
  - `ACT`: High-confidence match meeting all mandatory requirements. Automatically schedules deadlines to Google Calendar, adds to tracker, and sends alerts.
  - `ASK`: Ambiguous requirements, missing academic profile facts, or borderline scores. Surfaces interactive clarification cards to the student.
  - `IGNORE`: Expired deadlines, failing mandatory requirements, or roles below the student's relevance threshold.
- **Missing Deadline Handling (D1 Policy)**: If an internship posting does not state an explicit closing date, OpportunityOS authorizes action without cluttering the student's calendar.

### 4. Dual-Engine LLM with Automatic Failover
- **Primary Model**: Google Gemini (`models/gemini-2.5-flash` / `models/gemini-2.5-flash-lite`).
- **Resilient Fallback**: Groq Cloud (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`).
- **Dynamic Quota & Rate Management**: If Gemini encounters rate limits (HTTP 429) or daily quota exhaustion, the evaluation and extraction pipelines immediately switch to Groq without interruption.
- **Sub-Second Cooldown**: Worker cooldown reduced to 2 seconds with up to 10,000 daily evaluation allowances.

### 5. Multi-Channel Capture Tools
- **Chrome Extension (Manifest V3)**: One-click capture from active browser tabs with instant metadata extraction and secure authentication.
- **JavaScript Bookmarklet**: Portable capture tool compatible with any modern browser (Chrome, Edge, Safari, Firefox).
- **Inbound Email Ingestion**: Plus-address routing (`opportunities+userid@domain.com`) automatically converts forwarded job newsletters into structured opportunities.

### 6. Standing Rules & Progressive Autonomy
- **Learning Loop**: When students repeatedly accept or reject opportunities with specific traits, OpportunityOS proposes deterministic standing rules.
- **Autonomy Counter & Ledger**: Live transparency showing items read, acted upon, clarified, ignored, and protected against risk.

### 7. Weekly Action Planner & Resume Onboarding
- **Weekly Strategy Sprints**: Organizes active applications into manageable, prioritized weekly sprints with buffer time and conflict protection.
- **One-Click Resume Onboarding**: Upload a PDF resume to instantly extract degrees, graduation year, CGPA, technical skills, and career goals into your student profile.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Web App** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **Workflow Engine** | n8n (Self-hosted via Docker), Node.js Code Nodes, Custom HTTP Webhooks |
| **Database & Auth** | Supabase PostgreSQL, Row-Level Security (RLS), PL/pgSQL Triggers, Auth SSR |
| **AI & NLP** | Google Gemini 2.5, Groq Cloud (Llama 3.3 / GPT-OSS 120B), Structured Output Parsers |
| **Browser Extension** | Chrome Extensions Manifest V3, Webpack/Vanilla JS, Background Service Workers |
| **Testing & CI** | Node.js Test Runner (`node --test`), Custom Contract Suites, RLS Security Tests |

---

## Repository Structure

```
OpportunityOS/
├── web/                             # Next.js 15 web application
│   ├── src/app/                    # App Router pages (inbox, approvals, plan, rules, sources)
│   ├── src/components/             # UI components, autonomy counter, decision toolbar
│   └── src/lib/                    # Supabase SSR clients, validation, decision contracts
├── workflows/                       # Sanitized, exportable n8n workflows
│   ├── 01-ingest.json              # Intake, hashing, and user authentication
│   ├── 02-understand.json          # Grounded extraction with dual Gemini/Groq LLM
│   ├── 03-evaluate.json            # Deterministic decision and semantic matching
│   ├── 04-act.json                 # Calendar scheduling, tracking, and notifications
│   ├── 05-ask-and-approve.json     # Interactive student approvals and clarifications
│   ├── 08-discovery.json           # Scheduled discovery feeder (JSearch, Lever, etc.)
│   ├── 09-plan.json                # Weekly action planner generator
│   └── 10-resume.json              # PDF resume parsing and profile alignment
├── scripts/                         # Core execution contracts, test suites, and worker tools
│   ├── decision-contract.mjs       # Pure-function decision logic shared with n8n
│   ├── discovery-adapters.mjs      # Normalizers for JSearch, Lever, Greenhouse, Ashby, Devpost
│   ├── skill-extractor.mjs         # Canonical skill and requirement extraction engine
│   ├── planner-contract.mjs        # Deterministic weekly planner engine
│   ├── resume-contract.mjs         # Resume parser and profile extractor
│   ├── smoke-tests.mjs             # End-to-end system smoke tests (Slice S8)
│   └── run-database.ps1            # Secure database migration runner via n8n Postgres
├── supabase/
│   ├── migrations/                 # Migrations 0001 through 0046 (RLS, schema, procedures)
│   └── tests/                      # Reversible pgTAP / SQL isolation test suites
├── extension/                       # Chrome Extension (Manifest V3)
│   ├── manifest.json               # Extension configuration and permissions
│   ├── popup.html / popup.js       # Extension UI for one-click opportunity capture
│   └── background.js               # Service worker for background API dispatch
└── docs/                            # Architecture specs, decision policies, progress logs
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20.9.0 or higher
- **pnpm**: v9.0.0 or higher
- **Docker & Docker Compose**: For local n8n workflow execution
- **Supabase Account**: Free or self-hosted PostgreSQL database

### 2. Environment Configuration

Copy the example environment files and configure your keys:

```bash
# In the repository root
cp .env.example .env

# In the web directory
cp web/.env.example web/.env.local
```

Configure the following essential variables in `web/.env.local` and `.env`:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase anon/publishable key.
- `RAPIDAPI_KEY`: (Optional) JSearch API key for real-time job discovery.
- `GROQ_API_KEY`: (Optional) Groq Cloud key for ultra-fast fallback evaluation.

> [!IMPORTANT]
> Never commit `.env` or `web/.env.local` files to version control. All secrets, keys, and tokens are strictly excluded via `.gitignore`.

### 3. Database Initialization

Run the migrations in sequential order using your Supabase SQL editor or the provided database runner:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-database.ps1 -SqlFile supabase/migrations/0001_foundation.sql
# ... up through migration 0046
```

### 4. Start n8n Workflow Automation

```bash
# Launch the n8n container
docker compose up -d

# Open the n8n editor at http://localhost:5678
# Import workflows from the workflows/ directory and activate them
```

### 5. Launch the Web Application

```bash
cd web
pnpm install
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Install the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the [`extension/`](extension/) directory from this repository.
4. Pin the OpportunityOS extension to capture opportunities from any webpage with one click!

---

## Verification & Testing

OpportunityOS includes rigorous regression and acceptance test suites:

```bash
# 1. Run all core contract unit tests
node --test scripts/discovery-contract.test.mjs
node --test scripts/decision-contract.test.mjs scripts/field-relevance.test.mjs
node --test scripts/planner-contract.test.mjs
node --test scripts/resume-contract.test.mjs
node --test scripts/capture-contract.test.mjs

# 2. Run the full deployment smoke test suite
node scripts/smoke-tests.mjs
```

### Test Suite Highlights:
- **Zero Secret Leakage**: Guarantees zero sensitive tokens in workflow definitions.
- **Two-User Isolation**: Proves complete RLS isolation where User B cannot access or mutate User A's data.
- **Quota Resilience**: Proves automated failover when primary LLM quotas are exhausted.
- **Deterministic Decisions**: Verifies identical scoring and policy outputs across 30+ standardized scenarios.

---

## Security & Privacy Architecture

- **Strict Row-Level Security (RLS)**: Enforced across all 46 database tables. Authenticated users can only read and mutate their own opportunities, sources, and rules.
- **Prompt Injection Defense**: Injected instructions inside raw job postings cannot alter decisions or bypass safety gates; suspicious inputs are automatically flagged as risk signals.
- **Verified TLS & Certificate Pinning**: Direct database connections validate custom Supabase certificates.
- **Fenced Execution Boundaries**: Sensitive external mutations (calendar writes, email dispatches) require authenticated student authorization or explicit autopilot consent.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
