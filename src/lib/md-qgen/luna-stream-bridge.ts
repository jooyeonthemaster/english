// luna JSON→md 점진 렌더 브릿지 (26-08-14, O217 설계).
//
// luna 레인은 json_schema strict 로 생성하므로 content 델타가 JSON 원문이다 —
// 그대로 SSE `t:"c"` 로 흘리면 사용자 화면에 JSON 이 보인다. 이 브릿지는 content
// 델타를 문자 단위 증분 파싱해, 문자열 **값**만 md 섹션 동형 텍스트로 변환해
// 방류한다(클라이언트 바이트 계약 무변경 — 기존 gemini md 스트림과 동형 UX).
//
// 설계 원칙:
// - 파싱·게이트는 원본 JSON 누적본으로 별도 수행한다 — 이 브릿지는 표시 전용이며
//   실패해도 생성을 막지 않는다(호출측에서 try 로 감싸 폴백).
// - 필드 등장 순서 = json_schema property 순서 = 스트림 도착 순서. 각 필드가
//   열릴 때 prefix(섹션 라벨)를 내보내고, 값 문자를 unescape 해 실시간 방류한다.
// - 스펙에 없는 경로(marks 배열 등 메타 필드)는 침묵(suppress)한다.
//
// 상태기계 범위: 객체/배열 중첩, 키/값 문자열 구분, \" \\ \/ \b \f \n \r \t \uXXXX
// 이스케이프(청크 경계 분단 포함). 숫자·불리언·null 값은 표시 대상이 아니므로 무시.

/** 경로 표기: 최상위 키는 그대로, 배열 원소는 `key[].child`. 예: "wrong[].text" */
export interface LunaBridgeFieldSpec {
  path: string;
  /** 필드의 첫 문자 직전에 1회 방류할 prefix (섹션 라벨·개행). */
  prefix?: string;
  /** 필드 닫힘 직후 1회 방류할 suffix. */
  suffix?: string;
  /**
   * 배열 **첫 원소** 앞에만 1회 방류(26-08-14 — 다수 유형이 공통 보고한 제약의
   * 봉합). prefix 는 원소마다 반복되므로 복수 정답에서 "정답: ①\n정답: ②" 처럼
   * 머리표가 중복됐다. 섹션 머리표는 이쪽에 둔다.
   */
  arrayPrefix?: string;
  /**
   * 배열 **두 번째 원소부터** 값 앞에 방류(원소 사이 구분자). 조합형 선지의
   * 기출 관행 구분자(" …… ")처럼 "사이에만" 들어가야 하는 문자열용.
   */
  separator?: string;
}

interface Frame {
  type: "obj" | "arr";
  /** obj: 지금 키를 기다리는가(true) / 값을 기다리는가(false). */
  expectKey: boolean;
  /** obj: 방금 파싱된 키. */
  key: string;
  /** arr: 지금까지 시작된 원소 수 − 1(첫 원소 = 0). obj 에서는 미사용. */
  elemIndex: number;
}

export class LunaJsonMdBridge {
  private readonly specs: Map<string, LunaBridgeFieldSpec>;
  private readonly emit: (delta: string) => void;
  private stack: Frame[] = [];
  private inString = false;
  private stringIsKey = false;
  private keyBuffer = "";
  private escape = false;
  private unicodeBuffer: string | null = null;
  private activeSpec: LunaBridgeFieldSpec | null = null;
  private activePrefixSent = false;

  constructor(specs: LunaBridgeFieldSpec[], emit: (delta: string) => void) {
    this.specs = new Map(specs.map((s) => [s.path, s]));
    this.emit = emit;
  }

  /** 현재 스택 기준 값 경로("a[].b" 형태). */
  private currentPath(): string {
    const parts: string[] = [];
    for (const f of this.stack) {
      if (f.type === "obj") parts.push(f.key);
      else if (parts.length > 0) parts[parts.length - 1] += "[]";
    }
    return parts.join(".");
  }

