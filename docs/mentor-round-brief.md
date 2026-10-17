# OpportunityOS mentor round brief — 17 October 2026

Use the original [OpportunityOS_HackSprint.pptx](C:/Users/borle/Downloads/OpportunityOS_HackSprint.pptx). This is an engineering walkthrough, not a claim that every item pictured in the idea deck is live.

## The 90-second explanation

“Students see opportunities across company boards, hackathon sites, email alerts, and web pages. They must repeatedly check eligibility, compare deadlines, and remember follow-ups. OpportunityOS gives each student one profile and turns those sources into a single decision and action pipeline.

The website is built with Next.js and TypeScript. Supabase handles sign-in, ownership-protected data, and the application tracker. n8n is the visible orchestrator: it receives or discovers a source item, extracts and validates facts, evaluates the listing against the student's profile, then branches to ACT, ASK, or IGNORE. AI helps read unstructured announcements; hard eligibility, scoring, and permission rules run in deterministic code. We preserve evidence from the source so a student can see why a decision was made.

For a suitable listing, the system may create a task, track it, notify the student, or add a deadline to the connected demo calendar. When required facts are missing, it asks the student and reevaluates. It never automatically submits an application. We built the complete loop and also show failures and quota limits rather than silently claiming success.”

## Show this in 4–5 minutes

1. **Deck slides 2–3 (45 seconds):** State the problem and point at the architecture. Explain that the arrows represent the product loop, not one giant AI prompt.
2. **Website Home and Opportunities (60 seconds):** Sign in before the mentor arrives. Show the profile and a real/clearly labelled seeded opportunity. Open its detail page and point out original source, extracted requirements, evidence quote, eligibility, score breakdown, and decision.
3. **n8n canvas (75 seconds):** Open 08 Discovery, then 02 Understand and 03 Evaluate. Show source adapters, structured extraction/validation, Code and Switch decision nodes. Mention 04 Act, 05 Ask and Approve, 06 Autopilot, and 07 Error Handler. Avoid running a fresh long AI job during this explanation.
4. **Action and approval (60 seconds):** Show an eligible ACT's task/application/activity. Show an eligible ASK only if its Approve button is enabled. Explain the private Wait resume and revision/expiry checks. If no eligible ASK is ready, explain the flow on the n8n canvas and show a missing-facts item separately; never try to approve UNKNOWN eligibility.
5. **Deck slide 7 (30 seconds):** Say what is working, where the boundaries are, and the next improvement: source coverage and stable deployment. Offer to open the code for any node they question.

## Match the idea deck to reality

| Deck | What to say today |
|---|---|
| Slide 2: Discover → Understand → Evaluate → Decide → Act → Follow-up | This is the implemented architecture and the best story to demonstrate. ACT means permitted low-risk actions, never application submission. |
| Slide 3: “AI Agent” | AI extracts structured facts from text. Eligibility, scoring, confidence thresholds, and action permissions are deterministic code embedded in n8n. |
| Slide 3: Gmail / Outlook / Unstop | Gmail forwarding and deliberate browser capture are supported routes. Outlook alerts can be forwarded; direct Outlook OAuth and direct Unstop scraping are not claimed. |
| Slide 4: Framer Motion, Vercel | These were proposed in the idea deck. Current package uses Next.js 16, React 19, TypeScript, Tailwind and Radix components. The controlled demo is on localhost with Docker n8n and cloud Supabase; do not claim a Vercel production deployment. |
| Slide 5: PDF / URL | Public URL and text ingestion are in the intake path. Resume PDF onboarding is implemented. Do not describe arbitrary announcement-PDF ingestion as proven unless you show a successful live example. The slide's 01–05 labels are conceptual; actual n8n workflow names run 01 Ingest through 10 Resume. |
| Slide 6: Product mockup | This is original illustrative data. Switch to the actual website and label seeded records as seeded. |
| Slide 7: Future scope | Direct LinkedIn, college, and government portal integrations remain future work. Current discovery uses supported public company feeds and Devpost; portal alerts/capture cover sites without public APIs. |

## Technical answers to rehearse

**Why n8n?** It exposes the actual trigger, branch, Wait, retry, and error paths. The website handles user interaction; n8n runs background orchestration. State persists in Supabase rather than relying on a transient canvas execution.

**Why use AI if decisions are code?** AI reads messy announcements and proposes structured facts. We validate the output and source evidence. Code applies hard eligibility, a weighted match score (40 skills, 20 career, 15 interests, 10 location, 10 profile, 5 urgency), confidence thresholds, and permission checks.

**What happens if AI is wrong or quota is exhausted?** Evidence and schema checks can reject an extraction; the raw item is retained with a visible error or deferred state. The system does not turn an uncertain result into ACT. Gemini is the primary extraction model and the workflow contains a Groq fallback; free-tier availability still limits live throughput.

**How do you keep users separate?** Supabase Auth establishes identity; the website derives user identity from the verified session. Row-level security and owner-scoped database functions enforce access, including approvals and actions. A client cannot pick another owner by sending a user ID.

**How do approvals work?** Eligible ASK records bind to a private waiting n8n execution. The logged-in student confirms through the website; database checks owner, revision, eligibility, expiry, and replay. The server bridge resumes that exact waiting execution. Missing eligibility facts require correction and reevaluation first.

**What sources are live?** The discovery workflow contains Lever, Greenhouse, Ashby, Devpost, and a JSearch India path. State which ones have a current successful scan in the Sources screen. LinkedIn, Unstop, and Internshala are handled by user alerts or capture, not direct scraping.

**What can it do automatically?** It can save/track a listing, make tasks, notify, and schedule a verified deadline on the connected demo calendar. It does not apply to employers, send a student's application, invent deadlines, or share their profile.

**What makes it different from an aggregator?** It connects discovery to an evidence-backed decision and an auditable next action; it asks for the minimum missing input and records what it did. The autonomy boundary is explicit and reversible.

## Before the mentor arrives

- Keep the laptop plugged in and network/hotspot ready. Cloud Supabase and AI still need connectivity.
- Open the deck, signed-in website Home/Opportunities/Applications/Approvals, and n8n editor in separate tabs.
- Select one already analyzed ACT, one valid ASK if available, and one source card. Know which records are seeded.
- Confirm `http://localhost:3000/login` and `http://localhost:5678/healthz` respond. A redirect from `/home` in a separate unsigned browser session is expected.
- Do not trigger a fresh AI run as the only demo path. If asked, show it as an optional live experiment after the reliable walkthrough.

This brief is based on the original seven-slide deck, current code at commit `2068d5e`, and the local website/n8n responding on 17 October. It is a speaking guide, not a fresh end-to-end certification of every integration.
