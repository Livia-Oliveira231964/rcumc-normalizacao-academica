/* ============================================================
 * API ROUTE: /api/health
 * ------------------------------------------------------------
 * Endpoint simples de health check para monitoramento.
 * Não expõe dados sensíveis.
 * ============================================================ */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'rcumc-normalizacao-academica',
    timestamp: new Date().toISOString(),
  });
}
