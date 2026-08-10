// ============================================================================
// 전달 분량 예측 — "이 자료에서 몇 자가 이번 생성에 실리는가"를 실행 **전에**
// 화면이 정직하게 말하기 위한 계산기.
//
// 왜 이 파일이 있나:
//   화면은 오랫동안 자료 옆에 "13,786자"만 적었다. 그런데 서버는 역할별 상한과
//   전체 예산(60,000자)에 맞춰 앞부분만 싣는다 — 13,786자짜리 중3 중간고사가
//   앞 3,000자만 실려 듣기평가 안내문만 읽히고 독해 지문이 통째로 잘려 나간
//   사고가 실제로 있었다. 화면이 "13,786자"라고 적어 두면 선생님은 전부 실렸다고
//   믿는다. 그래서 자료 행과 자료 검토 모달은 **sent/total 두 값**을 함께 말한다.
//
// 값의 출처(중요):
//   상한·우선순위는 서버 프롬프트 조립기(prompts.ts)에서 **그대로 import** 한다.
//   여기서 숫자를 다시 적으면 서버가 상한을 올린 다음 날부터 화면이 조용히
//   거짓말을 시작한다. 상수는 한 곳에만 산다.
//
// 예측 ≠ 확정 (이 구분을 지운 채 쓰지 말 것):
//   · 여기서 나오는 값은 **예측**이다. 실행이 끝나면 결과의 perMaterialCharsSent
//     (서버가 실제로 실은 값)로 덮어 쓴다. 두 값이 다르면 서버 쪽이 참이다.
//   · EXAM_SAMPLE 은 서버가 DENSE_ENGLISH 전략으로 "영문 밀도가 높은 블록"만
//     골라 싣는다. 그 선별은 본문 구조에 달려 있어 길이만으로는 재현할 수 없다 —
//     이 파일은 상한(cap)까지는 실린다고 낙관적으로 잡는다(실제 sent ≤ 예측).
//   · 자료 선별·클리핑의 **실제** 단일 지점은 여전히
//     selectAuthoringMaterialsWithBudget() 하나다(prompts.ts 회귀 계약). 이 파일은
//     그 함수를 대신하지 않는다 — 같은 규칙을 길이 차원에서만 따라 계산할 뿐이고,
//     서버로 보내는 본문은 어떤 경우에도 여기서 자르지 않는다.
//
// 성능 메모:
//   자료 12개 × 60,000자면 한 번 계산에 문자열 정화가 720,000자다. 호출부는
//   반드시 useMemo 로 감싸 자료 배열이 바뀔 때만 다시 계산한다(발주 textarea 는
//   키 입력마다 리렌더된다 — 그때마다 계산하면 입력이 끊긴다).
// ============================================================================

import {
  ROLE_CHAR_BUDGET,
  ROLE_PRIORITY,
  TOTAL_MATERIAL_CHAR_BUDGET,
} from "@/lib/passage-authoring/prompts";
import type { MaterialRole } from "@/lib/passage-authoring/schema";

/**
 * 남은 예산이 이보다 적으면 서버는 자료를 조각내 싣지 않고 통째로 뺀다
 * (반쪽 자료는 해롭다). prompts.ts 의 MIN_USEFUL_CHARS 와 같은 값이며 그쪽은
 * 모듈 로컬 상수라 import 할 수 없다 — 값이 바뀌면 여기도 같이 고친다.
 */
const MIN_USEFUL_CHARS = 200;

/** 역할별 상한이 정의되지 않은 경우의 바닥값(prompts.ts 와 동일). */
const FALLBACK_ROLE_BUDGET = 7_500;

/** 자료 1건이 이번 생성에 얼마나 실리는지. */
export interface MaterialBudgetEntry {
  /** 이번 생성에 실릴 것으로 예측되는 글자 수. */
  sent: number;
  /** 정화 후 자료 전체 글자 수(화면의 분모). */
  total: number;
  /** 전부 실리지 못하는가 — 게이지가 100% 가 아닌 이유를 화면이 말할 수 있게. */
  clipped: boolean;
  /** 예산이 바닥나 이번 생성에서 통째로 빠지는가(sent === 0). */
  excluded: boolean;
}

