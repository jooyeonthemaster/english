// 구제 전략 초안 콜(RESCUE-SPEC §4.1 draftItem) — 프롬프트/메시지 조립 → lunaCall → 프로덕션 md v2 파싱·게이트.
// 메시지 규칙:
//   · messages·extras 둘 다 없으면 = buildLabGrammarPrompt(KILLER md) 단일 user 턴 — K-L6-low 요청 본문과 바이트 동일(parity D1).
//   · extraBlocks 는 프롬프트 뒤에 "\n\n" + extras.join("\n\n") (프로덕션 extras 자리). 피드백 블록은 extras 뒤.
//   · messages(ICL 등 여러 턴)가 있으면 그대로 쓰되 extraBlocks·피드백 블록은 **마지막 user 턴** 끝에 같은 순서로 붙인다.
// 파싱 = labParseAndGate(v2 여부는 buildLabGrammarPrompt 가 정한 값 그대로) → withTruncationHint. 채택 규칙은 adoptByProductionRule.
import { buildGrammarKillerV2Prompt } from "@/lib/md-qgen/grammar-killer-v2";
import type { LunaBridgeFieldSpec } from "@/lib/md-qgen/luna-stream-bridge";
import type { GenModelConfig, LabDifficulty } from "@/lib/qgen-lab/types";
import { buildLabGrammarPrompt, buildRegenFeedbackBlock, type LabJsonSchema } from "../grammar-prompt";
import { labParseAndGate, withTruncationHint, type LabParsed } from "../parse-gate";
import type { LabChatMessage } from "../stream-once";
import { lunaCall, type LlmCallOutcome, type LlmHost } from "./llm-call";

export interface DraftHost extends LlmHost {
  difficulty: LabDifficulty;
  /** 1차 시드(labSeed) — v2 KILLER 는 넛지가 없어 프롬프트에 영향 없음(INT 경로 호환용). */
  seed: number;
}

export interface DraftOpts {
  stage: string;
  kind: "gen" | "regen";
  /** 여러 턴(§5.1 ICL 조립 결과). 없으면 프로덕션 v2 프롬프트 단일 user 턴. */
  messages?: LabChatMessage[] | null;
  /** §5.2 카드·거울줄 등 — 프롬프트(또는 마지막 user 턴) 뒤. */
  extraBlocks?: string[] | null;
  /** 재생성 피드백(gateIssues.join(", ") — regenFeedback). buildRegenFeedbackBlock 문구로 붙는다. */
  feedback?: string | null;
  /** 넛지 시드 덮어쓰기(기본 host.seed). */
  seed?: number;
  gen?: Partial<GenModelConfig>;
  timeoutMs?: number;
  note?: string;
}

export interface DraftRequest {
  gen: GenModelConfig;
  /** 단일 user 턴 프롬프트(messages 경로에서는 마지막 user 턴 최종본 — 기록용). */
  prompt: string;
  messages: LabChatMessage[] | null;
  systemMessage: string | null;
  jsonSchema: LabJsonSchema | null;
  bridgeSpecs: LunaBridgeFieldSpec[] | null;
  grammarKillerV2: boolean;
}

export interface DraftOutcome extends LlmCallOutcome {
  parsed: LabParsed;
  request: DraftRequest;
}

/** 재생성 피드백 문자열(RESCUE-SPEC §4.1 regenFeedback) — 프로덕션과 같이 이슈를 ", " 로 잇는다. */
export function regenFeedback(issues: string[]): string {
  return issues.join(", ");
}

/** 정답 결함 재생성용 이슈 — "정답 시비 — <사유>" 로 시작해야 피드백 블록의 relocation 문구가 발화한다. */
export function answerDisputeIssue(reason: string): string {
  return /^정답 시비/.test(reason.trim()) ? reason.trim() : `정답 시비 — ${reason}`;
}

/** 프로덕션 채택 규칙(orchestrate.ts 3단계): 재생성본은 게이트 이슈 수가 1차 이하일 때만 채택. */
export function adoptByProductionRule<T extends { parsed: LabParsed }>(first: T, second: T | null | undefined): T {
  if (!second) return first;
  return second.parsed.gateIssues.length <= first.parsed.gateIssues.length ? second : first;
}

