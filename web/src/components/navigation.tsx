'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Inbox,
  Briefcase,
  CheckCircle2,
  Globe,
  UserRound,
  Activity,
  LogOut,
  Sliders,
  Home,
  GraduationCap,
  Award,
  Link2
} from 'lucide-react';
import { signOut } from '@/app/login/actions';

function NavigationLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentType = searchParams.get('type');

  // Primary destinations (Workspace)
  const primaryDestinations = [
    { href: '/home', name: 'Home', icon: Home, isActive: pathname === '/home' },
    {
      href: '/opportunities',
      name: 'Opportunities',
      icon: Inbox,
      isActive: (pathname === '/opportunities' || pathname === '/inbox') && !currentType
    },
    {
      href: '/opportunities?type=internship',
      name: 'Internships',
      icon: GraduationCap,
      isActive: (pathname === '/opportunities' || pathname === '/inbox') && currentType === 'internship'
    },
    {
      href: '/opportunities?type=job',
      name: 'Jobs',
      icon: Briefcase,
      isActive: (pathname === '/opportunities' || pathname === '/inbox') && currentType === 'job'
    },
    {
      href: '/opportunities?type=hackathon',
      name: 'Hackathons',
      icon: Award,
      isActive: (pathname === '/opportunities' || pathname === '/inbox') && currentType === 'hackathon'
    },
    { href: '/approvals', name: 'Approvals', icon: CheckCircle2, isActive: pathname.startsWith('/approvals') },
    { href: '/applications', name: 'Applications', icon: CheckCircle2, isActive: pathname === '/applications' },
    { href: '/activity', name: 'Activity', icon: Activity, isActive: pathname === '/activity' }
  ];

  // Secondary settings & tools (Setup)
  const secondarySettings = [
    { href: '/profile', name: 'Profile & resume', icon: UserRound, isActive: pathname === '/profile' },
    { href: '/rules', name: 'Automation rules', icon: Sliders, isActive: pathname === '/rules' },
    { href: '/sources', name: 'Sources & feeds', icon: Globe, isActive: pathname === '/sources' },
    { href: '/sources#capture', name: 'Capture tools', icon: Link2, isActive: pathname === '/capture' }
  ];

  return (
    <>
      {/* Workspace */}
      <div className="mt-6">
        <p className="px-2.5 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground mb-2">
          Workspace
        </p>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-1.5 md:flex-col">
          {primaryDestinations.map(({ href, name, icon: Icon, isActive }) => (
            <Link
              aria-current={isActive ? 'page' : undefined}
              key={href}
              href={href}
              className={`flex items-center justify-between gap-3 min-h-[40px] px-3 py-1.5 rounded-[10px] border-[1.5px] text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-foreground border-border font-bold shadow-[2px_2px_0_#111111]'
                  : 'bg-transparent text-ink-2 border-transparent hover:border-line hover:bg-white/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`size-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={isActive ? 'text-foreground font-bold' : ''}>{name}</span>
              </div>
            </Link>
          ))}
        </nav>
      </div>

      {/* Setup */}
      <div className="mt-6 pt-5 border-t border-line">
        <p className="px-2.5 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground mb-2">
          Setup
        </p>
        <nav aria-label="Settings navigation" className="flex flex-wrap gap-1.5 md:flex-col">
          {secondarySettings.map(({ href, name, icon: Icon, isActive }) => (
            <Link
              aria-current={isActive ? 'page' : undefined}
              key={href}
              href={href}
              className={`flex items-center gap-2.5 min-h-[38px] px-3 py-1.5 rounded-[10px] border-[1.5px] text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white text-foreground border-border font-bold shadow-[2px_2px_0_#111111]'
                  : 'bg-transparent text-ink-2 border-transparent hover:border-line hover:bg-white/60'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{name}</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

export function Navigation({ email }: { email: string }) {
  return (
    <aside className="flex flex-col border-b-[1.5px] border-border bg-[#F3F1EC] p-5 md:min-h-screen md:w-64 md:border-r-[1.5px] md:border-b-0 md:p-5 shrink-0">
      <Link href="/home" className="flex items-center gap-2.5 px-1 text-foreground no-underline group">
        <span
          aria-hidden="true"
          className="size-5 rounded-[5px] border-[1.5px] border-border bg-primary shadow-[2px_2px_0_#111111] transition-transform group-hover:scale-105"
        />
        <span className="font-display font-extrabold text-xl tracking-tight text-foreground">
          Trajectory
        </span>
      </Link>
      <p className="mt-1 hidden px-1 text-xs text-muted-foreground font-mono md:block">
        The Autonomous Opportunity System
      </p>

      <Suspense fallback={<div className="mt-6 animate-pulse text-xs text-muted-foreground font-mono">Loading navigation…</div>}>
        <NavigationLinks />
      </Suspense>

      <div className="mt-6 pt-4 border-t border-line md:mt-auto">
        <div className="rounded-[12px] border-[1.5px] border-border bg-white p-3 shadow-[2px_2px_0_#111111]">
          <p className="truncate text-xs font-semibold text-foreground" title={email}>
            {email.split('@')[0]}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {email}
          </p>
          <form action={signOut} className="mt-2 pt-2 border-t border-line">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent-text transition-colors"
            >
              <LogOut className="size-3" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
