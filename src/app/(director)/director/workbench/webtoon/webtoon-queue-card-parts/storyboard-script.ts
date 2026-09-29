import {
  ANGLE_LABELS,
  BEAT_LABELS,
  SHOT_LABELS,
  SIZE_LABELS,
  type BubbleKind,
  type PersistedWebtoonStoryboard,
  type StoryboardBubble,
  type StoryboardPanel,
} from "@/lib/webtoon-storyboard/types";

// ============================================================================
// 연출 노트 표시·「대본 복사」용 순수 함수. 저장된 JSON 은 느슨한 가드만 거쳐
// 들어오므로(isPersistedStoryboard) 필드 하나하나를 방어적으로 읽는다.
// ============================================================================

/** 문자열이 아니면 "" — 저장 JSON 의 누락·오형 필드 방어. */
export function safeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 표의 자기 소유 키만 조회한다("constructor" 같은 프로토타입 키 방어). */
export function lookup(table: Record<string, string>, key: unknown): string | undefined {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
}

/** 라벨 표에 없는 값은 원문 키를 그대로 보여준다. */
function labelOf(table: Record<string, string>, key: unknown): string {
  if (typeof key !== "string" || !key) return "";
  return lookup(table, key) ?? key;
}

export function panelDirectionLabels(panel: StoryboardPanel) {
  return {
    beat: labelOf(BEAT_LABELS, panel.beat),
    shot: labelOf(SHOT_LABELS, panel.shot),
    angle: labelOf(ANGLE_LABELS, panel.angle),
    size: labelOf(SIZE_LABELS, panel.size),
  };
}

// 화자 자리에 들어오는 일반 명사형 화자(스키마: "narrator/crowd/phone" 등)를 한국어로.
const GENERIC_SPEAKERS: Record<string, string> = {
  narrator: "내레이터",
  crowd: "군중",
  phone: "전화",
};

export function speakerLabel(speaker: unknown): string {
  const raw = safeText(speaker);
  return lookup(GENERIC_SPEAKERS, raw.toLowerCase()) ?? raw;
}

// 말풍선 종류 — 기본 대사(speech)는 표시하지 않는다.
const BUBBLE_KIND_LABELS: Record<BubbleKind, string> = {
  speech: "",
  thought: "생각",
  shout: "외침",
  whisper: "속삭임",
};

export function bubbleKindLabel(kind: unknown): string {
  return lookup(BUBBLE_KIND_LABELS, kind) ?? "";
}

/** 텍스트가 비어 있는 말풍선은 걸러낸다. */
export function panelBubbles(panel: StoryboardPanel): StoryboardBubble[] {
  if (!Array.isArray(panel.bubbles)) return [];
  return panel.bubbles.filter(
    (b): b is StoryboardBubble =>
      typeof b === "object" && b !== null && safeText(b.text) !== "",
  );
}

export function storyboardPanels(sb: PersistedWebtoonStoryboard): StoryboardPanel[] {
  return sb.panels.filter(
    (p): p is StoryboardPanel => typeof p === "object" && p !== null,
  );
}

/**
 * 교사용 평문 대본 — 컷마다 연출(비트·숏·앵글·크기)과 글자(내레이션·대사·효과음),
 * 핵심 표현, 원문 인용을 순서대로 적는다. 수업 자료·재생성 지시문에 붙여 쓰기 좋게.
 */
export function buildStoryboardScript(sb: PersistedWebtoonStoryboard): string {
  const lines: string[] = [];
  const title = safeText(sb.title);
  if (title) lines.push(`「${title}」`);
  const logline = safeText(sb.loglineKo);
  if (logline) lines.push(`한 줄 요약: ${logline}`);
  const keyMessage = safeText(sb.keyMessageKo);
  if (keyMessage) lines.push(`핵심 메시지: ${keyMessage}`);

  const cast = Array.isArray(sb.cast) ? sb.cast : [];
  const castLines = cast
    .map((c) => {
      const name = safeText(c?.name);
      const role = safeText(c?.role);
      if (!name) return "";
      return role ? `- ${name} — ${role}` : `- ${name}`;
    })
    .filter(Boolean);
  if (castLines.length) {
    lines.push("", "[등장인물]", ...castLines);
  }

  const panels = storyboardPanels(sb);
  if (panels.length) lines.push("", "[컷별 대본]");
  panels.forEach((panel, i) => {
    const d = panelDirectionLabels(panel);
    const direction = [d.beat, d.shot, d.angle, d.size].filter(Boolean).join(" · ");
    lines.push("", direction ? `#${i + 1} ${direction}` : `#${i + 1}`);

    const caption = safeText(panel.caption);
    if (caption) lines.push(`  내레이션: ${caption}`);
    for (const b of panelBubbles(panel)) {
      const kind = bubbleKindLabel(b.kind);
      const who = speakerLabel(b.speaker) || "대사";
      lines.push(`  ${who}${kind ? `(${kind})` : ""}: ${safeText(b.text)}`);
      const translation = safeText(b.translation);
      if (translation) lines.push(`    ↳ ${translation}`);
    }
    const sfx = safeText(panel.sfx);
    if (sfx) lines.push(`  효과음: ${sfx}`);
    const keyPhrase = safeText(panel.keyPhrase);
    if (keyPhrase) lines.push(`  핵심 표현: ${keyPhrase}`);
    const excerpt = safeText(panel.sourceExcerpt);
    if (excerpt) lines.push(`  원문: "${excerpt}"`);
  });

  return lines.join("\n").trim() + "\n";
}

/** 클립보드 복사 — 비보안 컨텍스트 등에서 Clipboard API 가 없으면 textarea 폴백. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 권한 거부 등 → 폴백 시도
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