const V2_SPLIT = "\n\n## 지문\n";
const V2_SENTINEL = "\u0000__QGEN_RESCUE_PASSAGE__\u0000";

/** v2 프롬프트의 지문 앞 전부(§5.1 V2_CORE[0]) — `core + "\n\n## 지문\n" + p === buildGrammarKillerV2Prompt(p)`.
 *  프로덕션 형상이 바뀌어 전제가 깨지면 throw(조용히 다른 프롬프트를 보내지 않는다). */
export function v2PromptCore(): string {
  const parts = buildGrammarKillerV2Prompt(V2_SENTINEL).split(V2_SPLIT);
  if (parts.length !== 2 || parts[1] !== V2_SENTINEL) {
    throw new Error("[rescue] v2 프롬프트 형상 변경 — '…\\n\\n## 지문\\n<지문>' 전제가 깨졌다(ICL 조립 중단)");
  }
  return parts[0];
}

export function buildDraftRequest(host: DraftHost, o: DraftOpts): DraftRequest {
  const gen: GenModelConfig = { ...host.gen, ...(o.gen ?? {}) };
  const lp = buildLabGrammarPrompt({
    passage: host.passageText,
    difficulty: host.difficulty,
    format: gen.format,
    seed: o.seed ?? host.seed,
  });
  const tails: string[] = [...(o.extraBlocks ?? []).filter((b) => b && b.length > 0)];
  if (o.feedback) tails.push(buildRegenFeedbackBlock(o.feedback));
  const tail = tails.length > 0 ? `\n\n${tails.join("\n\n")}` : "";
  const base = {
    gen,
    systemMessage: lp.systemMessage,
    jsonSchema: lp.jsonSchema,
    bridgeSpecs: lp.bridgeSpecs,
    grammarKillerV2: lp.grammarKillerV2,
  };
  if (o.messages && o.messages.length > 0) {
    const messages = o.messages.map((m) => ({ role: m.role, content: m.content }));
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser < 0) throw new Error(`[rescue] ${o.stage}: messages 에 user 턴이 없다`);
    messages[lastUser] = { role: "user", content: messages[lastUser].content + tail };
    return { ...base, prompt: messages[lastUser].content, messages };
  }
  return { ...base, prompt: lp.prompt + tail, messages: null };
}

/** 원문 → 프로덕션 파싱·게이트(콜 없음 — 수정본·조립본 재게이트용). */
export function gateDraftText(
  host: Pick<DraftHost, "passageText" | "difficulty" | "gen" | "seed">,
  text: string,
  finishReason: string | null = null,
): LabParsed {
  const lp = buildLabGrammarPrompt({
    passage: host.passageText,
    difficulty: host.difficulty,
    format: host.gen.format,
    seed: host.seed,
  });
  return withTruncationHint(
    labParseAndGate({
      text,
      passage: host.passageText,
      format: host.gen.format,
      grammarKillerV2: lp.grammarKillerV2,
      difficulty: host.difficulty,
    }),
    finishReason,
  );
}

/** 초안 1콜(전송 재시도 포함) + 파싱·게이트. record.gateIssues 는 게이트 결과로 채워진다. */
export async function draftItem(host: DraftHost, o: DraftOpts): Promise<DraftOutcome> {
  const request = buildDraftRequest(host, o);
  const out = await lunaCall(host, {
    stage: o.stage,
    kind: o.kind,
    prompt: request.prompt,
    messages: request.messages,
    systemMessage: request.systemMessage,
    jsonSchema: request.jsonSchema,
    bridgeSpecs: request.bridgeSpecs,
    gen: request.gen,
    display: request.grammarKillerV2 ? "v2" : "raw",
    timeoutMs: o.timeoutMs,
    note: o.note,
  });
  const parsed = withTruncationHint(
    labParseAndGate({
      text: out.call.text,
      passage: host.passageText,
      format: request.gen.format,
      grammarKillerV2: request.grammarKillerV2,
      difficulty: host.difficulty,
    }),
    out.call.finishReason,
  );
  out.record.gateIssues = [...parsed.gateIssues];
  return { ...out, parsed: { ...parsed, gateIssues: [...parsed.gateIssues] }, request };
}
