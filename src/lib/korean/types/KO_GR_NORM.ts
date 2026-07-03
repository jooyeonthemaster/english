// ============================================================================
// KO_GR_NORM — 문법 어문 규정 적용 (표준 발음법·한글 맞춤법)  【내신 최다 빈출 축】
// ============================================================================
// 카탈로그 §2.5 KO_GR_NORM + 스펙 §5 사양의 전면 구현.
//
// 실측 근거(관행):
//   발문: "<보기>의 규정을 적용한 예로 적절하지 않은 것은?" /
//         "<보기>의 ㉠에 들어갈 말로 가장 적절한 것은?" (조문+적용 도식 빈칸형)
//   <보기>: 규정 조문 요지 인용 — '다만/[붙임]' 예외 조항까지 포함(usesBogi=required)
//   오답 3원리: 예외 조항('다만') 해당 단어를 본 규정으로 처리 / 규정 적용 대상 오인 /
//              유사 규정 혼동. 빈도: 수능 간헐(언매 단독 문법 슬롯), 내신 최다 빈출.
//
// 결정론 장치 — 빈출 규정 사례 goldmap(70+):
//   두음법칙(제10~12항+[붙임] 렬/률)·사이시옷(제30항+다만 6개)·'-이/-히'(제51항)·
//   표준 발음(겹받침 제10·11항, 구개음화 제17항, 동화·첨가 제18·20·29항)의 정오 쌍을
//   상수로 보유하고, 선지별 사례 선언(exampleClaims)의 정오 진술을 기계 채점한다.
//   클레임-선지 대응은 라벨이 아니라 단어 문면 대조 — 정답 위치 셔플 이후에도 안전.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 빈출 규정 사례 goldmap (닫힌 상수 — 정오 진술 결정론 채점의 원천)
//   exception=true → '다만/[붙임]' 예외 조항 해당 사례(프롬프트 ※ 표기,
//   EXCEPTION_AS_MAIN 함정의 소재).
// ---------------------------------------------------------------------------

type KoNormTopic = "두음법칙" | "사이시옷" | "이히구별" | "겹받침발음" | "구개음화" | "동화·첨가";

interface KoNormGoldEntry {
  /** 판정 대상 표기(사전형). 발음 항목도 표기 기준. */
  word: string;
  /** 올바른 표기 또는 표준 발음(대괄호 없이 저장). */
  correct: string;
  /** 대표 오적용 형태. */
  wrong: readonly string[];
  topic: KoNormTopic;
  kind: "spelling" | "pronunciation";
  exception: boolean;
}

/** 표기 사례 (word=correct). */
function sp(correct: string, wrong: string, topic: KoNormTopic, exception = false): KoNormGoldEntry {
  return { word: correct, correct, wrong: [wrong], topic, kind: "spelling", exception };
}
/** 발음 사례 (word=표기, correct=표준 발음). */
function pr(word: string, correct: string, wrong: string, topic: KoNormTopic, exception = false): KoNormGoldEntry {
  return { word, correct, wrong: [wrong], topic, kind: "pronunciation", exception };
}

