// ============================================================================
// 클릭 유도 힌트 글로우 — 비활성(처럼 보이는) 버튼을 사용자가 눌렀을 때, 그 버튼을
// 활성화하려면 무엇을 해야 하는지 "대상 요소"를 파란색으로 두 번 글로우시켜 행동을
// 유도한다. (예: '다음으로(시험지 생성)'가 막혀 있으면 → 문항 카드들을 글로우)
//
// 핵심: 버튼은 네이티브 `disabled` 를 쓰지 말고 `aria-disabled` + 조건부 클래스로
// "비활성처럼" 만들어 두어야 클릭 이벤트가 살아 있어 이 힌트를 띄울 수 있다.
// 실제 동작은 onClick 안에서 조건을 보고 분기한다.
// ============================================================================

const GLOW_CLASS = "smoat-hint-glow";

function asElements(
  targets: Element | Iterable<Element> | null | undefined,
): HTMLElement[] {
  if (!targets) return [];
  const list =
    targets instanceof Element ? [targets] : Array.from(targets);
  return list.filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/**
 * 주어진 요소(들)에 1회성 파란 글로우를 입혀 시선을 끈다. 애니메이션이 끝나면
 * 클래스를 스스로 정리하므로 다시 호출하면 또 반짝인다.
 */
export function triggerHintGlow(
  targets: Element | Iterable<Element> | null | undefined,
  options?: { scroll?: boolean },
): void {
  const els = asElements(targets);
  if (els.length === 0) return;

  if (options?.scroll !== false) {
    els[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  for (const el of els) {
    el.classList.remove(GLOW_CLASS);
    // 리플로우 강제 — 같은 요소를 연속으로 눌러도 애니메이션이 매번 재시작되게.
    void el.offsetWidth;
    el.classList.add(GLOW_CLASS);
    const cleanup = () => {
      el.classList.remove(GLOW_CLASS);
      el.removeEventListener("animationend", cleanup);
      el.removeEventListener("animationcancel", cleanup);
    };
    el.addEventListener("animationend", cleanup);
    el.addEventListener("animationcancel", cleanup);
  }
}

/**
 * 컨테이너 안에서 선택자에 맞는 요소들(기본: 선택 가능한 카드 = data-drag-item-id)을
 * 글로우. 카드가 아주 많으면 시각적 소음/성능을 막기 위해 앞에서부터 max개만.
 */
export function triggerHintGlowWithin(
  container: Element | null | undefined,
  selector = "[data-drag-item-id]",
  options?: { scroll?: boolean; max?: number },
): void {
  if (!container) return;
  const max = options?.max ?? 24;
  let els = Array.from(container.querySelectorAll(selector));
  if (els.length > max) els = els.slice(0, max);
  triggerHintGlow(els, options);
}
