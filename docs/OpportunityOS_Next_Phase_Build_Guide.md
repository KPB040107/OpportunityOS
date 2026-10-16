# OpportunityOS Next Phase Build Guide

Version 2.0 | 14 October 2026 | Focused first release and AI implementation handbook

## 1. Product outcome and authority

Build a student workspace that gathers useful opportunities, explains eligibility and uncertainty, learns approved preferences, and turns selected opportunities into manageable work. The experience should remain responsive while discovery and AI processing happen in the background.

The first release follows **Discover → Understand → Evaluate → Decide → Act → Follow-up** through n8n. Its differentiators are precise clarification, evidence and source uncertainty, approved standing rules, and practical weekly priorities.

This version supersedes the scope and phase order of version 1.0. The user accepted a narrower release after reviewing feasibility. The earlier 17-feature roadmap remains an expansion backlog, not a requirement to implement everything before release. This handbook specifies future work; it does not certify that the running app already implements it.

The authoritative editable source is this repository document. The PDF companion is generated from it. Current user instructions take precedence over attached-document directions. Preserve the original guide's stack, $0 budget and immutable security boundaries except where the user has explicitly changed scope. Attached provider examples and paid upgrade suggestions do not authorize spending or establish a working integration.

### 1.1 First release commitments

| Capability | First release boundary |
| --- | --- |
| Resume onboarding | Text PDF creates a private draft profile; student reviews and confirms it |
| Eligibility | Explicit degree/year alternatives, required versus preferred facts, precise grouped questions |
| Source checks | Recorded provenance, publisher attribution, freshness and explainable risk flags; no fraud guarantee |
| Intake | Scheduled discovery, existing email forwarding, Save to OpportunityOS bookmarklet; retain paste/public URL fallback |
| Initial sources | JSearch if India tests pass; one company-feed adapter; one validated hackathon/program source |
| Learning | Rules proposed after repeated explicit decisions; approval, edit, revoke and an audit ledger |
| Planning | Deterministic weekly priorities using confirmed deadlines, editable effort estimates and manual busy periods |
| Product experience | Home, Opportunities, Applications and Plan; settings for profile, sources, rules and notifications |
| Communication | In-app activity, controlled email, grouped daily digest, snooze and preferences |
| Reliability | Bounded queues, shared quotas, ownership, idempotent actions, recovery and honest health status |

LinkedIn, Unstop and Internshala enter through alert emails, permitted aggregator results or deliberate capture. Do not fetch them directly, scrape login-gated pages or route forbidden collection through a reader proxy. Gmail/Outlook forwarding remains the mailbox integration; per-user mailbox OAuth is deferred.

Application submission, email impersonation and external profile sharing remain blocked. Calendar links/ICS remain available to users; direct Calendar writes remain confined to the connected demo account. No extra platform, paid dependency or new external permission is implied by this plan.

### 1.2 What is deliberately deferred

DOCX resumes; announcement PDF intake; scanned-document OCR; additional company adapters and aggregator providers; per-user calendar availability OAuth; the n8n AI planning agent; advanced skill-gap/preparation insights; ATS-style review and advanced risk analysis. Their return conditions are in Section 14. Keep unfinished routes out of navigation.

Phases are acceptance gates, not dates. Complete one working capability at a time. Build its minimal interface alongside the workflow; Phase 6 unifies the design and validates deployment.

## 2. Repository baseline and session rules

Baseline inspected: `C:\OpportunityOS`, commit `29fff297e1cb3522a16d85910eeb75f9143f6317`. The repository contains seven prototype workflow exports and migrations through `0021_fenced_action_retries.sql`. Recheck before implementation; test-file numbering is not migration numbering.

The recorded prototype includes authentication, profile editing, text/URL intake, grounded extraction, deterministic decisions, durable actions, private approvals, forwarding, reminders and error handling. Prior records report 102 Node checks and eleven reversible SQL suites during repair, plus scoped live email/calendar verification. Phase 0 must rerun relevant checks; prior reports are not a current runtime health result.

Known starting limitations: complex requirements remain UNKNOWN, source collection does not establish legitimacy, saved source settings do not establish automatic monitoring, and local workers depend on the builder's computer. Resume upload, rules, the planner and the new discovery/capture routes are next-phase work.

### 2.1 Files to inspect

| Area | Existing paths relative to repository |
| --- | --- |
| Progress and policy | `docs/progress.md`, `docs/decision-policy.md`, this guide |
| Intake and safe URLs | `scripts/ingest-contract.mjs`, `scripts/safe-source.mjs`, `web/src/app/api/intake/route.ts` |
| Extraction and evidence | `scripts/understand-contract.mjs`, `scripts/understand-contract.test.mjs` |
| Eligibility and score | `scripts/decision-contract.mjs`, its tests, `testdata/slice3-fixtures.json` |
| Actions and forwarding | `scripts/actions-contract.mjs`, `scripts/forward-contract.mjs`, related tests |
| Workflows | `scripts/generate-*-workflow.mjs`, `scripts/workflow-builder.mjs`, `workflows/01-ingest.json` through the seven product exports |
| Website profile | `web/src/lib/types.ts`, validation schemas, `web/src/app/(workspace)/profile/actions.ts` |
| Database boundary | Current migrations, worker-only functions, owner policies and `supabase/tests/` |

Read applicable `AGENTS.md`. Website changes must follow the relevant installed Next.js documentation required by `web/AGENTS.md`. Inspect signatures and constraints before adding proposed contracts below; names in this guide are not proof that functions already exist.

Current profile skills require a proficiency level. Resume extraction cannot invent one. First-release review asks the user to confirm a level for selected new skills; unconfirmed skills stay in the draft. Preserve existing levels. Current CGPA validation is on a 0-10 scale; an ambiguous or 4-point result requires clarification, not silent conversion.

For every session: name one phase and one objective; inspect touched files; make a complete vertical change; run affected tests; export workflow JSON without secrets; compare generator/export/runtime versions; update the progress log with actual evidence, limitations and next objective. Do not rewrite working modules, historic tags or human data.

