"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CredentialInfo } from "./types";

interface CredentialDialogProps {
  info: CredentialInfo | null;
  onClose: () => void;
}

export function CredentialDialog({ info, onClose }: CredentialDialogProps) {
  return (
    <Dialog open={!!info} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-500" />
            승인 완료
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            <strong>{info?.academyName}</strong> 학원이 승인되었습니다.
            아래 로그인 정보를 원장님께 전달해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">이메일 (아이디)</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[14px] font-semibold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-200">
                  {info?.email}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-9 text-[12px]"
                  onClick={() => {
                    navigator.clipboard.writeText(info?.email || "");
                    toast.success("이메일 복사됨");
                  }}
                >
                  복사
                </Button>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">임시 비밀번호</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[14px] font-semibold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-200 tracking-wider">
                  {info?.tempPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-9 text-[12px]"
                  onClick={() => {
                    navigator.clipboard.writeText(info?.tempPassword || "");
                    toast.success("비밀번호 복사됨");
                  }}
                >
                  복사
                </Button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            이 비밀번호는 다시 확인할 수 없습니다. 반드시 원장님께 전달한 후 이 창을 닫아주세요.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
