'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, Briefcase, CheckCircle2, Globe, UserRound, Activity, Compass, LogOut, Sliders } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { Button } from './ui/button';

export function Navigation({ email }: { email: string }) {
  const pathname = usePathname();
  const navItems = [
    { href: '/inbox', name: 'Opportunity inbox', icon: Inbox },
    { href: '/applications', name: 'Applications tracker', icon: Briefcase },
    { href: '/approvals', name: 'Approval center', icon: CheckCircle2 },
    { href: '/rules', name: 'Standing rules', icon: Sliders },
    { href: '/sources', name: 'Saved sources', icon: Globe },
    { href: '/profile', name: 'My profile', icon: UserRound },
    { href: '/activity', name: 'Activity', icon: Activity }
  ];

  return (
    <aside className="flex flex-col border-b border-border bg-white p-5 md:min-h-screen md:w-64 md:border-r md:border-b-0 md:p-7">
      <Link href="/inbox" className="flex items-center gap-2 text-lg font-bold">
        <Compass className="size-7 text-primary" />
        OpportunityOS
      </Link>
      <p className="mt-2 hidden text-xs text-muted-foreground md:block">Your possibilities, in one place.</p>
      <nav aria-label="Main navigation" className="mt-7 flex flex-wrap gap-2 md:flex-col">
        {navItems.map(({ href, name, icon: Icon }) => (
          <Link
            aria-current={pathname === href ? 'page' : undefined}
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
              pathname === href ? 'bg-emerald-50 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className="size-4" />
            <span>{name}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-7 md:mt-auto">
        <p className="mb-2 break-all text-xs text-muted-foreground">{email}</p>
        <form action={signOut}>
          <Button variant="ghost" size="sm">
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
