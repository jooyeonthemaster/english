"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  Users,
  BarChart3,
  Settings,
  Send,
  Pencil,
  ChevronDown,
  ChevronUp,
  Check,
  Download,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { publishExam } from "@/actions/exams";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExamQuestion {
  id: string;
  orderNum: number;
  points: number;
  question: {
    id: string;
    type: string;
    questionText: string;
    options: string | null;
    correctAnswer: string;
    difficulty: string;
    explanation: { content: string } | null;
  };
}

interface Submission {
  id: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  startedAt: string | Date;
  submittedAt: string | Date | null;
  gradedAt: string | Date | null;
  student: { id: string; name: string; studentCode: string };
}

interface ExamDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  duration: number | null;
  totalPoints: number;
  grade: number | null;
  semester: string | null;
  examType: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: boolean;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  questions: ExamQuestion[];
  submissions: Submission[];
}

interface AnalyticsData {
  totalStudents: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  distribution: number[];
  questionAnalysis: {
    questionId: string;
    orderNum: number;
    questionText: string;
    correctRate: number;
  }[];
}

interface Props {
  exam: ExamDetail;
  analytics: AnalyticsData | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PUBLISHED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

const SUB_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "응시중",
  SUBMITTED: "채점대기",
  GRADED: "채점완료",
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "단답형",
  ESSAY: "서술형",
  FILL_BLANK: "빈칸",
  ORDERING: "순서",
  VOCAB: "단어",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "고난도",
};

// ---------------------------------------------------------------------------
// Text formatting helpers
// ---------------------------------------------------------------------------

