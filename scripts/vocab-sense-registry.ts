/**
 * sense 식별자 레지스트리 — docs/vocab-corpus-spec.md §11 의 구현.
 *
 * ── 규범 (§11.2) ────────────────────────────────────────────────────────────
 *   senseId 는 번들 생성 시 부여되고, 한 번 부여되면 절대 바뀌지 않으며 재사용되지 않는다.
 *   같은 sense 가 다음 번들에도 있으면 같은 senseId 를 재사용한다. **판정 근거는
 *   정의문 문자열이 아니라 원 추출 항목의 출처**(passageId + sentenceIndex + surface)다.
 *   매핑 근거가 없으면 잇지 않는다. 고아 숙달도는 자연 소멸한다.
 *
 * ── 왜 정의문 유사도를 쓰지 않는가 (§11.1 / 적대검수 major-4) ─────────────────
 * 이전 적재기는 은퇴 sense 를 생존 sense 에 Jaccard 유사도로 재접합했다. 실측 귀결:
 *   · 생존 sense 가 1개인 표제어(4,451/6,860 = 64.9%)에서는 `bestScore = pool.length===1
 *     ? 0.6 : 0` 시드 때문에 **유사도를 계산조차 하지 않고** 죽은 뜻을 전부 흡수했다
 *   · 매핑이 ON CONFLICT DO NOTHING 이라 최초 1회로 고정 — 재실행해도 정정 불가
 *   · 4단계 LLM 병합이 2,409 표제어의 sense 목록을 갈아엎을 예정이라, 전혀 다른 뜻에
 *     학생 숙달도가 붙는다
 * 이것은 3단계 선병합이 Jaccard 로 의미를 판정하다 실패한 것과 같은 종류의 오류다.
 * **문자열 유사도는 의미 동일성의 근거가 될 수 없다.**
 *
 * ── 여기서 쓰는 판정은 유사도가 아니라 동일성이다 ────────────────────────────
 * memberKey = `passageId#sentenceIndex#surface`. 이건 코퍼스에 고정된 좌표이고
 * 재빌드해도 변하지 않는다. 두 sense 가 **같은 추출 항목을 품고 있으면 같은 sense**다.
 * 그리고 임계값을 쓰지 않는다 — 겹침이 1:1 로 **모호하지 않을 때만** 잇는다:
 *   · 새 sense 가 기존 항목 두 개 이상과 겹치면(=병합)  → 잇지 않는다(새 id)
 *   · 기존 항목 하나가 새 sense 두 개 이상과 겹치면(=분할) → 잇지 않는다(새 id)
 * 이 경우들은 "근거가 없는" 게 아니라 "코드가 판정할 자격이 없는" 사건이다.
 * 명시적 판정(4단계 산출 또는 사람)이 vocab_drill_sense_aliases 를 채운다.
 */
import fs from "node:fs";
import path from "node:path";

export const REGISTRY_VERSION = 1 as const;

export type RegistryEntry = {
  senseId: string;
  lemmaId: string;
  lemma: string;
  pos: string;
  /** 마지막으로 관측된 정의문. **판정 근거가 아니다** — 감사·사람 확인용 표시일 뿐. */
  senseKey: string;
  /** 이 sense 가 품었던 추출 항목 좌표의 **누적 합집합**(passageId#sentenceIndex#surface). */
  members: string[];
  firstBundle: string;
  lastBundle: string;
  /** 이 번들에서 사라졌다면 그 번들 버전. 다시 나타나면 null 로 되돌린다. */
  retiredIn: string | null;
};

export type Registry = {
  version: typeof REGISTRY_VERSION;
  createdAt: string;
  updatedAt: string;
  bundles: string[];
  senses: RegistryEntry[];
};

export type NewSense = {
  /** 내용주소 후보 id — lemmaId ':' sha1(normSense(senseKey))[0..7] */
  contentId: string;
  senseKey: string;
  members: string[];
};

export type Assignment = {
  senseId: string;
  /** content = 정의문이 그대로라 같은 id / source = 출처 1:1 일치로 승계 /
   *  new = 근거 없음(신규 발급) / collision = 내용주소가 이미 점유돼 재해시 */
  how: "content" | "source" | "new" | "collision";
};