  /** 값이 속한 가장 가까운 배열 프레임의 원소 인덱스(배열 밖이면 0). */
  private enclosingElemIndex(): number {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].type === "arr") return Math.max(0, this.stack[i].elemIndex);
    }
    return 0;
  }

  private emitValueChar(ch: string) {
    if (!this.activeSpec) return;
    if (!this.activePrefixSent) {
      const idx = this.enclosingElemIndex();
      if (idx === 0 && this.activeSpec.arrayPrefix) this.emit(this.activeSpec.arrayPrefix);
      if (idx > 0 && this.activeSpec.separator) this.emit(this.activeSpec.separator);
      if (this.activeSpec.prefix) this.emit(this.activeSpec.prefix);
      this.activePrefixSent = true;
    }
    this.emit(ch);
  }

  push(chunk: string): void {
    for (const ch of chunk) {
      if (this.inString) {
        if (this.unicodeBuffer !== null) {
          this.unicodeBuffer += ch;
          if (this.unicodeBuffer.length === 4) {
            const code = Number.parseInt(this.unicodeBuffer, 16);
            const decoded = Number.isNaN(code) ? "" : String.fromCharCode(code);
            if (this.stringIsKey) this.keyBuffer += decoded;
            else this.emitValueChar(decoded);
            this.unicodeBuffer = null;
          }
          continue;
        }
        if (this.escape) {
          this.escape = false;
          if (ch === "u") {
            this.unicodeBuffer = "";
            continue;
          }
          const decoded =
            ch === "n" ? "\n" : ch === "t" ? "\t" : ch === "r" ? "\r" : ch === "b" || ch === "f" ? "" : ch;
          if (this.stringIsKey) this.keyBuffer += decoded;
          else this.emitValueChar(decoded);
          continue;
        }
        if (ch === "\\") {
          this.escape = true;
          continue;
        }
        if (ch === '"') {
          this.inString = false;
          if (this.stringIsKey) {
            const top = this.stack[this.stack.length - 1];
            if (top && top.type === "obj") {
              top.key = this.keyBuffer;
              top.expectKey = false;
            }
          } else if (this.activeSpec) {
            if (this.activePrefixSent && this.activeSpec.suffix) this.emit(this.activeSpec.suffix);
            this.activeSpec = null;
            this.activePrefixSent = false;
          }
          continue;
        }
        if (this.stringIsKey) this.keyBuffer += ch;
        else this.emitValueChar(ch);
        continue;
      }
      // 문자열 밖.
      if (ch === '"') {
        const top = this.stack[this.stack.length - 1];
        this.inString = true;
        this.escape = false;
        if (top && top.type === "obj" && top.expectKey) {
          this.stringIsKey = true;
          this.keyBuffer = "";
        } else {
          this.stringIsKey = false;
          // 스칼라 배열의 원소(예: answers[]) — 문자열 시작이 곧 원소 시작이다.
          if (top && top.type === "arr") top.elemIndex += 1;
          const spec = this.specs.get(this.currentPath());
          this.activeSpec = spec ?? null;
          this.activePrefixSent = false;
        }
        continue;
      }
      if (ch === "{") {
        // 객체 배열의 원소 시작 — 원소 인덱스를 여기서 센다(wrong[].text 등).
        const top = this.stack[this.stack.length - 1];
        if (top && top.type === "arr") top.elemIndex += 1;
        this.stack.push({ type: "obj", expectKey: true, key: "", elemIndex: -1 });
        continue;
      }
      if (ch === "[") {
        const top = this.stack[this.stack.length - 1];
        if (top && top.type === "arr") top.elemIndex += 1;
        this.stack.push({ type: "arr", expectKey: false, key: "", elemIndex: -1 });
        continue;
      }
      if (ch === "}" || ch === "]") {
        this.stack.pop();
        const top = this.stack[this.stack.length - 1];
        if (top && top.type === "obj") top.expectKey = true; // 다음 ',' 후 키 — ','에서도 재설정됨
        continue;
      }
      if (ch === ",") {
        const top = this.stack[this.stack.length - 1];
        if (top && top.type === "obj") top.expectKey = true;
        continue;
      }
      if (ch === ":") {
        const top = this.stack[this.stack.length - 1];
        if (top && top.type === "obj") top.expectKey = false;
        continue;
      }
      // 숫자·불리언·null·공백은 표시 대상 아님.
    }
  }
}

/** 어법 문항(grammar_killer_item 스키마)의 md 동형 렌더 스펙. marks 는 침묵. */
export const LUNA_GRAMMAR_BRIDGE_SPECS: LunaBridgeFieldSpec[] = [
  { path: "markedPassage", prefix: "지문:\n", suffix: "\n" },
  { path: "answer", prefix: "\n정답: " },
  { path: "fix", prefix: "\n고침: " },
  { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  { path: "wrong[].label", prefix: "\n" },
  { path: "wrong[].text", prefix: " " },
];

/** 어법 비표준(grammar_nk_item 스키마 — answers/fixes 배열) 렌더 스펙. */
export const LUNA_GRAMMAR_NK_BRIDGE_SPECS: LunaBridgeFieldSpec[] = [
  { path: "markedPassage", prefix: "지문:\n", suffix: "\n" },
  // 복수 정답은 "정답: (B), (E)" 한 줄로 — 머리표 중복 방지(arrayPrefix).
  { path: "answers[]", arrayPrefix: "\n정답: ", separator: ", " },
  { path: "fixes[].label", prefix: "\n고침" },
  { path: "fixes[].fix", prefix: ": " },
  { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  { path: "wrong[].label", prefix: "\n" },
  { path: "wrong[].text", prefix: " " },
];

/** 다중 빈칸 조합형(multi_blank_item 스키마) 렌더 스펙. */
export const LUNA_MULTIBLANK_BRIDGE_SPECS: LunaBridgeFieldSpec[] = [
  { path: "blanks[].label", prefix: "\n빈칸원문" },
  { path: "blanks[].expression", prefix: ": " },
  { path: "options[].label", prefix: "\n" },
  // 조합 값은 기출 관행 구분자로 "값1 …… 값2" — 사이에만 들어간다(separator).
  { path: "options[].blankValues[]", arrayPrefix: " ", separator: " …… " },
  { path: "answer", prefix: "\n\n정답: " },
  { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  { path: "wrong[].label", prefix: "\n" },
  { path: "wrong[].text", prefix: " " },
];

/** 단일 빈칸 문항(blank_killer_item 스키마)의 md 동형 렌더 스펙. */
export const LUNA_BLANK_BRIDGE_SPECS: LunaBridgeFieldSpec[] = [
  { path: "originalExpression", prefix: "빈칸원문: ", suffix: "\n" },
  { path: "options[].label", prefix: "\n" },
  { path: "options[].text", prefix: " " },
  { path: "answer", prefix: "\n\n정답: " },
  { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  { path: "wrong[].label", prefix: "\n" },
  { path: "wrong[].text", prefix: " " },
];
