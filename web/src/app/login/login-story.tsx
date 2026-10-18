'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SortingBoard } from '@/components/sorting-board';

export function LoginStory() {
  const [progress, setProgress] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!storyRef.current) return;
        const rect = storyRef.current.getBoundingClientRect();
        const vh = window.innerHeight || 900;
        const span = Math.max(1, rect.height - vh);
        const p = Math.max(0, Math.min(1, -rect.top / span));
        setProgress(p);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const seg = (a: number, b: number) => Math.max(0, Math.min(1, (progress - a) / (b - a)));
  const band = (a: number, b: number, last = false) => {
    const inn = a <= 0 ? 1 : seg(a, a + 0.04);
    const outt = last ? 1 : 1 - seg(b - 0.04, b);
    return Math.min(inn, outt);
  };

  const o0 = band(0, 0.18);
  const o1 = band(0.2, 0.4);
  const o2 = band(0.42, 0.66);
  const o3 = band(0.68, 0.85);
  const o4 = band(0.86, 1, true);

  return (
    <>
      {/* Top Fixed Progress Bar */}
      <div
        className="fixed top-0 left-0 h-[3px] bg-primary z-50 transition-all duration-75"
        style={{ width: `${(progress * 100).toFixed(2)}%` }}
      />

      {/* Story Section */}
      <section ref={storyRef} className="relative h-[420vh]">
        <div className="sticky top-0 h-screen box-border pt-20 pb-6 px-4 flex flex-col items-center justify-center gap-4 overflow-hidden">
          {/* Animated Titles */}
          <div className="relative w-full max-w-[760px] h-[132px] text-center">
            {/* Chapter 0 */}
            <div
              className="absolute inset-0 flex flex-col items-center gap-2 transition-transform duration-75 pointer-events-none"
              style={{
                opacity: o0,
                transform: `translateY(${(1 - o0) * 14}px)`
              }}
            >
              <h1 className="font-display font-extrabold text-3xl sm:text-5xl lg:text-6xl tracking-tight leading-none text-foreground m-0">
                Hundreds of listings.
                <br />
                Half of them aren&apos;t for you.
              </h1>
              <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground animate-pulse">
                SCROLL TO SORT ↓
              </span>
            </div>

            {/* Chapter 1 */}
            <div
              className="absolute inset-0 flex flex-col items-center gap-2 transition-transform duration-75 pointer-events-none"
              style={{
                opacity: o1,
                transform: `translateY(${(1 - o1) * 14}px)`
              }}
            >
              <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-medium">
                01 · READ
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight leading-tight text-foreground m-0">
                It reads every one. Deadline, eligibility, the fine print.
              </h2>
            </div>

            {/* Chapter 2 */}
            <div
              className="absolute inset-0 flex flex-col items-center gap-2 transition-transform duration-75 pointer-events-none"
              style={{
                opacity: o2,
                transform: `translateY(${(1 - o2) * 14}px)`
              }}
            >
              <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-medium">
                02 · DECIDE
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight leading-tight text-foreground m-0">
                Then it sorts them against your real profile.
              </h2>
            </div>

            {/* Chapter 3 */}
            <div
              className="absolute inset-0 flex flex-col items-center gap-2 transition-transform duration-75 pointer-events-none"
              style={{
                opacity: o3,
                transform: `translateY(${(1 - o3) * 14}px)`
              }}
            >
              <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-medium">
                03 · FOLLOW THROUGH
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight leading-tight text-foreground m-0">
                Deadlines hit your calendar. Questions come to you. Scams never do.
              </h2>
            </div>

            {/* Chapter 4 */}
            <div
              className="absolute inset-0 flex flex-col items-center gap-2 transition-transform duration-75"
              style={{
                opacity: o4,
                transform: `translateY(${(1 - o4) * 14}px)`,
                pointerEvents: o4 > 0.5 ? 'auto' : 'none'
              }}
            >
              <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-medium">
                04 · YOUR NEXT STEP
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-4xl tracking-tight leading-tight text-foreground m-0">
                One clear next step. Every day.
              </h2>
              <a
                href="#signin"
                className="inline-flex items-center min-h-[44px] text-sm font-bold text-accent-text hover:underline"
              >
                Get started ↓
              </a>
            </div>
          </div>

          {/* Interactive Sorting Board */}
          <div className="w-full max-w-[1100px] shrink-0">
            <SortingBoard progress={progress} />
          </div>
        </div>
      </section>
    </>
  );
}
