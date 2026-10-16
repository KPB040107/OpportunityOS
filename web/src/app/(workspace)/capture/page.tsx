import { requireUser } from '@/lib/auth';
import { CaptureClient } from './capture-client';

export const metadata = {
  title: 'Save to OpportunityOS · Capture Preview',
  description: 'Inspect, edit, and save captured opportunities to your inbox.'
};

export default async function CapturePage() {
  await requireUser();

  return (
    <main className="min-h-screen bg-background py-8">
      <CaptureClient />
    </main>
  );
}
