'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { saveAlertPreferencesAction } from './actions';

export function AlertsView({
  initialEmail = true,
  initialCalendar = false,
  initialMode = 'balanced'
}: {
  initialEmail?: boolean;
  initialCalendar?: boolean;
  initialMode?: string;
}) {
  const [emailAlerts, setEmailAlerts] = useState(initialEmail);
  const [calendarSync, setCalendarSync] = useState(initialCalendar);
  const [browserPush, setBrowserPush] = useState(true);
  type AutonomyMode = 'cautious' | 'balanced' | 'autopilot';
  const initialValidMode: AutonomyMode =
    initialMode === 'cautious' || initialMode === 'autopilot' ? initialMode : 'balanced';
  const [mode, setMode] = useState<AutonomyMode>(initialValidMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modeDescriptions = {
    cautious: 'Questions every opportunity. Trajectory waits for your explicit confirmation before adding to your tracker or scheduling reminders.',
    balanced: 'The sweet spot. Trajectory auto-tracks high-confidence matches (70%+), and flags ambiguous listings into your Approvals queue.',
    autopilot: 'Hands-off speed. Trajectory schedules deadlines, manages tracker states, and runs automated evaluations for 60%+ matches.'
  };

  return (
    <div className="min-h-screen box-border pb-16 font-sans text-foreground bg-background">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-line bg-background">
        <Link href="#top" className="flex items-center gap-2.5 text-foreground no-underline group">
          <span
            aria-hidden="true"
            className="size-5 rounded-[5px] border-[1.5px] border-border bg-primary shadow-[2px_2px_0_#111111]"
          />
          <span className="font-display font-extrabold text-xl tracking-tight text-foreground">
            Trajectory
          </span>
        </Link>
        <ol className="list-none m-0 p-0 flex items-center gap-2 font-mono text-xs tracking-wider">
          <li className="flex items-center gap-1.5 px-2.5 py-1.5 border-[1.5px] border-border rounded-[8px] bg-act text-foreground font-semibold">
            ✓ PROFILE
          </li>
          <li aria-hidden="true" className="w-6 h-[1.5px] bg-border" />
          <li className="flex items-center gap-2 px-2.5 py-1.5 border-[1.5px] border-border rounded-[8px] bg-foreground text-background font-semibold">
            2 ALERTS
          </li>
        </ol>
      </header>

      {/* Main Container */}
      <main className="max-w-[860px] mx-auto px-6 pt-12 flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
            Step 2 of 2
          </span>
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl tracking-tight leading-[0.98] text-foreground m-0">
            How should we
            <br />
            reach you?
          </h1>
          <p className="text-base sm:text-lg text-ink-2 leading-relaxed m-0">
            Pick what you&apos;re comfortable with. You can change every setting later in Automation Rules.
          </p>
        </div>

        <form
          action={async (formData) => {
            setIsSubmitting(true);
            formData.set('emailAlerts', String(emailAlerts));
            formData.set('calendarSync', String(calendarSync));
            formData.set('browserPush', String(browserPush));
            formData.set('autonomyMode', mode);
            await saveAlertPreferencesAction(formData);
          }}
          className="flex flex-col gap-8"
        >
          {/* Permission Rows */}
          <div className="flex flex-col gap-3">
            {/* Email Alerts */}
            <div
              onClick={() => setEmailAlerts(!emailAlerts)}
              className={`flex items-center justify-between gap-4 p-5 border-[1.5px] border-border rounded-[14px] cursor-pointer transition-all ${
                emailAlerts
                  ? 'bg-white shadow-[4px_4px_0_#111111]'
                  : 'bg-[#F3F1EC] opacity-80'
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-display font-bold text-lg text-foreground">
                  Email alerts
                </span>
                <span className="text-sm text-ink-2">
                  New strong matches and upcoming deadline reminders delivered to your inbox.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emailAlerts}
                className="w-14 h-8 shrink-0 box-border border-[1.5px] border-border rounded-full p-1 transition-colors flex items-center"
                style={{ backgroundColor: emailAlerts ? '#FF5A1F' : '#DAD6CE' }}
              >
                <span
                  className={`size-5 rounded-full border-[1.5px] border-border bg-white shadow-sm transition-transform duration-150 ${
                    emailAlerts ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Calendar Sync */}
            <div
              onClick={() => setCalendarSync(!calendarSync)}
              className={`flex items-center justify-between gap-4 p-5 border-[1.5px] border-border rounded-[14px] cursor-pointer transition-all ${
                calendarSync
                  ? 'bg-white shadow-[4px_4px_0_#111111]'
                  : 'bg-[#F3F1EC] opacity-80'
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-display font-bold text-lg text-foreground">
                  Calendar sync
                </span>
                <span className="text-sm text-ink-2">
                  Confirmed deadlines automatically sync with Google Calendar. An offline .ics download is always available.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={calendarSync}
                className="w-14 h-8 shrink-0 box-border border-[1.5px] border-border rounded-full p-1 transition-colors flex items-center"
                style={{ backgroundColor: calendarSync ? '#FF5A1F' : '#DAD6CE' }}
              >
                <span
                  className={`size-5 rounded-full border-[1.5px] border-border bg-white shadow-sm transition-transform duration-150 ${
                    calendarSync ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Browser Notifications */}
            <div
              onClick={() => setBrowserPush(!browserPush)}
              className={`flex items-center justify-between gap-4 p-5 border-[1.5px] border-border rounded-[14px] cursor-pointer transition-all ${
                browserPush
                  ? 'bg-white shadow-[4px_4px_0_#111111]'
                  : 'bg-[#F3F1EC] opacity-80'
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="font-display font-bold text-lg text-foreground">
                  Browser notifications
                </span>
                <span className="text-sm text-ink-2">
                  A high-priority ping when an opportunity needs your answer before its deadline expires.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={browserPush}
                className="w-14 h-8 shrink-0 box-border border-[1.5px] border-border rounded-full p-1 transition-colors flex items-center"
                style={{ backgroundColor: browserPush ? '#FF5A1F' : '#DAD6CE' }}
              >
                <span
                  className={`size-5 rounded-full border-[1.5px] border-border bg-white shadow-sm transition-transform duration-150 ${
                    browserPush ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Autonomy Ladder */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <h2 className="font-display font-bold text-2xl text-foreground m-0">
                How much should Trajectory do on its own?
              </h2>
              <p className="text-sm text-ink-2 m-0">
                Trajectory never applies on your behalf without your consent. This controls when it acts automatically vs. asks you first.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'cautious' as const, name: 'Cautious', threshold: 'SCORE ≥ 80' },
                  { id: 'balanced' as const, name: 'Balanced', threshold: 'SCORE ≥ 70 (DEFAULT)' },
                  { id: 'autopilot' as const, name: 'Autopilot', threshold: 'SCORE ≥ 60' }
                ] as const
              ).map((m) => {
                const isSelected = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`p-4 border-[1.5px] border-border rounded-[12px] text-left flex flex-col gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-white shadow-[4px_4px_0_#111111] border-border'
                        : 'bg-[#F3F1EC] hover:bg-white/60'
                    }`}
                  >
                    <span className="font-display font-bold text-lg text-foreground">
                      {m.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground font-semibold">
                      {m.threshold}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-3.5 border-[1.5px] border-border rounded-[10px] bg-white text-sm text-ink-2 font-medium">
              💡 {modeDescriptions[mode]}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t-[1.5px] border-border">
            <Link
              href="/onboarding/profile"
              className="inline-flex items-center min-h-[44px] text-sm font-semibold text-ink-2 hover:text-foreground"
            >
              ← Back to Profile
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 h-12 px-7 border-[1.5px] border-border rounded-[12px] bg-primary shadow-hard text-primary-foreground font-sans font-bold text-base transition-all hover:scale-[1.01] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Finalizing setup…' : 'Finish setup →'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
