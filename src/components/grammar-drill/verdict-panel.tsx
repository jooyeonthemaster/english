"use client";

// 어법 드릴 — 제출 후 판정 패널: 정오 배너 + 해설 + 근거 + 번역 + 숙달도.

import { Check, X } from "lucide-react";
import type { SubmitVerdict } from "@/lib/grammar-drill/payload";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function VerdictPanel({ verdict }: { verdict: SubmitVerdict }) {
  const tone = verdict.correct ? "good" : "bad";
  return (
    <div className="gd-verdict mt-5 p-4" data-tone={tone}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-white"
          style={{ background: verdict.correct ? "var(--gd-good)" : "var(--gd-bad)" }}
        >
          {verdict.correct ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : (
            <X className="h-4 w-4" strokeWidth={3} />
          )}
        </span>
        <p
          className="gd-t-md font-bold"
          style={{ color: verdict.correct ? "var(--gd-good)" : "var(--gd-bad)" }}
        >
          {verdict.correct ? "정답입니다" : "오답입니다"}
        </p>
        {verdict.correctAnswer.correction && !verdict.correct && (
          <p className="gd-t-sm ml-auto">
            <span style={{ color: "var(--gd-ink-2)" }}>바른 형태 </span>
            <strong className="gd-en">{verdict.correctAnswer.correction}</strong>
          </p>
        )}
      </div>

      <p className="gd-t-sm mt-3 leading-relaxed">{verdict.explanation}</p>

      {verdict.rationales && verdict.rationales.length > 0 && (
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label mb-1.5">밑줄별 판단 근거</p>
          <ul className="flex flex-col gap-1">
            {verdict.rationales.map((r, i) => (
              <li key={i} className="gd-t-xs flex gap-1.5 leading-relaxed">
                <span
                  className="shrink-0 font-semibold"
                  style={{
                    color:
                      verdict.correctAnswer.number === i + 1
                        ? "var(--gd-bad)"
                        : "var(--gd-ink-3)",
                  }}
                >
                  {CIRCLED[i]}
                </span>
                <span style={{ color: "var(--gd-ink-2)" }}>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(verdict.translation || verdict.gist) && (
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label mb-1">{verdict.gist ? "지문 요지" : "해석"}</p>
          <p className="gd-t-xs leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
            {verdict.gist ?? verdict.translation}
          </p>
        </div>
      )}

      <div className="gd-hairline-t mt-3 flex items-center justify-between pt-3">
        <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
          개념 숙달도
        </p>
        <div className="flex items-center gap-2">
          <div className="gd-meter w-24" data-tone={verdict.mastery.score >= 70 ? "good" : undefined}>
            <span style={{ width: `${Math.min(100, verdict.mastery.score)}%` }} />
          </div>
          <span className="gd-mono gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            {Math.round(verdict.mastery.score)}
          </span>
          {verdict.mastery.streak >= 2 && (
            <span className="gd-t-2xs font-semibold" style={{ color: "var(--gd-blue)" }}>
              {verdict.mastery.streak}연속
            </span>
          )}
        </div>
      </div>

      {verdict.stageAdvanced && (
        <div
          className="gd-pop mt-3 rounded-lg px-3 py-2"
          style={{ background: "var(--gd-blue-soft)", border: "1px solid var(--gd-blue-line)" }}
        >
          <p className="gd-t-xs font-semibold" style={{ color: "var(--gd-blue)" }}>
            단계가 열렸습니다 — {stageLabel(verdict.stageAdvanced.stage)}
          </p>
        </div>
      )}
    </div>
  );
}

export function stageLabel(stage: string): string {
  switch (stage) {
    case "CONCEPT":
      return "개념 학습";
    case "DRILL":
      return "드릴";
    case "READING":
      return "실전 독해";
    case "WRITTEN":
      return "서술형";
    case "TEST":
      return "유닛 테스트";
    case "MASTERED":
      return "마스터";
    default:
      return stage;
  }
}
