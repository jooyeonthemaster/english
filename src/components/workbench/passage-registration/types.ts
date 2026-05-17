export interface RecentPassage {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  source: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData: string } | null;
  _count: { questions: number; notes: number };
}

export interface PassageCollection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number };
}

export interface DraftCollectionItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number; children: number };
}

export interface PassageRegistrationProps {
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  recentPassages?: RecentPassage[];
  initialCollections?: PassageCollection[];
  draftCollections?: DraftCollectionItem[];
  draftMembership?: Record<string, string[]>;
}

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}
