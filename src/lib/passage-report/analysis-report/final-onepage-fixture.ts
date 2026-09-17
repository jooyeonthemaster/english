import type { AnalysisReport } from "./schema";

/**
 * 원페이지 파이널 학습지 — dev 하네스(/dev/passage-report?sample=final)·조판 QA 용 픽스처.
 * 레퍼런스(수특영어 Stephen Smale 지문 필기 자료)를 재현하는 밀도 높은 샘플로,
 * 마크 5스타일·색 5종·태그·전개해설·함정표·각주·전문해석·파이널팁을 전부 행사한다.
 */
export const FINAL_ONEPAGE_FIXTURE: AnalysisReport = {
  schemaVersion: 1,
  brand: "SMOAT ENGLISH LAB",
  docNo: "FINAL-001",
  themeId: "black-white",
  meta: {
    eyebrow: "FINAL ONE-PAGE · 시험 직전 족집게",
    titleKo: "필즈 메달과 스메일 — 수학자가 정치의 한복판에 선 날",
    titleEn: "Stephen Smale: When Mathematics Met Politics",
    category: "비문학 · 일화",
    theme: "인물 · 수학사",
    difficulty: 4,
    difficultyNote: "(수능 3점)",
    solveTime: "2분 30초",
    examTypes: "빈칸추론·어법·순서·지칭",
  },
  sections: [
    {
      kind: "final-onepage",
      topic: "필즈 메달과 Stephen Smale에 대한 관심을 불러일으킨 사건",
      oneLiner: "수학 업적(메달) + 정치 활동(반전 시위) 이 '이례적 결합'이 무명의 수학상을 유명하게 만들었다!",
      sentences: [
        {
          n: 1,
          en: "On August 16, 1966, the 36-year-old mathematician Stephen Smale arrived in Moscow to receive the Fields Medal at the International Congress of Mathematicians.",
          marks: [
            { anchor: "the 36-year-old mathematician", style: "circle", color: "red", label: "years(x) 수일치" },
            { anchor: "to receive", style: "underline", color: "blue", label: "목적 to부정사" },
          ],
          tags: [],
        },
        {
          n: 2,
          en: "Smale had earned this award, often described as the \"Nobel Prize of Mathematics,\" by bringing a profound new understanding to the subject of higher dimensional topology.",
          marks: [
            { anchor: "described", style: "circle", color: "red", label: "describing(x) 수동" },
            { anchor: "by bringing a profound new understanding", style: "box", color: "purple", label: "서술형 대비" },
          ],
          note: "Smale이 Fields Medal을 받은 이유: 고차원 위상수학 — 서술형 1순위!",
          tags: [{ type: "서술형대비", text: "받은 '이유'를 by -ing 구문 그대로 영작시키는 자리" }],
        },
        {
          n: 3,
          en: "Normally there is little interest in the Fields Medal outside the upper level of the mathematics community.",
          marks: [{ anchor: "little", style: "circle", color: "green", label: "부정어! few(x)" }],
          tags: [{ type: "어휘함정", text: "little(불가산)↔few(가산) + '거의 없다' 부정 극성" }],
        },
        {
          n: 4,
          en: "In 1966, however, Smale's trip to Moscow frustrated attempts to serve him with a Congressional subpoena.",
          marks: [
            { anchor: "however", style: "circle", color: "blue", label: "역접=전환점" },
            { anchor: "frustrated", style: "wavy", color: "green", label: "좌절시켰다(동사)" },
          ],
          note: "의회가 Smale을 소환한 이유: 급진적인 반전 시위를 했기 때문 (⑤에서 확인)",
          tags: [{ type: "순서단서", text: "however + In 1966 재언급 — 순서 배열의 절단선" }],
        },
        {
          n: 5,
          en: "On the same day as the Fields Medal ceremony, the House Committee on Un-American Activities began a hearing in Washington to investigate radical antiwar protests by Smale and others.",
          marks: [
            { anchor: "On the same day", style: "underline", color: "blue", label: "동시성 연결" },
            { anchor: "radical antiwar protests", style: "highlight", color: "pink" },
          ],
          tags: [],
        },
        {
          n: 6,
          en: "The unusual combination of mathematical achievement and political activism raised the profile of a diminutive mathematician with a distinctive, high-pitched voice.",
          marks: [
            { anchor: "The unusual combination of mathematical achievement and political activism", style: "box", color: "pink", label: "빈칸 1순위!" },
            { anchor: "raised", style: "circle", color: "red", label: "rose(x) 타동사" },
          ],
          note: "빈칸대비 — '수학 업적 + 정치 활동의 이례적 결합'이 핵심 개념어. 오답은 '수학 업적'만 담은 반쪽!",
          tags: [{ type: "빈칸대비", text: "주제 수렴 문장 — combination 을 재진술한 선지가 정답" }],
        },
        {
          n: 7,
          en: "Ten days later, Smale held an unplanned Moscow press conference in which he criticized the United States' involvement in the Vietnam War and compared it to the Soviet invasion of Hungary.",
          marks: [
            { anchor: "in which", style: "circle", color: "red", label: "which(x) 완전한 절" },
            { anchor: "compared", style: "underline", color: "red", label: "criticized와 병렬" },
            { anchor: "it", style: "circle", color: "green", label: "= involvement 지칭" },
          ],
          tags: [{ type: "지칭대비", text: "it = the U.S. involvement (전쟁 자체 X — 최근접 명사 함정)" }],
        },
      ],
      flowNotes: [
        {
          afterSentence: 3,
          label: "흐름",
          text: "①~③ 배경(메달=원래 무명) → ④ however 로 반전 — 여기가 글의 전환점이자 순서·삽입 단서",
        },
        {
          afterSentence: 5,
          label: "빈칸대비",
          text: "정치활동의 구체 예시: 미국의 베트남전을 비판하는 모스크바 기자회견 개최 (⑦)",
        },
      ],
      traps: [
        { type: "빈칸추론", point: "⑥ 'The unusual combination of ___' 자리", trap: "수학 업적만 담은 반쪽 선지 + 방향반대(명성을 잃었다)" },
        { type: "어법", point: "⑦ in which — 뒤가 완전한 절", trap: "which 로 바꿔 '어법상 틀린 것'으로 출제" },
        { type: "어법", point: "② described — award 는 '불리는' 대상", trap: "describing(능동) 밑줄 함정" },
        { type: "순서", point: "④ however + ⑤ On the same day", trap: "시간 연결어만 보고 ⑤를 ④ 앞에 두는 배열" },
        { type: "지칭", point: "⑦ it", trap: "최근접 the Vietnam War 로 착각 (정답: involvement)" },
        { type: "서술형", point: "② by bringing ~ topology", trap: "by + -ing 를 because 절로 풀어 쓰면 감점" },
      ],
      mustKnow: [
        { term: "subpoena", meaning: "(법원의) 소환장" },
        { term: "diminutive", meaning: "왜소한" },
        { term: "topology", meaning: "위상수학" },
        { term: "conjecture", meaning: "추측" },
        { term: "activism", meaning: "(정치적) 행동주의" },
      ],
      koFull:
        "1966년 8월 16일, 36세의 수학자 Stephen Smale은 세계 수학자 대회에서 필즈 메달을 받기 위해 모스크바에 도착했다. Smale은 고차원 위상수학이라는 주제에 관해 심오하고 새로운 이해를 제공함으로써 '수학의 노벨상'이라고 표현되곤 하는 이 상을 받았다. 일반적으로 필즈 메달은 수학계 상위층 밖에서는 거의 관심을 받지 못한다. 그러나 1966년에는 Smale의 모스크바행이 그에게 의회 소환장을 송달하려는 시도를 좌절시켰다. 필즈 메달 수여식과 같은 날, 하원 비미활동위원회는 Smale 등의 급진적 반전 시위를 조사하기 위해 워싱턴에서 청문회를 열었다. 수학적 업적과 정치적 행동주의의 이례적 결합은 독특한 고음의 목소리를 가진 왜소한 수학자의 인지도를 높였다. 열흘 후, Smale은 예정에 없던 모스크바 기자 회견을 열어 미국의 베트남전 참전을 비판하며 그것을 소련의 헝가리 침공에 비유했다.",
      finalTip: "빈칸은 ⑥ combination, 어법은 ⑦ in which. 이 둘만은 절대 놓치지 마!",
    },
  ],
};
