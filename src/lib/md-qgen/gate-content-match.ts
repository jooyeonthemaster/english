// ============================================================================
// 내용 일치(CONTENT_MATCH) 0원 결정형 게이트.
// 파서·스냅: parser-content-match.ts / 견본: gate-vocab.ts · parser-antonym.ts
//
// 이 유형에는 "지문 재구성 일치" 게이트가 없다(지문을 변형하지 않으므로).
// 그 빈자리를 `근거:` 줄이 메운다 — 각 선지의 판단 근거 문장이
//   (1) 지문에 축자로 실재하고  (2) 서로 다르며  (3) 지문 등장 순서대로
// 라는 세 불변식이 이 유형의 결함 대부분을 결정형으로 잡는다:
//   · 지어낸 사실로 만든 진술 → (1) 에서 걸린다(어느 문장과도 안 겹침).
//   · 앞 두 문장만 훑고 다섯 진술을 짜낸 문항 → (2) 에서 걸린다.
//   · 선지가 지문 문장 복붙 → 별도 검사(#5-d)로 걸린다.
//
// 게이트 메시지는 반드시 **자리를 지목**한다(§1-B 철칙 5) — 이 문구가 그대로
// 재생성 프롬프트의 피드백으로 실린다.
// ============================================================================

import type { TeacherPointPayload } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import { normalizeWs } from "./parser";
import {
  CONTENT_MATCH_LABELS,
  foldForContentMatch,
  locateContentMatchSpan,
  splitPassageSentences,
  type MdContentMatchQuestion,
} from "./parser-content-match";

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/;

export interface ContentMatchGateOptions {
  optionCount: number;
  answerCount: number;
  /** 선지 언어(교사 설정) — 진술문의 문자 축을 결정형으로 강제한다. */
  optionLanguage?: "ko" | "en";
  /** answer-only 모드(오답 해설 미요구)에서만 false. */
  requireWrong?: boolean;
  /** CONTENT_MATCH 는 포인트 픽커 미등재라 실무상 항상 빈 배열(휴면 검사). */
  teacherPoints?: readonly TeacherPointPayload[];
}

/** 선지 텍스트 정규화 길이 — 균형·하한 검사의 단일 척도(프로덕션 검증기와 동일 축). */
function textLength(value: string): number {
  return normalizeWs(value).length;
}

function labelRun(count: number): string[] {
  return [...CONTENT_MATCH_LABELS].slice(0, count);
}

/**
 * 개수가 어긋났을 때 **인식하지 못한 원문 줄**을 함께 지목한다(§1-B 철칙 3·5).
 * 개수만 알려 주면 모델은 "한 줄 더 쓰라"로 읽고, 실제 원인(줄머리 장식 때문에
 * 줄이 소멸)과 무관한 방향으로 1회뿐인 재생성을 태운다.
 */