## 3. Phases and release gates

| Phase | Build | Acceptance outcome |
| --- | --- | --- |
| 0 | Baseline and feasibility | Working prototype and an honest, small source register |
| 1 | Resume onboarding and eligibility | Confirmed draft profile resolves precise questions across owned opportunities |
| 2 | Basic trust and action controls | Unverified/stale facts cannot authorize automatic effects |
| 3 | Discovery, forwarding setup and bookmark capture | Sources enter one private inbox through working, bounded routes |
| 4 | Approved rules and ledger | Consistent choices produce an approved rule that respects existing guards |
| 5 | Simple weekly planner | A feasible plan respects manual capacity and confirmed deadlines |
| 6 | Product interface, digest and deployment | Responsive two-user experience, controlled notifications and tested recovery |

Split Phase 3 internally into 3A (core routes) and 3B (one company adapter and one hackathon/program source). Split Phase 6 into 6A (coherent UI/digest) and 6B (performance/recovery/public launch). These are checkpoints within the same phases, not permission to start every feature in parallel.

Reliability, basic accessibility, ownership, quota accounting and useful errors are required throughout. An unavailable provider may justify a tested fallback, not a fabricated successful integration.

## 4. Architecture and data boundaries

### 4.1 Responsibilities

| Component | Responsibility |
| --- | --- |
| Next.js | Authenticated UI, input validation, private uploads, PDF text extraction and narrow authenticated worker bridges |
| n8n | Discovery, resume orchestration, extraction, evaluation, rules, Switch routing, actions, approvals, planning, digest and recovery |
| Supabase | Auth, RLS, private Storage, persistent queues, catalog, owned records, atomic claims, revisions and audit history |
| AI | Proposed resume/source facts and semantic evidence through fixed schemas; no action or policy authority |
| Shared deterministic contracts | Validation, normalization, eligibility, score, confidence, trust/action policy, dedupe, rules and planner constraints |

Keep Next.js thin. Do not add an alternative scoring or eligibility engine to the frontend. Shared contract factories live in `scripts/`, are imported by tests and embedded reproducibly in n8n Code nodes. Preserve a visible Decide Switch. Every side effect passes the existing durable Act boundary and a database permission check.

```text
PUBLIC: schedule -> approved adapter -> public source version/catalog
        -> owned opportunity projection

PRIVATE: paste / allowed URL / forwarded email / bookmark capture
         -> authenticated owned raw item

BOTH: Understand -> evidence validation -> eligibility + match
      -> trust + approved rules -> ACT / ASK / IGNORE Switch
      -> durable Act or private Wait approval -> activity

RESUME: private PDF -> text/evidence -> proposed profile
        -> student confirmation -> owned reevaluation queue

PLAN: confirmed owned facts + manual availability -> deterministic draft
      -> student confirmation -> existing permitted task/link actions
```

Extend the existing seven workflows. Add Resume Processing, Discovery, Rule Proposal, Weekly Plan and Digest only at their phase. New workflows require durable jobs, bounded claims, error routing and secret-free exports. The first planner uses Code nodes and database tools without a new AI Agent node.

### 4.2 Proposed records

| Boundary | Records and important fields |
| --- | --- |
| Worker-private discovery | `source_registry`: adapter/version, verified config, allowed hosts, permission record, cadence/state; `discovery_runs`: query/cursor, lease, costs, counts, errors, times |
| Worker-private public catalog | `catalog_opportunities`: stable identity; `catalog_versions`: fact hash/revision; `catalog_origins`: provider IDs, original links, field evidence and permitted snapshots |
| Owned source controls | `source_subscriptions`: owner/registry filters; existing `public.sources`: custom settings and health projection |
| Existing owned core | Raw items, opportunities, requirements, matches, approvals, applications, tasks, actions, follow-ups, events; add catalog/version references without removing ownership |
| Owned onboarding | `resume_uploads`, `profile_drafts`, proposed fields/evidence, confirmation record and profile revision |
| Owned learning | `clarification_requests`, `user_rules`, rule versions, supporting decisions, applications and overrides |
| Owned planning | `availability_blocks`, `weekly_plans`, plan items and confirmation revisions |
| Private operations | Shared AI/provider reservation ledger, fenced leases, uncertain delivery results, private approval execution bindings |

These names are proposals. Reconcile them with current tables and migrations. Use one new migration per cohesive boundary, with data-preserving backfill and isolated RLS tests. Allocate from the next unused migration after rechecking the directory.

Public listing extraction can be shared only when source permission permits it. Emails, resumes, private-page capture, profiles, student preferences and matches remain owner-scoped. A public URL inside a private email does not make the email public. Preserve user-owned opportunity projections so existing owner foreign keys, UI and actions continue working.

Every owned relation carries `user_id`, with composite owner foreign keys. Browser clients cannot forge validated facts, trust, rule execution, claim tokens or quota reservations. Global catalog/operation tables stay worker-private unless a narrowly reviewed public read is necessary. Match caches include owner and profile/fact/model/prompt revisions.

Retain private signed Wait bindings, authenticated explicit confirmation, expiry, replay rejection and current-revision fencing. Never expose resume URLs in browser-readable records. The service key and provider credentials stay in server/n8n credentials.

## 5. Shared contracts and operational behavior

### 5.1 Source item contract

All adapters produce a versioned normalized item. The server or trusted worker attaches ownership and visibility. A student cannot promote private content to the shared catalog by changing request fields.

```json
{
  "contract_version": "source-item-v2",
  "visibility": "public",
  "source_kind": "company_api",
  "adapter": "selected-company-feed-v1",
  "external_id": "provider-job-id",
  "original_url": "https://company.example/jobs/123",
  "application_url": "https://company.example/apply/123",
  "captured_at": "2026-10-14T12:00:00Z",
  "content_hash": "sha256-value",
  "text": "Original description and observed links",
  "fields": { "title": "Software Engineering Intern", "deadline": null },
  "field_provenance": [
    {
      "field": "title",
      "kind": "structured_field",
      "json_pointer": "/title",
      "payload_hash": "sha256-value"
    }
  ]
}
```

