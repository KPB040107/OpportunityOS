# OpportunityOS UI redesign: "The Sorting Board"

This is the design handoff for the OpportunityOS web app (`web/`, Next.js App Router + Tailwind v4 + Supabase).

**Goal:** restyle the existing app to match these designs.

**Rules for the restyle:**
- Keep all existing data fetching (Supabase queries, RPCs, server actions, API routes) and business logic.
- Change only the presentation, plus the small onboarding-flow additions listed below.
- All names, companies, numbers and dates in the designs are mock data. Replace them with the real query results already on each page.

## What's in this folder

| Path | What it is |
|---|---|
| `designs/*.dc.html` | One file per screen. Plain HTML with inline styles; it is the source of truth for layout, spacing, copy and colour. The `{{holes}}`, `<sc-for>` (loop), `<sc-if>` (conditional) and `<dc-import>` (child component) tags come from the design tool's template syntax. Read them as React: `sc-for` → `.map()`, `sc-if` → `&&`, `dc-import name="Nav"` → `<Navigation />`. The `<script data-dc-script>` block at the bottom of each file holds the mock data and the UI state logic (filters, toggles). |
| `tokens/globals.css` | Drop-in replacement for `web/src/app/globals.css`, with every colour, font and shadow as Tailwind v4 theme tokens. |
| `README.md` | This file. |

## Visual system

- **Look:** off-white paper, black ink outlines (1.5px), hard offset shadows (no blur), one signal orange. Bold grotesque headlines, monospace kickers and labels in UPPERCASE with letter-spacing. No gradients, no soft drop shadows, no emoji.
- **Fonts (Google Fonts, load with `next/font/google`):**
  - Bricolage Grotesque 500/700/800: headings, big numbers.
  - Instrument Sans 400/500/600: body and UI.
  - JetBrains Mono 400/500: kickers, tags, dates, labels.
- **Colours:**

  | Token | Hex | Use |
  |---|---|---|
  | paper | #F3F1EC | page background |
  | surface | #FFFFFF | cards, inputs |
  | ink | #111111 | text, all borders, hard shadows |
  | ink-2 | #3D3A35 | secondary text |
  | muted | #5F5B54 | labels, meta text |
  | line | #DAD6CE | hairline dividers |
  | accent | #FF5A1F | primary buttons, hero cards, progress, toggles on (text on it is ink, not white) |
  | accent-text | #C23E0C | orange text: kickers, links |
  | act | bg #FFE3D6, text #C23E0C | ACT decision |
  | ask | bg #E1E8FF, text #2445C8 | ASK decision |
  | skip | bg #ECEAE5, text #5F5B54 | SKIP / IGNORE decision |
  | danger | bg #FDE4E1, text #9F1D12 | "unverified" trust tier, scam warnings |

- **Shapes:**
  - Radius: 8–10px for buttons, 12px for inputs and small cards, 14–16px for large cards.
  - Shadows: `3px 3px 0 #111`, `4px 4px 0 #111`, `6px 6px 0 #111` (hero). Each card or button also gets a 1.5px solid #111 border.
  - Tap targets are at least 44px tall.
- **Decision language in the UI:** ACT / ASK / SKIP. The backend's `IGNORE` is shown as "SKIP".

## Screen → route map

