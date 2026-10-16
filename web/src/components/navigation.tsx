'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Briefcase,
  CheckCircle2,
  Globe,
  UserRound,
  Activity,
  Compass,
  LogOut,
  Sliders,
  Home,
  Calendar
} from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { Button } from './ui/button';

export function Navigation({ email }: { email: string }) {
  const pathname = usePathname();

  // Primary destinations
  const primaryDestinations = [
    { href: '/home', name: 'Home', icon: Home, isActive: pathname === '/home' },
    {
      href: '/opportunities',
      name: 'Opportunities',
      icon: Inbox,
      isActive: pathname === '/opportunities' || pathname === '/inbox'
    },
    { href: '/plan', name: 'Weekly Plan', icon: Calendar, isActive: pathname === '/plan' },
    { href: '/applications', name: 'Applications', icon: Briefcase, isActive: pathname === '/applications' }
  ];

  // Secondary settings & tools
  const secondarySettings = [
    { href: '/profile', name: 'Profile & Resume', icon: UserRound, isActive: pathname === '/profile' },
    { href: '/sources', name: 'Sources & Feeds', icon: Globe, isActive: pathname === '/sources' },
    { href: '/rules', name: 'Standing rules & ledger', icon: Sliders, isActive: pathname === '/rules' },
    { href: '/activity', name: 'Activity log', icon: Activity, isActive: pathname === '/activity' },
    { href: '/approvals', name: 'Approval center', icon: CheckCircle2, isActive: pathname.startsWith('/approvals') }
  ];

  return (
    <aside className="flex flex-col border-b border-border bg-white p-5 md:min-h-screen md:w-64 md:border-r md:border-b-0 md:p-6">
      <Link href="/home" className="flex items-center gap-2 text-lg font-bold">
        <Compass className="size-7 text-primary" />
        OpportunityOS
      </Link>
      <p className="mt-1 hidden text-xs text-muted-foreground md:block">Your possibilities, in one place.</p>

      {/* Primary Destinations */}
      <div className="mt-6">
        <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block mb-1.5">
          Workspace
        </p>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-1 md:flex-col">
          {primaryDestinations.map(({ href, name, icon: Icon, isActive }) => (
            <Link
              aria-current={isActive ? 'page' : undefined}
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-emerald-50 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{name}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Settings & Tools */}
      <div className="mt-6 pt-5 border-t border-border">
        <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block mb-1.5">
          Settings & Ledger
        </p>
        <nav aria-label="Settings navigation" className="flex flex-wrap gap-1 md:flex-col">
          {secondarySettings.map(({ href, name, icon: Icon, isActive }) => (
            <Link
              aria-current={isActive ? 'page' : undefined}
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                isActive ? 'bg-emerald-50 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{name}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-6 pt-4 border-t border-border md:mt-auto">
        <p className="mb-2 truncate text-[11px] text-muted-foreground" title={email}>
          {email}
        </p>
        <form action={signOut}>
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-8 text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5 mr-2" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
