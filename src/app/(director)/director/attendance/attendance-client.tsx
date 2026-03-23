"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, ClipboardList } from "lucide-react";
import { KioskMode } from "@/components/attendance/kiosk-mode";
import { ManualMode } from "@/components/attendance/manual-mode";

interface AttendanceClientProps {
  academyId: string;
  classes: Array<{ id: string; name: string; schedule: string | null }>;
}

export function AttendanceClient({ academyId, classes }: AttendanceClientProps) {
  const [activeTab, setActiveTab] = useState("kiosk");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          출결 관리
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          키오스크 모드 또는 수동으로 출결을 관리합니다.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100/80 h-11">
          <TabsTrigger value="kiosk" className="gap-2 px-4 h-9">
            <Monitor className="h-4 w-4" />
            키오스크 모드
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2 px-4 h-9">
            <ClipboardList className="h-4 w-4" />
            수동 체크
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kiosk" className="mt-4">
          <KioskMode academyId={academyId} />
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          <ManualMode academyId={academyId} classes={classes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
