import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/atlas';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, size, quality, outputFormat, enableBase64 } = body ?? {};

    if (typeof prompt !== 'string' || prompt.length < 10) {
      return NextResponse.json({ error: 'prompt is required (min 10 chars)' }, { status: 400 });
    }

    const result = await generateImage({
      prompt,
      size,
      quality,
      outputFormat,
      enableBase64
    });

    return NextResponse.json({
      ok: true,
      predictionId: result.predictionId,
      outputs: result.outputs.map(toDisplayImageUrl),
      rawOutputs: result.outputs
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[/api/ai/generate-image] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function toDisplayImageUrl(output: string) {
  if (output.startsWith('data:')) {
    return output;
  }

  try {
    const url = new URL(output);
    if (url.hostname === 'atlas-img.oss-us-west-1.aliyuncs.com' || url.hostname.endsWith('.atlascloud.ai')) {
      return `/api/ai/image-proxy?url=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    return output;
  }

  return output;
}
