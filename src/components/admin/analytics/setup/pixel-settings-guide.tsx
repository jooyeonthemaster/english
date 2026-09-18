"use client";

// 유입 분석 › 설정 › 픽셀 — 전환 이벤트 매핑표·설치 확인 방법·운영자 조치. 계약 §8.3·§8.4·§14 D11·D13
// 좁은 화면(<640px)에서는 4열 표가 2열만 보이고 스크롤 단서도 없어 픽셀별 카드로 쌓는다(U8-6).

import { AlertTriangle, Info } from "lucide-react";
import { Section } from "../shared/section";
import { CHECKS, ExtLink, MAPPING, MAPPING_HEADS, OPERATOR_TODOS } from "./pixel-settings-meta";

function MappingTable() {
  return (
    <table className="w-full min-w-[520px] text-left">
      <thead>
        <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400">
          {MAPPING_HEADS.map((h) => (
            <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {MAPPING.map((row) => (
          <tr key={row[0]} className="border-b border-gray-50 last:border-0">
            <td className="px-2 py-2 text-[12.5px] font-semibold text-gray-800 whitespace-nowrap">{row[0]}</td>
            {row.slice(1).map((cell, i) => (
              <td key={i} className="px-2 py-2 font-mono text-[11.5px] text-gray-600 whitespace-nowrap">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MappingCards() {
  return (
    <ul className="space-y-2">
      {MAPPING.map((row) => (
        <li key={row[0]} className="rounded-lg border border-gray-100 px-3 py-2.5">
          <div className="text-[12.5px] font-semibold text-gray-800">{row[0]}</div>
          <dl className="mt-1.5 space-y-1">
            {row.slice(1).map((cell, i) => (
              <div key={i} className="flex gap-2">
                <dt className="w-16 shrink-0 text-[11px] text-gray-400">{MAPPING_HEADS[i + 1]}</dt>
                <dd className="min-w-0 flex-1 font-mono text-[11.5px] break-words text-gray-600">{cell}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function PixelGuide() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="전환 이벤트 매핑" description="1st-party 서버 판정(§6) 후 각 픽셀로 발사하는 이벤트">
        <div className="hidden overflow-x-auto sm:block">
          <MappingTable />
        </div>
        <div className="sm:hidden">
          <MappingCards />
        </div>
      </Section>

      <Section title="설치 확인 방법" description="저장 후 최대 5분(CDN 캐시) 뒤 사이트를 새로 열어 확인">
        <ul className="space-y-2.5">
          {CHECKS.map((c) => (
            <li key={c.name} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-3">
              <span className="w-40 shrink-0 text-[12.5px] font-semibold text-gray-800">{c.name}</span>
              <span className="min-w-0 flex-1 text-[12.5px] text-gray-500">
                {c.how}
                {c.link && <ExtLink link={c.link} className="ml-1.5" />}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2.5 rounded-lg bg-amber-50/70 px-3 py-3 text-[12px] leading-relaxed text-amber-800">
          <p className="flex gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>코드로는 끌 수 없는 항목 — 픽셀 ID 를 넣기 전에 각 매체 관리 화면에서 직접 해 주세요.</span>
          </p>
          <ol className="ml-5 list-decimal space-y-1.5 marker:text-amber-600">
            {OPERATOR_TODOS.map((t) => (
              <li key={t.title}>
                <span className="font-semibold">{t.title}</span>
                {t.link && <ExtLink link={t.link} className="ml-1.5" />}
                <div className="text-amber-700/90">{t.body}</div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-3 space-y-1.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] leading-relaxed text-gray-600">
          <p className="flex gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>GTM 에서는 History Change 트리거 대신 dataLayer 이벤트 page_view·sign_up·purchase 를 트리거로 쓰세요.</span>
          </p>
          <p className="flex gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              학생·학부모·튜터 화면(/g·/student·/parent·/tutor·/assignments·/exams), 공유 토큰(/t·/r·/a), 온보딩, 쿠폰·프로모션 경로에서는
              픽셀을 로드·발사하지 않습니다(대소문자 구분 없이 차단). Clarity 는 여기에 더해 원장·강사 화면에서도 로드하지 않습니다.
            </span>
          </p>
        </div>
      </Section>
    </div>
  );
}