export type ResolveStats = {
  content: number; source: number; new: number; collision: number;
  ambiguousMerge: number; ambiguousSplit: number;
};

export function emptyRegistry(): Registry {
  const now = new Date().toISOString();
  return { version: REGISTRY_VERSION, createdAt: now, updatedAt: now, bundles: [], senses: [] };
}

export function defaultRegistryPath(lemmasFile: string): string {
  return path.join(path.dirname(lemmasFile), "sense-registry.json");
}

export function loadRegistry(p: string): Registry | null {
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as Registry;
  if (j?.version !== REGISTRY_VERSION) {
    throw new Error(`sense-registry 버전 불일치: 파일 ${j?.version} ≠ 코드 ${REGISTRY_VERSION} (${p})`);
  }
  if (!Array.isArray(j.senses)) throw new Error(`sense-registry 형상 오류: senses 가 배열이 아니다 (${p})`);
  return j;
}

/** 원자적 쓰기 — 중간에 죽어도 반쪽 레지스트리가 남지 않게 temp → rename. */
export function saveRegistry(p: string, reg: Registry): void {
  reg.updatedAt = new Date().toISOString();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 1));
  fs.renameSync(tmp, p);
}

/** 추출 항목 좌표 — 재빌드해도 변하지 않는 유일한 것. */
export function memberKey(passageId: string, sentenceIndex: number, surface: string): string {
  return `${passageId}#${sentenceIndex}#${surface}`;
}

// ── 해소기 ───────────────────────────────────────────────────────────────────

export class SenseRegistry {
  readonly reg: Registry;
  /** senseId → 항목 (전역 유일) */
  private byId = new Map<string, RegistryEntry>();
  /** lemmaId → 항목들 */
  private byLemma = new Map<string, RegistryEntry[]>();
  /** 이번 실행에서 살아 있다고 확인된 senseId */
  private seen = new Set<string>();
  readonly stats: ResolveStats = { content: 0, source: 0, new: 0, collision: 0, ambiguousMerge: 0, ambiguousSplit: 0 };
  /** 처음 만들어진 레지스트리인가(= 첫 세대 발급) */
  readonly fresh: boolean;

  constructor(reg: Registry | null) {
    this.fresh = reg === null;
    this.reg = reg ?? emptyRegistry();
    for (const e of this.reg.senses) {
      this.byId.set(e.senseId, e);
      const a = this.byLemma.get(e.lemmaId) ?? [];
      a.push(e);
      this.byLemma.set(e.lemmaId, a);
    }
  }

  get size() { return this.byId.size; }

