// ============================================================================
// paper-item-groups — PaperItem[] → PaperGroup[] (지문 박스·세트 안내문·병합 지문) JSX 없는 정본.
// paper-item-utils.tsx 에서 동작 보존으로 옮겼다(26-09-30 CORE-MODEL). 웹 조판과 HWPX·DOCX 가
// 같은 buildGroups 를 쓴다 — 그룹 안 아무 문항이든 지문을 원하면 켠다, 비문항 블록으로 쪼개진
// 같은 묶음은 지문을 한 번만, 영어 세트는 병합 지문 + 「[n~m] 다음 글을 읽고, 물음에 답하시오.」,
// KO 세트는 공유지문 1박스(applyKoSetSharedPassages).
// ============================================================================
import type { BuilderQuestionSetRender, PaperGroup, PaperItem } from "./types";
import {
  isSetMemberItem,
  readStructuredObject,
  resolvePaperItemPassageTitle,
  shouldRenderSourcePassageForItem,
} from "./paper-item-model";
import { normalizePassageText } from "./text-normalization";
import { formatSourcePassageForQuestionItems } from "./source-passage-markers";
import { inlineSourcePassageForItem } from "./paper-export-items";
import { buildQuestionSetMergedPassage } from "@/lib/question-sets/render";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import type { Anchor } from "@/lib/question-sets/types";
import { isKoQuestionType } from "@/lib/korean/registry";
import {
  buildKoSetDirective,
  buildKoSetSharedPassage,
  isKoSetGroupId,
} from "@/lib/korean/sets/paper";

// ── 영어(비-KO) 장문 세트: 공유 지문 1박스 병합 렌더 (codex 방식) ──────────────
// 세트 멤버는 지문을 저장하지 않고 span anchors(_spans)/setRender 만 갖는다. 그룹
// 선두에 병합 지문 1박스(밑줄 __…__ + 빈칸 ___)를 그리고 '[1~2] 다음 글을 읽고,
// 물음에 답하시오.' 안내를 붙인다. KO 세트는 이 경로가 아니라 applyKoSetSharedPassages
// (buildKoSetSharedPassage/koSetDirective)로 처리한다 — 아래 헬퍼들은 KO 그룹에도
// 중간값을 채우지만 applyKoSetSharedPassages 가 그 값을 덮어써 KO 동작은 불변이다.
function spansFromStructuredData(value: unknown): Anchor[] {
  const spans = readStructuredObject(value)._spans;
  return Array.isArray(spans) ? (spans as Anchor[]) : [];
}

function setRenderFromItems(items: PaperItem[]): BuilderQuestionSetRender | null {
  for (const item of items) {
    const render = item.sourceQuestion.setRender;
    if (render) return render;
  }
  return null;
}

function normalizedSourcePassageForItem(item: PaperItem): string {
  return normalizePassageText(item.sourceQuestion.passage?.content || "");
}

function currentPassageDiffersFromSource(items: PaperItem[]): boolean {
  return items.some((item) => {
    const current = normalizePassageText(item.passageContent || "");
    const source = normalizedSourcePassageForItem(item);
    return Boolean(current) && current !== source;
  });
}

function mergedSetPassageForItems(
  passageContent: string,
  items: PaperItem[],
): string | null {
  if (!items.some(isSetMemberItem)) return null;
  if (currentPassageDiffersFromSource(items)) return passageContent;

  const setRender = setRenderFromItems(items);
  if (setRender) {
    const merged = buildQuestionSetMergedPassage(setRender);
    const footnotes = [...new Set(items.flatMap((item) => {
      const meta = readStructuredObject(readStructuredObject(item.sourceQuestion.structuredData)._gichul);
      return Array.isArray(meta.footnotes)
        ? meta.footnotes.filter((line): line is string => typeof line === "string" && Boolean(line.trim()) && !merged.includes(line))
        : [];
    }))];
    return normalizePassageText(merged + (footnotes.length ? `\n${footnotes.join("  ")}` : ""));
  }

  const base = normalizePassageText(
    passageContent || items.map(normalizedSourcePassageForItem).find(Boolean) || "",
  );
  const spans = items.flatMap((item) =>
    spansFromStructuredData(item.sourceQuestion.structuredData),
  );
  if (!base || spans.length === 0) return base || null;
  return normalizePassageText(reconstructPassageView(base, spans).text || base);
}

function formatPassageContentForGroup(
  passageContent: string,
  items: PaperItem[],
): string {
  return (
    mergedSetPassageForItems(passageContent, items) ??
    formatSourcePassageForQuestionItems(passageContent, items)
  );
}

