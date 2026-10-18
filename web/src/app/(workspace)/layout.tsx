import { requireUser } from '@/lib/auth';
import { Navigation } from '@/components/navigation';

export default async function WorkspaceLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <Navigation email={user.email || ''} />
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
