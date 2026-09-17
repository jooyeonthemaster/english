import type {
  Density,
  PaperCover,
  PaperItem,
  PaperSize,
  PaperTemplate,
  PassageStyle,
} from "./types";

const DB_NAME = "smoat.examPaperBuilder";
const DB_VERSION = 1;
const DRAFT_STORE_NAME = "drafts";

export type ExamPaperBuilderDraftState = {
  savedExamId: string | null;
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
  examDate: string;
  classId: string;
  schoolId: string;
  grade: string;
  semester: string;
  examType: string;
  template: PaperTemplate;
  paperSize: PaperSize;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  forceTwoPerPage: boolean;
  autoPointTotal: number | null;
  cover: PaperCover;
  paperItems: PaperItem[];
  activeItemId: string | null;
  dirty: boolean;
};

export type ExamPaperBuilderDraft = {
  key: string;
  academyId: string;
  version: 1;
  updatedAt: string;
  state: ExamPaperBuilderDraftState;
};

export function getExamPaperBuilderDraftKey(academyId: string, scope?: string) {
  // scope: create 슬롯이 academyId 당 1개뿐이라 임베드 호스트(스튜디오 오버레이)와
  // 기존 생성 페이지가 같은 초안을 쟁탈하지 않도록 키를 갈라주는 접미사.
  const base = `exam-paper-builder:create:${academyId}`;
  return scope ? `${base}:${scope}` : base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeDraft(value: unknown): ExamPaperBuilderDraft | null {
  if (!isRecord(value) || !isRecord(value.state)) return null;
  if (typeof value.key !== "string" || typeof value.academyId !== "string") {
    return null;
  }
  if (!Array.isArray(value.state.paperItems)) return null;

  return {
    key: value.key,
    academyId: value.academyId,
    version: 1,
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date().toISOString(),
    state: value.state as ExamPaperBuilderDraftState,
  };
}

function openDraftDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onblocked = () =>
      reject(new Error("IndexedDB upgrade was blocked by another tab."));
  });
}

export async function readExamPaperBuilderDraft(
  key: string,
): Promise<ExamPaperBuilderDraft | null> {
  const db = await openDraftDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE_NAME, "readonly");
    const store = transaction.objectStore(DRAFT_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(normalizeDraft(request.result));
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to read draft."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Failed to read draft."));
    };
  });
}

export async function writeExamPaperBuilderDraft(
  draft: ExamPaperBuilderDraft,
): Promise<void> {
  const db = await openDraftDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DRAFT_STORE_NAME);
    const request = store.put(draft);

    request.onerror = () =>
      reject(request.error ?? new Error("Failed to write draft."));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Failed to write draft."));
    };
  });
}

export async function deleteExamPaperBuilderDraft(key: string): Promise<void> {
  const db = await openDraftDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DRAFT_STORE_NAME);
    const request = store.delete(key);

    request.onerror = () =>
      reject(request.error ?? new Error("Failed to delete draft."));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Failed to delete draft."));
    };
  });
}