The example is a hypothetical fixture, not a real provider schema. Map each adapter's actual immutable payload and validate pointers/values. Text facts use literal quotes with offsets/source version; resume facts add page position. Do not serialize model output and pretend it was original evidence.

Record server receipt/fetch time separately from a client-provided capture time. A submitted timestamp is provenance, not proof that an opening was recently checked; it cannot refresh trust or availability by itself.

Map genuine structured company/title/location/application fields without another extraction call. Requirements inside descriptions still need grounded parsing. Provider-inferred education, technologies and other enriched fields cannot become hard requirements without source evidence. Missing deadline, stipend or requirement remains null/NOT_STATED.

### 5.2 Dedupe and changed facts

Prefer provider stable IDs and verified canonical apply URLs. Strip only known tracking parameters; retain semantic IDs, signed parameters and original links. Company/title/location is a possible match, not sufficient proof to merge two openings.

Separate stable identity from material-content hash. Unchanged content reuses validated extraction and adds provenance. A deadline/requirement/location change creates a revision, invalidates affected approvals/rules/plan permissions and reevaluates owned projections. Stable calendar/action identities prevent duplicate effects after updates.

Use atomic registration and database uniqueness for concurrent arrivals. Extraction caches for private intake remain owner-scoped. Do not leak another user's submissions through dedupe responses.

### 5.3 Queues and shared quota

Use `queued`, `claimed`, `completed`, `deferred`, `failed` and `uncertain` states, with fencing token, lease expiry and expected revisions. Expired leases permit a safe continuation, not a blind repeat of a charged request or email. Record attempted and uncertain effects separately from success.

Reserve provider costs before calls. Timeouts, detail calls, pagination and retries count conservatively; refund only when demonstrably uncharged. Transient failures use bounded exponential backoff/jitter. Credentials/permission failures require repair. One failed source does not stop another. Source disable preserves old provenance.

JSearch's reviewed free allowance is 200 monthly requests. Proposed ordinary schedule: at most five requests daily, 24-hour query cache and 30 reserved requests per provider period. In a 31-day period this uses 155 ordinary plus 30 reserved requests, leaving 15 for other accounted needs. Actual account limits/period and request costs control the allocator; the reserve is not extra quota.

Preserve the current conservative Gemini boundary: 350 reserved SDK attempts per Pacific day, seven reserved attempts per model start and at least 60 seconds between starts. At most 50 combined starts fit, or roughly 25 fresh extraction/matching pairs before resume work. Actual provider quota may be lower. This is a small-pilot capacity, not a claim that many students can all receive fresh analysis instantly.

Resume jobs join the same global ledger; do not create a new allowance per feature. Use deterministic parsing, public extraction reuse, matching cache and fair user scheduling. Resume processing receives a bounded share so onboarding and background discovery do not starve each other. Queue deferrals are visible and do not produce invented evaluations.

Store UTC; show Asia/Kolkata initially. Calculate Pacific daily resets with daylight saving. A fresh AI submission may wait; existing pages never require a fresh model call. Keep the website useful during quota exhaustion.

### 5.4 Bridge and state contracts

Authenticated operations validate Origin, session, ownership, size, schema and stable request UUID. Preserve the existing `/api/intake` boundary; no wildcard CORS or permanent tokens in capture code. Worker endpoints accept typed arguments, not arbitrary SQL, unvalidated URLs or ownership claims.

Suggested future operations: upload-init/finalize; confirm-profile-draft with expected revision; subscribe-to-approved-source; activate-rule with explicit confirmation; generate/confirm-weekly-plan. Worker functions independently check role, owner, current facts and allowed actions. Do not grant worker-only functions to browser roles to bypass the server bridge.

Document draft states are uploaded/validating/extracting/draft_ready/confirmed, plus unsupported/failed/expired/deleted. Unconfirmed values cannot affect matching. Rule edits require a newly approved version. Plans become stale when their referenced facts, profile, availability or rule permission changes.

Return distinguishable errors: unauthorized, invalid input, unsupported file/source, revision conflict, quota deferred and temporary failure. An uncertain save returns/checks the same request reference before retry. Never label a deferred or failed job completed.

## 6. Phase 0 Verify the baseline and source feasibility

**Objective:** establish a healthy starting point and choose the smallest useful source set.

1. Recheck website authentication, profile save, intake, extraction, decisions, Wait confirmation, forwarding, heartbeat and recovery. Confirm persistent n8n storage and stable encryption configuration across restart. Compare current generated/exported/published workflows.
2. Run existing contract tests and relevant reversible SQL checks in isolated accounts. Record actual results rather than copying prior acceptance. New real emails/calendar effects require their own authorized test scope; historic message/event limits are not a reusable allowance.
3. Create `docs/source-feasibility.md`: endpoint/account transport, region, sample schema, permission/terms/attribution, retention constraints, result quality, costs, test date and failure reason.
4. Test JSearch with Bengaluru software intern, SDE intern India, frontend intern India and data-science intern India queries. Use one hackathon query only to measure coverage. Charge every probe to the provider ledger. Inspect recency, descriptions, live links, duplicates and actual date semantics.
5. Probe candidate company feeds sufficiently to choose one adapter from Lever/Greenhouse/Ashby; do not implement all three. Choose one permitted hackathon/program feed or public parser. A URL pattern is not a tested source. Do not build adapters for unsuccessful candidates.

**Files:** baseline checks/progress, source feasibility register and adapter fixtures. No production schema deployment is necessary just to document feasibility.

**Gate:** core baseline passes, source choices have evidence, failed candidates stay disabled with reasons. If JSearch quality is poor, use the best validated company feed as scheduled discovery and keep JSearch minor/disabled. If none works, scheduled discovery remains an open gate; email/capture are still usable but cannot be presented as autonomous discovery.

