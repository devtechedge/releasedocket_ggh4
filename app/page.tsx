import MarketingLanding from '@/components/MarketingLanding';
import { getDb } from '@/db/client';
import { ensureDemoSeeded } from '@/db/seed';
import {
  getOptionalSessionContext,
  isDemoModeAllowed,
} from '@/services/auth.service';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const db = await getDb();
  await ensureDemoSeeded(db);
  const session = await getOptionalSessionContext(db);
  const demoAllowed = isDemoModeAllowed();

  return (
    <MarketingLanding
      demoAllowed={demoAllowed}
      isAuthenticated={Boolean(session)}
    />
  );
}
