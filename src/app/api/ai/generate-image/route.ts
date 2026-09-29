import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/atlas';
import { getStaffSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 레거시 AtlasCloud 엔드포인트 — src 안에 호출처가 없다(26-09-29 확인).
// 크레딧 차감이 없는 과금 경로라 최소한 스태프 로그인만은 요구한다.
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

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