| Design file | Route / file in `web/src` | Notes |
|---|---|---|
| `Main.dc.html` (+ `Scene.dc.html`) | `/login` → `app/login/page.tsx`, `form.tsx` | Scroll story with a sticky stage, then the sign-in / create-account section. Keep the existing `login/actions.ts`. Remove "scholarships / programs" copy (retired categories). |
| `Scene.dc.html` | new `components/sorting-board.tsx` | Client component taking `progress` 0–1. 18 listing chips animate: messy pile → grid (with a scan line) → three lanes Act/Ask/Skip → one hero card. Used on `/login` (progress = scroll position) and the curating screen (progress = timer). |
| `Onboarding-Profile.dc.html` | new `/onboarding/profile` | Reuse the logic in `components/resume-onboarding-card.tsx` and `/api/resume/upload`, `/api/resume/confirm`. The numbered tags tie each extracted field to its evidence quote in the resume. |
| `Onboarding-Alerts.dc.html` | new `/onboarding/alerts` | Toggles map to `email_notifications_enabled` and `calendar_sync_enabled` (browser notifications are new, so leave them as a UI-only toggle or TODO). Autonomy mode cards map to `autonomy_mode` (`cautious` 80/0.85, `balanced` 70/0.75, `autopilot` 60/0.65). |
| `Curating.dc.html` | new `/onboarding/done` | Runs the sorting board on a timer with rotating copy, then "Open my dashboard" → `/home`. |
| `Nav.dc.html` | `components/navigation.tsx` | Workspace: Home, Opportunities, Approvals (pending count badge), Applications, Activity. Setup: Profile & resume, Automation rules, Sources & feeds, Capture tools. The active item is an ink fill with white text. |
| `Home.dc.html` | `/home` | Stat strip (from `get_home_counter`), orange "Your next step" card (existing `nextAction` logic), Waiting on you (approvals + clarifications), Deadlines this week, Strongest matches. |
| `Opportunities.dc.html` | `/opportunities` (+ `?type=`) | Type tabs (All/Internships/Jobs/Hackathons) use the existing `type` param. Decision filter chips. Row layout: score block, details, decision badge plus deadline. **When eligibility is UNKNOWN, show "—" and the missing fact instead of a score.** Trust badge per `trust_tier`. `/inbox` can redirect here. |
| `Opportunity-Detail.dc.html` | `/opportunities/[id]` | Score breakdown bars (weights Skills 40, Career 20, Interests 15, Location 10, Academic 10, Urgency 5), matched vs missing skills, requirements table with the 4-way classification and verbatim quotes, decision panel, "what it did for you", and actions. |
| `Approvals.dc.html` | `/approvals`, `/approvals/[id]` | Questions (clarifications) first, then approval cards, then a "resolved this week" list. Keep `actions.ts`, `clarification-card.tsx`, `resolve-button.tsx` logic. |
| `Applications.dc.html` | `/applications` | Kanban. Real statuses are `saved, to_apply, applied, assessment, interview, offer, rejected`. The design shows 5 columns; use one column per real status, or group assessment with interview and offer/rejected under Closed. Arrow buttons call `updateApplicationStatus`. |
| `Rules.dc.html` | `/rules` | Autonomy cards, a suggested-rule banner (rule proposals), and standing rules with toggles (`rule-card.tsx`). |
| `Profile.dc.html` | `/profile` | Header, skills with BEG/INT/ADV level pickers, "Looking for" chips, eligibility facts (unanswered ones in blue), projects. |
| `Sources.dc.html` | `/sources` | Trust-tier legend plus one row per feed with its count and a toggle (`toggle-button.tsx`, `seed-button.tsx`). |
| `Activity.dc.html` | `/activity` | Filter chips ALL/ACT/ASK/SKIP/READ, day-grouped ledger with the reason under each entry, and Undo where supported. |
| `Capture.dc.html` | `/capture` | Paste-a-link form (orange card, existing `/api/intake`), extension, bookmarklet and email-forwarding cards (`extension-setup-card.tsx`, `bookmarklet-card.tsx`, `portal-setup-card.tsx`), recently captured list. |

`/plan` stays retired (it redirects to `/applications`).

## Suggested order

1. Replace `globals.css` with `tokens/globals.css`, load the three fonts in `app/layout.tsx`, and restyle `components/ui/button|card|input|textarea.tsx` to the ink-border plus hard-shadow style.
2. Navigation and workspace layout.
3. Opportunities and the detail page, then Home, then Approvals and Applications.
4. The remaining setup pages.
5. The login scroll story, `sorting-board.tsx`, and the `/onboarding/*` flow, with a redirect to onboarding when a new user has no confirmed profile.

## Accessibility

Keep:
- real `<button>` and `<a>` elements
- `role="switch"` and `aria-checked` on toggles
- `aria-pressed` on filter chips
- visible focus (`outline: 2px solid #FF5A1F`)
- `prefers-reduced-motion` turning off the story and scan animations