function renderFormatted(text: string): React.ReactNode {
  const regex = /__([^_]+)__|_{3,}|([①②③④⑤])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <span key={key++} className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      parts.push(
        <span key={key++} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold mx-0.5">
          {match[2]}
        </span>
      );
    } else {
      parts.push(
        <span key={key++} className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline">&nbsp;</span>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Exam Question Card (for questions tab)
// ---------------------------------------------------------------------------

function ExamQuestionCard({ eq }: { eq: ExamQuestion }) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const q = eq.question;
  const options = safeParseJSON<{ label: string; text: string }[]>(q.options, []);
  const diffLabel = DIFFICULTY_LABELS[q.difficulty] || q.difficulty;
  const diffClass =
    q.difficulty === "KILLER"
      ? "bg-red-50 text-red-700 border-red-200"
      : q.difficulty === "INTERMEDIATE"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";

  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#3182F6] text-white text-[11px] font-bold shrink-0">
          {eq.orderNum}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {QUESTION_TYPE_LABELS[q.type] || q.type}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${diffClass}`}>
          {diffLabel}
        </Badge>
        <span className="text-[10px] text-[#8B95A1] ml-auto">
          {eq.points}점
        </span>
      </div>

      {/* Question text */}
      <div className="text-[13px] text-[#191F28] leading-relaxed whitespace-pre-line">
        {renderFormatted(q.questionText)}
      </div>

      {/* Options */}
      {options.length > 0 && (
        <div className="space-y-1 pl-1">
          {options.map((opt) => {
            const isCorrect = opt.label === q.correctAnswer;
            return (
              <div
                key={opt.label}
                className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                  isCorrect
                    ? "bg-emerald-50 text-emerald-800 font-medium"
                    : "text-slate-600"
                }`}
              >
                <span
                  className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isCorrect ? <Check className="w-3 h-3" /> : opt.label}
                </span>
                <span className="pt-0.5">{renderFormatted(opt.text)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MC answer */}
      {options.length === 0 && q.correctAnswer && (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">정답:</span> {q.correctAnswer}
        </div>
      )}

      {/* Explanation */}
      {q.explanation && (
        <div className="border-t border-[#F2F4F6] pt-2">
          <button
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            onClick={() => setExplanationOpen(!explanationOpen)}
          >
            {explanationOpen ? "해설 접기" : "해설 보기"}
            {explanationOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {explanationOpen && (
            <div className="mt-2 bg-amber-50/50 border border-amber-100 rounded-md px-3 py-2">
              <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">
                {q.explanation.content}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamDetailClient({ exam, analytics }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("questions");

  const gradedCount = exam.submissions.filter(
    (s) => s.status === "GRADED"
  ).length;
  const totalSubs = exam.submissions.length;

  function handlePublish() {
    startTransition(async () => {
      const result = await publishExam(exam.id);
      if (result.success) {
        toast.success("시험이 배포되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "배포에 실패했습니다.");
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/director/exams")}
            className="shrink-0 mt-0.5"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-[#191F28]">
                {exam.title}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATUS_COLORS[exam.status]
                )}
              >
                {STATUS_LABELS[exam.status]}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-[#8B95A1]">
              <span>{TYPE_LABELS[exam.type]}</span>
              {exam.class && <span>{exam.class.name}</span>}
              {exam.examDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {formatDate(exam.examDate)}
                </span>
              )}
              {exam.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {exam.duration}분
                </span>
              )}
              <span>{exam.totalPoints}점</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {exam.status === "DRAFT" && (
            <Button
              onClick={handlePublish}
              disabled={isPending || exam.questions.length === 0}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
            >
              <Send className="size-4 mr-1.5" />
              {isPending ? "배포 중..." : "배포하기"}
            </Button>
          )}
          {(exam.status === "IN_PROGRESS" || exam.status === "COMPLETED") &&
            exam.submissions.some((s) => s.status === "SUBMITTED") && (
              <Button asChild className="bg-[#3182F6] hover:bg-[#1B64DA]">
                <Link href={`/director/exams/${exam.id}/grade`}>
                  <Pencil className="size-4 mr-1.5" />
                  채점하기
                </Link>
              </Button>
            )}
          {exam.questions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="size-4 mr-1.5" />
                  시험지 다운로드
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/exams/${exam.id}/export-docx`} download>
                    <FileText className="size-4 mr-2" />
                    시험지 (문제만)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/exams/${exam.id}/export-docx?answers=true`} download>
                    <FileText className="size-4 mr-2" />
                    시험지 + 정답 해설
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">문제 수</p>
          <p className="text-2xl font-bold text-[#191F28]">
            {exam.questions.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">응시 인원</p>
          <p className="text-2xl font-bold text-[#191F28]">{totalSubs}</p>
        </div>
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">채점 완료</p>
          <p className="text-2xl font-bold text-[#191F28]">
            {gradedCount}/{totalSubs}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EB] bg-white p-4">
          <p className="text-xs text-[#8B95A1] mb-1">평균 점수</p>
          <p className="text-2xl font-bold text-[#191F28]">
            {analytics ? `${analytics.avgScore}` : "-"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#F7F8FA] border border-[#E5E8EB]">
          <TabsTrigger
            value="questions"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <FileText className="size-4 mr-1.5" />
            문제 목록
          </TabsTrigger>
          <TabsTrigger
            value="submissions"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <Users className="size-4 mr-1.5" />
            응시 현황
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <BarChart3 className="size-4 mr-1.5" />
            성적 분석
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="data-[state=active]:bg-white data-[state=active]:text-[#3182F6]"
          >
            <Settings className="size-4 mr-1.5" />
            설정
          </TabsTrigger>
        </TabsList>

        {/* Questions Tab */}
        <TabsContent value="questions" className="mt-4">
          {exam.questions.length === 0 ? (
            <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center text-[#8B95A1]">
              <FileText className="size-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">등록된 문제가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {exam.questions.map((eq) => (
                <ExamQuestionCard key={eq.id} eq={eq} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="mt-4">
          <div className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden">
            {exam.submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#8B95A1]">
                <Users className="size-12 mb-3 opacity-40" />
                <p className="text-sm">아직 응시한 학생이 없습니다.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                    <TableHead className="text-[#6B7684] font-semibold text-xs">
                      학생
                    </TableHead>
                    <TableHead className="text-[#6B7684] font-semibold text-xs">
                      상태
                    </TableHead>
                    <TableHead className="text-[#6B7684] font-semibold text-xs">
                      점수
                    </TableHead>
                    <TableHead className="text-[#6B7684] font-semibold text-xs">
                      응시 시작
                    </TableHead>
                    <TableHead className="text-[#6B7684] font-semibold text-xs">
                      제출 시간
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exam.submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium text-[#191F28]">
                        {sub.student.name}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            sub.status === "GRADED"
                              ? "bg-emerald-100 text-emerald-700"
                              : sub.status === "SUBMITTED"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {SUB_STATUS_LABELS[sub.status] || sub.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#4E5968]">
                        {sub.score != null
                          ? `${sub.score}/${sub.maxScore} (${Math.round(sub.percent || 0)}%)`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-[#8B95A1] text-sm">
                        {formatDateTime(sub.startedAt)}
                      </TableCell>
                      <TableCell className="text-[#8B95A1] text-sm">
                        {sub.submittedAt
                          ? formatDateTime(sub.submittedAt)
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-4">
          {!analytics || analytics.totalStudents === 0 ? (
            <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center text-[#8B95A1]">
              <BarChart3 className="size-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">채점된 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Score Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 text-center">
                  <p className="text-xs text-[#8B95A1]">평균</p>
                  <p className="text-2xl font-bold text-[#3182F6]">
                    {analytics.avgScore}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 text-center">
                  <p className="text-xs text-[#8B95A1]">최고점</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {analytics.maxScore}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 text-center">
                  <p className="text-xs text-[#8B95A1]">최저점</p>
                  <p className="text-2xl font-bold text-red-500">
                    {analytics.minScore}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 text-center">
                  <p className="text-xs text-[#8B95A1]">응시자</p>
                  <p className="text-2xl font-bold text-[#191F28]">
                    {analytics.totalStudents}
                  </p>
                </div>
              </div>

              {/* Score Distribution */}
              <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
                <h3 className="text-sm font-semibold text-[#191F28] mb-4">
                  점수 분포
                </h3>
                <div className="flex items-end gap-2 h-40">
                  {analytics.distribution.map((count, i) => {
                    const max = Math.max(...analytics.distribution, 1);
                    const height = (count / max) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <span className="text-[10px] text-[#8B95A1]">
                          {count}
                        </span>
                        <div
                          className={cn(
                            "w-full rounded-t transition-all",
                            i >= 9
                              ? "bg-emerald-400"
                              : i >= 7
                                ? "bg-blue-400"
                                : i >= 5
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                          )}
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <span className="text-[10px] text-[#8B95A1]">
                          {i * 10}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Question Analysis */}
              <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
                <h3 className="text-sm font-semibold text-[#191F28] mb-4">
                  문항별 정답률
                </h3>
                <div className="space-y-3">
                  {analytics.questionAnalysis.map((qa) => (
                    <div key={qa.questionId} className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-[#F7F8FA] text-xs font-bold text-[#4E5968] shrink-0">
                        {qa.orderNum}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#191F28] truncate mb-1">
                          {qa.questionText}
                        </p>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={qa.correctRate}
                            className="h-2 flex-1"
                          />
                          <span
                            className={cn(
                              "text-xs font-medium min-w-[36px] text-right",
                              qa.correctRate >= 70
                                ? "text-emerald-600"
                                : qa.correctRate >= 40
                                  ? "text-amber-600"
                                  : "text-red-600"
                            )}
                          >
                            {qa.correctRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <div className="rounded-xl border border-[#E5E8EB] bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#191F28]">
              시험 설정
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between py-2 border-b border-[#F2F4F6]">
                <span className="text-[#8B95A1]">문제 순서 섞기</span>
                <span className="text-[#191F28]">
                  {exam.shuffleQuestions ? "사용" : "미사용"}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#F2F4F6]">
                <span className="text-[#8B95A1]">선택지 순서 섞기</span>
                <span className="text-[#191F28]">
                  {exam.shuffleOptions ? "사용" : "미사용"}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#F2F4F6]">
                <span className="text-[#8B95A1]">결과 즉시 공개</span>
                <span className="text-[#191F28]">
                  {exam.showResults ? "사용" : "미사용"}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#F2F4F6]">
                <span className="text-[#8B95A1]">시간 제한</span>
                <span className="text-[#191F28]">
                  {exam.duration ? `${exam.duration}분` : "없음"}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