const GOLDMAP: readonly KoNormGoldEntry[] = [
  // 두음법칙 — 한글 맞춤법 제10~12항 (+[붙임] 모음/'ㄴ' 받침 뒤 '렬·률'→'열·율')
  sp("여자", "녀자", "두음법칙"), sp("연세", "년세", "두음법칙"), sp("요소", "뇨소", "두음법칙"),
  sp("유대", "뉴대", "두음법칙"), sp("익명", "닉명", "두음법칙"), sp("연도", "년도", "두음법칙"),
  sp("남녀", "남여", "두음법칙"), sp("당뇨", "당요", "두음법칙"),
  sp("신년도", "신연도", "두음법칙"), sp("신여성", "신녀성", "두음법칙", true),
  sp("양심", "량심", "두음법칙"), sp("역사", "력사", "두음법칙"), sp("예의", "례의", "두음법칙"),
  sp("이발", "리발", "두음법칙"), sp("개량", "개양", "두음법칙"), sp("협력", "협역", "두음법칙"),
  sp("낙원", "락원", "두음법칙"), sp("내일", "래일", "두음법칙"), sp("노인", "로인", "두음법칙"),
  sp("쾌락", "쾌낙", "두음법칙"), sp("극락", "극낙", "두음법칙"),
  sp("백분율", "백분률", "두음법칙", true), sp("실패율", "실패률", "두음법칙", true),
  sp("출산율", "출산률", "두음법칙", true), sp("비율", "비률", "두음법칙", true),
  sp("선율", "선률", "두음법칙", true), sp("합격률", "합격율", "두음법칙"), sp("명중률", "명중율", "두음법칙"),
  // 사이시옷 — 한글 맞춤법 제30항 (다만: 두 음절 한자어 6개는 예외적으로 표기)
  sp("나뭇가지", "나무가지", "사이시옷"), sp("냇가", "내가", "사이시옷"), sp("바닷가", "바다가", "사이시옷"),
  sp("촛불", "초불", "사이시옷"), sp("아랫집", "아래집", "사이시옷"), sp("잇몸", "이몸", "사이시옷"),
  sp("나뭇잎", "나무잎", "사이시옷"), sp("빗물", "비물", "사이시옷"), sp("만둣국", "만두국", "사이시옷"),
  sp("등굣길", "등교길", "사이시옷"), sp("최댓값", "최대값", "사이시옷"), sp("혼잣말", "혼자말", "사이시옷"),
  sp("전셋집", "전세집", "사이시옷"), sp("전세방", "전셋방", "사이시옷"),
  sp("개수", "갯수", "사이시옷"), sp("초점", "촛점", "사이시옷"), sp("마구간", "마굿간", "사이시옷"),
  sp("곳간", "고간", "사이시옷", true), sp("셋방", "세방", "사이시옷", true), sp("숫자", "수자", "사이시옷", true),
  sp("찻간", "차간", "사이시옷", true), sp("툇간", "퇴간", "사이시옷", true), sp("횟수", "회수", "사이시옷", true),
  sp("위층", "윗층", "사이시옷"), sp("위쪽", "윗쪽", "사이시옷"), sp("뒤풀이", "뒷풀이", "사이시옷"),
  sp("해님", "햇님", "사이시옷"),
  // '-이/-히' — 한글 맞춤법 제51항
  sp("깨끗이", "깨끗히", "이히구별"), sp("버젓이", "버젓히", "이히구별"), sp("일일이", "일일히", "이히구별"),
  sp("틈틈이", "틈틈히", "이히구별"), sp("곰곰이", "곰곰히", "이히구별"), sp("헛되이", "헛되히", "이히구별"),
  sp("꼼꼼히", "꼼꼼이", "이히구별"), sp("급히", "급이", "이히구별"), sp("정확히", "정확이", "이히구별"),
  sp("조용히", "조용이", "이히구별"), sp("솔직히", "솔직이", "이히구별"), sp("꾸준히", "꾸준이", "이히구별"),
  sp("도저히", "도저이", "이히구별"),
  // 겹받침 발음 — 표준 발음법 제10·11항 (다만: '밟-'/'넓죽-', 용언 어간 ㄺ+ㄱ)
  pr("맑다", "막따", "말따", "겹받침발음"), pr("맑고", "말꼬", "막꼬", "겹받침발음", true),
  pr("읽다", "익따", "일따", "겹받침발음"), pr("읽고", "일꼬", "익꼬", "겹받침발음", true),
  pr("늙지", "늑찌", "늘찌", "겹받침발음"), pr("흙과", "흑꽈", "흘꽈", "겹받침발음"),
  pr("닭", "닥", "달", "겹받침발음"), pr("밝게", "발께", "박께", "겹받침발음", true),
  pr("넓다", "널따", "넙따", "겹받침발음"), pr("밟다", "밥따", "발따", "겹받침발음", true),
  pr("밟고", "밥꼬", "발꼬", "겹받침발음", true), pr("여덟", "여덜", "여덥", "겹받침발음"),
  pr("넓죽하다", "넙쭈카다", "널쭈카다", "겹받침발음", true),
  // 구개음화 — 표준 발음법 제17항 (형식 형태소 'ㅣ' 결합에서만)
  pr("굳이", "구지", "구디", "구개음화"), pr("같이", "가치", "가티", "구개음화"),
  pr("해돋이", "해도지", "해도디", "구개음화"), pr("밭이", "바치", "바티", "구개음화"),
  pr("곧이듣다", "고지듣따", "고디듣따", "구개음화"),
  pr("잔디", "잔디", "잔지", "구개음화"), pr("마디", "마디", "마지", "구개음화"),
  pr("견디다", "견디다", "견지다", "구개음화"),
  // 동화·첨가 — 표준 발음법 제18·20·29항
  pr("국물", "궁물", "국물", "동화·첨가"), pr("밥물", "밤물", "밥물", "동화·첨가"),
  pr("신라", "실라", "신나", "동화·첨가"), pr("난로", "날로", "난노", "동화·첨가"),
  pr("종로", "종노", "종로", "동화·첨가"), pr("담력", "담녁", "담력", "동화·첨가"),
  pr("색연필", "생년필", "색연필", "동화·첨가"), pr("솜이불", "솜니불", "솜이불", "동화·첨가"),
  pr("맨입", "맨닙", "맨입", "동화·첨가"), pr("꽃잎", "꼰닙", "꼬칩", "동화·첨가"),
];