/** 자료 id → 예측값. */
export type MaterialBudgetMap = Record<string, MaterialBudgetEntry>;

/** 예측에 필요한 최소한의 자료 정보. 화면 타입(DraftMaterial)과 서버 타입 양쪽이 만족한다. */
export interface BudgetInputMaterial {
  id: string;
  role: MaterialRole;
  content: string;
}

/**
 * prompts.ts clipMaterial() 의 정화와 같은 규칙으로 **길이만** 잰다.
 * 마커 위조 차단(`<<<END>>>` → 공백)은 길이를 바꾸므로 여기서도 그대로 적용한다.
 */
function cleanedLength(raw: string): number {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[<>]{3,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim().length;
}

function emptyEntry(): MaterialBudgetEntry {
  return { sent: 0, total: 0, clipped: false, excluded: true };
}

/**
 * 자료 목록 전체를 놓고 각 자료의 전달 분량을 예측한다.
 *
 * 서버(selectAuthoringMaterialsWithBudget)와 같은 순서로 계산한다.
 *  1) 본문이 빈 자료는 제외
 *  2) ROLE_PRIORITY 순, 같은 역할 안에서는 화면에 붙인 순서
 *  3) 각 자료는 min(역할 상한, 남은 총예산)까지만 실린다
 *  4) 남은 예산이 200자 미만이면 그 자료는 통째로 빠진다
 *
 * @param materials 서버로 실제로 보낼 자료만 넘긴다(READY 가 아닌 것은 호출부가 거른다).
 */
export function predictMaterialBudgets(
  materials: readonly BudgetInputMaterial[],
): MaterialBudgetMap {
  const map: MaterialBudgetMap = {};

  const ordered = materials
    .map((material, order) => ({
      material,
      order,
      total: cleanedLength(material.content ?? ""),
    }))
    .filter((entry) => {
      if (entry.total > 0) return true;
      // 빈 자료도 화면에는 남아 있다 — 0/0 으로 정직하게 말한다.
      map[entry.material.id] = emptyEntry();
      return false;
    })
    .sort((a, b) => {
      const pa = ROLE_PRIORITY.indexOf(a.material.role);
      const pb = ROLE_PRIORITY.indexOf(b.material.role);
      return pa !== pb ? pa - pb : a.order - b.order;
    });

  let remaining = TOTAL_MATERIAL_CHAR_BUDGET;
  for (const entry of ordered) {
    const roleCap = ROLE_CHAR_BUDGET[entry.material.role] ?? FALLBACK_ROLE_BUDGET;
    const cap = Math.min(roleCap, remaining);
    if (cap < MIN_USEFUL_CHARS) {
      map[entry.material.id] = {
        sent: 0,
        total: entry.total,
        clipped: true,
        excluded: true,
      };
      continue;
    }
    const sent = Math.min(entry.total, cap);
    remaining -= sent;
    map[entry.material.id] = {
      sent,
      total: entry.total,
      clipped: sent < entry.total,
      excluded: false,
    };
  }

  return map;
}

/**
 * 자료 1건만 놓고 본 예측 — **다른 자료와의 총예산 경쟁은 반영하지 못한다.**
 * 목록 전체를 아는 자리(발주 밴드)에서는 반드시 predictMaterialBudgets 를 쓰고,
 * 이 함수는 자료가 하나뿐이거나 목록을 알 수 없는 자리의 폴백으로만 쓴다.
 */
export function predictMaterialBudget(
  role: MaterialRole,
  content: string,
): MaterialBudgetEntry {
  const total = cleanedLength(content ?? "");
  if (total === 0) return emptyEntry();
  const cap = Math.min(
    ROLE_CHAR_BUDGET[role] ?? FALLBACK_ROLE_BUDGET,
    TOTAL_MATERIAL_CHAR_BUDGET,
  );
  const sent = Math.min(total, cap);
  return { sent, total, clipped: sent < total, excluded: false };
}