function setPromptForItems(items: PaperItem[]): string {
  if (!items.some(isSetMemberItem)) return "";
  const orderNums = items
    .filter((item) => item.blockType === "question" && item.orderNum > 0)
    .map((item) => item.orderNum);
  if (orderNums.length === 0) return "";
  const first = Math.min(...orderNums);
  const last = Math.max(...orderNums);
  const range = first === last ? `[${first}]` : `[${first}~${last}]`;
  return `${range} 다음 글을 읽고, 물음에 답하시오.`;
}

export function buildGroups(items: PaperItem[]): PaperGroup[] {
  const groups: PaperGroup[] = [];
  // 같은 지문 묶음(groupId)이 비문항 블록(워드프로세서식 빈 줄 등)으로 끊겨 여러 그룹으로
  // 쪼개지더라도 지문 박스는 한 번만 그리도록, 이미 지문을 그린 groupId 를 기억한다.
  // (안 그러면 지문이 중복 렌더되어 칸 높이가 부풀고 페이지 여백을 넘는다.)
  const passageRenderedGroupIds = new Set<string>();
  for (const item of items) {
    if (item.blockType !== "question") {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: false,
        passageTitle: "",
        passageContent: "",
        setPrompt: "",
      });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && item.groupId && last.id === item.groupId) {
      last.items.push(item);
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      if (shouldRenderSourcePassageForItem(item) && passageContent) {
        // 제목은 폴백·정규화(빈칸 방지)하되, 지문 박스 표시는 이 묶음이
        // 아직 한 번도 안 그렸을 때만 켠다(중복 방지).
        last.passageTitle = resolvePaperItemPassageTitle(item);
        last.passageContent = formatPassageContentForGroup(
          passageContent,
          last.items,
        );
        last.setPrompt = setPromptForItems(last.items);
        if (!last.includePassage && !passageRenderedGroupIds.has(last.id)) {
          last.includePassage = true;
          passageRenderedGroupIds.add(last.id);
        }
      }
    } else {
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      const groupId = item.groupId || item.localId;
      const wantsPassage =
        shouldRenderSourcePassageForItem(item) && Boolean(passageContent);
      // 같은 지문 묶음이 "비문항 블록"(워드프로세서식 빈 줄 등)으로 쪼개진 경우에만 지문
      // 중복 렌더를 막는다. 다른 문항(다른 지문)으로 갈라진 경우는 기존처럼 각자 지문을
      // 그리도록 둬 일반 시험지 생성 동작을 바꾸지 않는다(회귀 방지).
      const prevGroup = groups[groups.length - 1];
      const prevIsNonQuestionBlock =
        !!prevGroup && prevGroup.items[0]?.blockType !== "question";
      const renderPassage =
        wantsPassage &&
        !(prevIsNonQuestionBlock && passageRenderedGroupIds.has(groupId));
      if (wantsPassage) passageRenderedGroupIds.add(groupId);
      const groupItems = [item];
      groups.push({
        id: groupId,
        items: groupItems,
        includePassage: renderPassage,
        passageTitle: resolvePaperItemPassageTitle(item),
        passageContent: formatPassageContentForGroup(passageContent, groupItems),
        setPrompt: setPromptForItems(groupItems),
      });
    }
  }
  dropBundleBoxAfterInlinePassage(groups);
  applyKoSetSharedPassages(groups);
  return groups;
}

// 지문 묶음 그룹 id — 빌더 「지문별로 다시 묶기」(computeRegroupedByPassage: passage:<지문 id>)·유사 시험지
// (pattern:<묶음>:passage:<지문 id>)·복제(clonePaperItem 이 passage: 접두 보존)만 만든다. 그래서 멤버가 같은 지문이다.
// 「같은 지문」을 본문 글자나 지문 행 id 로 보지 않는 이유: 서버 라우트는 지문 id 를 읽지 않고(문항마다 saved:<문항 id>),
// 감사 탐침(export-parity/probe)은 문항마다 지문 끝에 다른 토큰을 붙인다 — 판정은 그룹 id 와 지문의 빈/안 빈만 본다.
const PASSAGE_BUNDLE_GROUP_ID = /(?:^|:)passage:/;

