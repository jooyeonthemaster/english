"use client";

// ④ 개인정보 고지 체크 — 1st-party 쿠키·브라우저 저장소·픽셀(행태정보) 사용 시 /privacy 에 고지할 항목 점검표.
// 사실을 단정하지 않는다: 방침 원문 반영 여부는 관리자가 직접 확인하고 체크한다(체크 상태는 이 브라우저 localStorage 에만 저장).

import { useMemo, useSyncExternalStore } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section } from "../shared/section";

const STORAGE_KEY = "smoat_admin_privacy_checklist_v1";

const ITEMS: Array<{ id: string; title: string; detail: string }> = [
  {
    id: "cookie",
    title: "1st-party 쿠키 smoat_vid 고지",
    detail: "방문 브라우저 식별용 난수 쿠키(유효기간 2년)를 설치·운영한다는 사실과 목적(방문·유입 통계)이 「자동 수집 장치」 항목에 있는가",
  },
  {
    id: "storage",
    title: "브라우저 저장소(localStorage) 고지",
    detail: "smoat_vid·smoat_ses(방문·세션 식별, 30분 무활동 시 새 세션)를 브라우저에 저장한다는 점을 같은 항목에 포함했는가",
  },
  {
    id: "items",
    title: "자동 수집 항목 일치",
    detail:
      "방문 페이지·체류 시간·스크롤·유입 경로(참조 사이트·UTM·광고 클릭 ID)·기기/브라우저/OS·화면 크기·언어·시간대·국가/시도/도시(접속 지역 추정, IP 원문 미저장)가 「수집하는 개인정보 항목」과 맞는가",
  },
  {
    id: "account",
    title: "로그인 후 계정 연결 목적",
    detail: "로그인·가입 뒤 방문 기록을 학원 계정과 연결해 가입·결제 전환을 분석한다는 이용 목적이 적혀 있는가",
  },
  {
    id: "pixels",
    title: "픽셀 사용 시 행태정보 고지",
    detail:
      "GA4·GTM·Google Ads·Meta·네이버·카카오·TikTok·Clarity 중 하나라도 켰다면 행태정보를 수집·이용한다는 사실, 수집하는 사업자, 목적, 보유·이용 기간을 고지했는가",
  },
  {
    id: "optout",
    title: "거부 방법 안내 — 우리 사이트의 수단까지",
    detail:
      "브라우저 설정만이 아니라 이미 구현된 수단을 방침에 적었는가: /privacy 의 「수집 거부」 토글(거부 쿠키 smoat_analytics_optout=1), 브라우저 GPC(Global Privacy Control) 신호 준수, 쿠키·저장소를 모두 막으면 수집하지 않는다는 점, 그리고 거부 시 영향",
  },
  {
    id: "revision",
    title: "개정일·시행일 갱신",
    detail: "위 내용을 반영해 방침을 고쳤다면 개정일·시행일과 변경 내역을 갱신했는가",
  },
];

// localStorage 를 외부 스토어로 구독 — 서버 렌더는 빈 체크(하이드레이션 안전), 다른 탭 변경도 반영.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function parseChecked(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function PrivacyNoticePanel() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const checked = useMemo(() => parseChecked(raw), [raw]);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 불가(시크릿 창 등) — 체크는 반영되지 않는다
    }
    listeners.forEach((cb) => cb());
  };

  const done = ITEMS.filter((i) => checked[i.id]).length;

  return (
    <Section
      title="개인정보 고지 체크"
      description="수집기·픽셀을 켜기 전에 개인정보처리방침(/privacy)에 반영됐는지 직접 확인하는 점검표"
      right={
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
        >
          /privacy 열기 <ExternalLink className="size-3" aria-hidden />
        </a>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <ShieldCheck className={cn("size-4", done === ITEMS.length ? "text-emerald-600" : "text-gray-400")} aria-hidden />
          <span className="font-semibold text-gray-700 tabular-nums">
            {done}/{ITEMS.length} 확인
          </span>
          <span className="text-gray-400">· 체크 상태는 이 브라우저에만 저장됩니다</span>
        </div>

        <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
          {ITEMS.map((item) => {
            const on = !!checked[item.id];
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50/60">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5 size-4 shrink-0 accent-blue-600"
                  />
                  <span className="min-w-0">
                    <span className={cn("block text-[13px] font-semibold", on ? "text-emerald-700" : "text-gray-800")}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-gray-500 break-words">{item.detail}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-[11.5px] leading-relaxed text-gray-400">
          이 점검표는 고지 누락을 막기 위한 참고용이며 법률 검토를 대신하지 않습니다. 실제 반영 여부는 /privacy 원문에서 확인하세요.
        </p>
      </div>
    </Section>
  );
}
