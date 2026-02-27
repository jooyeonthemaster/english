"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "확인",
  cancelText = "취소",
  variant = "default",
}: ConfirmDialogProps) {
  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-w-[320px] gap-0 overflow-hidden rounded-2xl border-0 p-0",
          "bg-white/90 backdrop-blur-xl shadow-float",
          "data-[state=open]:animate-scale-in"
        )}
      >
        <DialogHeader className="px-6 pt-7 pb-3">
          <DialogTitle className="text-[17px] font-bold tracking-tight text-[#1A1F16]">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[14px] leading-relaxed text-[#6B7265]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2.5 px-6 pt-3 pb-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={cn(
              "flex-1 h-12 rounded-xl border-[#E5E7E0] text-[14px] font-semibold text-[#4A5043]",
              "hover:bg-[#FAFBF8] hover:text-[#1A1F16] hover:border-[#C8CCC2]",
              "transition-all duration-150"
            )}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            className={cn(
              "flex-1 h-12 rounded-xl text-[14px] font-semibold",
              "transition-all duration-150",
              variant === "default" &&
                "gradient-primary text-white shadow-glow-green hover:opacity-90",
              variant === "destructive" &&
                "bg-gradient-to-r from-[#EF4444] to-[#DC2626] text-white hover:opacity-90"
            )}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
