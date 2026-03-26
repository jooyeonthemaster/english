// ============================================================================
// Passage Analysis Types — 5-Layer Analysis Model
// ============================================================================

export interface PassageAnalysisData {
  // 기존 (하위 호환)
  sentences: SentenceAnalysis[];
  vocabulary: VocabItem[];
  grammarPoints: GrammarPoint[];
  structure: StructureAnalysis;

  // 신규 층위
  syntaxAnalysis?: SyntaxItem[];
  examDesign?: ExamDesignAnalysis;
}

// ─── Layer 0: 문장 분리 + 번역 ────────────────────────────
export interface SentenceAnalysis {
  index: number;
  english: string;
  korean: string;
}

// ─── Layer 1: 어휘 분석 ──────────────────────────────────
export interface VocabItem {
  // 기존 필드
  word: string;
  meaning: string;
  partOfSpeech: string;
  pronunciation: string;
  sentenceIndex: number;
  difficulty: "basic" | "intermediate" | "advanced";

  // 확장 필드 (5-layer)
  synonyms?: string[];
  antonyms?: string[];
  derivatives?: string[];              // educate → education, educational
  collocations?: string[];             // make a decision, take action
  englishDefinition?: string;          // 영영풀이
  confusableWords?: string[];          // affect vs effect
  contextMeaning?: string;             // 문맥 속 특정 의미
  examType?: VocabExamType;            // 출제 예상 유형
}

export type VocabExamType =
  | "빈칸추론"
  | "동의어"
  | "영영풀이"
  | "문맥추론"
  | "어휘적절성";

// ─── Layer 2: 문법/어법 분석 ─────────────────────────────
export interface GrammarPoint {
  // 기존 필드
  id: string;
  pattern: string;
  explanation: string;
  textFragment: string;
  sentenceIndex: number;
  examples: string[];
  level: string;

  // 확장 필드 (5-layer)
  examType?: GrammarExamType;          // 출제 예상 유형
  commonMistake?: string;              // 오답 함정 (학생이 자주 틀리는 이유)
  transformations?: string[];          // 변형 가능 방향 (능동↔수동, 분사구문 전환)
  gradeLevel?: GradeLevel;             // 학년별 위계
  relatedGrammar?: string[];           // 연관/혼동 문법
  csatFrequency?: CsatFrequency;      // 수능 빈출 여부
}

export type GrammarExamType =
  | "어법객관식"
  | "서술형고치기"
  | "문장전환"
  | "빈칸"
  | "어순배열";

export type GradeLevel =
  | "중1" | "중2" | "중3"
  | "고1" | "고2" | "고3/수능";

export type CsatFrequency =
  | "최다빈출"
  | "빈출"
  | "간헐"
  | "해당없음";

// ─── Layer 3: 구문 분석 (신규) ───────────────────────────
export interface SyntaxItem {
  sentenceIndex: number;
  structure: string;                   // S/V/O/C 분석 ("S[주어] + V[동사] + O[목적어]")
  chunkReading: string;                // 끊어읽기 ("When he dissolved it / in methylated spirit, / the mixture blossomed / into a rich purple.")
  patternType?: string;                // 도치, 강조, 가정법, 분사구문, 삽입, 생략 등
  transformPoint?: string;             // 전환 가능 지점 설명
  complexity: "simple" | "compound" | "complex" | "compound-complex";
  keyPhrase?: string;                  // 핵심 구문 (원문 발췌)
}

// ─── Layer 4: 독해/구조 분석 (확장) ─────────────────────
export interface StructureAnalysis {
  // 기존 필드
  mainIdea: string;
  purpose: string;
  textType: string;
  paragraphSummaries: ParagraphSummary[];
  keyPoints: string[];

  // 확장 필드 (5-layer)
  logicFlow?: LogicFlowItem[];         // 논리 흐름 도식
  connectorAnalysis?: ConnectorItem[]; // 연결어 분석
  topicSentenceIndex?: number;         // Topic sentence 위치
  blankSuitablePositions?: string[];   // 빈칸 출제 적합 위치
  orderClues?: string[];               // 문장삽입/순서배열 단서
  tone?: string;                       // 글의 톤/어조
}

export interface ParagraphSummary {
  paragraphIndex: number;
  summary: string;
  role: string;
}

export interface LogicFlowItem {
  role: "주장" | "근거" | "예시" | "반론" | "결론" | "전환" | "부연";
  sentenceIndices: number[];
  summary: string;
}

export interface ConnectorItem {
  word: string;                        // However, Therefore, In addition...
  sentenceIndex: number;
  role: string;                        // 역접, 인과, 부연, 대조, 예시...
  examRelevance: string;               // 출제 연관성 설명
}

// ─── Layer 5: 변형 출제 설계 (신규) ─────────────────────
export interface ExamDesignAnalysis {
  paraphrasableSegments: ParaphraseSegment[];
  structureTransformPoints: TransformPoint[];
  summaryKeyPoints: string[];          // 요약문 작성용 핵심 내용
  descriptiveConditions: string[];     // 서술형 조건 설정 가능 포인트
}

export interface ParaphraseSegment {
  original: string;
  alternatives: string[];
  sentenceIndex: number;
  reason?: string;                     // 왜 이 구간이 출제 포인트인지
  questionExample?: string;            // 예상 출제 문항 예시
  difficulty?: string;                 // 기본/중급/고급
  relatedPoint?: string;               // 관련 어휘/문법 포인트
}

export interface TransformPoint {
  original: string;
  transformType: string;               // 수동태, 분사구문, 관계사절 축약 등
  example: string;
  sentenceIndex: number;
  reason?: string;                     // 왜 이 변형이 출제에 유용한지
  questionExample?: string;            // 예상 서술형 문항 예시
  difficulty?: string;                 // 기본/중급/고급
}

// ─── Utility types ───────────────────────────────────────

export type DetailInfo =
  | { type: "vocab"; data: VocabItem }
  | { type: "grammar"; data: GrammarPoint }
  | {
      type: "sentence";
      data: SentenceAnalysis;
      vocab: VocabItem[];
      grammar: GrammarPoint[];
    };

export interface TextSegment {
  type: "plain" | "vocab" | "grammar";
  text: string;
  data?: VocabItem | GrammarPoint;
}
