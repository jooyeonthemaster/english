// 단어 훈련 — 채점 토큰(probe). **암호화**한다, 서명만 하지 않는다.
//
// 왜 필요한가: TRAP_JUDGE("이 문장에서 이 단어는 X 라는 뜻이다" O/X)와
// EXAMPLE_MATCH(뜻↔예문 짝짓기)는 큐 조립 시점에 서버가 정한 배치가 곧 정답이다.
// 큐 상태를 DB 에 저장하지 않는 대신(어법 드릴도 무상태) 그 배치를 토큰에 담아
// 클라이언트에 실어 보내고 제출 때 회신받는다.
//
// ★ 2026-08-04 적대검수: 초판은 base64url(JSON) + HMAC 이었다. HMAC 은 **위조**만
//   막고 **기밀**을 지키지 않는다 — 클라이언트가 앞부분을 그냥 디코딩하면
//   claimSenseId(=정답 여부)가 평문으로 보였다. AES-256-GCM 인증암호화로 교체한다.
//   GCM 은 기밀성과 무결성을 동시에 주므로 별도 HMAC 이 필요 없다.
//
// 토큰 형식: v2.<iv>.<tag>.<ciphertext>  (전부 base64url)
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v2";
const IV_BYTES = 12; // GCM 표준 nonce 길이
/** 토큰 유효 시간 — 큐 하나를 푸는 시간이면 충분하다(오래된 토큰 재사용 차단). */
const MAX_AGE_MS = 6 * 60 * 60_000;

function key(): Buffer {
  const s = process.env.GRAMMAR_DRILL_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("GRAMMAR_DRILL_JWT_SECRET/NEXTAUTH_SECRET 미설정");
  // 시크릿 길이가 32바이트가 아닐 수 있으므로 해시로 고정 길이 키를 파생한다.
  return createHash("sha256").update(`vocab-drill-probe:${s}`).digest();
}

export interface TrapProbe {
  kind: "TRAP_JUDGE";
  /** 채점 대상 sense */
  senseId: string;
  /** 주장으로 보여준 뜻의 sense (senseId 와 같으면 참 주장) */
  claimSenseId: string;
  exampleId: string;
  at: number;
}

export interface MatchProbe {
  kind: "EXAMPLE_MATCH";
  /** 채점 대상 sense(문항의 대표) */
  senseId: string;
  /**
   * 큐 한정 라벨 → 실키. 클라이언트는 라벨만 보고 짝을 만들고, 서버가 여기서 되돌린다.
   * senseLabels: 라벨 → senseId · exampleLabels: 라벨 → {exampleId, senseId(정답 짝)}
   */
  senseLabels: Record<string, string>;
  exampleLabels: Record<string, { exampleId: string; senseId: string }>;
  at: number;
}

export type VocabProbe = TrapProbe | MatchProbe;

export function sealProbe(probe: Omit<TrapProbe, "at"> | Omit<MatchProbe, "at">): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plain = Buffer.from(JSON.stringify({ ...probe, at: Date.now() }), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function openProbe(token: string): VocabProbe | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ct = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    // 변조되면 final() 이 던진다 — 이것이 무결성 검증이다.
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as VocabProbe;
    if (typeof parsed?.senseId !== "string") return null;
    if (typeof parsed?.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (parsed.kind === "TRAP_JUDGE") {
      return typeof parsed.claimSenseId === "string" &&
        typeof parsed.exampleId === "string"
        ? parsed
        : null;
    }
    if (parsed.kind === "EXAMPLE_MATCH") {
      return parsed.senseLabels && parsed.exampleLabels ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** 큐 한정 라벨 — 전역 식별자를 클라이언트에 노출하지 않기 위한 불투명 값. */
export function opaqueLabel(): string {
  return randomBytes(9).toString("base64url");
}
