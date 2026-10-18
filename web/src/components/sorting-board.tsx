'use client';

import React, { useMemo } from 'react';

export interface SortingBoardProps {
  progress: number; // 0 to 1
  className?: string;
}

const RAW_DATA = [
  ['INTERNSHIP', 'SDE Intern · Bengaluru', 'act', 'Tracking · apply by Fri'],
  ['ROLE', 'Product Intern · Remote', 'ask', 'Graduating in 2027?'],
  ['LISTING', 'Pay ₹999 to apply', 'skip', 'Upfront fee — likely scam'],
  ['HACKATHON', '48h Fintech Build', 'act', 'On your calendar · Oct 27'],
  ['INTERNSHIP', 'ML Intern · Hyderabad', 'ask', 'Is your CGPA 7.5+?'],
  ['JOB', 'Senior SDE · 5 yrs exp', 'skip', 'Needs 5 years experience'],
  ['INTERNSHIP', 'Data Analyst Intern', 'act', 'Strong match · 91'],
  ['LISTING', 'Campus Ambassador', 'skip', 'Outside your interests'],
  ['HACKATHON', 'Global AI Challenge', 'ask', 'Are you 18 or older?'],
  ['JOB', 'Associate Engineer · Pune', 'act', 'Eligible · reminder set'],
  ['INTERNSHIP', 'Design Intern · Delhi', 'skip', 'Deadline passed Sep 30'],
  ['INTERNSHIP', 'Backend Intern · Remote', 'ask', 'Comfortable with Go?'],
  ['LISTING', 'SDE Intern · Bengaluru', 'skip', 'Duplicate listing'],
  ['INTERNSHIP', 'Frontend Intern · Remote', 'act', 'Strong match · 88'],
  ['ROLE', 'Research Intern · IISc', 'ask', 'Can you relocate?'],
  ['LISTING', 'Unpaid · ₹2,000 kit fee', 'skip', 'Asks you to pay'],
  ['HACKATHON', 'Smart Cities Hack', 'act', 'Team slot saved'],
  ['JOB', 'Sales Exec · Field', 'skip', 'Not your field']
] as const;

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const laneX = { act: 60, ask: 490, skip: 920 };