Unavailable provider credentials may leave a source awaiting validation without blocking the independent resume/eligibility phase once the core baseline passes. Do not enable that source until its Phase 3 acceptance succeeds.

## 7. Phase 1 Resume onboarding and precise eligibility

**Objective:** a student uploads a text PDF, confirms a populated draft, and resolves shared missing-profile questions once.

### 7.1 Resume path

1. Add authenticated private upload-init/finalize. Proposed initial limits: PDF only, 5 MiB, ten pages, bounded decompression/text length and parser time. Validate signature as well as MIME; reject scanned, encrypted, malformed and oversized files. Do not run embedded JavaScript or resolve external links/resources.
2. Store under an owner-specific private Storage path. Finalize verifies actual object ownership, size and content. Log upload/job IDs and statuses, not signed URLs or document bodies. Use a narrow server PDF-text tool and the existing n8n orchestration boundary; adding a parser dependency needs the existing dependency review.
3. Reserve shared AI capacity and extract a fixed draft schema. Proposed fields: display name, explicitly stated degree/branch/year/graduation year/CGPA with scale, and skill names. Keep contact details out of matching prompts; do not overwrite Supabase account identity from a resume email.
4. Show each proposed value, quote/page evidence, conflicts and missing fields. Confirm existing skill levels or ask the student to set a level for newly selected skills. Do not infer proficiency, current academic year, residence, experience or career goals from weak clues.
5. Student can confirm, edit, deselect or deliberately replace an existing value. Apply selected fields atomically with an expected profile revision. Preserve confirmed values by default. An outdated draft returns a conflict; autonomy and notification settings never change from resume content.
6. Queue a bounded owned reevaluation batch. Reuse unaffected matching evidence. Record resolved questions without duplicating existing tasks, emails or calendar entries.

Automatic profile creation means automatic draft population followed by confirmation. Proposed retention: delete raw PDF/text after confirmation or seven days, and expired drafts after 30 days; offer immediate deletion. Settle retention before rollout and remove retained private quotes when deleting their content.

```json
{
  "contract_version": "profile-draft-v1",
  "base_profile_revision": 4,
  "fields": [
    {
      "field": "degree",
      "value": "B.Tech",
      "state": "proposed",
      "evidence": { "page": 1, "quote": "B.Tech in Computer Engineering" }
    }
  ],
  "skills": [{ "name": "Python", "level": null, "state": "needs_confirmation" }],
  "missing_fields": ["cgpa", "academic_year"]
}
```

### 7.2 Eligibility path

Add a typed, versioned constraint parser and three-valued evaluator. Explicit degree/year alternatives and ranges become constraints with literal evidence. Preserve AND/OR meaning; a degree named Computer Science and Engineering is not two mandatory degree requirements. Preferred skills/locations do not become hard gates.

AND passes only if all mandatory children pass, fails if any fails, otherwise UNKNOWN. OR passes if a supported alternative passes, fails only if all fail, otherwise UNKNOWN. Contradictory source statements are a conflict hold, not an opportunistic OR. Vague equivalents, mandatory facts not represented by confirmed profile fields, unclear scales and unsupported clauses remain UNKNOWN.

A clarification contains owner, affected constraint IDs, profile field, requirement quote, typed answer options and affected owned opportunities. Group by missing fact, not one question per card. One confirmed correction reevaluates all affected items for that student. Source contradictions need source clarification; profile edits cannot repair them by assertion.

Preserve score weights 40/20/15/10/10/5, mode thresholds 80/.85, 70/.75, 60/.65, and existing strict missing-deadline behavior. Confidence and parser changes are versioned and frozen against fixtures. Missing resume evidence of a skill does not prove incompetence.

**Files:** proposed resume/draft/clarification migrations, profile review route/UI, PDF extraction bridge, resume and eligibility contracts/tests, Understand/Decide generators and policy documentation.

**Gate:** evidence-backed draft, confirmation/overwrite conflict, missing fields, user-set skill level, private deletion, cross-user denial, degree/year alternatives and grouped reevaluation pass. A malicious PDF cannot alter policy, credentials or another profile. No existing action duplicates. DOCX and OCR remain out of scope.

## 8. Phase 2 Basic source checks and action gates

**Objective:** distinguish supported facts, attribution, uncertainty and stale/risky items without promising automatic fraud detection.

### 8.1 Minimal trust implementation

Track collection method/source version, publisher attribution, corroboration, last successful check/availability and concrete risk signals. User labels: corroborated, unverified, suspicious signals, stale/unavailable. Extraction confidence and source trust are separate.

Extend forwarding metadata only from the trusted receiving connector. A body saying "From: company" or an arbitrary Authentication-Results header does not prove identity. Forwarding can lose original authentication; preserve unknown. An aggregator publisher name, logo, HTTPS or bookmark click is also insufficient.

Corroboration comes from a recorded matching listing in an approved official feed/page, or a separately approved verification method. Start with explicit domain/organization mappings and cached approved-source evidence. Do not fetch every apply link on every view, especially restricted sites. An unfamiliar campus notice is unverified, not automatically fraudulent.

Initial deterministic risk flags cover clearly stated payments/credential requests, identity/domain conflicts and unavailable listings, each with quoted evidence. A normal third-party application domain is not automatically suspicious; use configured known relationships and show ambiguity. Advanced lookalike/reputation scoring and AI scam classification are deferred.

Use a configurable source freshness policy. Proposed initial daily-scan default: corroborated availability becomes stale after 48 hours without a successful check. First gate review must confirm it per source. A failed check alone does not prove closure. Suspected closure requires explicit evidence or repeated complete-scan confirmation.

### 8.2 Effective action policy

| Condition | Result |
| --- | --- |
| INELIGIBLE or explicitly expired | IGNORE; no automatic actions |
| UNKNOWN mandatory eligibility | ASK precise questions; approval cannot bypass unresolved facts |
| Eligible but unverified | Review hold; preserve the item, block automatic effects |
| Suspicious signals or stale/unavailable | Needs attention; block automatic effects and explain evidence |
| Eligible, current, corroborated and thresholds/rule permit | ACT only for allowed action types |
| Explicit review of eligible unverified item | May approve named low-risk internal tracking; does not establish source legitimacy |

