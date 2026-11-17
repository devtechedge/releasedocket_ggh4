import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import { requireSessionContext } from '@/services/auth.service';
import { generateRetainerReportService } from '@/services/reports.service';

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId');
    const format = req.nextUrl.searchParams.get('format');
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const report = await generateRetainerReportService(db, ctx, { clientId });

    if (format === 'markdown') {
      return new NextResponse(report.markdownExport, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="releasedocket-retainer-snapshot.md"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err) {
    return handleApiError(err);
  }
}