export function SortingBoard({ progress = 0, className = '' }: SortingBoardProps) {
  const items = useMemo(() => {
    const laneCount = { act: 0, ask: 0, skip: 0 };
    return RAW_DATA.map((d, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const ax = 10 + col * 185 + (pseudoRandom(i + 1) - 0.5) * 80;
      const ay = 40 + row * 205 + (pseudoRandom(i + 7) - 0.5) * 120;
      const ar = (pseudoRandom(i + 13) - 0.5) * 28;
      const gc = i % 4;
      const gr = Math.floor(i / 4);
      const bx = 70 + gc * 270;
      const by = 110 + gr * 100;
      const lane = d[2] as 'act' | 'ask' | 'skip';
      const li = laneCount[lane]++;
      const cx = laneX[lane];
      const cy = 130 + li * 74;
      return {
        kind: d[0],
        title: d[1],
        lane,
        note: d[3],
        ax,
        ay,
        ar,
        bx,
        by,
        cx,
        cy,
        hero: i === 0
      };
    });
  }, []);

  const P = Math.max(0, Math.min(1, Number(progress) || 0));

  const seg = (a: number, b: number) => Math.max(0, Math.min(1, (P - a) / (b - a)));
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const mixHex = (h1: string, h2: string, t: number) => {
    const f = (h: string, k: number) => parseInt(h.substring(k, k + 2), 16);
    const r = Math.round(f(h1, 1) + (f(h2, 1) - f(h1, 1)) * t);
    const g = Math.round(f(h1, 3) + (f(h2, 3) - f(h1, 3)) * t);
    const b = Math.round(f(h1, 5) + (f(h2, 5) - f(h1, 5)) * t);
    return `rgb(${r},${g},${b})`;
  };

  const e1 = ease(seg(0.18, 0.34));
  const e2 = ease(seg(0.42, 0.58));
  const e4 = ease(seg(0.66, 0.74));
  const e3 = ease(seg(0.86, 0.96));

  const tint = { act: '#FFE3D6', ask: '#E1E8FF', skip: '#ECEAE5' };
  const tagColor = { act: '#C23E0C', ask: '#2445C8', skip: '#5F5B54' };
  const tagText = { act: 'ACT', ask: 'ASK', skip: 'SKIP' };
  const noteColor = { act: '#111111', ask: '#2445C8', skip: '#5F5B54' };

  const chips = items.map((it) => {
    let x = lerp(lerp(it.ax, it.bx, e1), it.cx, e2);
    let y = lerp(lerp(it.ay, it.by, e1), it.cy, e2);
    const r = it.ar * (1 - e1);
    let s = 1;
    let op = 1;

    if (it.hero) {
      x = lerp(x, 490, e3);
      y = lerp(y, 290, e3);
      s = lerp(1, 1.7, e3);
    } else {
      op = 1 - 0.88 * e3;
      if (it.lane === 'skip') op *= 1 - 0.45 * e4;
    }

    return {
      kind: it.kind,
      title: it.title,
      note: it.note,
      tag: tagText[it.lane],
      left: `${(x / 12).toFixed(3)}%`,
      top: `${(y / 6.8).toFixed(3)}%`,
      transform: `rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})`,
      opacity: op,
      zIndex: it.hero ? 30 : 1,
      bg: mixHex('#FFFFFF', tint[it.lane], e2),
      tagColor: tagColor[it.lane],
      tagOp: e2,
      t1: 1 - e4,
      t2: e4,
      noteColor: noteColor[it.lane]
    };
  });

  const laneOp = e2 * (1 - e3);
  const lanes = [
    { name: 'Act', sub: 'WE HANDLE IT', color: '#C23E0C', left: '5%', op: laneOp },
    { name: 'Ask', sub: 'NEEDS YOUR ANSWER', color: '#2445C8', left: '40.83%', op: laneOp },
    { name: 'Skip', sub: 'NOT WORTH YOUR TIME', color: '#5F5B54', left: '76.67%', op: laneOp }
  ];

  const scanTop = `${(12 + 76 * seg(0.24, 0.4)).toFixed(2)}%`;
  const scanOp = Math.min(seg(0.22, 0.26), 1 - seg(0.38, 0.42));

  return (
    <div
      role="img"
      aria-label="A pile of internship, job and hackathon listings being read and sorted into Act, Ask and Skip lanes."
      className={`relative w-full aspect-[1200/680] font-sans text-foreground overflow-hidden select-none ${className}`}
      style={{ containerType: 'inline-size' }}
    >
      {/* Background Dot Grid */}
      <div
        className="absolute inset-0 rounded-[16px] opacity-70 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#CFCAC0 1px, transparent 1.2px)',
          backgroundSize: '22px 22px'
        }}
      />

      {/* Lanes Headers */}
      {lanes.map((l) => (
        <div
          key={l.name}
          className="absolute top-[4.5%] w-[18.4%] flex flex-col gap-[0.3cqw] pointer-events-none transition-opacity duration-200"
          style={{ left: l.left, opacity: l.op }}
        >
          <span className="font-display font-extrabold text-[2.6cqw] leading-none" style={{ color: l.color }}>
            {l.name}
          </span>
          <span className="font-mono text-[0.9cqw] tracking-[0.06em] text-muted-foreground uppercase">
            {l.sub}
          </span>
        </div>
      ))}

      {/* Laser Scan Line */}
      <div
        className="absolute left-[3%] right-[3%] h-[2px] bg-primary pointer-events-none transition-all duration-75"
        style={{
          top: scanTop,
          opacity: scanOp,
          boxShadow: '0 0 18px 4px rgba(255, 90, 31, 0.45)'
        }}
      />

      {/* Chips */}
      {chips.map((c, i) => (
        <div
          key={i}
          className="absolute w-[18.4%] box-border p-[0.8cqw_1cqw] border-[1.5px] border-border rounded-[0.8cqw] shadow-[0.3cqw_0.3cqw_0_#111111] flex flex-col gap-[0.35cqw] pointer-events-none transition-all duration-75"
          style={{
            left: c.left,
            top: c.top,
            transform: c.transform,
            opacity: c.opacity,
            zIndex: c.zIndex,
            backgroundColor: c.bg
          }}
        >
          <div className="flex justify-between gap-[0.6cqw] font-mono text-[0.85cqw] tracking-[0.06em]">
            <span className="text-muted-foreground whitespace-nowrap">{c.kind}</span>
            <span style={{ color: c.tagColor, opacity: c.tagOp }} className="font-semibold">
              {c.tag}
            </span>
          </div>
          <div className="relative h-[1.5cqw] text-[1.15cqw] font-semibold leading-[1.3]">
            <span
              className="absolute inset-0 whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ opacity: c.t1 }}
            >
              {c.title}
            </span>
            <span
              className="absolute inset-0 whitespace-nowrap overflow-hidden text-ellipsis font-medium"
              style={{ opacity: c.t2, color: c.noteColor }}
            >
              {c.note}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
