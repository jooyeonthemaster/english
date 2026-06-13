"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getStudentRegisteredDevices,
  type StudentDeviceItem,
} from "@/actions/students";
import { StudentCodeRow } from "./student-code-row";
import { DeviceSlotGrid } from "./device-slot-grid";
import { RevokeDeviceDialog } from "./revoke-device-dialog";
import { RegenerateCodeDialog } from "./regenerate-code-dialog";

/**
 * 학생 상세 "개요" 탭의 보안/접속 카드: 학생 코드(표시·복사·재발급) + 등록 기기(2칸) 관리.
 * 데이터는 클라이언트에서 직접 로드해 상세 페이지 props 배선을 건드리지 않는다.
 */
export function StudentAccessCard({
  studentId,
  studentCode,
  isDirector,
}: {
  studentId: string;
  studentCode: string;
  isDirector: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(studentCode);
  const [devices, setDevices] = useState<StudentDeviceItem[] | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<StudentDeviceItem | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);

  async function load() {
    try {
      setDevices(await getStudentRegisteredDevices(studentId));
    } catch {
      setDevices([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return (
    <Card className="rounded-xl border-[#E5E8EB] shadow-none">
      <CardHeader className="border-b border-[#F2F4F6] pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#191F28]">
          <KeyRound className="size-4 text-[#3182F6]" />
          학생 코드 &amp; 접속
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <StudentCodeRow
          code={code}
          isDirector={isDirector}
          onReissueClick={() => setRegenOpen(true)}
        />

        {devices === null ? (
          <div className="flex items-center justify-center py-8 text-[#8B95A1]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <DeviceSlotGrid devices={devices} isDirector={isDirector} onRevoke={setRevokeTarget} />
        )}

        <div className="flex items-start gap-2 border-t border-[#F2F4F6] pt-4 text-xs font-medium text-[#8B95A1]">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            웹 기반이라 완벽한 차단은 어려워요. 학생이 브라우저 데이터를 지우면 슬롯이 다시 비워질
            수 있는 소프트 제한이에요.
          </p>
        </div>
      </CardContent>

      <RevokeDeviceDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        studentId={studentId}
        device={revokeTarget}
        onDone={() => {
          setRevokeTarget(null);
          void load();
          router.refresh();
        }}
      />
      <RegenerateCodeDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        studentId={studentId}
        onReissued={(newCode) => {
          setCode(newCode);
          void load();
          router.refresh();
        }}
      />
    </Card>
  );
}
