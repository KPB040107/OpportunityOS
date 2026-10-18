import { requireUser } from '@/lib/auth';
import { CuratingView } from './curating-view';

export const dynamic = 'force-dynamic';

export default async function OnboardingDonePage() {
  await requireUser();
  return <CuratingView />;
}