// ── 비세트 지문 묶음: 같은 지문은 한 번만 (26-09-30 MODEL-FINISH) ─────────────────────────────
// 지문 묶음(passage:·pattern:…:passage: 등 세트가 아닌 그룹)의 멤버 중 제목·요지·내용일치·요약문 같은 구조화 유형은
// 지문을 문항 안에 그린다(inlineSourcePassageForItem — 그룹 박스를 원하지 않는다). 그런데 뒤 멤버(어휘·지칭 등
// includePassage=true)가 그룹 박스를 켜면 같은 지문이 박스 + 문항 안으로 두 번 찍혔다(감사 invariant.passage.multiple —
// similar-v1 cmppijdnd 41 TITLE + 42 VOCAB_CHOICE). 세트 멤버는 문항 안 지문을 버리는 규칙이 있지만 지문 묶음은 없었다.
// 규칙: 지문 묶음 그룹(PASSAGE_BUNDLE_GROUP_ID)에서 박스를 켠 첫 멤버보다 앞서(같은 조각 안, 또는 비문항 블록으로만
// 끊긴 같은 묶음의 앞 조각) 지문을 문항 안에 이미 그린 멤버가 있으면 그룹 박스를 끈다 — 그 문항 안 지문이 한 번의 출력이고
// 뒤 멤버는 위의 지문을 본다(빌더 지문 묶음 관례: 첫 멤버가 지문을 싣는다). 문항 안 지문은 PaperItem 만으로 정해지므로
// 웹 조판·HWPX·DOCX·감사가 이 buildGroups 결과 하나를 그대로 소비한다(PaperExportItem.printInlinePassage 계약 불변).
// 남은 경우(보고됨): 박스를 원하는 멤버가 문항 안 지문 멤버보다 앞이면 그대로 둔다(박스를 끄면 앞 멤버가 지문 없이 읽힌다).
function dropBundleBoxAfterInlinePassage(groups: PaperGroup[]) {
  let runId: string | null = null;
  let inlineInRun = false;
  for (const group of groups) {
    const questions = group.items.filter((it) => it.blockType === "question");
    if (questions.length === 0) continue; // 비문항 블록은 묶음을 끊지 않는다(buildGroups 의 박스 1회 규칙과 같은 범위)
    if (group.id !== runId) {
      runId = group.id;
      inlineInRun = false;
    }
    if (!PASSAGE_BUNDLE_GROUP_ID.test(group.id) || questions.some(isSetMemberItem)) continue;
    const inline = questions.map((it) => Boolean(inlineSourcePassageForItem(it)));
    if (group.includePassage) {
      const firstWanting = questions.findIndex((it) => shouldRenderSourcePassageForItem(it));
      if (firstWanting >= 0 && (inlineInRun || inline.slice(0, firstWanting).some(Boolean))) {
        group.includePassage = false;
      }
    }
    if (inline.some(Boolean)) inlineInRun = true;
  }
}

// KO 세트 그룹(`set:<setId>`) 선두에 공유지문 1박스를 채운다: 전 멤버 markers 를
// buildKoMarkedPassage 로 병합 오버레이한 지문 + 세트 지시문 "[n~m] 다음 글을 읽고
// 물음에 답하시오."(번호는 그룹 내 문항 번호에서 파생). 멤버 문항은 makePaperItem 이
// includePassage=false 로 만들어 지문 미동봉(발문+보기+선지만)이다.
// 영어 세트도 `set:` 프리픽스를 쓰지만(codex 병합지문 경로), 멤버가 KO 유형이 아니라
// isKoQuestionType every-검사에서 걸러져 이 함수에 절대 잡히지 않는다 — 영어 세트는
// buildGroups 의 mergedSetPassageForItems/setPromptForItems 병합 결과를 그대로 유지한다.
// KO 세트는 지시문을 passageContent 에 접합하므로 codex setPromptForItems 가 채운
// setPrompt(쉼표 변형)를 여기서 비워 지시문 이중 노출을 막는다.
function applyKoSetSharedPassages(groups: PaperGroup[]) {
  const renderedSetIds = new Set<string>();
  for (const group of groups) {
    if (!isKoSetGroupId(group.id)) continue;
    const questionItems = group.items.filter((it) => it.blockType === "question");
    if (
      questionItems.length === 0 ||
      !questionItems.every((it) => isKoQuestionType(it.sourceQuestion.subType))
    ) {
      continue;
    }
    // 같은 세트가 비문항 블록으로 쪼개져 그룹이 여러 개면 지문 박스는 첫 그룹만.
    if (renderedSetIds.has(group.id)) {
      group.includePassage = false;
      group.setPrompt = "";
      continue;
    }
    const passage =
      questionItems[0].passageContent ||
      questionItems[0].sourceQuestion.passage?.content ||
      "";
    if (!passage.trim()) continue;
    renderedSetIds.add(group.id);
    const shared = buildKoSetSharedPassage(
      passage,
      questionItems.map((it) => it.sourceQuestion.structuredData),
    );
    const directive = buildKoSetDirective(questionItems.map((it) => it.orderNum));
    group.passageTitle = resolvePaperItemPassageTitle(questionItems[0]);
    group.passageContent = `${directive}\n${shared}`;
    group.includePassage = true;
    group.setPrompt = "";
  }
}