Persist baseline decision, trust hold, effective disposition and action allowlist. Recheck ownership, current facts, trust/rule version and expiry at action claim. Update Code nodes and SQL queue/claim/approval guards together. Revoked trust invalidates unexecuted permission; do not delete history or undo completed effects silently.

Do not flood the student with one "unknown source" question per discovery. Group source holds in a review section; ask profile questions only when the student can provide the missing fact. Display source uncertainty separately from skill-fit scoring.

### 8.3 Pending missing-deadline policy

The source brief proposed permitting internal tracker/notification actions for a corroborated live internship/job with no stated deadline, while fixed-date hackathons/scholarships remain ASK. It has not been activated by this scope approval. Keep strict `decision-v1` enabled and any replacement flag off.

Before enabling a replacement: owner approves exact action allowlist/freshness/expiry/confidence handling; update reason codes, policy documentation, Code nodes, `worker_action_allowed`, queue/claim, approval expiry and calendar guards; pass old and new fixtures. A missing posted requirement is NOT_STATED, while a missing student fact for a stated mandatory requirement remains UNKNOWN. A shallow description cannot establish comprehensive eligibility.

**Files:** source/trust contract and provenance migration, forwarding metadata, Decide/Act/Ask generators and database permission tests; basic source badges/review UI.

**Gate:** spoofed message, legitimate unverified notice, official matched opening, payment signal, stale revision and injection produce reasoned outcomes. No unverified fact triggers automatic effects. Review clicks and standing rules cannot bypass UNKNOWN/INELIGIBLE. Pending policy flag stays off without explicit approval.

## 9. Phase 3 Three intake routes and limited discovery

**Objective:** opportunities enter the same inbox through scheduled discovery, guided forwarding and deliberate bookmark capture.

### 9.1 Initial source set

| Route | First release selection |
| --- | --- |
| Search | JSearch if real India results and account terms pass; otherwise validated company feed is the primary pull source |
| Company feed | One adapter chosen from Lever, Greenhouse or Ashby; proposed initial cap five verified company boards |
| Hackathons/programs | One validated feed or permitted public listing adapter selected through feasibility testing |
| Portal alerts | LinkedIn, Unstop, Internshala and campus notices through Gmail/Outlook forwarding |
| Deliberate intake | Bookmarklet, existing paste and permitted public URL reading |

Adding another company to the selected adapter is configuration. Adding a platform is new tested adapter code. Registry rows cannot contain executable code or grant arbitrary fetch/credential access. Adzuna, Jooble, extra remote boards, all-company coverage and generic web crawling are deferred.

### 9.2 Discovery workflow

1. Add private registry/catalog/run tables and owned subscriptions. Backfill existing presets as awaiting validation unless current permission/test evidence exists. An older enabled Unstop setting cannot activate forbidden fetching.
2. Write pure adapters with schema fixtures and structured provenance. Pin the actual JSearch account transport/auth/pagination; the reviewed OpenWeb Ninja example uses search-v2, while older examples use different hosts/headers. Verify rather than mixing snippets.
3. Build n8n Discovery: schedule → claim due approved query/source → reserve cost → fetch → validate/normalize → dedupe → save catalog version → project to owner queue → log counts/error → next scan. Default scheduled sources daily; no per-inbox-refresh search.
4. Pool role/region queries and cache for 24 hours. Search requests contain no student names, emails, CGPA or resume text. Fairly rotate pooled queries within the remaining provider period; do not create five daily searches per user.
5. Bound each run. Proposed defaults: one search page per request, at most 100 normalized records and ten new candidates queued per dispatch, with durable cursors for remaining items. Existing source/evidence size limits still apply. Do not silently discard excess results.
6. Prefilter clear non-roles/expired items before AI. Unknown locations remain potentially relevant. Global catalog filtering cannot use one student's preference to erase openings for other students. Direct-map structured facts; grounded body requirements and matching use their normal queues.
7. Version changed deadlines/requirements and reevaluate affected users. A listing missing from a partial page is not closed. Record source health, last successful scan, next attempt, counts and errors. States: active, paused, failed, unsupported, awaiting validation.

Use existing public URL protections: public-address validation, DNS pinning, checked redirects, robots/permission review, time/body/decompression limits. JSON/RSS adapters need equivalent protections; RSS rejects external entities. Do not follow provider-supplied links through a privileged unrestricted fetch.

### 9.3 Guided forwarding setup

Reuse the actual 32-hex-token personal alias. Show copy/reset instructions and steps for alert creation. Where a portal cannot choose an arbitrary recipient, guide the student to forward its alerts from their current Gmail/Outlook account. No direct account password handling.

Mark setup verified after an attributable alert arrives at the correct alias. A generic message does not establish a connected LinkedIn account. Preserve message replay protections, recipient routing and private provenance. Shallow alerts keep missing facts; do not fetch restricted details to invent completeness.

Under the current strict policy, many job alerts without deadlines will remain ASK and unscheduled. They can still be discovered, inspected and manually tracked. Show grouped source/deadline uncertainty rather than repetitive questions; limited automatic handling requires the separately approved Phase 2 policy replacement.

### 9.4 Save to OpportunityOS

1. Provide bookmark installation. Capture selected announcement text or bounded visible main content, page URL/time and actual associated anchor targets. Omit forms, passwords, cookies, storage, hidden input values and unrelated private content.
2. Show preview with trim/cancel. Keep links adjacent to the announcement they belong to. Saving is user intake and does not establish source legitimacy or authorize ongoing crawling.
3. Open first-party `/capture` and use a tested popup/message handshake. A short-lived single-use nonce binds the expected opener, first-party session and request UUID. Use exact app origin, validate sender/source and payload, and never send a session token to the source page.
4. If sign-in is required, keep the payload ephemeral or explain that capture must be repeated. Do not embed content/secrets in URL parameters/history. Confirm on the authenticated first-party page, then submit through the existing same-origin intake route.
5. Save private provenance and idempotent request reference; normal extraction/trust checks follow. No permanent JWT, service key or reusable token is placed in the bookmarklet. Do not weaken Origin/CORS, CSP or COOP protections.

