export interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  school: { id: string; name: string } | null;
  content: string;
}

export interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
  publishers: string[];
}

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}