  /**
   * 한 표제어의 새 sense 목록에 senseId 를 확정한다.
   * 입력 순서를 유지한 배열을 돌려준다.
   *
   * @param rehash  내용주소가 점유됐을 때 재해시하는 함수(적재기의 해시 규칙을 주입).
   *                (senses 배열의 인덱스, 시도 횟수) → 후보 id.
   */
  resolveLemma(
    lemmaId: string, lemma: string, pos: string,
    senses: NewSense[],
    rehash: (index: number, attempt: number) => string,
  ): Assignment[] {
    const out: Assignment[] = new Array(senses.length);
    const pool = (this.byLemma.get(lemmaId) ?? []).slice();
    const claimed = new Set<string>();          // 이번 표제어에서 이미 승계된 기존 senseId
    const usedNow = new Set<string>();          // 이번 표제어에서 확정된 senseId(중복 방지)

    // ── 1) 정의문이 그대로면 같은 id. 모호성이 원리적으로 없다. ──
    for (let i = 0; i < senses.length; i++) {
      const hit = this.byId.get(senses[i].contentId);
      if (hit && hit.lemmaId === lemmaId && !claimed.has(hit.senseId)) {
        out[i] = { senseId: hit.senseId, how: "content" };
        claimed.add(hit.senseId);
        usedNow.add(hit.senseId);
        this.stats.content++;
      }
    }

    // ── 2) 출처 겹침이 **모호하지 않을 때만** 승계 ──
    const free = pool.filter((e) => !claimed.has(e.senseId));
    const open = senses.map((_, i) => i).filter((i) => !out[i]);
    if (free.length && open.length) {
      const memberSets = new Map<number, Set<string>>();
      for (const i of open) memberSets.set(i, new Set(senses[i].members));

      // ov[i] = 겹치는 기존 항목들 / rev[senseId] = 겹치는 새 sense 들
      const ov = new Map<number, string[]>();
      const rev = new Map<string, number[]>();
      for (const i of open) {
        const ms = memberSets.get(i) as Set<string>;
        const hits: string[] = [];
        for (const e of free) {
          let n = 0;
          for (const m of e.members) if (ms.has(m)) { n++; break; }
          if (n) {
            hits.push(e.senseId);
            const r = rev.get(e.senseId) ?? [];
            r.push(i);
            rev.set(e.senseId, r);
          }
        }
        ov.set(i, hits);
      }
      for (const i of open) {
        const hits = ov.get(i) as string[];
        if (hits.length === 0) continue;                      // 신규 — 근거 없음
        if (hits.length > 1) { this.stats.ambiguousMerge++; continue; }  // 병합 의심 → 잇지 않는다
        const target = hits[0];
        const back = rev.get(target) as number[];
        if (back.length > 1) { this.stats.ambiguousSplit++; continue; }  // 분할 의심 → 잇지 않는다
        if (usedNow.has(target)) continue;
        out[i] = { senseId: target, how: "source" };
        claimed.add(target);
        usedNow.add(target);
        this.stats.source++;
      }
    }

    // ── 3) 남은 것은 신규 발급. 내용주소가 점유됐으면 결정적으로 재해시한다. ──
    for (let i = 0; i < senses.length; i++) {
      if (out[i]) continue;
      let id = senses[i].contentId;
      let attempt = 1;
      let collided = false;
      while (usedNow.has(id) || this.byId.has(id)) {
        attempt++;
        collided = true;
        id = rehash(i, attempt);
        if (attempt > 64) throw new Error(`senseId 발급 실패(재해시 64회 초과): ${lemmaId} / ${senses[i].senseKey}`);
      }
      out[i] = { senseId: id, how: collided ? "collision" : "new" };
      usedNow.add(id);
      if (collided) this.stats.collision++; else this.stats.new++;
    }

    // ── 4) 레지스트리 반영(메모리) ──
    for (let i = 0; i < senses.length; i++) {
      const a = out[i];
      const s = senses[i];
      this.seen.add(a.senseId);
      const prev = this.byId.get(a.senseId);
      if (prev) {
        prev.senseKey = s.senseKey;
        prev.retiredIn = null;
        // 합집합 — 지문이 잠시 빠져도 다음 번들에서 승계가 끊기지 않는다.
        const set = new Set(prev.members);
        for (const m of s.members) set.add(m);
        prev.members = [...set].sort();
      } else {
        const e: RegistryEntry = {
          senseId: a.senseId, lemmaId, lemma, pos, senseKey: s.senseKey,
          members: [...new Set(s.members)].sort(),
          firstBundle: "", lastBundle: "", retiredIn: null,
        };
        this.byId.set(e.senseId, e);
        const arr = this.byLemma.get(lemmaId) ?? [];
        arr.push(e);
        this.byLemma.set(lemmaId, arr);
        this.reg.senses.push(e);
      }
    }
    return out;
  }

  /**
   * 이번 번들에서 확인되지 않은 항목에 retiredIn 을 찍고 번들 정보를 마감한다.
   * **행을 지우지 않는다** — §11.2 소멸 규칙.
   *
   * @param partial 부분 실행(--limit/--only)이면 true. 이때는 "안 보였다"가
   *   "사라졌다"를 뜻하지 않으므로 **은퇴 표시를 하지 않는다.** 적재기의 --sweep
   *   안전가드와 같은 이유다(적대검수 major-3).
   */
  finalize(version: string, partial = false): { alive: number; retired: number; newlyRetired: number; partial: boolean } {
    let alive = 0, retired = 0, newlyRetired = 0;
    for (const e of this.reg.senses) {
      if (this.seen.has(e.senseId)) {
        alive++;
        if (!e.firstBundle) e.firstBundle = version;
        e.lastBundle = version;
        e.retiredIn = null;
      } else {
        retired++;
        if (!partial && !e.retiredIn) { e.retiredIn = version; newlyRetired++; }
      }
    }
    if (!partial && !this.reg.bundles.includes(version)) this.reg.bundles.push(version);
    return { alive, retired, newlyRetired, partial };
  }
}