Test popup blockers, CSP, opener loss and browser variants. Provide manual paste when capture is blocked. The advertised capability is save-with-preview on supported pages, not universal browser access. No extension is required.

**Files:** source/discovery/capture contracts and tests, registry/catalog/subscription migrations, Discovery generator/export, source setup and capture UI, existing Ingest/Understand integration.

**Gate 3A:** one functioning approved scheduled pull source, verified forwarding and a previewed authenticated capture produce owned cards. Concurrent duplicate/429/quota/private-content tests pass. If JSearch fails, record the tested fallback; do not claim JSearch coverage.

**Gate 3B:** the selected company adapter and one hackathon/program source pass real evidence tests before enabling their rows. Unsupported candidates are documented and disabled; no extra provider is required to complete this checkpoint. A changed listing invalidates stale approvals without duplicate actions.

## 10. Phase 4 Approved standing rules and ledger

**Objective:** repeated explicit decisions reduce future questions through inspectable, revocable permission.

1. Record immutable explicit choices with reasons and current opportunity versions. After three consecutive consistent explicit decisions in the same source/type scope, propose a typed rule. Exclude automatic outcomes and demo fixtures from real learning statistics.
2. Rule fields include scope, conditions, effect, allowed action types, expiry/version, supporting decision IDs and enabled state. Server attaches owner/approval time. Model-generated arbitrary code/prompt text is never executable rule logic.
3. Student reviews, edits, approves, rejects, disables or deletes proposals. Edits need approval of the new version. Start with pin/deprioritize/ignore; scoped preauthorization may resolve score/confidence-based ASK under clearly displayed minimums and named actions.
4. Proposed initial preauthorization floor is existing Autopilot score 60/confidence .65, subject to policy-bound review before activation. Global mode remains unchanged; the UI explains the scoped exception. Rules never bypass UNKNOWN/INELIGIBLE, expiry, trust holds, score-under-40 filtering or blocked action types.
5. Decide Code applies the rule after immutable guards. Persist baseline/effective decisions, rule/version and reason. Act checks them again. Revocation invalidates pending permissions; completed action history stays intact.
6. Ledger shows rule use, questions avoided and overrides. Count questions avoided only when an eligible baseline ASK was resolved by an active approved rule. Show relevant-opportunity denominator and label simulated data. Fewer displayed questions alone is not proof of better decisions.

**Files:** rule/proposal/application records and RLS, rule contract/tests, Rule Proposal workflow, Decide/Act fencing changes, settings/ledger UI.

**Gate:** three consistent choices create a proposal; disagreement does not. Rule activation, scope conflicts, edit/revoke, replay and cross-user attempts pass. Active rules cannot act on unknown, ineligible, stale or unverified items. Ledger counts are reproducible from records.

## 11. Phase 5 Deterministic weekly planner

**Objective:** propose a manageable week from confirmed facts and manual availability without another AI call.

### 11.1 Inputs and algorithm

Collect working windows, exam/busy blocks, weekly effort budget and optional priority choices. Preparation durations are editable estimates, initially entered/confirmed by the student. Do not invent source-confirmed hours. Use the same timezone for deadline comparison and availability conversion.

Eligible/current/trust-permitted owned opportunities form the candidate set. Missing or same-day ambiguous cutoff times do not become invented deadlines. Uncertain items appear unscheduled with reasons. Rank by earliest confirmed deadline, then match score and stable ID; honor explicit user priority overrides with recorded reasons.

Place confirmed tasks into allowed windows before their deadline, respecting busy intervals and weekly capacity. Proposed granularity: 30-minute blocks. Do not exceed the user's effort budget or split a task unless permitted. Unplaced work stays unscheduled with explanation; do not pretend the algorithm solved an impossible week.

Distinguish same-day deadline pressure from actual time overlap. Highlight both accurately. Add a Weekly Plan n8n workflow using the shared planner contract and deterministic Code nodes. No AI Agent or external calendar-reading tools in the first release.

### 11.2 Review and confirmation

Store profile, opportunity, availability and rule revisions with the draft. Student can edit estimates/priority, regenerate, confirm or discard. Changes invalidate the old draft. Confirming twice uses the same plan/item action identity and cannot duplicate tasks.

Queue only existing permitted internal task/calendar-link actions. A demo event write still passes the Act boundary and existing account permission. Do not reschedule committed work or submit applications automatically. Ordinary users use links/ICS; manual availability is not represented as a live calendar sync.

```json
{
  "contract_version": "weekly-plan-v1",
  "algorithm_version": "deadline-capacity-v1",
  "profile_revision": 5,
  "availability_revision": 2,
  "items": [
    {
      "opportunity_id": "owned-opportunity-id",
      "opportunity_revision": 3,
      "duration_minutes": 30,
      "duration_kind": "user_confirmed_estimate",
      "start_at": "2026-10-19T12:30:00Z",
      "reason_codes": ["EARLIEST_CONFIRMED_DEADLINE"]
    }
  ],
  "unscheduled": []
}
```

Example IDs/date are fixtures, not live scheduling authority. Validate current owned facts, permitted actions and capacity before accepting a plan.

**Files:** availability/plan records with revisions/RLS, planner contract/tests, Weekly Plan generator/export, Plan screen and fenced confirmation helper.

**Gate:** no availability, exams, overcapacity, same-day pressure, actual overlap, estimate edits, timezone conversion, stale facts and forged owner IDs pass. Output is deterministic under the same inputs. No model request is made; repeated confirmation creates no duplicate task/event.

## 12. Phase 6 Product experience and dependable release

**Objective:** a coherent, responsive workspace with controlled notifications and tested recovery.

### 12.1 UI structure

