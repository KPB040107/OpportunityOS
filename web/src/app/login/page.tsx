import Link from 'next/link';
import { LoginForm } from './form';
import { LoginStory } from './login-story';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="bg-background text-foreground font-sans min-h-screen">
      {/* Fixed Sticky Header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-4 px-6 py-4 bg-[#F3F1EC]/90 backdrop-blur-sm border-b border-line">
        <Link href="#top" className="flex items-center gap-2.5 text-foreground no-underline group">
          <span
            aria-hidden="true"
            className="size-5 rounded-[5px] border-[1.5px] border-border bg-primary shadow-[2px_2px_0_#111111] transition-transform group-hover:scale-105"
          />
          <span className="font-display font-extrabold text-xl tracking-tight text-foreground">
            Trajectory
          </span>
        </Link>
        <a
          href="#signin"
          className="inline-flex items-center justify-center min-h-[40px] px-4 border-[1.5px] border-border rounded-[10px] bg-white text-foreground text-xs font-mono font-semibold uppercase tracking-wider shadow-[2px_2px_0_#111111] hover:bg-muted transition-all"
        >
          Sign in
        </a>
      </header>

      {/* Scroll Story with Sorting Board */}
      <LoginStory />

      {/* Sign In & Create Account Section */}
      <section
        id="signin"
        className="min-h-screen box-border py-24 px-4 flex flex-wrap items-center justify-center gap-12 lg:gap-16 border-t-[1.5px] border-border bg-background"
      >
        {/* Left Headline */}
        <div className="flex-1 min-w-[320px] max-w-[480px] flex flex-col gap-4">
          <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
            For Students · Internships · Jobs · Hackathons
          </span>
          <h2 className="font-display font-extrabold text-4xl sm:text-6xl tracking-tight leading-[0.95] text-foreground m-0">
            Stop searching.
            <br />
            Start{' '}
            <span className="bg-primary px-2 border-[1.5px] border-border shadow-[3px_3px_0_#111111] inline-block">
              deciding.
            </span>
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-ink-2 m-0">
            Upload your resume once. Trajectory monitors campus and company channels, verifies every listing against your confirmed facts, and tells you exactly what to do next.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {['100% Private (PDF purged)', 'Zero Hallucinations', 'Grounded Evidence'].map((badge) => (
              <span
                key={badge}
                className="px-2.5 py-1 rounded-[6px] border-[1.5px] border-border bg-white font-mono text-[11px] font-medium text-muted-foreground shadow-[1px_1px_0_#111111]"
              >
                ✓ {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Right Form Card */}
        <div className="w-full max-w-[440px] p-7 border-[1.5px] border-border rounded-[16px] bg-white shadow-hard-lg">
          <LoginForm next={next} />
        </div>
      </section>
    </div>
  );
}
