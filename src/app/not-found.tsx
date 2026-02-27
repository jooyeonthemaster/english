import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-5">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#F2F3F6]">
        <FileQuestion className="size-8 text-[#8B95A1]" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-[18px] font-semibold text-[#191F28]">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-[14px] text-[#8B95A1]">
          요청하신 페이지가 존재하지 않습니다
        </p>
      </div>
      <Link
        href="/"
        className="flex h-10 items-center rounded-xl bg-[#7CB342] px-5 text-[14px] font-medium text-white transition-colors active:bg-[#689F38]"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
