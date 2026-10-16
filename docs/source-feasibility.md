# OpportunityOS — Source Feasibility Register

**Date:** 15 October 2026  
**Author:** OpportunityOS Core Team (@kpb)  
**Standard:** Hackathon Demo Build Guide v3.0 (Slice S0)  

---

## 1. Executive Summary & Source Strategy

To deliver an autonomous discovery experience on stage without violating robots policies or paying for commercial proxy scrapers, OpportunityOS relies on a **three-tier sourcing strategy**:
1. **Public Zero-Auth REST APIs (Autonomous Scheduled Pull)**: Official company feeds (Lever) and public hackathon registries (Devpost).
2. **Attributed Alert-Email Forwarding (Private Ingest)**: High-frequency alert emails from LinkedIn, Unstop, and Internshala routed via individual 32-hex student forwarding aliases.
3. **First-Party Bookmarklet ("Save to OpportunityOS")**: 1-click capture from authenticated browser tabs when students view listings directly.

---

## 2. Tested Candidate Source Register

| Candidate | Category | Transport & Auth | Cost | Feasibility & Probe Results | Selected Role in Demo |
|---|---|---|---|---|---|
| **Lever Postings API** | Company Feed | HTTPS GET JSON, Zero-Auth | $0 | **PASS**. Tested with CRED (7 live jobs) and Meesho (58 live jobs in Bangalore). Full structured metadata (commitment, location, team, hostedUrl, applyUrl). | **Primary Company Adapter** (Slice S2) |
| **Devpost Hackathons** | Hackathons | HTTPS GET JSON, Zero-Auth | $0 | **PASS**. Tested `/api/hackathons`. Returned 14,070 total entries, 9/page with explicit submission deadlines, links, and prize pools. `robots.txt` explicitly permits general crawlers. | **Primary Hackathon Adapter** (Slice S2) |
| **Greenhouse Board API** | Company Feed | HTTPS GET JSON, Zero-Auth | $0 | **PASS**. Tested `https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs?content=true`. Full structured title, location, content, departments. | **Curated Public Board** (Slice S5 Experience) |
| **Ashby Board API** | Company Feed | HTTPS GET JSON, Zero-Auth | $0 | **PASS**. Tested `https://api.ashbyhq.com/posting-api/job-board/posthog`. Returns structured title, location, descriptionPlain, applyUrl. | **Curated Public Board** (Slice S5 Experience) |
| **Devfolio** | Hackathons | HTML / SSR | $0 | **FEASIBLE (Secondary)**. `robots.txt` allows paths, but requires HTML/SSR parsing. Devpost selected as cleaner JSON primary. | **Secondary Hackathon Fallback** |
| **JSearch (OpenWeb Ninja / RapidAPI)** | Search Aggregator | REST API (API Key required) | Free tier 200 req/mo | **AWAITING CREDENTIALS**. No API key configured in current environment. Per Decision D5, autonomous discovery proceeds with Lever and Devpost. | **Awaiting Provider Key** |
| **Internshala** | Job / Internship Board | Web Scraping / HTML | N/A | **DIRECT FETCH BLOCKED**. `robots.txt` disallows `/internship/details/`, `/job/details/`, and `/api/`. | **Alert Forwarding & Bookmarklet Only** (Slice S4) |
| **LinkedIn & Unstop** | Portals / Aggregators | Web Scraping / HTML | N/A | **DIRECT FETCH BLOCKED**. Login-walled; automated scraping forbidden. | **Alert Forwarding & Bookmarklet Only** (Slice S4) |

---

## 3. Deep Candidate Profiles

### 3.1 Lever Postings API (Selected Primary Company Adapter)
* **Endpoint Pattern**: `https://api.lever.co/v0/postings/:company?mode=json`
* **Transport**: Direct HTTPS GET, standard JSON.
* **Pagination**: Supports `skip` and `limit` query parameters.
* **Verified Probe Evidence (15 Oct 2026)**:
  * `cred`: 7 active postings (e.g., Accounts Payable Manager, Prefr Team, Hyderabad/Bangalore).
  * `meesho`: 58 active postings (e.g., AM/Manager - Risk & Decision Science, Bangalore).
  * `spotify`: 82 active postings.
  * `palantir`: 314 active postings.
* **Sample Normalized Payload Fields**:
  ```json
  {
    "id": "7d9af9b5-c1c7-48ec-bbb5-9b25e49f6596",
    "text": "AM/ Manager - Risk & Decision Science",
    "categories": {
      "commitment": "Full Time Employee",
      "department": "Financial Services",
      "location": "Bangalore, Karnataka",
      "team": "Financial Services"
    },
    "hostedUrl": "https://jobs.lever.co/meesho/7d9af9b5-c1c7-48ec-bbb5-9b25e49f6596",
    "applyUrl": "https://jobs.lever.co/meesho/7d9af9b5-c1c7-48ec-bbb5-9b25e49f6596/apply",
    "createdAt": 1728900000000
  }
  ```
* **Attribution & Terms**: Public job postings published by employers for public distribution. Attribution clearly marked as company career portal.
* **Verdict**: **APPROVED** for Slice S2. Initial demo companies: **CRED** and **Meesho**.

---

### 3.2 Devpost Hackathons API (Selected Primary Hackathon Adapter)
* **Endpoint**: `https://devpost.com/api/hackathons`
* **Transport**: HTTPS GET, application/json.
* **Pagination**: `?page=1` (9 hackathons per page).
* **Robots Policy**:
  ```text
  User-agent: *
  Disallow:
  ```
  Permits general automated access to public listing routes.
* **Verified Probe Evidence (15 Oct 2026)**:
  * Successfully retrieved current live hackathons.
  * Fields: `title`, `url`, `submission_period_dates` (e.g., *"Aug 31 - Oct 23, 2026"*), `prize_amount`, `themes`, `open_state`.
* **Attribution**: Devpost public hackathon directory.
* **Verdict**: **APPROVED** for Slice S2.

---

### 3.3 Internshala, LinkedIn, and Unstop (Forwarding & Bookmarklet Only)
* **Internshala `robots.txt`**:
  ```text
  User-agent: *
  Disallow: /internship/details/
  Disallow: /job/details/
  Disallow: /internship/search/
  Disallow: /job/search/
  Disallow: /api/
  ```
* **Decision**: We respect provider terms and robots rules. We will **never** scrape these sites directly or use an unauthorized proxy.
* **Ingest Channel**:
  1. **Alert Forwarding**: Students set up job alert emails on these portals directed or forwarded to their personal OpportunityOS alias (`user_<token>@...`).
  2. **Bookmarklet**: When a student browses a detail page in their own browser, they click "Save to OpportunityOS" to capture visible text and link metadata.
* **Verdict**: Handled cleanly in **Slice S4**.

---

## 4. Hosting & Deployment Decisions (D6)

* **Next.js Web Application**:
  * Hosted on **Vercel** with custom or preview domain.
  * Environment configuration synchronizes Supabase URL, anon key, and service role key.
  * Supabase Auth Redirect URLs configured for the Vercel HTTPS domain.
* **n8n Workflow Engine**:
  * Runs on Docker with persistent host volume (`n8n_data`).
  * Ingress secured via Cloudflare Quick Tunnel / named tunnel with the restricted webhook gateway on port 5680.
  * Zero exposure of n8n editor (`5678`) or database ports.
* **Demo Transparency**:
  * Disclosed to hackathon judges as controlled-demo operation with zero-latency cached card fallbacks.
