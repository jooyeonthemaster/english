// @ts-nocheck
import { cn, formatDate, getScoreColor } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StudentDetailGradesTabProps {
  stats: any;
}

export function StudentDetailGradesTab({ stats }: StudentDetailGradesTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-[#191F28]">
          시험 성적 이력
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.examSubmissions.length === 0 ? (
          <p className="text-sm text-[#8B95A1] py-8 text-center">
            시험 기록이 없습니다.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                <TableHead>시험명</TableHead>
                <TableHead className="w-[80px]">유형</TableHead>
                <TableHead className="w-[80px]">점수</TableHead>
                <TableHead className="w-[80px]">총점</TableHead>
                <TableHead className="w-[80px]">득점률</TableHead>
                <TableHead className="w-[110px]">응시일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.examSubmissions.map((exam: any) => {
                const percent =
                  exam.score != null && exam.totalPoints
                    ? Math.round((exam.score / exam.totalPoints) * 100)
                    : null;
                return (
                  <TableRow key={exam.id}>
                    <TableCell className="font-medium text-[#191F28]">
                      {exam.exam.title}
                    </TableCell>
                    <TableCell className="text-sm text-[#6B7684]">
                      {exam.exam.examType === "MIDTERM"
                        ? "중간"
                        : exam.exam.examType === "FINAL"
                        ? "기말"
                        : exam.exam.examType}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-bold",
                        percent != null ? getScoreColor(percent) : ""
                      )}
                    >
                      {exam.score ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm text-[#6B7684]">
                      {exam.totalPoints ?? "-"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        percent != null ? getScoreColor(percent) : ""
                      )}
                    >
                      {percent != null ? `${percent}%` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-[#8B95A1]">
                      {formatDate(exam.submittedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