Four primary destinations: Home, Opportunities, Applications and Plan. Settings contain profile/resume, sources, rules and notifications. Activity and detailed autonomy history stay accessible from details/settings without dominating the main navigation. Preserve existing working routes with redirects or links during reorganization.

Home shows grouped questions/reviews, strongest current matches, confirmed upcoming deadlines and this week's priorities. One next-action suggestion comes from code. Opportunities is a unified searchable inbox, not one dashboard per provider. Details reveal source evidence, eligibility, score breakdown and action history on demand.

Cards show title/company, type/location, deadline or Not stated, understandable disposition and one next step. ACT/ASK/IGNORE remain visible in details and on the demo canvas; plain-language labels explain them in everyday use. Source logos are attribution, not trust badges. Every screen has responsive loading, empty, delayed and error states, keyboard access and labelled controls.

Implement owner-scoped indexed search/filtering by type/source/location/deadline/eligibility/decision/trust/application status. Unknown deadline has an explicit filter. Stable pagination defaults to 20 records per page; cap requests at 50. Never fetch the entire catalog or all users' matches into the browser.

### 12.2 Digest and notifications

Add daily digest time/channel preferences and snooze, initially in Asia/Kolkata. Group routine discoveries, fact changes and related questions; avoid one email per routine card. Deliver through the agent mailbox only under user settings. Keep activity visible even when email is off.

Digest idempotency uses owner/period/version; claims recheck opt-out, snooze and current permission. Mark delivered only after provider acceptance. Uncertain SMTP results remain uncertain without blind resend. Source failures appear in-app and follow explicit error-notification preferences. Do not infer application status from an alert; existing student confirmation remains authoritative.

### 12.3 Responsiveness targets and measurement

These are proposed acceptance targets, not measured current performance. Record test device, network, data size, build and worker state. Measure the UI separately from provider/AI latency.

| Operation | Target under the documented healthy test setup |
| --- | --- |
| Saved inbox/search first page | p95 under 2 seconds for 500 seeded owned cards |
| Healthy durable intake acknowledgement | p95 under 3 seconds; confirms save/queue, never waits for AI |
| Existing-card open or UI filter | No fresh model/provider call; responsive persisted-data read |
| List reads | Default 20 rows, maximum 50; bounded selected fields and payload |
| Multi-submission test | Twenty near-simultaneous submissions across two isolated users are tracked without lost saves or duplicate effects |

The current intake bridge has a 20-second timeout. Preserve its honest uncertain-save behavior until changes demonstrably improve acknowledgement. A performance target does not authorize returning success before persistence or silently dropping work. Submit test bursts through product routes with provider stubs/shared quota boundaries, then verify one bounded live path; do not spend twenty fresh real model runs merely to measure UI speed.

AI turnaround depends on queue depth, global quota, provider latency and retries. Show Waiting for analysis, Processing, Needs input, Deferred by quota or Failed. Never promise a fixed completion time without measurements. Background jobs must not block cached reads or plan generation. Prefer narrow queries, indexes, debounced search, cache invalidation and pagination before introducing new infrastructure.

### 12.4 Deployment and recovery

Choose public website and worker hosting only after verifying current free terms, persistent storage and consent boundaries. A sleeping free worker is not always-on discovery. If no dependable $0 runtime exists, release with disclosed controlled-demo operation rather than claim continuous monitoring.

Use fixed HTTPS origins, narrow authenticated worker ingress, synchronized Supabase redirects and existing gateway restrictions. Do not expose n8n editor, worker-only functions or secrets. Keep n8n storage/encryption stable; export workflows and maintain secure data/credential backups.

Test restart mid-job, stale leases, source/provider outage, quota exhaustion, clean migration application, restore and fresh account signup/confirmation. Reconcile uncertain calendar/email effects before retry. Operator documentation covers pause, credential reauthorization, fenced retry, restore and feature-flag rollback. Health reports last successful scan/queue age/worker heartbeat with redacted diagnostics.

**Files:** dashboard/navigation/search indexes, preferences/Digest workflow, deployment/recovery runbook, performance fixtures and evidence; extend existing auth/action recovery tests.

**Gate 6A:** four-screen experience, composed filters, grouped questions, responsive states, digest/snooze/opt-out and owner boundaries pass. No navigation to unfinished features.

**Gate 6B:** measured responsiveness and burst test pass, new two-user onboarding works, restart/restore preserve state without duplicate effects, live source/rule/plan paths are verified and public runtime limitations are disclosed. Do not claim permanent failure-free operation.

## 13. Validation and rollout protocol

### 13.1 Required cases

| Area | Cases to pass |
| --- | --- |
| Original guide | Strong eligible match ACT; no-deadline hackathon ASK; CGPA failure/expired opportunity IGNORE; junk stops; duplicate avoids AI; injection does not control policy; cross-user denial; retry idempotency; rules respect hard gates |
| Resume/profile | Literal page evidence, missing/conflicting fields, unconfirmed skill level, CGPA scale, scanned/encrypted/oversized rejection, deletion, overwrite conflict, grouped reevaluation |
| Eligibility | AND/OR alternatives, degree name containing and, required/preferred skills, vague clause, contradiction, mandatory missing fact, location preference versus residence |
| Trust | Spoofed sender/header/body, legitimate unverified notice, official corroboration, benign third-party apply domain, payment signal, freshness expiry, trust revoked before action |
| Discovery/capture | India quality, chosen adapter/feed, schema drift, concurrent dedupe, partial-page absence, material update, unsafe URL/XML, popup/CSP fallback, forged nonce/replay, private capture isolation |
| Rules | Three consistent explicit decisions, disagreement, inactive rule, scope conflict, edit/revoke, cross-user attempt, reproducible ledger |
| Planner | Exams/no availability/overcapacity, same-day pressure versus overlap, estimate change, stable ordering, stale version, timezone, no AI calls, repeated confirmation |
| Product/delivery | Composed filters/pagination, 500-card reads, twenty-submission burst, deferred status, opt-out/snooze/digest race, SMTP uncertainty and calendar reconciliation |
| Recovery | Restart mid-claim, restore, fresh signup, invalid AI, provider/quota outage, fair scheduling, no false success, no secret leakage |

