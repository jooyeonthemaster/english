// ============================================================================
// 국어(KO) 지문 세트 — export(DOCX/HWPX) 공유지문 1박스 배선 (서버 안전·순수)
// ============================================================================
// 웹 미리보기(paper-item-utils.applyKoSetSharedPassages)와 동일한 모델을
// 다운로드 경로에서 재현한다:
//   - KO 세트 그룹(groupId `set:<setId>`)의 선두에 지문 1박스 —
//     전 멤버 structuredData 의 KO 마커를 병합 오버레이한 지문
//     (buildKoSetSharedPassage) + 세트 지시문(buildKoSetDirective,
//     "[n~m] 다음 글을 읽고 물음에 답하시오." — 번호는 그룹 내 문항 번호).
//   - 멤버 문항은 지문 미동봉(includePassage=false)이므로 본문에는
//     발문+보기+선지만 남는다.
// 영어 경로 무회귀 게이트: groupId 가 `set:` 프리픽스가 아니거나 멤버 중
// KO_* 가 아닌 유형이 하나라도 있으면 null 을 반환해 기존 로직이 그대로
// 실행된다(DOCX assemble / HWPX resolveGroupPassage·break-plan 공용).
// ============================================================================

import { isKoQuestionType } from "@/lib/korean/registry";
import {
  buildKoSetDirective,
  buildKoSetSharedPassage,
  isKoSetGroupId,
} from "@/lib/korean/sets/paper";

/** DOCX BuilderItemResolved / HWPX BuilderItemResolved / PaperItem 공용 최소형. */
export interface KoSetGroupItemLike {
  orderNum?: number;
  passageContent?: string;
  sourceQuestion: {
    subType?: string | null;
    structuredData?: unknown;
    passage?: { content?: string | null } | null;
  };
}

/**
 * KO 세트 그룹이면 "지시문\n병합마커지문" 본문을, 아니면 null 을 반환한다.
 * (null = 영어/일반 경로 — 호출부 기존 로직 무변경 통과.)
 */
export function resolveKoSetSharedPassageContent(
  groupId: string | null | undefined,
  items: KoSetGroupItemLike[],
): string | null {
  if (!isKoSetGroupId(groupId)) return null;
  if (items.length === 0) return null;
  if (!items.every((it) => isKoQuestionType(it.sourceQuestion?.subType))) {
    return null;
  }
  const passage =
    items[0].passageContent || items[0].sourceQuestion?.passage?.content || "";
  if (!passage.trim()) return null;

  const shared = buildKoSetSharedPassage(
    passage,
    items.map((it) => it.sourceQuestion?.structuredData),
  );
  const directive = buildKoSetDirective(
    items.map((it) =>
      typeof it.orderNum === "number" ? it.orderNum : 0,
    ),
  );
  return `${directive}\n${shared}`;
}

/**
 * KO 세트 멤버의 인라인 지문을 억제한다(includePassage=false 로 정규화).
 *
 * export 라우트(resolveBuilderItems)는 includePassage 를
 * `저장값 !== false || shouldForceSourcePassage` 로 되살리는데, KO 지문동봉
 * 유형은 force 가 참이라 세트 멤버(저장값 false)까지 true 로 뒤집힌다 —
 * 그대로 두면 그룹 공유지문 1박스에 더해 멤버마다 지문이 인라인 중복 렌더된다
 * (웹 미리보기는 멤버 includePassage=false 로 억제 — koStructuredSegments).
 * KO 세트 멤버(groupId `set:` + KO_* 유형)만 false 로 재정규화하고, 그 외
 * (영어 전체·KO 솔로 문항)는 원소 그대로 반환한다(무회귀 게이트).
 */
export function suppressKoSetMemberInlinePassages<
  T extends {
    groupId?: string | null;
    includePassage?: boolean;
    sourceQuestion: { subType?: string | null };
  },
>(items: T[]): T[] {
  let changed = false;
  const out = items.map((it) => {
    if (
      isKoSetGroupId(it.groupId) &&
      isKoQuestionType(it.sourceQuestion?.subType) &&
      it.includePassage !== false
    ) {
      changed = true;
      return { ...it, includePassage: false };
    }
    return it;
  });
  return changed ? out : items;
}
