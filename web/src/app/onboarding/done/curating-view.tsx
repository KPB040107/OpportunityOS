'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SortingBoard } from '@/components/sorting-board';

const PHRASES = [
  'Reading the fine print so you don’t have to…',
  'Checking if “freshers welcome” really means freshers…',
  'Untangling eligibility criteria…',
  'Binning the pay-to-apply scams…',
  'Asking hackathons when they actually close…',
  'Putting deadlines on your calendar…'
];

export function CuratingView() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const startAnimation = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let startTimestamp: number | null = null;
    const DURATION = 9500; // ~9.5 seconds

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const k = Math.min(1, elapsed / DURATION);
      setProgress(k);

      if (k < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    startAnimation();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isWorking = progress < 1;
  const isDone = progress >= 1;

  const phraseIndex = Math.min(
    PHRASES.length - 1,
    Math.floor(progress * PHRASES.length)
  );

  return (
    <div className="min-h-screen box-border py-10 px-4 flex flex-col items-center justify-center gap-6 font-sans text-foreground bg-background">
      {/* Title & Status */}
      <div className="flex flex-col items-center gap-3 text-center min-h-[116px] max-w-[760px]">
        {isWorking ? (
          <>
            <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-primary animate-pulse"
              />
              Sorting listings for you
            </span>
            <p
              aria-live="polite"
              className="font-display font-bold text-2xl sm:text-4xl lg:text-5xl tracking-tight leading-tight text-foreground m-0 transition-all"
            >
              {PHRASES[phraseIndex]}
            </p>
          </>
        ) : (
          <>
            <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
              All Sorted
            </span>
            <h1 className="font-display font-extrabold text-3xl sm:text-5xl lg:text-6xl tracking-tight leading-none text-foreground m-0">
              Here&apos;s your first next step.
            </h1>
          </>
        )}
      </div>

      {/* The Animated Sorting Board */}
      <div className="w-full max-w-[1100px] border-[1.5px] border-border rounded-[16px] bg-white shadow-hard-lg p-2 sm:p-4">
        <SortingBoard progress={progress} />
      </div>

      {/* Completion Buttons & Skip */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {isDone ? (
          <>
            <Link
              href="/home"
              className="inline-flex items-center justify-center h-12 px-7 border-[1.5px] border-border rounded-[12px] bg-primary shadow-hard text-primary-foreground font-sans font-bold text-base transition-all hover:scale-[1.02] active:translate-x-0.5 active:translate-y-0.5 no-underline"
            >
              Open my dashboard →
            </Link>
            <button
              type="button"
              onClick={() => {
                setProgress(0);
                startAnimation();
              }}
              className="h-12 px-5 border-[1.5px] border-border rounded-[12px] bg-white text-foreground font-sans text-sm font-semibold hover:bg-muted transition-all"
            >
              Replay
            </button>
          </>
        ) : (
          <Link
            href="/home"
            className="text-xs font-mono font-medium text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Skip animation & go to dashboard →
          </Link>
        )}
      </div>
    </div>
  );
}
