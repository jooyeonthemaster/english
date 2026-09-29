import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_IMAGE_HOSTS = new Set([
  'atlas-img.oss-us-west-1.aliyuncs.com',
  'cdn.atlascloud.ai'
]);

// 레거시 AtlasCloud 이미지 프록시 — src 안에 호출처가 없다(26-09-29 확인).
// 무인증 공개 프록시로 남겨 두지 않도록 스태프 로그인을 요구한다.
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const src = req.nextUrl.searchParams.get('url');
    if (!src) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const url = new URL(src);
    if (url.protocol !== 'https:' || !isAllowedImageHost(url.hostname)) {
      return NextResponse.json({ error: 'image host is not allowed' }, { status: 400 });
    }

    const upstream = await fetch(url.toString(), {
      headers: {
        Referer: 'https://api.atlascloud.ai/'
      },
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain; charset=utf-8'
        }
      });
    }

    const contentType = upstream.headers.get('Content-Type') ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'upstream did not return an image' }, { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'Content-Length': String(bytes.byteLength)
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isAllowedImageHost(hostname: string) {
  return ALLOWED_IMAGE_HOSTS.has(hostname) || hostname.endsWith('.atlascloud.ai');
}
