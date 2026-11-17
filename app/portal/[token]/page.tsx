import type { Metadata } from 'next';
import PortalClientView from '@/components/PortalClientView';
import { getDb } from '@/db/client';
import { ensureDemoSeeded } from '@/db/seed';
import {
  getPortalReceiptService,
  type PortalReceiptPayload,
} from '@/services/portal.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Delivery Receipt — Client Portal',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function ClientPortalPage(context: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await context.params;
  const db = await getDb();
  await ensureDemoSeeded(db);

  let initialPayload: PortalReceiptPayload | null = null;
  let initialError: string | null = null;

  try {
    initialPayload = await getPortalReceiptService(db, token);
  } catch (err) {
    initialError =
      err instanceof Error ? err.message : 'Unable to open portal receipt.';
  }

  return (
    <PortalClientView
      token={token}
      initialPayload={initialPayload}
      initialError={initialError}
    />
  );
}