function unparsedHint(lines: readonly string[] | undefined): string {
  const line = (lines ?? []).find((raw) => raw.trim().length > 0);
  return line
    ? ` — 인식하지 못한 줄이 있다: '${line.slice(0, 20)}…'(줄머리 장식 없이 라벨로 시작하라)`
    : "";
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdContentMatch(
  q: MdContentMatchQuestion,
  passage: string,
  options: ContentMatchGateOptions,
): string[] {
  const optionCount = options.optionCount;
  const answerCount = options.answerCount;
  const requireWrong = options.requireWrong !== false;
  const optionLanguage = options.optionLanguage === "ko" ? "ko" : "en";
  const expected = labelRun(optionCount);
  const v: string[] = [];

  // #1 선지 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  //    `근거:` 머리표가 없으면 근거 줄이 선지 구역으로 흘러 들어와 개수가 배로
  //    잡힌다. 그 경우 진짜 원인을 지목한다(개수만 알려 주면 모델이 선지를 지운다).
  if (q.options.length !== optionCount) {
    if (q.evidence.length === 0 && q.options.length > optionCount) {
      return [
        `\`근거:\` 머리표가 없어 선지 줄과 근거 줄이 한 구역에 섞였다(줄 ${q.options.length}개) — 선지 ${optionCount}줄 뒤에 \`근거:\` 머리표를 쓰고 근거 ${optionCount}줄을 따로 적으라`,
      ];
    }
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)${unparsedHint(q.unparsedOptions)}`];
  }

  // #2 선지 라벨 축 — 원문자 ①~ 순서.
  if (q.options.map((o) => o.label).join("") !== expected.join("")) {
    v.push(
      `선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${q.options.map((o) => o.label).join("") || "없음"}`,
    );
  }

  // #3 근거 개수·라벨 축 — 이 유형의 축자 검사 전체가 여기에 달려 있다.
  if (q.evidence.length !== optionCount) {
    v.push(
      `근거 ${q.evidence.length}개 (선지마다 1개씩 ${optionCount}개 필요 — \`근거:\` 구역에 ${expected.join("")} 줄을 빠짐없이 적으라)${unparsedHint(q.unparsedEvidence)}`,
    );
  } else if (q.evidence.map((e) => e.label).join("") !== expected.join("")) {
    v.push(
      `근거 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${q.evidence.map((e) => e.label).join("") || "없음"}`,
    );
  }

  // #4 진술문 — 개별 형상.
  const pn = normalizeWs(passage);
  const seenOptions = new Set<string>();
  for (const option of q.options) {
    const text = option.text?.trim() ?? "";
    if (!text) {
      v.push(`${option.label} 진술문 누락`);
      continue;
    }
    const length = textLength(text);
    if (length < 12) {
      v.push(`${option.label} 진술문이 너무 짧아 진술로 성립하지 않음: '${text.slice(0, 40)}'`);
    }
    if (length > 240) {
      v.push(`${option.label} 진술문이 ${length}자 — 한 문장 진술로 줄이라`);
    }
    // #4-b 선지 언어(교사 설정) 집행.
    if (optionLanguage === "en" && HANGUL_RE.test(text)) {
      v.push(`${option.label} 진술문에 한글이 섞임 — 선지는 영어로 쓰라: '${text.slice(0, 40)}'`);
    }
    if (optionLanguage === "ko" && !HANGUL_RE.test(text)) {
      v.push(`${option.label} 진술문이 한국어가 아님 — 선지는 한국어로 쓰라: '${text.slice(0, 40)}'`);
    }
    // #4-c 지문 문장 복붙 금지 — 복붙이면 학생이 눈으로 대조만 하고 끝난다.
    if (length >= 20 && pn.includes(normalizeWs(text))) {
      v.push(`${option.label} 진술문이 지문 문장의 축자 복사 — 재진술로 바꾸라`);
    }
    // #4-d 진술 중복 금지.
    const key = foldForContentMatch(text);
    if (key && seenOptions.has(key)) v.push(`${option.label} 진술문이 다른 선지와 중복`);
    if (key) seenOptions.add(key);
  }

  // #5 길이 편중 — 프로덕션은 warning(option-length-giveaway)이지만 md 는 error 로
  //    승격한다(기록만 남는 fast 와 달리 md 는 반려·재생성으로 실제 교정된다).
  const lengths = q.options.map((o) => textLength(o.text ?? "")).filter((n) => n > 0);
  if (lengths.length === optionCount) {
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    if (longest >= shortest * 3 && longest - shortest > 18) {
      v.push(
        `진술문 길이 편중(최장 ${longest}자 · 최단 ${shortest}자) — 길이만 보고 정답이 찍힌다`,
      );
    }
  }

  // #6 근거 축자 존재 + 문장 좌표.
  //    이 유형에는 "지문 재구성 일치" 게이트가 없다. 그 빈자리를 메우려고 규범 §4-7
  //    골격을 이탈해 `근거:` 구역을 추가한 것이므로, **정보량 하한**이 없으면 모델이
  //    최소 비용으로 형식만 만족시킨다(축자 단어 하나 → (근거: "canopies")).
  //    그래서 "지문 문장 하나와 통째로 일치" 를 요구한다. 절 인용·표기 드리프트는
  //    스냅이 이미 문장 전문으로 확장하므로 정상 경로 손실이 없다.
  const sentences = splitPassageSentences(passage);
  const sentenceIndexByText = new Map<string, number>();
  for (const s of sentences) {
    const key = normalizeWs(s.text);
    if (!sentenceIndexByText.has(key)) sentenceIndexByText.set(key, s.index);
  }
  const sentenceIndexByLabel = new Map<string, number>();
  for (const row of q.evidence) {
    const sentence = row.sentence?.trim() ?? "";
    if (!sentence) {
      v.push(`${row.label} 근거 누락`);
      continue;
    }
    const words = sentence.split(/\s+/).filter(Boolean).length;
    if (words > 60) {
      v.push(`${row.label} 근거가 ${words}단어 — 지문 문장 하나만 옮겨 적으라`);
      continue;
    }
    const span = locateContentMatchSpan(passage, sentence);
    if (!pn.includes(normalizeWs(sentence))) {
      // fold 로는 찾아지는데 축자로는 아니면 표기 변형이다 — 원인을 정확히 지목한다.
      v.push(
        span
          ? `${row.label} 근거가 지문 표기와 다름(구두점·따옴표 변형) — 지문 문장을 한 글자도 바꾸지 말고 옮기라: '${sentence.slice(0, 50)}'`
          : `${row.label} 근거 문장이 지문에 없음(지어낸 근거) — 지문에 실재하는 문장만 쓰라: '${sentence.slice(0, 50)}'`,
      );
      continue;
    }
    // #6-b 문장 하한 — 축자로 존재하기만 하면 단어 하나도 통과하던 구멍을 막는다.
    const hostIndex = sentenceIndexByText.get(normalizeWs(sentence));
    if (hostIndex === undefined) {
      v.push(
        `${row.label} 근거가 지문 문장 전체가 아님(받은 값: '${sentence.slice(0, 50)}') — 그 판정이 확정되는 지문 문장 하나를 마침표까지 통째로 옮기라`,
      );
      continue;
    }
    sentenceIndexByLabel.set(row.label, hostIndex);
  }

  // #7 근거 분포 — 한 문장에 몰아 인용하면 지문 전역을 훑지 않은 문항이다.
  //    지문 문장이 선지 수보다 적을 수도 있으므로(짧은 지문) 상한을 적응형으로 둔다.
  if (sentences.length > 0 && sentenceIndexByLabel.size === optionCount) {
    const cap = Math.max(1, Math.ceil(optionCount / sentences.length));
    const byIndex = new Map<number, string[]>();
    for (const [label, index] of sentenceIndexByLabel) {
      byIndex.set(index, [...(byIndex.get(index) ?? []), label]);
    }
    for (const [index, labels] of byIndex) {
      if (labels.length > cap) {
        v.push(
          `${labels.join("")} 가 지문 ${index + 1}번째 문장 하나를 근거로 함(문장당 최대 ${cap}개) — 지문 전체를 고르게 훑으라`,
        );
      }
    }

    // #8 근거 순서 == 지문 등장 순.
    for (let i = 1; i < expected.length; i += 1) {
      const prev = sentenceIndexByLabel.get(expected[i - 1]);
      const current = sentenceIndexByLabel.get(expected[i]);
      if (prev !== undefined && current !== undefined && current < prev) {
        v.push(
          `${expected[i]} 근거가 ${expected[i - 1]} 근거보다 지문 앞쪽임 — 근거는 지문 등장 순서대로 배열하라`,
        );
        break;
      }
    }
  }

  // #9 정답 — `정답:` 줄이 유일한 진실원이다.
  const optionLabels = new Set(q.options.map((o) => o.label));
  if (q.answers.length === 0) {
    // `정답:` 줄이 있는데 라벨만 못 읽은 경우와 줄 자체가 없는 경우를 구분한다 —
    // 둘을 뭉뚱그려 "정답 누락" 이라 하면 재생성이 엉뚱한 곳을 고친다(§1-B 철칙 5).
    const raw = (q.answerLine ?? "").trim();
    v.push(
      raw
        ? `정답 줄에서 라벨을 인식할 수 없음(받은 값: '${raw.slice(0, 40)}') — \`정답: ${expected[0]}\` 형식으로 원문자 라벨만 적으라`
        : "정답 누락",
    );
  } else if (q.answers.length !== answerCount) {
    v.push(`정답 ${q.answers.length}개 (${answerCount}개 필요) — 실제 '${q.answers.join(", ")}'`);
  }
  for (const answer of q.answers) {
    if (!optionLabels.has(answer)) v.push(`정답 라벨(${answer})이 선지에 없음`);
  }
  /** 정답 축이 확정됐는가 — 라벨별 파생 검사를 낼 자격. */
  const answersResolved =
    q.answers.length === answerCount && q.answers.every((a) => optionLabels.has(a));

  if (!q.explanation) v.push("해설 누락");

  // #10 오답 해설 — 비정답 라벨과 1:1.
  const wrongNeeded = optionCount - answerCount;
  if (requireWrong) {
    if (q.wrong.length !== wrongNeeded) {
      v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
    }
    const wrongLabels = new Set(q.wrong.map((w) => w.label));
    // 정답 축이 확정되지 않았으면 라벨별 파생 검사를 하지 않는다. `정답:` 줄을 못
    // 읽은 상태에서 이 루프를 돌리면 정답 라벨에 대해 "③ 오답해설 누락"(=정답에
    // 오답해설을 쓰라)이라는 **유해한 재생성 지시**가 나가고, 모델이 순순히 따르면
    // 그때는 정답 라벨이 오답해설에 들어가 다시 반려된다(실패·환불).
    // "0개" 가드만으로는 **부분 파싱**(`정답: ③, ⑤` 중 ③만 읽힘)을 못 막는다 —
    // 그때 나가는 "⑤ 오답해설 누락" 의 ⑤ 는 진짜 정답이다. 라벨 축이 설정 개수와
    // 정확히 맞고 전부 선지에 실재할 때만 파생 지시를 낸다.
    if (answersResolved) {
      for (const label of expected) {
        if (q.answers.includes(label)) continue;
        if (!wrongLabels.has(label)) v.push(`${label} 오답해설 누락`);
      }
    }
    if (q.wrong.length !== wrongLabels.size) v.push("오답해설 라벨 중복");
  }
  if (q.wrong.some((w) => q.answers.includes(w.label))) {
    v.push("오답해설에 정답 라벨 포함");
  }

  // #11 교사 지정 준수(휴면) — CONTENT_MATCH 는 POINT_PICKER_CONFIG 미등재라
  //     라우트가 항상 빈 배열을 넘긴다. 훗날 등재되면 "지정 문장이 근거로 쓰였는가"
  //     가 그대로 준수 판정이 된다(fast 의 soft 정책보다 강한 결정형).
  for (const point of options.teacherPoints ?? []) {
    const needle = foldForContentMatch(point.text);
    if (!needle) continue;
    const hit = q.evidence.some((row) => {
      const hay = foldForContentMatch(row.sentence);
      return hay.length > 0 && (hay.includes(needle) || needle.includes(hay));
    });
    if (!hit) v.push(`교사 지정 문장이 어느 선지의 근거로도 쓰이지 않음: '${point.text.slice(0, 60)}'`);
  }

  return v;
}
