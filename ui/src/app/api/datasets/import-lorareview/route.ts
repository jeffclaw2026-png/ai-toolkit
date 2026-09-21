// src/app/api/datasets/import-lorareview/route.ts
// Import images (keep-status only) from a LoRA Dataset Review webapp instance.
// Flow: POST { url, dataset, includeCaptions } -> fetch export tar.gz -> extract images
// into datasets root -> optionally write merged-caption .txt sidecars.
import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';
import { spawn } from 'child_process';

function cleanName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

async function extractTar(tarPath: string, destDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', tarPath, '-C', destDir]);
    proc.on('error', reject);
    proc.on('exit', code => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url: string = (body.url || '').replace(/\/+$/, '');
    const dataset: string = body.dataset || '';
    const includeCaptions: boolean = body.includeCaptions !== false;
    if (!url || !dataset) {
      return NextResponse.json({ error: 'url and dataset are required' }, { status: 400 });
    }

    const datasetsRoot = await getDatasetsRoot();
    if (!datasetsRoot) {
      return NextResponse.json({ error: 'Datasets path not found' }, { status: 500 });
    }
    const destDir = path.resolve(datasetsRoot, cleanName(dataset));
    if (path.dirname(destDir) !== datasetsRoot || destDir === datasetsRoot) {
      return NextResponse.json({ error: 'Invalid dataset name' }, { status: 400 });
    }

    // 1) Stream export tar.gz (keep-mode) from LoRA Review to a temp file
    const exportUrl = `${url}/api/datasets/${encodeURIComponent(dataset)}/export?mode=keep`;
    const tmpTar = path.join('/tmp', `lorareview_${cleanName(dataset)}_${Date.now()}.tar.gz`);
    const tmpFd = await import('fs/promises').then(m => m.open(tmpTar, 'w'));
    const resp = await fetch(exportUrl, { method: 'POST' });
    if (!resp.ok || !resp.body) {
      await tmpFd.close();
      return NextResponse.json({ error: `LoRA Review export failed: ${resp.status}` }, { status: 502 });
    }
    const reader = resp.body.getReader();
    let imported = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await tmpFd.writeFile(value);
      imported += value.length;
    }
    await tmpFd.close();

    // 2) Extract images into the dataset folder
    await mkdir(destDir, { recursive: true });
    await extractTar(tmpTar, destDir);

    // 3) Captions: pull merged caption text per image and write .txt sidecars
    let captions = 0;
    if (includeCaptions) {
      try {
        const imgsResp = await fetch(`${url}/api/datasets/${encodeURIComponent(dataset)}/images?limit=10000`);
        if (imgsResp.ok) {
          const data = await imgsResp.json();
          for (const img of data.images || []) {
            if (img.status !== 'keep' || !img.caption) continue;
            const base = img.filename.replace(/\.[^.]+$/, '');
            const txtPath = path.join(destDir, `${base}.txt`);
            await writeFile(txtPath, String(img.caption), 'utf-8');
            captions++;
          }
        }
      } catch (e) {
        console.error('caption fetch failed (images imported without captions)', e);
      }
    }

    // cleanup temp
    import('fs').then(fs => fs.unlink(tmpTar, () => {}));

    return NextResponse.json({
      success: true,
      dataset: cleanName(dataset),
      bytes: imported,
      captions,
    });
  } catch (error: any) {
    console.error('import-lorareview error:', error);
    return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}

export const config = {
  api: { bodyParser: false },
};
