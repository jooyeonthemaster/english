// generation-config-panel.tsx 에서 분리한 Props 인터페이스 (verbatim 이동).
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";

export interface GenerationConfigPanelProps {
  // Mode
  genMode: "manual" | "set";
  setGenMode: (v: "manual" | "set") => void;
  /** 워크스페이스의 특정 지문만 개별 설정 중인지 — 장문 세트 빌더 바인딩에 쓴다. */
  editingRow?: boolean;
  /** 개별 설정 중인 지문 id — 장문 세트 모드일 때 이 지문으로 세트를 만든다. */
  activePassageId?: string | null;
  /** 개별 설정 중인 지문의 세트 프리셋(controlled) — 있으면 지문별 저장. */
  setPresetId?: string | null;
  onSetPresetChange?: (presetId: string | null) => void;
  /** 개별 설정 중인 지문의 세트 프리셋별 생성 개수. */
  setPresetCounts?: Record<string, number>;
  onSetPresetCountsChange?: (next: Record<string, number>) => void;
  /**
   * 세트 멤버별 난이도·세부설정 오버라이드(controlled) — 프리셋 멤버 순서와 평행한
   * 배열. 있으면 지문별 저장(SetBuilderPanel 로 그대로 전달).
   */
  setMemberOverrides?: Array<{
    difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
    generationPlan?: QuestionGenerationPlan;
    typeSettings?: Record<string, unknown>;
  }>;
  onSetMemberOverridesChange?: (
    next: Array<{
      difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
      generationPlan?: QuestionGenerationPlan;
      typeSettings?: Record<string, unknown>;
    }>,
  ) => void;
  setMemberOverridesByPreset?: Record<
    string,
    Array<{
      difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
      generationPlan?: QuestionGenerationPlan;
      typeSettings?: Record<string, unknown>;
    }>
  >;
  onSetMemberOverridesByPresetChange?: (
    next: Record<
      string,
      Array<{
        difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
        generationPlan?: QuestionGenerationPlan;
        typeSettings?: Record<string, unknown>;
      }>
    >,
  ) => void;
  generationPlan: QuestionGenerationPlan;
  setGenerationPlan: (v: QuestionGenerationPlan) => void;

  // Manual config
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (v: Record<string, number>) => void;
  questionTypeSettings: QuestionTypeGenerationSettings;
  setQuestionTypeSettings: (
    v:
      | QuestionTypeGenerationSettings
      | ((
          prev: QuestionTypeGenerationSettings,
        ) => QuestionTypeGenerationSettings),
  ) => void;
  totalQuestions: number;
  /**
   * 활성 지문의 문장 수 — 문장삽입(SENTENCE_INSERT)처럼 일정 문장 수를 요구하는
   * 유형을 짧은 지문에서 비활성화(게이팅)하는 데 쓴다. 미전달(undefined) 시
   * 게이팅하지 않음(다른 호출자 무영향).
   */
  passageSentenceCount?: number;

  // Difficulty
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  setDifficulty: (v: "BASIC" | "INTERMEDIATE" | "KILLER") => void;

  // Prompt
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  savedPrompts: { id: string; name: string; content: string }[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  savePromptName: string;
  setSavePromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;
  editingPromptId: string | null;
  setEditingPromptId: (v: string | null) => void;
  editingName: string;
  setEditingName: (v: string) => void;
  loadSavedPrompts: () => void;

  // Generate
  canGenerate: boolean;
  selectedIds: Set<string>;
  handleBatchGenerate: () => void;

  // 지문 워크스페이스 모드 — 행이 1개라도 불러와지면 생성 버튼은 워크스페이스
  // 기준으로 동작한다 (라이브러리 직접 선택 생성 대신).
  workspaceActive?: boolean;
  /** 워크스페이스에 없는, 내 지문에서 체크만 된 생성 대상 수. */
  workspaceSelectedOnlyCount?: number;
  workspaceRowCount?: number;
  workspaceTotalQuestions?: number;
  workspaceCreditCost?: number;
  workspaceVariantCount?: number;
  workspaceGenerating?: boolean;
  onWorkspaceGenerate?: () => void;
  /**
   * 패널 하단의 생성 버튼들을 숨긴다 — 지문별 '문제 생성' 모달처럼 생성 CTA 를
   * 패널 바깥(모달 푸터)에서 제공할 때 쓴다. 미지정 시 기존처럼 버튼을 렌더한다.
   */
  hideGenerateButtons?: boolean;
  /**
   * 제품 투어가 진행 중인지 — true 면 카테고리 그룹을 강제로 모두 펼쳐 투어가
   * 가리키는 유형 행(type-add-button 등)이 항상 보이게 한다.
   */
  tourActive?: boolean;
}