/** 대조용 정규화 — 공백·대괄호·따옴표·장음 기호 제거. */
function normForm(text: string): string {
  return text.normalize("NFC").replace(/[\s[\]‘’'"“”「」()ː:·]/g, "");
}

const GOLD_BY_FORM: ReadonlyMap<string, KoNormGoldEntry> = (() => {
  const map = new Map<string, KoNormGoldEntry>();
  for (const entry of GOLDMAP) {
    for (const form of [entry.word, entry.correct, ...entry.wrong]) {
      const key = normForm(form);
      if (key && !map.has(key)) map.set(key, entry);
    }
  }
  return map;
})();

function findGoldEntry(statedForm: string, word: string): KoNormGoldEntry | null {
  return GOLD_BY_FORM.get(normForm(statedForm)) ?? GOLD_BY_FORM.get(normForm(word)) ?? null;
}

/** goldmap 기준 정오. 미수록 형태면 null(판정 유보). */
function goldTruth(entry: KoNormGoldEntry, statedForm: string): boolean | null {
  const s = normForm(statedForm);
  if (s === normForm(entry.correct)) return true;
  if (entry.wrong.some((w) => normForm(w) === s)) return false;
  return null;
}

function goldListing(topic: KoNormTopic): string {
  return GOLDMAP.filter((e) => e.topic === topic)
    .map((e) =>
      e.kind === "spelling"
        ? `${e.correct}(≠${e.wrong[0]})${e.exception ? "※" : ""}`
        : `${e.word}[${e.correct}](≠[${e.wrong[0]}])${e.exception ? "※" : ""}`,
    )
    .join(", ");
}

// ---------------------------------------------------------------------------
// 스키마 — MC5 봉투 + 출제 모드 + 규정 참조 + 선지별 사례 판정 선언
// ---------------------------------------------------------------------------

const koGrNormTrap = z.enum(["NONE", "EXCEPTION_AS_MAIN", "TARGET_MISID", "SIMILAR_RULE_CONFUSION"]);

const schema = koMc5Envelope({
  questionMode: z
    .enum(["EXAMPLE_JUDGE", "BLANK_FILL"])
    .describe(
      "출제 모드 — EXAMPLE_JUDGE: 규정 적용 예 정오 판정(기본), BLANK_FILL: <보기> 조문+적용 도식의 ㉠ 빈칸 완성",
    ),
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — NEGATIVE: '적용한 예로 적절하지 않은 것은?' (EXAMPLE_JUDGE 기본), POSITIVE: '가장 적절한 것은?'. BLANK_FILL 은 항상 POSITIVE",
    ),
  regulationRef: z.object({
    name: z.enum(["한글 맞춤법", "표준 발음법"]).describe("인용 규정명"),
    clause: z
      .string()
      .min(1)
      .describe("조문 표기 — 예: '제30항(사이시옷)'. <보기> 첫 행 '[한글 맞춤법 제30항]' 형식에 그대로 사용"),
    topic: z
      .enum(["두음법칙", "사이시옷", "이히구별", "겹받침발음", "구개음화", "동화·첨가"])
      .describe("규정 주제 — 한 문항은 한 주제의 조문만 다룬다"),
    hasException: z
      .boolean()
      .describe("<보기> 조문에 '다만/[붙임]' 예외 조항을 포함했는가 — EXCEPTION_AS_MAIN 함정 사용 시 반드시 true"),
  }),
  exampleClaims: z
    .array(
      z.object({
        word: z
          .string()
          .min(1)
          .describe("판정 대상 단어의 올바른 사전형 표기 (예: '나뭇가지', 발음 사례면 표기 '맑고')"),
        statedForm: z
          .string()
          .min(1)
          .describe("이 선지가 옳다고 제시한 표기 또는 발음 — 발음은 대괄호 포함 '[말꼬]' 형식"),
        isTrue: z.boolean().describe("이 선지의 규정 적용 진술이 실제로 옳은가 — 시스템이 goldmap 으로 기계 채점"),
        trapPrinciple: koGrNormTrap.describe(
          "함정 원리 — NONE=참 선지 / EXCEPTION_AS_MAIN=예외('다만') 해당 단어를 본 규정으로 처리 / TARGET_MISID=규정 적용 대상 오인(조건 미충족 단어에 적용) / SIMILAR_RULE_CONFUSION=유사 규정 혼동",
        ),
      }),
    )
    .length(5)
    .describe(
      "선지 5개 각각의 사례 판정 선언 — 각 선지 문면에 해당 word/statedForm 이 그대로 등장해야 하며(시스템이 문면 대조로 선지에 대응), 5개 사례의 단어는 서로 달라야 한다",
    ),
});

// ---------------------------------------------------------------------------
// 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 어문 규정 적용 (표준 발음법·한글 맞춤법) 【내신 최다 빈출 축】

이 유형은 지문이 아니라 **<보기>의 규정 조문**이 판정의 유일 근거다. 학생은 조문(특히
'다만/[붙임]' 예외)을 정독해 표기·발음 사례 5개의 정오를 가른다.

**발문 템플릿** (questionMode·stemPolarity 에 따라 정확히 이 형태로):
- EXAMPLE_JUDGE·NEGATIVE(기본): "<보기>의 규정을 적용한 예로 적절하지 않은 것은?"
- EXAMPLE_JUDGE·POSITIVE: "<보기>의 규정을 적용한 예로 가장 적절한 것은?"
- BLANK_FILL(항상 긍정): "<보기>의 ㉠에 들어갈 말로 가장 적절한 것은?"

**<보기> 조문 작성법 (usesBogi=required — 없으면 자동 반려)**:
1. 첫 행: "[한글 맞춤법 제30항]" / "[표준 발음법 제10항]" 처럼 규정명+조항 번호를 대괄호로.
2. 본 규정 요지를 1~2행으로 **자체 요지 작성**하라(조문 통암기 인용이 아니라 적용 조건이
   드러나는 요지). 적용 조건(순우리말 합성어/앞말 모음 종결/형식 형태소 'ㅣ' 등)을 빠뜨리지 마라.
3. 예외 조항: "다만, ~" 행으로 별도 작성. [붙임]이 판정에 필요하면 "[붙임] ~" 행 추가.
   EXCEPTION_AS_MAIN 함정을 쓰려면 해당 '다만/[붙임]' 조항이 <보기>에 반드시 있어야 한다
   (없으면 학생이 풀 수 없는 문항 — 시스템이 반려).
4. 항목 나열이 필요하면 "◦ " 불릿을 쓰라.
5. **정답 누출 금지**: 선지에서 판정할 단어를 <보기> 조문·예시에 등장시키지 마라.
   조문 예시가 필요하면 선지에 안 쓴 다른 단어를 골라라. (예: 다만 예외 6개 중 '찻간'을
   선지로 판정한다면 <보기>에는 "두 음절로 된 일부 한자어" 요지만 쓰고 단어 나열은 생략하거나
   선지 밖 단어만 제시.)
6. BLANK_FILL 모드: 조문 아래에 적용 도식/학생 정리 행을 두고 결론 자리에 ㉠ 을 정확히
   1회 넣어라. (예: "'나무'와 '가지'가 결합한 순우리말 합성어로 뒷말의 첫소리가 된소리로
   나므로 ㉠ 와 같이 적는다.")

**빈출 사례 goldmap (이 목록의 사례를 우선 사용하라 — 시스템이 정오를 기계 채점한다.
목록 밖 사례를 쓰면 정오 검증이 불가하니 확신 없는 희귀어는 금지. ※ = '다만/[붙임]' 예외 사례)**:
- 두음법칙(맞춤법 제10~12항, [붙임] 렬·률→열·율): ${goldListing("두음법칙")}
- 사이시옷(맞춤법 제30항, 다만: 두 음절 한자어 6개): ${goldListing("사이시옷")}
- '-이/-히'(맞춤법 제51항): ${goldListing("이히구별")}
- 겹받침 발음(표준 발음법 제10·11항, 다만: '밟-'·'넓죽-'·용언 어간 ㄺ+ㄱ): ${goldListing("겹받침발음")}
- 구개음화(표준 발음법 제17항 — 형식 형태소 'ㅣ' 결합에서만): ${goldListing("구개음화")}
- 동화·첨가(표준 발음법 제18·20·29항): ${goldListing("동화·첨가")}

**선지 구성 원리**:
1. 한 문항은 **한 규정(한 주제)** 만 다룬다 — regulationRef.topic 의 조문 범위 안에서만
   정오가 갈리게 하라. 조문 밖 문법 지식을 요구하면 반려된다.
2. EXAMPLE_JUDGE 선지 형식(사례 적용 진술, 종결 '~다'):
   "① "여자(女子)"는 단어 첫머리에 오므로 두음 법칙에 따라 "여자"로 적는다."
   "② "맑고"는 어간 받침 'ㄺ'이 'ㄱ' 앞에 오므로 [말꼬]로 발음한다."
   각 선지는 [단어]+[적용 조건 판단]+[결과 표기/발음] 3요소를 갖춘다. 발음은 [대괄호].
3. **작은따옴표 금지**: 판정 대상 단어·발음을 작은따옴표('')로 감싸지 마라 — 시스템이
   작은따옴표를 지문·보기 인용으로 간주해 반려한다. 큰따옴표(" ") 또는 대괄호만 사용.
4. 5개 선지의 판정 단어는 **서로 다른 5개**여야 하며, 같은 조문의 서로 다른 적용 국면
   (본 규정 정면 사례 / 조건 미충족 사례 / 예외 사례)을 고루 배치하라.
5. NEGATIVE 발문: 참(옳은 적용) 4개 + 오적용 1개(=정답). POSITIVE·BLANK_FILL: 오적용
   4개 + 옳은 적용 1개(=정답).
6. BLANK_FILL 선지는 ㉠ 에 들어갈 표기(또는 발음) 후보 5개 — "나뭇가지" 처럼 형태만 제시.
   정답 1개는 올바른 형태, 오답 4개는 goldmap 의 오형(誤形)이나 조건 오적용 형태로.
7. exampleClaims 에 선지마다 {word(올바른 사전형), statedForm(선지가 옳다고 한 형태),
   isTrue, trapPrinciple} 을 선언하라 — 선지 문면에 word·statedForm 이 그대로 있어야 한다.

**빈발 반려 사유 — goldmap 정오 진술 (시스템이 기계 채점하므로 어기면 전량 반려)**:
- isTrue 판정은 위 goldmap 목록과 **절대 어긋나면 안 된다**. 목록의 왼쪽 형태가 표준
  (correct)이고 괄호 안 ≠형이 오형(誤形)이다 — 예: '개수(≠갯수)'는 "개수"가 표준이므로
  "개수"로 적는다는 진술은 isTrue=true 다. 표준형을 틀렸다고(isTrue=false) 선언하거나
  오형을 옳다고 선언하는 정오 반전이 최빈 반려 사유다. 각 선지를 쓰기 전에 goldmap 에서
  그 단어를 다시 찾아 표준형·오형을 확인하고 statedForm·isTrue 를 맞춰라.
- 참 선지(isTrue=true)는 trapPrinciple=NONE 이어야 한다 — 참 선지에 TARGET_MISID/
  SIMILAR_RULE_CONFUSION 을 붙이는 자기모순도 즉시 반려된다(함정 원리는 오적용 선지 전용).
- 사례 단어는 goldmap 목록 **안에서만** 골라라 — 목록 밖 단어는 정오 검증이 불가해
  반려 대상이다(우선 사용 권고가 아니라 사실상 전용이다).

**오답 함정 3원리 — 오답마다 정확히 하나를 적용하고 trapPrinciple 로 선언**:
- EXCEPTION_AS_MAIN(예외를 본 규정으로): '다만/[붙임]' 예외에 해당하는 단어를 본 규정으로
  처리한다. (예: "찻간(車間)"은 한자어끼리의 합성이므로 사이시옷 없이 "차간"으로 적는다
  → 실제로는 '다만'의 두 음절 한자어 예외라 "찻간". / "밟다"는 겹받침 'ㄼ'이 [ㄹ]로 발음
  되므로 [발따] → 실제로는 다만 조항에 따라 [밥따].)
- TARGET_MISID(적용 대상 오인): 규정의 적용 조건을 충족하지 않는 단어에 규정을 적용한다.
  (예: "해님"은 합성어이므로 사이시옷을 받치어 "햇님"으로 적는다 → '해님'은 파생어라
  제30항의 적용 대상이 아님. / "잔디"는 'ㄷ' 뒤에 'ㅣ'가 오므로 [잔지] → 한 형태소
  내부라 구개음화가 일어나지 않음.)
- SIMILAR_RULE_CONFUSION(유사 규정 혼동): 인접한 다른 규정·조건의 처리를 끌어와 적용한다.
  (예: "위층"은 순우리말 합성어이므로 "윗층"으로 적는다 → 뒷말 첫소리가 거센소리면
  사이시옷을 적지 않음. / "합격률"은 모음 뒤이므로 "합격율" → 'ㄱ' 받침 뒤라 '률'.)

**근거앵커(evidence) 작성** — 지문이 아니라 <보기> 조문이 근거다:
- 모든 선지(①~⑤)에 evidence 를 부착하고, spanText 는 **<보기> 조문의 해당 구절을
  한 글자도 바꾸지 말고 그대로 복사**하라(시스템이 실재성을 기계 검증).
- 참 선지: relation=SUPPORTS + 적용 근거가 되는 본 규정(또는 예외) 구절.
- EXCEPTION_AS_MAIN 오답: relation=CONTRADICTS + 위반한 '다만/[붙임]' 구절.
- TARGET_MISID·SIMILAR_RULE_CONFUSION 오답: relation=DISTORTS + 오적용된 조건 구절.
- note 에 함정 원리를 한 줄로 (오답 해설과 정합되게).

**금지**:
- <보기> 조문 없이 배경지식만으로 풀리는 구성 · 조문 밖 규정 지식을 요구하는 선지.
- 한 문항에 두 규정 혼합(표기 규정과 발음 규정을 섞는 것 포함).
- goldmap 밖 희귀어·고유명사·사전 등재가 불확실한 단어의 정오 판정.
- <보기>에 판정 대상 단어 노출(정답 누출) · 선지의 작은따옴표 사용.
- 두 선지가 같은 단어 또는 같은 함정 지점으로 갈리는 구성.
- 옛한글 자모(ㆍ ㅿ ㆁ 등)가 필요한 국어사 표기 — 현대어 규정만 다뤄라.`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트 (내신이 기본 수요 — 수능은 언매 단독 슬롯 간헐)
// ---------------------------------------------------------------------------

const TOPIC_CLAUSE_HINT: Record<string, string> = {
  두음법칙: "한글 맞춤법 제10~12항(두음 법칙, [붙임] 렬·률→열·율 포함)",
  사이시옷: "한글 맞춤법 제30항(사이시옷, 다만: 두 음절 한자어 예외 포함)",
  이히구별: "한글 맞춤법 제51항('-이/-히' 구별)",
  표준발음: "표준 발음법 제10·11항(겹받침) 또는 제17항(구개음화) 또는 제18·20·29항(동화·첨가) 중 하나",
};

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];

  const mode = settings.questionMode === "BLANK_FILL" ? "BLANK_FILL" : "EXAMPLE_JUDGE";
  if (mode === "BLANK_FILL") {
    lines.push(
      "- questionMode=BLANK_FILL 로 출제하라: <보기>에 조문+적용 도식(㉠ 빈칸 정확히 1개)을 싣고, 발문은 '<보기>의 ㉠에 들어갈 말로 가장 적절한 것은?', 선지는 ㉠ 후보 형태 5개(옳은 형태 1=정답).",
    );
  } else {
    const polarity = settings.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
    if (polarity === "POSITIVE") {
      lines.push(
        "- questionMode=EXAMPLE_JUDGE·stemPolarity=POSITIVE 로 출제하라: 발문은 '<보기>의 규정을 적용한 예로 가장 적절한 것은?', 선지는 오적용 4 + 옳은 적용 1(전수 검증 강제).",
      );
    } else {
      lines.push(
        "- questionMode=EXAMPLE_JUDGE·stemPolarity=NEGATIVE 로 출제하라: 발문은 '<보기>의 규정을 적용한 예로 적절하지 않은 것은?', 선지는 옳은 적용 4 + 오적용 1.",
      );
    }
  }

  const topic = typeof settings.ruleTopic === "string" ? settings.ruleTopic : "AUTO";
  if (topic !== "AUTO" && TOPIC_CLAUSE_HINT[topic]) {
    lines.push(`- 규정 주제는 '${topic}' 로 고정하라: ${TOPIC_CLAUSE_HINT[topic]} 의 조문만 <보기>에 인용하고, 사례도 해당 주제 goldmap 에서만 골라라.`);
  } else {
    lines.push(
      "- 규정 주제는 goldmap 6개 주제(두음법칙·사이시옷·'-이/-히'·겹받침 발음·구개음화·동화·첨가) 중 사례가 풍부한 하나를 골라 한 조문만 다뤄라.",
    );
  }

  if (settings.examMode === "SUNEUNG") {
    lines.push(
      "- 수능 모드(언매 단독 문법 슬롯 — 간헐 출제): 조문 요지를 <보기>에 완결 제시해 배경지식 없이 조문 적용만으로 풀리게 하라. 정답은 본 규정과 '다만' 예외의 경계 사례에서 갈리게 하고, 참 선지의 적용 조건 판단도 조문 문면에서 확인 가능해야 한다.",
    );
  } else {
    lines.push(
      "- 내신 모드(이 유형의 기본 수요 — 어문 규범 단원 최다 빈출): 교과서 어문 규범 단원의 조문 번호·용어를 그대로 명시하고, 수업에서 다루는 빈출 goldmap 사례(여자·나뭇가지·깨끗이·맑고 계열)를 중심으로 구성하라. 정오가 조문 조건의 정확한 암기·적용(순우리말 여부, 된소리 발생, 형식 형태소 조건)에서 갈리게 하되 사례 자체는 친숙한 단어로.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
//   1) goldmap 정오 대조: exampleClaims 의 isTrue 를 빈출 사례 상수로 기계 채점
//   2) 정오 분포·정답 대응: 극성별 오적용 개수(부정=1/긍정=4) + 정답 클레임이
//      가리키는 선지(문면 대조 — 셔플 안전)가 correctAnswer 와 일치
//   3) 함정 자기모순 + 예외 전제: isTrue↔trapPrinciple 정합, EXCEPTION_AS_MAIN
//      사용 시 <보기>에 '다만/[붙임]' 실재
//   4) 모드 구조: BLANK_FILL 의 ㉠(보기 1개·발문 포함·긍정발문), EXAMPLE_JUDGE 의
//      <보기> 지시 발문 + 조문 인용('제n항'/규정명) 실재
//   5) 정답 누출: 판정 대상 표기·발음이 <보기>에 그대로 등장(정답 선지=error)
//   6) 사례 중복·goldmap 커버리지·모드별 선지 어미(warning)
// 공통 게이트(선지 수·근거앵커 verbatim·보기 존재·발문 문법)는 dispatch 선실행 — 중복 금지.
// ---------------------------------------------------------------------------

interface KoNormClaim {
  word: string;
  statedForm: string;
  isTrue: boolean;
  trapPrinciple: string;
}

function readClaims(question: Record<string, unknown>): KoNormClaim[] {
  if (!Array.isArray(question.exampleClaims)) return [];
  const out: KoNormClaim[] = [];
  for (const raw of question.exampleClaims) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    out.push({
      word: typeof c.word === "string" ? c.word : "",
      statedForm: typeof c.statedForm === "string" ? c.statedForm : "",
      isTrue: c.isTrue === true,
      trapPrinciple: typeof c.trapPrinciple === "string" ? c.trapPrinciple : "",
    });
  }
  return out;
}

function readBogiText(question: Record<string, unknown>): string {
  if (!question.bogi || typeof question.bogi !== "object") return "";
  const lines = (question.bogi as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return "";
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

/** 클레임 → 선지 라벨 대응 (라벨이 아니라 문면 대조 — 정답 위치 셔플 이후에도 안전). */
function mapClaimToOptionLabel(
  claim: KoNormClaim,
  options: { label: string; text: string }[],
): string | null {
  const byForm = (form: string) => {
    const f = normForm(form);
    if (f.length < 2) return [];
    return options.filter((o) => normForm(o.text).includes(f));
  };
  const byStated = byForm(claim.statedForm);
  if (byStated.length === 1) return byStated[0].label;
  const byWord = byForm(claim.word);
  if (byWord.length === 1) return byWord[0].label;
  return null;
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const mode = question.questionMode === "BLANK_FILL" ? "BLANK_FILL" : "EXAMPLE_JUDGE";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  const bogiText = readBogiText(question);
  const claims = readClaims(question);
  const options = (Array.isArray(question.options) ? question.options : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      label: typeof o.label === "string" ? o.label : "",
      text: typeof o.text === "string" ? o.text : "",
    }));

  // --- [결정론 4] 모드 구조 ------------------------------------------------
  if (mode === "BLANK_FILL") {
    if (!direction.includes("㉠")) {
      add("error", "ko-direction-grammar", "BLANK_FILL 모드인데 발문에 ㉠ 이 없습니다 — '<보기>의 ㉠에 들어갈 말로 가장 적절한 것은?' 형식이어야 합니다");
    }
    if (negativeStem) {
      add("error", "ko-direction-grammar", "BLANK_FILL(빈칸 완성) 모드는 긍정발문('가장 적절한 것은?')이어야 합니다 — 부정발문 감지");
    }
    if (bogiText) {
      const blankCount = bogiText.split("㉠").length - 1;
      if (blankCount === 0) {
        add("error", "ko-bogi-missing", "BLANK_FILL 모드인데 <보기>에 ㉠ 빈칸이 없습니다 — 적용 도식의 결론 자리에 ㉠ 을 정확히 1회 넣으세요");
      } else if (blankCount > 1) {
        add("warning", "ko-option-ending", `<보기>에 ㉠ 이 ${blankCount}회 등장합니다 — 빈칸은 정확히 1개여야 합니다`);
      }
    }
  } else {
    if (!direction.includes("보기")) {
      add("error", "ko-direction-grammar", "EXAMPLE_JUDGE 모드 발문이 <보기>를 지시하지 않습니다 — '<보기>의 규정을 적용한 예로 …' 형식이어야 합니다");
    }
    if (stemPolarity === "NEGATIVE" && !negativeStem) {
      add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
    }
    if (stemPolarity === "POSITIVE" && negativeStem) {
      add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
    }
  }

  // 조문 인용 실재 — <보기>가 규정 조문이어야 한다 (usesBogi 존재 검사는 공통 게이트)
  if (bogiText && !/제\s*\d+\s*항/.test(bogiText) && !/(맞춤법|표준\s*발음|표준어\s*규정)/.test(bogiText)) {
    add("error", "ko-bogi-missing", "<보기>에 규정 조문 인용(규정명 또는 '제n항')이 없습니다 — 이 유형의 <보기>는 어문 규정 조문 요지가 필수입니다");
  }

  // --- [결정론 1] goldmap 정오 대조 -----------------------------------------
  let goldCovered = 0;
  const usedEntryWords = new Map<string, number>();
  for (const claim of claims) {
    if (!claim.statedForm && !claim.word) continue;
    const entry = findGoldEntry(claim.statedForm, claim.word);
    if (!entry) continue;
    goldCovered += 1;
    usedEntryWords.set(entry.word, (usedEntryWords.get(entry.word) ?? 0) + 1);
    const truth = goldTruth(entry, claim.statedForm);
    if (truth !== null && truth !== claim.isTrue) {
      add(
        "error",
        "ko-solver-mismatch",
        `사례 '${claim.word}': goldmap 기준 '${claim.statedForm}' 은(는) ${truth ? "옳은" : "잘못된"} 적용(표준: ${entry.kind === "pronunciation" ? `[${entry.correct}]` : entry.correct})인데 isTrue=${claim.isTrue} 로 선언 — 정오 진술 오류`,
      );
    }
  }
  // 사례 단어 중복 — EXAMPLE_JUDGE 전용 (BLANK_FILL 은 정답 단어의 오형이 정당한 오답 후보)
  if (mode === "EXAMPLE_JUDGE") {
    for (const [word, count] of usedEntryWords) {
      if (count > 1) {
        add("warning", "ko-option-ending", `사례 '${word}' 가 ${count}개 선지에 중복 사용되었습니다 — 5개 사례의 단어는 서로 달라야 합니다`);
      }
    }
  }
  if (claims.length === 5 && goldCovered === 0) {
    add(
      "warning",
      "ko-option-ending",
      "goldmap 빈출 사례가 하나도 사용되지 않아 정오 결정론 검증이 불가합니다 — 빈출 사례(여자·나뭇가지·깨끗이·맑고 계열)를 우선 사용하세요",
    );
  }

  // --- [결정론 2] 정오 분포·정답 대응 (문면 대조 — 셔플 안전) -----------------
  if (claims.length === 5) {
    const falseClaims = claims.filter((c) => !c.isTrue);
    const expectedFalse = negativeStem ? 1 : 4;
    if (falseClaims.length !== expectedFalse) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${negativeStem ? "부정" : "긍정"}발문인데 오적용(isTrue=false) 사례가 ${falseClaims.length}개입니다 — 정확히 ${expectedFalse}개여야 합니다`,
      );
    }
    const answerClaims = claims.filter((c) => c.isTrue !== negativeStem); // 부정=오적용 1개, 긍정=옳은 적용 1개
    if (answerClaims.length === 1 && options.length === 5) {
      const mapped = mapClaimToOptionLabel(answerClaims[0], options);
      if (mapped && mapped !== correctAnswer) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `정답 대응 오류: 판정상 정답 사례('${answerClaims[0].word}')는 ${mapped} 선지인데 correctAnswer=${correctAnswer} — 정오 선언과 정답 라벨이 어긋납니다`,
        );
      } else if (!mapped) {
        add(
          "warning",
          "ko-option-ending",
          `정답 사례('${answerClaims[0].word}')를 선지 문면에서 유일하게 찾지 못했습니다 — 각 선지에 판정 단어(word/statedForm)를 그대로 노출하세요`,
        );
      }
    }
  } else if (claims.length > 0) {
    add("error", "ko-correct-answer-invalid", `exampleClaims 가 ${claims.length}개 — 선지 5개와 1:1 로 정확히 5개여야 합니다`);
  }

  // --- [결정론 3] 함정 자기모순 + 예외 조항 전제 ------------------------------
  const traps = new Set(["EXCEPTION_AS_MAIN", "TARGET_MISID", "SIMILAR_RULE_CONFUSION"]);
  let usesExceptionTrap = false;
  for (const claim of claims) {
    const isTrap = traps.has(claim.trapPrinciple);
    if (claim.trapPrinciple === "EXCEPTION_AS_MAIN") usesExceptionTrap = true;
    if (claim.isTrue && isTrap) {
      add("error", "ko-correct-answer-invalid", `사례 '${claim.word}': isTrue=true(옳은 적용)인데 trapPrinciple=${claim.trapPrinciple} — 참 선지는 NONE 이어야 합니다(자기모순)`);
    }
    if (!claim.isTrue && !isTrap) {
      add("error", "ko-correct-answer-invalid", `사례 '${claim.word}': isTrue=false(오적용)인데 함정 원리가 선언되지 않았습니다 — 3원리 중 하나를 지정하세요`);
    }
  }
  if (usesExceptionTrap && bogiText && !/다만|\[?붙\s*임\]?/.test(bogiText)) {
    add(
      "error",
      "ko-bogi-missing",
      "EXCEPTION_AS_MAIN(예외를 본 규정으로) 함정을 썼는데 <보기> 조문에 '다만'/[붙임] 예외 조항이 없습니다 — 예외 조항 없이는 학생이 판정할 수 없습니다",
    );
  }

  // --- [결정론 5] 정답 누출 — 판정 형태가 <보기>에 그대로 등장 ------------------
  if (bogiText) {
    const bogiNorm = normForm(bogiText);
    for (const claim of claims) {
      const entry = findGoldEntry(claim.statedForm, claim.word);
      const kind = entry?.kind ?? (claim.statedForm.startsWith("[") ? "pronunciation" : "spelling");
      // 발음 사례는 대괄호 발음형만 검사(표기 자체는 조문 서술에 흔히 필요),
      // 표기 사례는 올바른 표기·제시 표기 모두 검사.
      const leakForms =
        kind === "pronunciation"
          ? [claim.statedForm.startsWith("[") ? claim.statedForm : `[${claim.statedForm}]`, entry ? `[${entry.correct}]` : ""]
          : [claim.word, claim.statedForm];
      const leaked = leakForms.some((f) => {
        const n = normForm(f);
        return n.length >= 2 && bogiNorm.includes(n);
      });
      if (!leaked) continue;
      const isAnswerClaim = claim.isTrue !== negativeStem;
      if (isAnswerClaim) {
        add("error", "ko-answer-leak", `정답 사례('${claim.word}')의 표기·발음이 <보기>에 그대로 등장합니다 — 조문 예시와 판정 단어를 분리하세요(정답 누출)`);
      } else {
        add("warning", "ko-option-ending", `사례 '${claim.word}' 가 <보기>에 그대로 등장합니다 — 해당 선지의 판정 단서가 직접 노출됩니다`);
      }
    }
  }

  // --- [결정론 6] 모드별 선지 어미 (meta.optionEnding=any — 모드 인지형 자체 검사) --
  if (mode === "EXAMPLE_JUDGE") {
    for (const o of options) {
      if (!o.text) continue;
      const endingIssue = ctx.koText.optionEndingIssueKo(o.text, "plain");
      if (endingIssue) {
        add("warning", "ko-option-ending", `${o.label} ${endingIssue} — 규정 적용 진술은 '~로 적는다/발음한다' 평서형: "${o.text.slice(0, 40)}"`);
        break; // 공통 게이트 관행과 동일 — 첫 위반만
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_NORM: KoTypeModule = {
  meta: {
    typeId: "KO_GR_NORM",
    area: "GRAMMAR",
    label: "어문 규정 적용(맞춤법·표준발음)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "required",
    markerFamilies: [],
    optionEnding: "any", // 모드별 상이(EXAMPLE_JUDGE=평서형 진술, BLANK_FILL=형태 제시) — validate 가 모드 인지형으로 검사
    needsSolverGate: false,
    description:
      "<보기>에 어문 규정(한글 맞춤법·표준 발음법) 조문 요지를 '다만/[붙임]' 예외까지 인용하고 표기·발음 사례의 정오를 판정하는 규정 적용 유형 — 내신 최다 빈출 축, 빈출 사례 goldmap 결정론 채점",
    setSlot: "언매 단독 문법 슬롯(수능 간헐 — 어문 규범 출제 시) · 내신 어문 규범 단원 최다 빈출 축(지필·수행 단골)",
    studentTask:
      "<보기>의 규정 조문('다만' 예외 포함)을 읽고, 표기·발음 사례 5개 중 규정을 잘못 적용한 하나(또는 ㉠에 들어갈 옳은 적용)를 고릅니다.",
    bestFor: [
      "내신 어문 규범(한글 맞춤법·표준 발음법) 단원 지필 대비",
      "두음법칙·사이시옷·'-이/-히'·겹받침 발음 빈출 사례 훈련",
      "지문 없이 <보기> 조문만으로 자기완결되는 문법 문항",
    ],
    outputUi: ["<보기> 규정 조문 박스('다만' 예외 포함)", "5지선다(사례 정오 판정 또는 ㉠ 빈칸 완성)", "선지별 조문 근거·함정 원리 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "questionMode",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "EXAMPLE_JUDGE", label: "규정 적용 예 판정(기본)" },
          { value: "BLANK_FILL", label: "㉠ 빈칸 완성(조문+적용 도식)" },
        ],
        defaultValue: "EXAMPLE_JUDGE",
        description: "빈칸 완성형은 조문 적용 도식의 결론(㉠)을 채우는 변형 — 긍정발문 고정",
      },
      {
        key: "ruleTopic",
        label: "규정 주제",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(사례 풍부 주제)" },
          { value: "두음법칙", label: "두음 법칙(제10~12항)" },
          { value: "사이시옷", label: "사이시옷(제30항)" },
          { value: "이히구별", label: "'-이/-히'(제51항)" },
          { value: "표준발음", label: "표준 발음(겹받침·구개음화·동화)" },
        ],
        defaultValue: "AUTO",
        description: "한 문항은 한 규정만 — 내신 진도 단원에 맞춰 고정할 수 있습니다",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 관행)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 전수검증형)" },
        ],
        defaultValue: "NEGATIVE",
        description: "규정 적용 예 판정 모드에서만 적용 — 빈칸 완성형은 항상 긍정발문",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "본 규정 정면 사례만으로 구성하라(goldmap 대표 사례: 여자·나뭇가지·깨끗이·국물 계열). 함정은 TARGET_MISID 명백형(조건 불충족이 한눈에 보이는 단어) 1개 축으로, <보기> 조문에 적용 조건을 풀어서 명시하라.",
    INTERMEDIATE:
      "'다만/[붙임]' 예외 경계 사례를 정답 축으로 넣어라(찻간·횟수·밟다·맑고 계열 — EXCEPTION_AS_MAIN). 참 선지에도 조건 판단(순우리말 여부·형식 형태소 여부)이 필요한 사례를 배치해 조문 왕복을 강제하라.",
    KILLER:
      "SIMILAR_RULE_CONFUSION 을 정답 축으로 — 표면상 유사한 조건 쌍(위층/전셋집, 합격률/백분율, 맑다/맑고)을 한 문항에 병치해 조건 변별을 강제하라. 예외의 예외(밟다·넓죽하다)를 포함하고 조문 요지는 최소로 압축해 '다만' 정독 없이는 못 풀게 하라. BLANK_FILL 도식 전환(적용 절차 추적형)을 함께 고려하라.",
  },
};
