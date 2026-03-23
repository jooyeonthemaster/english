import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";

type SchoolWithCounts = {
  id: string;
  name: string;
  slug: string;
  type: string;
  _count: {
    vocabLists: number;
    exams: number;
    passages: number;
  };
};

function SchoolTable({ schools }: { schools: SchoolWithCounts[] }) {
  if (schools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[14px] text-[#8B95A1]">등록된 학교가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#F2F4F6] bg-white">
      <Table>
        <TableHeader>
          <TableRow className="border-[#F2F4F6] hover:bg-transparent">
            <TableHead className="pl-6 text-[13px] font-medium text-[#8B95A1]">
              학교명
            </TableHead>
            <TableHead className="text-[13px] font-medium text-[#8B95A1]">
              유형
            </TableHead>
            <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
              등록 단어장
            </TableHead>
            <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
              등록 시험
            </TableHead>
            <TableHead className="text-center text-[13px] font-medium text-[#8B95A1]">
              등록 지문
            </TableHead>
            <TableHead className="w-10 pr-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {schools.map((school) => (
            <TableRow
              key={school.id}
              className="group border-[#F2F4F6] transition-colors hover:bg-[#F7F8FA]"
            >
              <TableCell className="pl-6">
                <Link
                  href={`/admin/schools/${school.slug}`}
                  className="block text-[14px] font-medium text-[#191F28] group-hover:text-[#3182F6]"
                >
                  {school.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={
                    school.type === "MIDDLE"
                      ? "bg-[#E8F3FF] text-[#3182F6] hover:bg-[#E8F3FF]"
                      : "bg-[#F3EEFF] text-[#8B5CF6] hover:bg-[#F3EEFF]"
                  }
                >
                  {school.type === "MIDDLE" ? "중학교" : "고등학교"}
                </Badge>
              </TableCell>
              <TableCell className="text-center text-[14px] text-[#4E5968]">
                {school._count.vocabLists}
              </TableCell>
              <TableCell className="text-center text-[14px] text-[#4E5968]">
                {school._count.exams}
              </TableCell>
              <TableCell className="text-center text-[14px] text-[#4E5968]">
                {school._count.passages}
              </TableCell>
              <TableCell className="pr-6">
                <Link href={`/admin/schools/${school.slug}`}>
                  <ChevronRight className="size-4 text-[#ADB5BD] transition-colors group-hover:text-[#3182F6]" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function SchoolsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  const schools = await prisma.school.findMany({
    include: {
      _count: {
        select: {
          vocabLists: true,
          exams: true,
          passages: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const middleSchools = schools.filter((s) => s.type === "MIDDLE");
  const highSchools = schools.filter((s) => s.type === "HIGH");

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-[#191F28]">학교 관리</h1>
        <p className="mt-1 text-[14px] text-[#8B95A1]">
          총 {schools.length}개 학교 (중학교 {middleSchools.length}개, 고등학교{" "}
          {highSchools.length}개)
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList variant="line">
          <TabsTrigger value="all">
            전체 ({schools.length})
          </TabsTrigger>
          <TabsTrigger value="middle">
            중학교 ({middleSchools.length})
          </TabsTrigger>
          <TabsTrigger value="high">
            고등학교 ({highSchools.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <SchoolTable schools={schools} />
        </TabsContent>

        <TabsContent value="middle">
          <SchoolTable schools={middleSchools} />
        </TabsContent>

        <TabsContent value="high">
          <SchoolTable schools={highSchools} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
