/**
 * IndexNow — 변경된 URL 을 검색엔진에 즉시 push 통지하는 오픈 프로토콜.
 *
 * 지원 엔진: Bing, 네이버, Yandex, Seznam, Yep (구글은 미지원 → GSC sitemap 으로 별도).
 * 네이버는 2023-07-26 부터 공식 지원 — 한국 영어학원 타깃에 가장 큰 실익.
 *
 * 동작: api.indexnow.org 글로벌 엔드포인트로 보내면 참여 엔진 전체로 전파되며,
 * 한국 시장 안정성을 위해 네이버 전용 엔드포인트로도 직접 핑한다.
 *
 * 키 검증: keyLocation(기본 https://<host>/<key>.txt)이 key 문자열을 반환해야 한다.
 * 서버 전용(키는 공개되어도 무방한 설계지만 호출은 서버에서).
 */

// 서버 전용 모듈(라우트 핸들러/스크립트에서만 호출). INDEXNOW_KEY 는 서버 env.
import { SITE_URL } from "@/lib/seo/config";

// 하드코딩 폴백(config.ts 소유확인 코드와 동일 패턴): env 미설정이어도 prod 에서
// IndexNow 가 즉시 동작하도록 기본 키를 둔다. public/<key>.txt 가 이 값과 반드시
// 일치해야 검증을 통과한다(키 회전 시 env INDEXNOW_KEY 설정 + public 파일도 교체).
const DEFAULT_INDEXNOW_KEY = "e39beb436962f916e5a50f6bd74c4c4a";
const INDEXNOW_KEY = (process.env.INDEXNOW_KEY || DEFAULT_INDEXNOW_KEY).trim();

const HOST = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "www.smoat.co.kr";
  }
})();

const KEY_LOCATION =
  (process.env.INDEXNOW_KEY_LOCATION || "").trim() ||
  (INDEXNOW_KEY ? `${SITE_URL}/${INDEXNOW_KEY}.txt` : "");

const ENDPOINTS = [
  "https://api.indexnow.org/indexnow", // 글로벌(전 참여엔진 전파)
  "https://searchadvisor.naver.com/indexnow", // 네이버 직접(한국 타깃 보강)
];

export type IndexNowResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  submitted: number;
  responses: { endpoint: string; status: number; ok: boolean }[];
};

/** 같은 호스트의 절대 URL 만 통지 대상으로 허용(외부/상대 URL 방어). */
function sanitizeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (parsed.host !== HOST) continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      out.push(parsed.href);
    } catch {
      // 무시
    }
  }
  return out.slice(0, 10000); // IndexNow 일괄 상한
}

/**
 * 변경/신규 URL 일괄 통지. 키 미설정이면 안전하게 skip.
 */
export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  if (!INDEXNOW_KEY) {
    return {
      ok: false,
      skipped: true,
      reason: "INDEXNOW_KEY 미설정",
      submitted: 0,
      responses: [],
    };
  }

  const urlList = sanitizeUrls(urls);
  if (urlList.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "유효한 동일호스트 URL 없음",
      submitted: 0,
      responses: [],
    };
  }

  const body = JSON.stringify({
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  });

  const responses = await Promise.all(
    ENDPOINTS.map(async (endpoint) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
          body,
        });
        return { endpoint, status: res.status, ok: res.ok };
      } catch {
        return { endpoint, status: 0, ok: false };
      }
    }),
  );

  return {
    ok: responses.some((r) => r.ok),
    submitted: urlList.length,
    responses,
  };
}

/** 키/키위치가 환경에 구성됐는지(런북·헬스체크용). */
export function indexNowConfig() {
  return {
    configured: Boolean(INDEXNOW_KEY),
    host: HOST,
    keyLocation: KEY_LOCATION,
    endpoints: ENDPOINTS,
  };
}
