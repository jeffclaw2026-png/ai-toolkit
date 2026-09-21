// src/app/api/datasets/lorareview-list/route.ts
// Proxy: list datasets from a LoRA Review webapp instance (avoids browser CORS).
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = (request.nextUrl.searchParams.get('url') || '').replace(/\/+$/, '');
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }
  try {
    const resp = await fetch(`${url}/api/datasets`, { cache: 'no-store' });
    if (!resp.ok) {
      return NextResponse.json({ error: `LoRA Review responded ${resp.status}` }, { status: 502 });
    }
    const data = await resp.json();
    return NextResponse.json({ datasets: data.datasets || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 502 });
  }
}
