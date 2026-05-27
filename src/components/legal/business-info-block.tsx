import Link from "next/link";
import {
  BUSINESS_INFO,
  BUSINESS_INFO_FIELDS,
  hasMissingBusinessInfo,
} from "@/lib/legal/business-info";
import { cn } from "@/lib/utils";

type BusinessInfoBlockProps = {
  compact?: boolean;
  className?: string;
  showPolicyLinks?: boolean;
};

export function BusinessInfoBlock({
  compact = false,
  className,
  showPolicyLinks = true,
}: BusinessInfoBlockProps) {
  return (
    <section
      className={cn(
        "border-t border-slate-200 bg-white/80",
        compact ? "px-4 py-4" : "px-5 py-6 sm:px-8",
        className,
      )}
      aria-label="사업자 정보"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[13px] font-black tracking-widest text-slate-900">
              {BUSINESS_INFO.brandName}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              결제, 환불, 서비스 이용 관련 문의는{" "}
              <a
                href={`mailto:${BUSINESS_INFO.email}`}
                className="font-semibold text-blue-700"
              >
                {BUSINESS_INFO.email}
              </a>
              로 접수해 주세요.
            </p>
            {hasMissingBusinessInfo() && (
              <p className="mt-2 text-[11px] font-semibold text-rose-600">
                사업자 정보 중 일부가 비어 있습니다. 심사 제출 전 환경변수에
                실제 정보를 입력하고, 전화번호는 휴대폰번호가 아닌 대표
                전화번호로 입력해야 합니다.
              </p>
            )}
          </div>

          {showPolicyLinks && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-slate-500">
              <Link
                href="/credits/products"
                className="transition hover:text-slate-900"
              >
                상품 정보
              </Link>
              <Link href="/terms" className="transition hover:text-slate-900">
                이용약관
              </Link>
              <Link href="/privacy" className="transition hover:text-slate-900">
                개인정보처리방침
              </Link>
              <Link
                href="/refund-policy"
                className="transition hover:text-slate-900"
              >
                환불 정책
              </Link>
            </div>
          )}
        </div>

        <dl
          className={cn(
            "mt-4 grid gap-x-4 gap-y-2 text-[11px] leading-5 text-slate-500",
            compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {BUSINESS_INFO_FIELDS.map((field) => {
            const missing = field.value === "심사 제출 전 입력 필요";
            const isVerifyUrl = field.label === "사업자정보 확인";

            return (
              <div key={field.label} className="flex gap-2">
                <dt className="shrink-0 font-semibold text-slate-400">
                  {field.label}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 break-keep font-medium text-slate-600",
                    missing && "text-rose-600",
                  )}
                >
                  {isVerifyUrl && !missing ? (
                    <a
                      href={field.value}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 transition hover:text-blue-800"
                    >
                      공개페이지
                    </a>
                  ) : (
                    field.value
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
