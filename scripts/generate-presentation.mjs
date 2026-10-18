import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL('../.local/package.json', import.meta.url));
const pptxgen = require('pptxgenjs');

async function createPresentation() {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 inches
  pres.title = 'Trajectory — Autonomous Student Opportunity Intelligence';
  pres.subject = 'Project Presentation';
  pres.author = 'Trajectory Team';

  // Palette
  const C_DARK_BG = '0B0F19';
  const C_CARD_BG = '151C2C';
  const C_LIGHT_BG = 'F8F9FA';
  const C_LIGHT_CARD = 'FFFFFF';
  const C_ORANGE = 'FF5A1F';
  const C_BLUE = '2563EB';
  const C_TEXT_DARK = '111827';
  const C_TEXT_LIGHT = 'F9FAFB';
  const C_MUTED_LIGHT = '94A3B8';
  const C_MUTED_DARK = '4B5563';
  const C_BORDER = 'E2E8F0';
  const C_BORDER_DARK = '2D3748';

  function addHeader(slide, title, category = 'TRAJECTORY SYSTEM ARCHITECTURE', dark = false) {
    slide.addText(category.toUpperCase(), {
      x: 0.8, y: 0.4, w: 8.4, h: 0.3,
      fontSize: 10, bold: true, fontFace: 'Segoe UI',
      color: dark ? C_ORANGE : C_ORANGE,
      tracking: 2
    });
    slide.addText(title, {
      x: 0.8, y: 0.65, w: 8.4, h: 0.6,
      fontSize: 22, bold: true, fontFace: 'Segoe UI',
      color: dark ? C_TEXT_LIGHT : C_TEXT_DARK
    });
  }

  function addSlideNumber(slide, num, total = 22, dark = false) {
    slide.addText(`${num} / ${total}`, {
      x: 8.8, y: 5.1, w: 0.8, h: 0.3,
      fontSize: 9, fontFace: 'Segoe UI', align: 'right',
      color: dark ? C_MUTED_LIGHT : C_MUTED_DARK
    });
  }

  // ==========================================
  // SLIDE 1: Title Slide
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };

    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.8, y: 0.8, w: 1.6, h: 0.35,
      fill: { color: C_ORANGE }, line: { color: C_ORANGE }
    });
    slide.addText('AUTONOMOUS AI SYSTEM', {
      x: 0.8, y: 0.8, w: 1.6, h: 0.35,
      fontSize: 9, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI'
    });

    slide.addText('Trajectory', {
      x: 0.8, y: 1.3, w: 8.4, h: 1.1,
      fontSize: 48, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
    });

    slide.addText('The autonomous student opportunity intelligence and action system', {
      x: 0.8, y: 2.35, w: 8.4, h: 0.5,
      fontSize: 18, color: 'E2E8F0', fontFace: 'Segoe UI'
    });

    slide.addText('AI extracts grounded evidence.   Deterministic code decides.   n8n orchestrates.', {
      x: 0.8, y: 2.85, w: 8.4, h: 0.4,
      fontSize: 13, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });

    // Pipeline badges
    const stages = ['Discover', 'Understand', 'Evaluate', 'Decide', 'Act', 'Follow up'];
    stages.forEach((stg, idx) => {
      const bx = 0.8 + idx * 1.4;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: bx, y: 3.6, w: 1.25, h: 0.45,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1 }, rectRadius: 0.08
      });
      slide.addText(stg, {
        x: bx, y: 3.6, w: 1.25, h: 0.45,
        fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI'
      });
      if (idx < 5) {
        slide.addText('→', {
          x: bx + 1.25, y: 3.6, w: 0.15, h: 0.45,
          fontSize: 11, bold: true, color: C_ORANGE, align: 'center'
        });
      }
    });

    slide.addText('Judges Round   |   Internships  —  Jobs  —  Hackathons', {
      x: 0.8, y: 4.8, w: 8.4, h: 0.4,
      fontSize: 11, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 1, 22, true);
  }

  // ==========================================
  // SLIDE 2: The Problem We Solve
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'The Problem We Solve', 'CHALLENGE & SOLUTION', false);

    // Headers
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 1.35, w: 4.0, h: 0.4,
      fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1', width: 1 }
    });
    slide.addText('TODAY (MANUAL CHAOS)', {
      x: 0.8, y: 1.35, w: 4.0, h: 0.4,
      fontSize: 11, bold: true, color: '64748B', align: 'center', fontFace: 'Segoe UI'
    });

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.2, y: 1.35, w: 4.0, h: 0.4,
      fill: { color: 'FFF1EB' }, line: { color: C_ORANGE, width: 1 }
    });
    slide.addText('WITH TRAJECTORY (AUTONOMOUS)', {
      x: 5.2, y: 1.35, w: 4.0, h: 0.4,
      fontSize: 11, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
    });

    const problems = [
      {
        icon: '🔍',
        pTitle: 'Scattered Sources',
        pDesc: 'Company boards, hackathon portals, email alerts, and web pages—all checked manually every day.',
        sTitle: 'One Profile, One Pipeline',
        sDesc: 'Feeds, forwarded emails, and browser captures flow into one unified evaluation loop.'
      },
      {
        icon: '📋',
        pTitle: 'Manual Eligibility Checks',
        pDesc: 'Every listing re-read for CGPA, branch, graduation year, region, and buried fine print.',
        sTitle: 'Evidence-Backed Decisions',
        sDesc: 'AI extracts literal quoted facts; deterministic code checks eligibility, scores, and confidence.'
      },
      {
        icon: '⚠️',
        pTitle: 'Risky & Unverified Listings',
        pDesc: 'Fee-charging traps and suspicious postings look identical to authentic career opportunities.',
        sTitle: 'Safe Next Actions',
        sDesc: 'Track, notify, calendar, or ask. Never auto-submits applications or impersonates students.'
      }
    ];

    problems.forEach((item, idx) => {
      const cy = 1.9 + idx * 1.0;

      // Problem card
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: cy, w: 4.0, h: 0.88,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1 }, rectRadius: 0.08
      });
      slide.addText(`${item.icon}  ${item.pTitle}`, {
        x: 0.95, y: cy + 0.08, w: 3.7, h: 0.28,
        fontSize: 11, bold: true, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });
      slide.addText(item.pDesc, {
        x: 0.95, y: cy + 0.35, w: 3.7, h: 0.48,
        fontSize: 9.5, color: C_MUTED_DARK, fontFace: 'Segoe UI'
      });

      // Solution card
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 5.2, y: cy, w: 4.0, h: 0.88,
        fill: { color: C_LIGHT_CARD }, line: { color: C_ORANGE, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(`✔  ${item.sTitle}`, {
        x: 5.35, y: cy + 0.08, w: 3.7, h: 0.28,
        fontSize: 11, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(item.sDesc, {
        x: 5.35, y: cy + 0.35, w: 3.7, h: 0.48,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 2, 22, false);
  }

  // ==========================================
  // SLIDE 3: One Loop: Discover to Follow-Up
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'One Loop: Discover to Follow-Up', 'PIPELINE ARCHITECTURE', false);

    const steps = [
      { num: '1', title: 'Discover', desc: 'Public feeds, forwarded email, browser capture', wf: 'WF 08 | 01' },
      { num: '2', title: 'Understand', desc: 'Safe fetch; AI extracts quoted facts', wf: 'WF 02' },
      { num: '3', title: 'Evaluate', desc: 'Eligibility check, 0–100 score, confidence', wf: 'WF 03' },
      { num: '4', title: 'Decide', desc: 'ACT, ASK, or IGNORE by deterministic policy', wf: 'WF 03' },
      { num: '5', title: 'Act', desc: 'Track, notify, calendar, or get approval', wf: 'WF 04 | 05' },
      { num: '6', title: 'Follow up', desc: 'Daily reminders, failure alerts, calendar updates', wf: 'WF 06 | 07' }
    ];

    steps.forEach((st, idx) => {
      const sx = 0.8 + idx * 1.42;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: sx, y: 1.5, w: 1.32, h: 2.1,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
      });

      slide.addShape(pres.shapes.OVAL, {
        x: sx + 0.46, y: 1.65, w: 0.4, h: 0.4,
        fill: { color: C_ORANGE }, line: { color: C_ORANGE }
      });
      slide.addText(st.num, {
        x: sx + 0.46, y: 1.65, w: 0.4, h: 0.4,
        fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI'
      });

      slide.addText(st.title, {
        x: sx + 0.05, y: 2.15, w: 1.22, h: 0.3,
        fontSize: 12, bold: true, color: C_TEXT_DARK, align: 'center', fontFace: 'Segoe UI'
      });

      slide.addText(st.desc, {
        x: sx + 0.08, y: 2.45, w: 1.16, h: 0.75,
        fontSize: 9, color: C_MUTED_DARK, align: 'center', fontFace: 'Segoe UI'
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: sx + 0.15, y: 3.25, w: 1.02, h: 0.22,
        fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1' }
      });
      slide.addText(st.wf, {
        x: sx + 0.15, y: 3.25, w: 1.02, h: 0.22,
        fontSize: 8, bold: true, color: '475569', align: 'center', fontFace: 'Segoe UI'
      });
    });

    // Governance Callout Cards
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 3.8, w: 4.1, h: 1.1,
      fill: { color: 'F8FAFC' }, line: { color: C_BLUE, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('🔁  Feedback Loop', {
      x: 0.95, y: 3.9, w: 3.8, h: 0.25,
      fontSize: 11, bold: true, color: C_BLUE, fontFace: 'Segoe UI'
    });
    slide.addText('A profile edit or a newly answered question instantly re-evaluates affected opportunities. Stale runs are fenced, and AI evidence is cached.', {
      x: 0.95, y: 4.18, w: 3.8, h: 0.65,
      fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI'
    });

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.1, y: 3.8, w: 4.1, h: 1.1,
      fill: { color: 'FFF7ED' }, line: { color: C_ORANGE, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('🛡️  Autonomy Boundary', {
      x: 5.25, y: 3.9, w: 3.8, h: 0.25,
      fontSize: 11, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });
    slide.addText('Trajectory NEVER applies to an employer on a student’s behalf, NEVER invents a deadline, and NEVER shares a student’s profile externally.', {
      x: 5.25, y: 4.18, w: 3.8, h: 0.65,
      fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 3, 22, false);
  }

  // ==========================================
  // SLIDE 4: System Architecture
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'System Architecture', 'TECHNICAL TOPOLOGY', true);

    const colW = 1.95;
    const cards = [
      {
        title: 'CAPTURE TOOLS',
        items: [
          'Chrome Extension (MV3)',
          'One-click Bookmarklet',
          'Pasted text / Raw URL',
          'Resume PDF upload',
          'Forwarded email (IMAP)',
          'Public API feeds: Lever, Greenhouse, Ashby, Devpost'
        ],
        badge: 'INPUT LAYER'
      },
      {
        title: 'NEXT.JS 16 WEB APP',
        items: [
          'React 19 & TypeScript',
          'Tailwind 4 & Radix UI',
          'Route handlers & API routes',
          'SSR session auth guards',
          'Approvals & Sorting Board',
          '7-stage Kanban tracker'
        ],
        badge: 'USER WORKSPACE'
      },
      {
        title: 'N8N ORCHESTRATOR',
        items: [
          'Self-hosted in Docker',
          '15 modular workflows',
          'Webhook & Cron triggers',
          'Private Wait nodes',
          'Durable queue polling',
          'Zero-loss recovery'
        ],
        badge: 'EXECUTION ENGINE'
      },
      {
        title: 'SUPABASE & DATA',
        items: [
          'PostgreSQL with RLS',
          'Private worker schema',
          'PL/pgSQL security definers',
          'Realtime subscriptions',
          'Bucket storage (resumes)',
          '70 audited migrations'
        ],
        badge: 'ISOLATED DATA'
      }
    ];

    cards.forEach((c, idx) => {
      const cx = 0.8 + idx * 2.12;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: 1.45, w: colW, h: 2.8,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1.5 }, rectRadius: 0.08
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx + 0.1, y: 1.55, w: colW - 0.2, h: 0.25,
        fill: { color: '1E293B' }, line: { color: C_BORDER_DARK }
      });
      slide.addText(c.badge, {
        x: cx + 0.1, y: 1.55, w: colW - 0.2, h: 0.25,
        fontSize: 8, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
      });

      slide.addText(c.title, {
        x: cx + 0.1, y: 1.85, w: colW - 0.2, h: 0.35,
        fontSize: 10.5, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI'
      });

      const bulletText = c.items.map(it => `•  ${it}`).join('\n');
      slide.addText(bulletText, {
        x: cx + 0.1, y: 2.25, w: colW - 0.2, h: 1.9,
        fontSize: 8.5, color: 'CBD5E1', fontFace: 'Segoe UI', lineSpacingMultiple: 1.15
      });
    });

    // Bottom Integration & Deployment Strip
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 4.4, w: 8.4, h: 0.7,
      fill: { color: C_CARD_BG }, line: { color: C_ORANGE, width: 1 }, rectRadius: 0.08
    });
    slide.addText('AI ENGINES & DEPLOYMENT:  Groq gpt-oss-120b (primary) · Gemini 3.5 Flash Lite (fallback) · Google Calendar API (OAuth2) · Cloudflare Tunnel', {
      x: 0.95, y: 4.45, w: 8.1, h: 0.25,
      fontSize: 9.5, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
    });
    slide.addText('Local Next.js host · Pinned Docker n8n container · Cloud Supabase PostgreSQL · Webhook-only gateway protects all credentials', {
      x: 0.95, y: 4.75, w: 8.1, h: 0.25,
      fontSize: 8.5, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 4, 22, true);
  }

  // ==========================================
  // SLIDE 5: Technology Stack
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Technology Stack', 'FULL MODERN TOOLCHAIN', false);

    const techGrid = [
      {
        title: 'Frontend Framework',
        tech: 'Next.js 16 (App Router)',
        details: 'React 19, TypeScript 5, Tailwind CSS 4, Radix UI primitives, Zod schema validation, Lucide icons.'
      },
      {
        title: 'Database & Security',
        tech: 'Supabase PostgreSQL',
        details: 'Auth with SSR cookies, Row-Level Security, PL/pgSQL RPCs, Realtime channels, 70 migrations, 21 SQL tests.'
      },
      {
        title: 'Orchestration Engine',
        tech: 'Self-Hosted n8n (Docker)',
        details: '15 workflows, 168 nodes. Webhook listeners, Cron schedules, Wait nodes, and pure JavaScript Code nodes.'
      },
      {
        title: 'AI Intelligence Layer',
        tech: 'Groq + Gemini 3.5 Flash Lite',
        details: 'Groq gpt-oss-120b primary with Gemini fallback. LLM chain with forced JSON schemas and zero-hallucination quote gates.'
      },
      {
        title: 'Integrations & Protocols',
        tech: 'Calendar & Mail Protocols',
        details: 'Lever, Greenhouse, Ashby, Devpost, JSearch India. Google Calendar OAuth2, Gmail SMTP outgoing, and IMAP incoming.'
      },
      {
        title: 'Capture & Verification',
        tech: 'Extensions & Test Harness',
        details: 'Chrome Extension (MV3), Bookmarklet, unpdf in-process parser, 246 Node contract tests, Cloudflare secure tunnel.'
      }
    ];

    techGrid.forEach((t, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const tx = 0.8 + col * 2.85;
      const ty = 1.45 + row * 1.7;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: tx, y: ty, w: 2.7, h: 1.55,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
      });

      slide.addText(t.title.toUpperCase(), {
        x: tx + 0.15, y: ty + 0.12, w: 2.4, h: 0.25,
        fontSize: 8.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });

      slide.addText(t.tech, {
        x: tx + 0.15, y: ty + 0.38, w: 2.4, h: 0.35,
        fontSize: 12, bold: true, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });

      slide.addText(t.details, {
        x: tx + 0.15, y: ty + 0.75, w: 2.4, h: 0.7,
        fontSize: 9, color: C_MUTED_DARK, fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 5, 22, false);
  }

  // ==========================================
  // SLIDE 6: Security and Data Isolation
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Security and Data Isolation', 'ENTERPRISE-GRADE DEFENSE IN DEPTH', true);

    const layers = [
      { num: '1', title: 'Edge Hardening', desc: 'Public Cloudflare tunnel exposes webhooks only. Header authentication enforced; root and settings paths return 404.' },
      { num: '2', title: 'Identity Verification', desc: 'Resource owner always comes from verified Supabase session cookies, NEVER trusted from request bodies.' },
      { num: '3', title: 'Data Isolation', desc: 'Row-Level Security (RLS) on all public tables; owner-scoped security definer RPCs; privileged worker schema stays private.' },
      { num: '4', title: 'Source Fetch Safety', desc: 'SSRF-fenced reader: DNS resolved and pinned; private and loopback IP ranges blocked; robots.txt strictly honored.' },
      { num: '5', title: 'Action Safety Boundaries', desc: 'Separate, revocable consents for email and calendar; idempotent queue execution ensures actions are never duplicated.' }
    ];

    layers.forEach((l, idx) => {
      const ly = 1.45 + idx * 0.7;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: ly, w: 8.4, h: 0.6,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1 }, rectRadius: 0.08
      });

      slide.addShape(pres.shapes.OVAL, {
        x: 0.95, y: ly + 0.1, w: 0.4, h: 0.4,
        fill: { color: C_ORANGE }, line: { color: C_ORANGE }
      });
      slide.addText(l.num, {
        x: 0.95, y: ly + 0.1, w: 0.4, h: 0.4,
        fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Segoe UI'
      });

      slide.addText(l.title, {
        x: 1.45, y: ly + 0.15, w: 2.2, h: 0.3,
        fontSize: 11, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });

      slide.addText(l.desc, {
        x: 3.7, y: ly + 0.12, w: 5.3, h: 0.4,
        fontSize: 9.5, color: 'CBD5E1', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 6, 22, true);
  }

  // ==========================================
  // SLIDE 7: AI Proposes, Code Decides
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'AI Proposes, Code Decides', 'ZERO-HALLUCINATION ARCHITECTURE', false);

    // Flow row
    const flowBoxes = [
      { title: 'Messy Input', sub: 'Postings, emails, pages, resume PDF' },
      { title: 'AI Proposes', sub: 'Groq / Gemini extracts facts with literal quotes' },
      { title: 'Validation Gate', sub: 'Code verifies quotes match source text 100%' },
      { title: 'Code Decides', sub: 'Deterministic rules score & route ACT / ASK / SKIP' }
    ];

    flowBoxes.forEach((f, idx) => {
      const bx = 0.8 + idx * 2.12;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: bx, y: 1.4, w: 1.95, h: 0.75,
        fill: { color: idx === 3 ? 'FFF7ED' : C_LIGHT_CARD },
        line: { color: idx === 3 ? C_ORANGE : C_BORDER, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(f.title, {
        x: bx + 0.05, y: 1.48, w: 1.85, h: 0.25,
        fontSize: 10.5, bold: true, color: idx === 3 ? C_ORANGE : C_TEXT_DARK, align: 'center', fontFace: 'Segoe UI'
      });
      slide.addText(f.sub, {
        x: bx + 0.05, y: 1.75, w: 1.85, h: 0.35,
        fontSize: 8, color: C_MUTED_DARK, align: 'center', fontFace: 'Segoe UI'
      });
      if (idx < 3) {
        slide.addText('→', {
          x: bx + 1.95, y: 1.55, w: 0.17, h: 0.4,
          fontSize: 12, bold: true, color: C_ORANGE, align: 'center'
        });
      }
    });

    // Two Column Boundaries
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 2.35, w: 4.05, h: 2.7,
      fill: { color: C_LIGHT_CARD }, line: { color: '10B981', width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('✔  WHAT THE AI MODEL MAY DO', {
      x: 0.95, y: 2.48, w: 3.75, h: 0.3,
      fontSize: 11, bold: true, color: '059669', fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Extract title, organization, deadline, and eligibility.\n' +
      '•  Provide verbatim quotes for every extracted fact.\n' +
      '•  Propose matching evidence quoting both listing and profile.\n' +
      '•  Parse messy raw markdown and text.\n' +
      '•  Failover seamlessly from Groq to Gemini Flash Lite.',
      {
        x: 0.95, y: 2.85, w: 3.75, h: 2.1,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.25
      }
    );

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.15, y: 2.35, w: 4.05, h: 2.7,
      fill: { color: C_LIGHT_CARD }, line: { color: 'EF4444', width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('✖  WHAT THE AI MODEL MAY NEVER DO', {
      x: 5.3, y: 2.48, w: 3.75, h: 0.3,
      fontSize: 11, bold: true, color: 'DC2626', fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Return policy decision fields or declare eligibility.\n' +
      '•  Call external tools, write to DB, or execute side-effects.\n' +
      '•  See student credentials, API keys, or private nonces.\n' +
      '•  Invent a deadline: missing facts stay NULL.\n' +
      '•  Bypass the quota reservation or budget ceilings.',
      {
        x: 5.3, y: 2.85, w: 3.75, h: 2.1,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.25
      }
    );

    addSlideNumber(slide, 7, 22, false);
  }

  // ==========================================
  // SLIDE 8: Grounded Extraction Pipeline
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Grounded Extraction Pipeline', 'EVIDENCE VERIFICATION', true);

    const steps = [
      { s: '01', t: 'Safe Source Read', d: 'Public static pages only; DNS pinned, redirects checked, robots.txt honored.' },
      { s: '02', t: 'Hash & Dedupe', d: 'Source text hashed before AI call; cached extractions reused per user.' },
      { s: '03', t: 'Bounded Chunking', d: 'Listings over 20k characters split by headings; merged without silent truncation.' },
      { s: '04', t: 'Schema Extraction', d: 'Groq/Gemini JSON-schema output; strictly bounded to 5 items max; no tools.' },
      { s: '05', t: 'Validate Evidence', d: 'Every fact verified with a literal quote; dates, timezones, and ranges checked.' },
      { s: '06', t: 'Classify Requirements', d: 'Mandatory criteria separated from skills, preferences, and perks.' },
      { s: '07', t: 'Save with Provenance', d: 'Saved as deduplicated catalog item. Missing fields stay NULL, never guessed.' }
    ];

    steps.forEach((st, idx) => {
      const sy = 1.4 + idx * 0.44;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: sy, w: 5.0, h: 0.38,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1 }, rectRadius: 0.06
      });
      slide.addText(st.s, {
        x: 0.9, y: sy + 0.05, w: 0.3, h: 0.28,
        fontSize: 9, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(st.t, {
        x: 1.25, y: sy + 0.05, w: 1.5, h: 0.28,
        fontSize: 9.5, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addText(st.d, {
        x: 2.8, y: sy + 0.05, w: 2.9, h: 0.28,
        fontSize: 8, color: 'CBD5E1', fontFace: 'Segoe UI'
      });
    });

    // Requirement Classes Box
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 6.0, y: 1.4, w: 3.2, h: 3.1,
      fill: { color: C_CARD_BG }, line: { color: C_ORANGE, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('FOUR REQUIREMENT CLASSES', {
      x: 6.15, y: 1.55, w: 2.9, h: 0.3,
      fontSize: 10, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });

    const reqs = [
      { name: '1. mandatory_eligibility', desc: 'Hard constraints (degree, branch, CGPA, graduation year).' },
      { name: '2. required_skill', desc: 'Core technical competencies essential for the role.' },
      { name: '3. preferred_skill', desc: 'Bonus skills; NEVER cause a hard eligibility failure.' },
      { name: '4. other_requirement', desc: 'Benefits, visa rules, or non-technical requirements.' }
    ];
    reqs.forEach((r, idx) => {
      const ry = 1.95 + idx * 0.55;
      slide.addText(r.name, {
        x: 6.15, y: ry, w: 2.9, h: 0.2,
        fontSize: 9, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addText(r.desc, {
        x: 6.15, y: ry + 0.2, w: 2.9, h: 0.32,
        fontSize: 8, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
      });
    });

    slide.addText('Rule: Unstated criteria are marked NOT_STATED, never failed.', {
      x: 6.15, y: 4.15, w: 2.9, h: 0.25,
      fontSize: 8, italic: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 8, 22, true);
  }

  // ==========================================
  // SLIDE 9: Deterministic Decision Engine
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Deterministic Decision Engine', 'GOVERNANCE & POLICY RULES', false);

    const rules = [
      { order: '1', cond: 'Application deadline already expired', out: 'IGNORE', color: 'DC2626' },
      { order: '2', cond: 'A mandatory eligibility requirement fails', out: 'IGNORE', color: 'DC2626' },
      { order: '3', cond: 'Eligibility status is UNKNOWN (missing facts)', out: 'ASK', color: '2563EB' },
      { order: '4', cond: 'Eligible, but match score is below 40', out: 'IGNORE', color: 'DC2626' },
      { order: '5', cond: 'Score & confidence meet active autonomy mode threshold', out: 'ACT', color: '059669' },
      { order: '6', cond: 'Otherwise (borderline fit or confidence)', out: 'ASK', color: '2563EB' }
    ];

    rules.forEach((r, idx) => {
      const ry = 1.45 + idx * 0.48;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: ry, w: 8.4, h: 0.42,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1 }, rectRadius: 0.06
      });

      slide.addText(`Rule ${r.order}`, {
        x: 0.95, y: ry + 0.08, w: 0.8, h: 0.26,
        fontSize: 10, bold: true, color: C_MUTED_DARK, fontFace: 'Segoe UI'
      });

      slide.addText(r.cond, {
        x: 1.8, y: ry + 0.08, w: 5.6, h: 0.26,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 7.6, y: ry + 0.06, w: 1.4, h: 0.3,
        fill: { color: r.out === 'ACT' ? 'ECFDF5' : r.out === 'ASK' ? 'EFF6FF' : 'FEF2F2' },
        line: { color: r.color, width: 1.5 }
      });
      slide.addText(r.out, {
        x: 7.6, y: ry + 0.06, w: 1.4, h: 0.3,
        fontSize: 10, bold: true, color: r.color, align: 'center', fontFace: 'Segoe UI'
      });
    });

    // Confidence formula box
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 4.45, w: 8.4, h: 0.7,
      fill: { color: 'F1F5F9' }, line: { color: C_ORANGE, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('MATHEMATICAL CONFIDENCE FORMULA', {
      x: 0.95, y: 4.52, w: 8.1, h: 0.22,
      fontSize: 8.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });
    slide.addText('Confidence = min( model_confidence,  0.30 × completeness + 0.30 × verified_evidence + 0.25 × clarity + 0.15 × model_confidence )', {
      x: 0.95, y: 4.75, w: 8.1, h: 0.3,
      fontSize: 10, bold: true, color: C_TEXT_DARK, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 9, 22, false);
  }

  // ==========================================
  // SLIDE 10: Autonomy Modes and Outcomes
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Autonomy Modes and Outcomes', 'CALIBRATED HUMAN-IN-THE-LOOP CONTROL', true);

    const modes = [
      { name: 'Cautious', score: 'Score 80+', conf: 'Confidence 0.85+', desc: 'High barrier. Ideal for final-round candidates seeking precise matches.' },
      { name: 'Balanced (Default)', score: 'Score 70+', conf: 'Confidence 0.75+', desc: 'Standard operating mode. Balanced precision and discovery throughput.' },
      { name: 'Autopilot', score: 'Score 60+', conf: 'Confidence 0.65+', desc: 'Broadest net. Automatically handles tracking for all viable roles.' }
    ];

    modes.forEach((m, idx) => {
      const mx = 0.8 + idx * 2.85;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: mx, y: 1.45, w: 2.7, h: 1.45,
        fill: { color: C_CARD_BG }, line: { color: idx === 1 ? C_ORANGE : C_BORDER_DARK, width: idx === 1 ? 2 : 1 }, rectRadius: 0.08
      });
      slide.addText(m.name, {
        x: mx + 0.15, y: 1.55, w: 2.4, h: 0.3,
        fontSize: 11, bold: true, color: idx === 1 ? C_ORANGE : 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addText(`${m.score}  ·  ${m.conf}`, {
        x: mx + 0.15, y: 1.85, w: 2.4, h: 0.25,
        fontSize: 9, bold: true, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
      });
      slide.addText(m.desc, {
        x: mx + 0.15, y: 2.15, w: 2.4, h: 0.65,
        fontSize: 8.5, color: 'CBD5E1', fontFace: 'Segoe UI'
      });
    });

    const outcomes = [
      {
        tag: 'ACT',
        title: 'Eligible & Confident',
        desc: 'Queues permitted low-risk actions: tracker task, notification, calendar event. Never submits application.',
        color: '10B981'
      },
      {
        tag: 'ASK',
        title: 'Missing Facts or Borderline',
        desc: 'Enters the Approval Center. Asks student once; explicit approval immediately resumes execution.',
        color: '3B82F6'
      },
      {
        tag: 'IGNORE',
        title: 'Ineligible, Expired, or Low Fit',
        desc: 'Silently archived. Reasons (expired deadline, failed requirement, low score) transparently visible.',
        color: '94A3B8'
      }
    ];

    outcomes.forEach((o, idx) => {
      const ox = 0.8 + idx * 2.85;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: ox, y: 3.1, w: 2.7, h: 1.8,
        fill: { color: C_CARD_BG }, line: { color: o.color, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(o.tag, {
        x: ox + 0.15, y: 3.2, w: 2.4, h: 0.35,
        fontSize: 14, bold: true, color: o.color, fontFace: 'Segoe UI'
      });
      slide.addText(o.title, {
        x: ox + 0.15, y: 3.55, w: 2.4, h: 0.25,
        fontSize: 9.5, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addText(o.desc, {
        x: ox + 0.15, y: 3.85, w: 2.4, h: 0.95,
        fontSize: 8.5, color: 'CBD5E1', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 10, 22, true);
  }

  // ==========================================
  // SLIDE 11: 15 n8n Workflows at a Glance
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, '15 n8n Workflows at a Glance', 'ORCHESTRATION TOPOLOGY', false);

    // Stats Bar
    const stats = [
      { num: '15', label: 'WORKFLOWS' },
      { num: '10', label: 'PRODUCTION PIPELINE' },
      { num: '5', label: 'SETUP CONNECTIVITY CHECKS' },
      { num: '168', label: 'TOTAL NODES' }
    ];
    stats.forEach((s, idx) => {
      const sx = 0.8 + idx * 2.12;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: sx, y: 1.35, w: 1.95, h: 0.7,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.06
      });
      slide.addText(s.num, {
        x: sx, y: 1.4, w: 1.95, h: 0.35,
        fontSize: 16, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
      });
      slide.addText(s.label, {
        x: sx, y: 1.75, w: 1.95, h: 0.22,
        fontSize: 7.5, bold: true, color: C_MUTED_DARK, align: 'center', fontFace: 'Segoe UI'
      });
    });

    // Workflow Map Table
    const wfRows = [
      { id: '01 Ingest', role: 'Front door: webhook & IMAP receiver, session validation, atomic raw store', trigger: 'Webhook / IMAP' },
      { id: '02 Understand', role: 'DNS-pinned fetch, text hashing, Groq/Gemini fact & quote extraction', trigger: 'Call / Queue poll' },
      { id: '03 Evaluate', role: 'Eligibility in code, AI quote matching, deterministic scoring & routing', trigger: 'Call / Queue poll' },
      { id: '04 Act', role: 'Permitted low-risk execution: tracker, calendar reconciliation, SMTP email', trigger: 'Call / 1-min recovery' },
      { id: '05 Ask & Approve', role: 'Private Wait node; resumes only upon student approval with private nonce', trigger: 'Wait node (48h)' },
      { id: '06 Autopilot', role: 'Hourly cron scanning at 09:00 IST; user heartbeats and daily reminders', trigger: 'Cron (Hourly)' },
      { id: '08 Discovery', role: 'Adapter-based polling: Lever, Greenhouse, Ashby, Devpost, JSearch India', trigger: 'Cron (15 min)' },
      { id: '07 Error Handler', role: 'Shared sanitizer redacts secrets; logs failure in owner activity ledger', trigger: 'Error Trigger' }
    ];

    wfRows.forEach((r, idx) => {
      const ry = 2.2 + idx * 0.35;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: ry, w: 8.4, h: 0.31,
        fill: { color: idx % 2 === 0 ? C_LIGHT_CARD : 'F1F5F9' },
        line: { color: C_BORDER, width: 0.5 }, rectRadius: 0.04
      });
      slide.addText(r.id, {
        x: 0.9, y: ry + 0.05, w: 1.5, h: 0.22,
        fontSize: 8.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(r.role, {
        x: 2.45, y: ry + 0.05, w: 5.3, h: 0.22,
        fontSize: 8, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });
      slide.addText(r.trigger, {
        x: 7.8, y: ry + 0.05, w: 1.3, h: 0.22,
        fontSize: 7.5, bold: true, color: '64748B', align: 'right', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 11, 22, false);
  }

  // ==========================================
  // SLIDE 12: Workflow 01: Ingest
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Workflow 01: Ingest', 'PIPELINE FRONT DOOR', true);

    slide.addText('Accepts signed-in website/extension submissions & forwarded emails, saves atomically, and hands off to 02 Understand.', {
      x: 0.8, y: 1.3, w: 8.4, h: 0.4,
      fontSize: 11, color: 'CBD5E1', fontFace: 'Segoe UI'
    });

    // 2 Ingest Channels
    const channels = [
      {
        title: 'CHANNEL A: WEBHOOK INTAKE (Web & Extension)',
        steps: [
          'Webhook POST received from web app or extension',
          'Payload validated against strict Zod intake contract',
          'Session verified directly with Supabase Auth (owner extracted)',
          'Atomic raw item save + audit event logged',
          'Confirmed HTTP 201 response returned to client',
          'Immediate trigger handoff to 02 Understand'
        ]
      },
      {
        title: 'CHANNEL B: IMAP INTAKE (Forwarded Email Alerts)',
        steps: [
          'IMAP trigger polls personal agent mailbox',
          'Sender alias token validated before any AI parsing',
          'Email alert parsed into discrete opportunity items',
          'Owner identity resolved via email_alias_token in DB',
          'Discovered raw text stored with attributed provenance',
          'Enqueued for evaluation in 02 Understand'
        ]
      }
    ];

    channels.forEach((ch, idx) => {
      const cx = 0.8 + idx * 4.25;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: 1.75, w: 4.15, h: 3.1,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(ch.title, {
        x: cx + 0.15, y: 1.9, w: 3.85, h: 0.35,
        fontSize: 9.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      const bulletText = ch.steps.map((st, i) => `${i + 1}.  ${st}`).join('\n\n');
      slide.addText(bulletText, {
        x: cx + 0.15, y: 2.3, w: 3.85, h: 2.4,
        fontSize: 8.5, color: 'E2E8F0', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 12, 22, true);
  }

  // ==========================================
  // SLIDE 13: Workflow 02: Understand
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Workflow 02: Understand', 'VERIFIED FACT EXTRACTION', false);

    slide.addText('Turns raw submissions into grounded structured facts. No eligibility checks, scoring, or actions occur here.', {
      x: 0.8, y: 1.3, w: 8.4, h: 0.35,
      fontSize: 10.5, color: C_MUTED_DARK, fontFace: 'Segoe UI'
    });

    const steps02 = [
      { t: '1. Claim Submission', d: 'Claims queued item with atomic lease token to prevent duplicate parallel processing.' },
      { t: '2. SSRF-Fenced Read', d: 'Public URLs fetched with DNS pinning; redirects checked; robots.txt honoured.' },
      { t: '3. Hash & Cache Lookup', d: 'Content hashed; if already parsed by any user, cached facts are reused with 0 AI cost.' },
      { t: '4. AI Budget Guard', d: 'Shared daily AI budget reserved before model execution; prevents runaway spend.' },
      { t: '5. Schema Fact Extraction', d: 'Groq extracts title, organization, deadline, and eligibility with literal quotes.' },
      { t: '6. Grounded Verification', d: 'JavaScript gate verifies every quoted fact matches source markdown byte-for-byte.' }
    ];

    steps02.forEach((s, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const sx = 0.8 + col * 4.25;
      const sy = 1.75 + row * 1.05;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: sx, y: sy, w: 4.15, h: 0.95,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(s.t, {
        x: sx + 0.15, y: sy + 0.1, w: 3.85, h: 0.28,
        fontSize: 10.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(s.d, {
        x: sx + 0.15, y: sy + 0.38, w: 3.85, h: 0.5,
        fontSize: 9, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 13, 22, false);
  }

  // ==========================================
  // SLIDE 14: Workflow 03: Evaluate and Decide
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Workflow 03: Evaluate and Decide', 'THE DECISION CONTRACT', true);

    const blocks = [
      {
        title: 'HARD ELIGIBILITY IN CODE',
        text: 'Code checks student profile (degree, branch, CGPA, graduation year) against mandatory requirements.\n\nIf any mandatory criterion fails → IGNORE.\nIf any criterion is unknown → ASK.'
      },
      {
        title: 'DOUBLE-SIDED EVIDENCE',
        text: 'AI proposes semantic match evidence. Code validates quotes exist on BOTH sides: verbatim quote from job listing AND verbatim quote from student profile.\n\nZero hallucinated match claims.'
      },
      {
        title: 'DETERMINISTIC ROUTING',
        text: 'Composite score (0–100) and mathematical confidence computed.\n\n• ACT: Triggers Workflow 04 (Act)\n• ASK: Triggers Workflow 05 (Ask & Approve)\n• IGNORE: Archived with explicit failure reasons'
      }
    ];

    blocks.forEach((b, idx) => {
      const bx = 0.8 + idx * 2.85;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: bx, y: 1.45, w: 2.7, h: 3.4,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(b.title, {
        x: bx + 0.15, y: 1.6, w: 2.4, h: 0.35,
        fontSize: 10, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(b.text, {
        x: bx + 0.15, y: 2.05, w: 2.4, h: 2.6,
        fontSize: 9, color: 'E2E8F0', fontFace: 'Segoe UI', lineSpacingMultiple: 1.2
      });
    });

    addSlideNumber(slide, 14, 22, true);
  }

  // ==========================================
  // SLIDE 15: Workflow 04: Act
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Workflow 04: Act', 'PERMITTED LOW-RISK EXECUTION', false);

    const actCards = [
      {
        title: 'Tracker Integration',
        desc: 'Creates a tracked record in public.applications with stage set to "To Apply" and sets optimistic UI updates.'
      },
      {
        title: 'Google Calendar Event',
        desc: 'Reconciles event ID before creation. If already on calendar, updates time; never creates duplicates.'
      },
      {
        title: 'Offline .ics Download Link',
        desc: 'For users without connected Google Calendar, generates signed .ics links for native iCal/Outlook import.'
      },
      {
        title: 'Agent Email Notification',
        desc: 'Dispatches clean notification via SMTP from the agent mailbox. No blind retries on uncertain socket states.'
      }
    ];

    actCards.forEach((c, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = 0.8 + col * 4.25;
      const cy = 1.45 + row * 1.5;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: cy, w: 4.15, h: 1.35,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(c.title, {
        x: cx + 0.15, y: cy + 0.12, w: 3.85, h: 0.3,
        fontSize: 11, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(c.desc, {
        x: cx + 0.15, y: cy + 0.45, w: 3.85, h: 0.75,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI'
      });
    });

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 4.5, w: 8.4, h: 0.5,
      fill: { color: 'FFF1EB' }, line: { color: C_ORANGE, width: 1 }
    });
    slide.addText('GUARANTEE: Workflow 04 NEVER auto-submits an application or contacts an employer.', {
      x: 0.95, y: 4.58, w: 8.1, h: 0.3,
      fontSize: 9.5, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 15, 22, false);
  }

  // ==========================================
  // SLIDE 16: Workflow 05: Ask and Approve
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Workflow 05: Ask and Approve', 'HUMAN-IN-THE-LOOP WAIT FENCE', true);

    const pillars = [
      { t: 'Private n8n Wait Node', d: 'When an opportunity requires confirmation, the workflow execution enters a cryptographic n8n Wait node.' },
      { t: 'Private Resume Nonce', d: 'The student reviews in the authenticated Approval Center. Resuming requires a server-side verified one-time nonce.' },
      { t: 'Immutable Expiration', d: 'Approval authority strictly expires after 48 hours or when the job deadline passes, whichever is first.' },
      { t: 'Revision Invalidation', d: 'If the profile or opportunity changes while waiting, the execution is canceled as stale and cannot authorize.' }
    ];

    pillars.forEach((p, idx) => {
      const py = 1.45 + idx * 0.8;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: py, w: 8.4, h: 0.68,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(`0${idx + 1}`, {
        x: 0.95, y: py + 0.15, w: 0.4, h: 0.35,
        fontSize: 12, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(p.t, {
        x: 1.45, y: py + 0.12, w: 2.4, h: 0.25,
        fontSize: 10.5, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addText(p.d, {
        x: 3.9, y: py + 0.1, w: 5.1, h: 0.45,
        fontSize: 9, color: 'CBD5E1', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 16, 22, true);
  }

  // ==========================================
  // SLIDE 17: Workflows 06 and 07: Autopilot and Errors
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Workflows 06 & 07: Autopilot and Error Handling', 'BACKGROUND RELIABILITY', false);

    // Left: 06 Autopilot
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 1.45, w: 4.1, h: 3.4,
      fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('06 AUTOPILOT (DAILY RUNNER)', {
      x: 0.95, y: 1.6, w: 3.8, h: 0.3,
      fontSize: 11, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Runs every hour; performs daily scans at 09:00 IST.\n' +
      '•  Recovers missed days if the machine was offline.\n' +
      '•  Records a cryptographic Agent Heartbeat in the user activity log.\n' +
      '•  Queues daily reminder digests for upcoming deadlines.\n' +
      '•  Idempotent keys ensure reminders are never sent twice.',
      {
        x: 0.95, y: 2.05, w: 3.8, h: 2.6,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.25
      }
    );

    // Right: 07 Error Handler
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.1, y: 1.45, w: 4.1, h: 3.4,
      fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('07 ERROR HANDLER (SELF-HEALING)', {
      x: 5.25, y: 1.6, w: 3.8, h: 0.3,
      fontSize: 11, bold: true, color: 'DC2626', fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Global Error Trigger catches any failing workflow node.\n' +
      '•  Shared Sanitizer scrubs API keys, JWTs, and passwords from errors.\n' +
      '•  Maps failures to their specific resource owner only.\n' +
      '•  Logs visible diagnostics in student activity log—never silent failure.\n' +
      '•  Unattributed system errors remain private from public exposure.',
      {
        x: 5.25, y: 2.05, w: 3.8, h: 2.6,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.25
      }
    );

    addSlideNumber(slide, 17, 22, false);
  }

  // ==========================================
  // SLIDE 18: Workflow 08: Discovery
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Workflow 08: Discovery', 'AUTONOMOUS MULTI-FEED POLLING', true);

    slide.addText('Runs every 15 minutes. Polls registered job feeds, normalizes listings in code, and triggers evaluation.', {
      x: 0.8, y: 1.3, w: 8.4, h: 0.35,
      fontSize: 10.5, color: 'CBD5E1', fontFace: 'Segoe UI'
    });

    const adapters = [
      { name: 'Lever Postings API', trust: 'Corroborated', desc: 'Direct employer endpoints. High trust, structured salary & deadline fields.' },
      { name: 'Greenhouse Boards API', trust: 'Corroborated', desc: 'Official company career pages. Zero scraping required; clean JSON.' },
      { name: 'Ashby Job-Board API', trust: 'Corroborated', desc: 'Modern tech startups. Full markdown job specifications.' },
      { name: 'Devpost Hackathons', trust: 'Attributed', desc: 'Student hackathons, prize pools, submission dates, and developer themes.' },
      { name: 'JSearch India Feeds', trust: 'Attributed', desc: 'Aggregated tech internships across Indian metropolitan hubs.' }
    ];

    adapters.forEach((a, idx) => {
      const ay = 1.75 + idx * 0.62;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: ay, w: 8.4, h: 0.52,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1 }, rectRadius: 0.06
      });
      slide.addText(a.name, {
        x: 0.95, y: ay + 0.1, w: 2.5, h: 0.3,
        fontSize: 10, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
      });
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 3.5, y: ay + 0.12, w: 1.2, h: 0.26,
        fill: { color: '1E293B' }, line: { color: C_ORANGE }
      });
      slide.addText(a.trust, {
        x: 3.5, y: ay + 0.12, w: 1.2, h: 0.26,
        fontSize: 8, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
      });
      slide.addText(a.desc, {
        x: 4.85, y: ay + 0.1, w: 4.2, h: 0.3,
        fontSize: 8.5, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
      });
    });

    slide.addText('Key Efficiency: Structured feeds use deterministic code normalization—ZERO LLM tokens spent.', {
      x: 0.8, y: 4.85, w: 8.4, h: 0.25,
      fontSize: 9, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 18, 22, true);
  }

  // ==========================================
  // SLIDE 19: Workflows 09 and 10: Plan and Resume
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Workflows 09 & 10: Plan and Resume', 'SPECIALIZED PIPELINE CAPABILITIES', false);

    // Left: 09 Plan
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 1.45, w: 4.1, h: 3.4,
      fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
    });
    slide.addText('09 WEEKLY PLAN (RETIRED PER PRD A-05)', {
      x: 0.95, y: 1.6, w: 3.8, h: 0.3,
      fontSize: 10, bold: true, color: '64748B', fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Originally scheduled 30-minute blocks for application preparation.\n' +
      '•  Retired in favor of direct 7-stage Kanban execution in /applications.\n' +
      '•  Server API routes return 410 GONE.\n' +
      '•  Route /plan performs clean server redirect to /applications.',
      {
        x: 0.95, y: 2.1, w: 3.8, h: 2.5,
        fontSize: 9.5, color: C_MUTED_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.3
      }
    );

    // Right: 10 Resume Processing
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.1, y: 1.45, w: 4.1, h: 3.4,
      fill: { color: C_LIGHT_CARD }, line: { color: C_ORANGE, width: 2 }, rectRadius: 0.08
    });
    slide.addText('10 RESUME PROCESSING (OFFLINE SAFE)', {
      x: 5.25, y: 1.6, w: 3.8, h: 0.3,
      fontSize: 10, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
    });
    slide.addText(
      '•  Deterministic in-process PDF parsing via unpdf library.\n' +
      '•  Zero external LLM dependency—immune to quotas or rate limits.\n' +
      '•  Extracts branch, CGPA, graduation year, skills, and projects.\n' +
      '•  Student reviews and confirms in onboarding Step 1.\n' +
      '•  PRIVACY GUARANTEE: Raw resume PDF is permanently purged upon confirmation.',
      {
        x: 5.25, y: 2.1, w: 3.8, h: 2.5,
        fontSize: 9.5, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.3
      }
    );

    addSlideNumber(slide, 19, 22, false);
  }

  // ==========================================
  // SLIDE 20: The 00-Series: Connectivity Checks
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'The 00-Series: Connectivity Checks', 'END-TO-END INTEGRATION TEST PROOFS', true);

    const checks = [
      { name: '00 Foundation', target: 'Webhook & Database', desc: 'Validates authenticated webhook delivery, test user validation, and atomic write confirmation.' },
      { name: '00 Gemini Connection', target: 'AI Credentials', desc: 'Validates Google AI Studio / Gemini API credentials with a live LLM chain test.' },
      { name: '00 Email Out', target: 'SMTP Gateway', desc: 'Verifies Gmail SMTP credential by sending a test message to the configured sender address.' },
      { name: '00 Email In', target: 'IMAP Mailbox', desc: 'Checks IMAP authentication, mailbox access, and plus-addressed forwarding routing.' },
      { name: '00 Calendar', target: 'Google Calendar API', desc: 'Executes an authenticated calendar write, confirms event creation, and verifies cleanup.' }
    ];

    checks.forEach((c, idx) => {
      const cy = 1.45 + idx * 0.7;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: cy, w: 8.4, h: 0.6,
        fill: { color: C_CARD_BG }, line: { color: C_BORDER_DARK, width: 1 }, rectRadius: 0.08
      });
      slide.addText(c.name, {
        x: 0.95, y: cy + 0.1, w: 2.2, h: 0.25,
        fontSize: 10.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(c.target, {
        x: 0.95, y: cy + 0.32, w: 2.2, h: 0.2,
        fontSize: 8, color: C_MUTED_LIGHT, fontFace: 'Segoe UI'
      });
      slide.addText(c.desc, {
        x: 3.3, y: cy + 0.12, w: 5.7, h: 0.4,
        fontSize: 9, color: 'E2E8F0', fontFace: 'Segoe UI'
      });
    });

    addSlideNumber(slide, 20, 22, true);
  }

  // ==========================================
  // SLIDE 21: Built to Fail Safely
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_LIGHT_BG };
    addHeader(slide, 'Built to Fail Safely', 'DEFENSIVE ARCHITECTURE GUARANTEES', false);

    const pillars21 = [
      { icon: '🔄', title: 'Idempotent Intake', desc: 'Unique request IDs ensure duplicate or overlapping submissions create exactly one database row.' },
      { icon: '🔒', title: 'Fenced Work Claims', desc: 'Claim tokens and monotonic revisions prevent stale background runs from overwriting current decisions.' },
      { icon: '👁️', title: 'Visible Failures', desc: 'Quota limits, rate limits, and interrupted states are shown transparently in the UI—never silent success.' },
      { icon: '✉️', title: 'Safe Retries', desc: 'No blind retries after uncertain socket sends. Calendar events reconcile state before create.' },
      { icon: '🔑', title: 'Redacted Secrets', desc: 'A shared sanitizer strips API keys and credentials before logging errors to the student activity stream.' },
      { icon: '🔔', title: 'Separate Consents', desc: 'Email notifications and Google Calendar sync have independent opt-ins. Downloadable .ics links always work.' }
    ];

    pillars21.forEach((p, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const px = 0.8 + col * 2.85;
      const py = 1.45 + row * 1.7;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: px, y: py, w: 2.7, h: 1.55,
        fill: { color: C_LIGHT_CARD }, line: { color: C_BORDER, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(`${p.icon}  ${p.title}`, {
        x: px + 0.15, y: py + 0.12, w: 2.4, h: 0.3,
        fontSize: 10.5, bold: true, color: C_ORANGE, fontFace: 'Segoe UI'
      });
      slide.addText(p.desc, {
        x: px + 0.15, y: py + 0.48, w: 2.4, h: 0.95,
        fontSize: 9, color: C_TEXT_DARK, fontFace: 'Segoe UI', lineSpacingMultiple: 1.15
      });
    });

    addSlideNumber(slide, 21, 22, false);
  }

  // ==========================================
  // SLIDE 22: Verified, Honest, Next
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C_DARK_BG };
    addHeader(slide, 'Verified, Honest, Next', 'STATUS & ROADMAP', true);

    // 4 Proof Metrics
    const metrics = [
      { num: '246', label: 'Node Contract Tests' },
      { num: '21', label: 'SQL Test Files' },
      { num: '70', label: 'Database Migrations' },
      { num: '18', label: 'Optimized Web Routes' }
    ];

    metrics.forEach((m, idx) => {
      const mx = 0.8 + idx * 2.12;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: mx, y: 1.35, w: 1.95, h: 0.75,
        fill: { color: C_CARD_BG }, line: { color: C_ORANGE, width: 1.5 }, rectRadius: 0.06
      });
      slide.addText(m.num, {
        x: mx, y: 1.4, w: 1.95, h: 0.38,
        fontSize: 18, bold: true, color: C_ORANGE, align: 'center', fontFace: 'Segoe UI'
      });
      slide.addText(m.label, {
        x: mx, y: 1.78, w: 1.95, h: 0.22,
        fontSize: 7.5, bold: true, color: 'CBD5E1', align: 'center', fontFace: 'Segoe UI'
      });
    });

    // 3 Status Columns
    const statusCols = [
      {
        title: 'WORKING TODAY',
        color: '10B981',
        items: [
          'Full autonomous loop: discover, extract, evaluate, ACT/ASK/SKIP.',
          'Resume-first onboarding with verified fact extraction.',
          'Approval Center with private n8n Wait resumption.',
          'Earned Autonomy: 3 decisions propose active standing rules.'
        ]
      },
      {
        title: 'BOUNDARIES (HONEST)',
        color: 'F59E0B',
        items: [
          'Demo running on localhost, Docker n8n, cloud Supabase.',
          'Free-tier AI rate limits enforce daily quota guards.',
          'LinkedIn, Unstop, Internshala via alerts and capture only.',
          'Never auto-submits applications to employers.'
        ]
      },
      {
        title: 'NEXT ROADMAP',
        color: '3B82F6',
        items: [
          'Stable hosted multi-tenant cloud deployment.',
          'Expanded official ATS integration (Workday, SmartRecruiters).',
          'Direct college training and placement cell (TPO) integration.',
          'Autonomous mock interview preparation tailored to matches.'
        ]
      }
    ];

    statusCols.forEach((sc, idx) => {
      const scx = 0.8 + idx * 2.85;
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: scx, y: 2.25, w: 2.7, h: 2.1,
        fill: { color: C_CARD_BG }, line: { color: sc.color, width: 1.5 }, rectRadius: 0.08
      });
      slide.addText(sc.title, {
        x: scx + 0.15, y: 2.38, w: 2.4, h: 0.25,
        fontSize: 9.5, bold: true, color: sc.color, fontFace: 'Segoe UI'
      });
      const bulletText = sc.items.map(it => `•  ${it}`).join('\n');
      slide.addText(bulletText, {
        x: scx + 0.15, y: 2.68, w: 2.4, h: 1.55,
        fontSize: 8, color: 'E2E8F0', fontFace: 'Segoe UI', lineSpacingMultiple: 1.15
      });
    });

    // Final Closing Strip
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 4.5, w: 8.4, h: 0.65,
      fill: { color: C_ORANGE }, line: { color: C_ORANGE }, rectRadius: 0.08
    });
    slide.addText('“AI reads. Code decides. n8n orchestrates. The student stays in control.”', {
      x: 0.95, y: 4.55, w: 6.2, h: 0.3,
      fontSize: 10.5, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI'
    });
    slide.addText('Thank you! Questions? Happy to open any node or function.', {
      x: 0.95, y: 4.85, w: 6.2, h: 0.22,
      fontSize: 8.5, color: 'FFE3D6', fontFace: 'Segoe UI'
    });
    slide.addText('Trajectory', {
      x: 7.2, y: 4.6, w: 1.9, h: 0.45,
      fontSize: 16, bold: true, color: 'FFFFFF', align: 'right', fontFace: 'Segoe UI'
    });

    addSlideNumber(slide, 22, 22, true);
  }

  // Write presentation file
  const outPath = path.resolve(__dirname, '../Trajectory-Presentation.pptx');
  await pres.writeFile({ fileName: outPath });
  console.log(`✔ PowerPoint file created successfully at: ${outPath}`);

  // Also write to web public folder so it can be downloaded directly from the web app!
  const publicOutPath = path.resolve(__dirname, '../web/public/Trajectory-Presentation.pptx');
  await pres.writeFile({ fileName: publicOutPath });
  console.log(`✔ PowerPoint file copied to web public folder at: ${publicOutPath}`);
}

createPresentation().catch(err => {
  console.error('Error generating presentation:', err);
  process.exit(1);
});