Run Node contract tests (`node --test scripts/*.test.mjs`), website type checking/lint/build from `web`, affected reversible SQL suites and workflow generator/export parity. Inspect available scripts before assuming extra commands exist. Live checks must use explicit authorized external-effect scope and distinguish fixtures from real integrations.

### 13.2 Migration and feature rollout

Add only records needed for the current phase. Suggested order is resume/clarification, trust/action permissions, catalog/discovery, rules, planning, then read indexes/digest. This is not a fixed sequence number; allocate after inspecting existing migrations. Each migration preserves human data, checks backfill before constraints and includes owner/worker access tests.

Enable new discovery projections in shadow mode before notifications. Use separate default-off flags for new routes/rules/plans and the pending missing-deadline policy. Disabling a feature keeps the existing prototype usable and preserves history. Queue grants, private approval bindings and score formulas must not be silently loosened to pass a demo.

For each accepted gate, record commit, workflow version, actual source/provider, timestamp, expected/actual result, quota cost, fixture/live distinction, cleanup and remaining limits. Keep screenshots and logs private/redacted where they contain student material. Export portable workflows without credentials.

## 14. Expansion backlog and return conditions

| Deferred feature | Build only when |
| --- | --- |
| DOCX resumes | Text-PDF confirmation/deletion path is stable and users need DOCX; review secure parser/decompression behavior |
| Announcement PDF intake | Resume upload infrastructure is accepted; preserve page evidence and chunking for 20,000-character/five-opportunity limits; no silent truncation |
| More company adapters/aggregators | Existing routes measurably miss useful openings; source terms, quality, maintenance and quota fit are validated |
| More hackathon/government/RSS sources | The first source is reliable and the new one adds relevant coverage |
| Calendar availability OAuth | Users need live availability; approve minimal consent, ownership, disconnect and deletion separately |
| AI planning agent | Deterministic planner has measured limitations; add bounded read-only tools, validate output and use the shared AI budget |
| Skill gaps/preparation | Users have enough relevant owned opportunities; label feed sample size and distinguish missing profile evidence from actual gaps |
| ATS-style review | Core outcomes are accepted and users need it; never claim a real ATS/hiring score |
| Advanced risk analysis/OCR | A demonstrated need, validated accuracy/parser behavior and a free feasible dependency justify it |

The eventual read-only planner tools may inspect owned opportunities, manual/consented availability, approved rules and feed gaps. They cannot send messages, resume approvals, write profiles/calendars or submit applications. No expansion changes immutable eligibility or action safeguards.

This backlog preserves the original ambitions while keeping the first release's maintenance, AI load and navigation bounded. Expansions each receive a new small guide section, test gate and activation decision; they are not bundled into one large upgrade.

## 15. AI implementation handoff and decisions

Use this prompt with the repository and current progress log. Fill one phase/objective for each session.

```text
Implement OpportunityOS Phase <N>, objective <one working capability>.
Read the version 2 focused guide, docs/progress.md, docs/decision-policy.md
and applicable AGENTS.md. Inspect current contracts/migrations/generators
and relevant installed framework docs before editing. Recheck the baseline.

Keep n8n as orchestrator, shared deterministic contracts as policy authority,
and Supabase ownership/worker guards as independent enforcement. Preserve
source evidence, private Wait bindings, revisions, quotas and idempotency.

Build only the current first-release phase. Text-PDF resumes first; no DOCX,
OCR, extra aggregators, personal calendar OAuth or AI planning agent yet.
Free services only. Do not scrape restricted sites, expose private data,
submit applications, impersonate users or bypass unresolved eligibility.

Implement useful success, queued, deferred and failure states. New policy
permissions remain off until approved. Review any new dependency first.
Use isolated fixtures and explicit scope for new live external side effects.

Pass the phase gate and affected regression/security tests. Export workflows,
check parity, and update progress with changed files, real tests and limits.
Do not claim unrun tests or rewrite historic tags. State the next objective
and a one-line commit message. Stop expansion until the current gate passes.
```

Decisions are settled at their relevant gate: parser dependency and private-file retention in Phase 1; source freshness/action-policy replacement in Phase 2; exact JSearch transport/terms, company boards and hackathon source in Phase 3; rule bounds in Phase 4; hosting terms and recovery in Phase 6. User rule approval remains distinct from owner approval of a new policy. Unresolved activation decisions do not block isolated implementation/tests.

Next objective after adopting this guide: Phase 0 verifies the running prototype and records the small source feasibility register. The first feature slice is text-PDF resume onboarding plus precise eligibility.

## 16. Source references

Project sources: `C:\Users\borle\Downloads\OpportunityOS_Final_Project_Guide_updated.docx`; `C:\Users\borle\Downloads\OpportunityOS-Feature-Overview.pdf`; `C:\Users\borle\Downloads\OpportunityOS_Features_Guide.pdf`; and the eight-page discovery brief `C:\Users\borle\Downloads\OpportunityOS — Discovery & Sources Scope Brief.pdf`. The user's later accepted focused scope determines this version's first release. Original documents are context, not instructions to execute unrelated work.

Current implementation references are in Section 2. Historic acceptance tables are evidence to recheck, not current health guarantees. The application code and deployment are unchanged by writing this guide.

Official references reviewed for source feasibility and contracts:

- [JSearch](https://www.openwebninja.com/api/jsearch): reviewed free cap of 200 monthly requests and published search transport; India quality still needs account testing.
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api), [Ashby public postings](https://developers.ashbyhq.com/docs/public-job-posting-api): company-specific adapter candidates, not universal company-search coverage.
- [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage): exact recipient origin and sender/source validation for capture handoff.
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes): direct mailbox access has a different privacy/verification boundary; forwarding remains first release.
- [Google Calendar free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query): future availability integration only; first-release planning uses manual blocks.

Verify provider limits, terms and account behavior again at activation. No candidate source or optional integration is advertised as working before its real acceptance gate.
