"use client";

import { useEffect, useState } from "react";
import { Printer, Gift } from "lucide-react";
import type { PrintHandoff } from "@/components/admin/printable-coupons-admin-client";

const PRINT_STORAGE_PREFIX = "printable-coupon-print:";

/** 헤드라인의 숫자(크레딧 수·금액·%)만 크게·파랑으로 강조해 렌더. */
function renderHeadline(headline: string) {
  const m = headline.match(/^(.*?)(\d[\d,]*)(.*)$/);
  if (!m) return headline;
  return (
    <>
      {m[1]}
      <b className="ticket-headline-num">{m[2]}</b>
      {m[3]}
    </>
  );
}

/**
 * A4 세로 2열×5행 = 10장/쪽. 발급 응답을 localStorage로 넘겨받아 렌더 후 인쇄.
 * @media print 규칙은 파일 하단 style 태그(색유지·잘림방지)로 인라인한다.
 */
export function CouponPrintView({ batchId }: { batchId: string }) {
  const [handoff, setHandoff] = useState<PrintHandoff | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRINT_STORAGE_PREFIX + batchId);
      if (raw) setHandoff(JSON.parse(raw) as PrintHandoff);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, [batchId]);

  if (!loaded) return null;

  if (!handoff || !handoff.cards.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8 text-center">
        <div>
          <p className="text-[15px] font-semibold text-gray-800">
            인쇄할 쿠폰 데이터를 찾을 수 없습니다.
          </p>
          <p className="mt-1 text-[13px] text-gray-500">
            QR 원본 토큰은 보안상 저장하지 않아 재인쇄가 불가합니다. 관리자
            화면에서 발급 직후 인쇄하거나, 새 배치로 재발급하세요.
          </p>
        </div>
      </div>
    );
  }

  // 10장/쪽으로 페이지 분할.
  const pages: PrintHandoff["cards"][] = [];
  for (let i = 0; i < handoff.cards.length; i += 10) {
    pages.push(handoff.cards.slice(i, i + 10));
  }

  return (
    <div className="coupon-print-root">
      {/* 화면 전용 툴바(인쇄 시 숨김) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <div>
          <p className="text-[14px] font-bold text-gray-900">
            {handoff.batchName}
          </p>
          <p className="text-[12px] text-gray-500">
            {handoff.title} · {handoff.cards.length}장 · {pages.length}쪽
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800"
        >
          <Printer className="size-4" />
          인쇄
        </button>
      </div>

      <div className="coupon-print-pages">
        {pages.map((cards, pi) => (
          <div key={pi} className="coupon-page">
            {cards.map((c) => (
              <div key={c.serialNumber} className="coupon-card">
                <div className="ticket">
                  <div className="ticket-main">
                    <div className="ticket-brand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/smoat-logo.png"
                        alt="SMOAT"
                        className="ticket-logo"
                      />
                      <div className="ticket-brand-text">
                        <span className="ticket-wordmark">SMOAT</span>
                        <span className="ticket-tagline-top">
                          AI 영어 문제 생성 플랫폼
                        </span>
                      </div>
                    </div>

                    {handoff.title && (
                      <p className="ticket-name">{handoff.title}</p>
                    )}

                    <p className="ticket-headline">
                      {renderHeadline(handoff.headline)}
                    </p>

                    <div className="ticket-code">{c.serialNumber}</div>

                    <div className="ticket-bottom">
                      {(handoff.registerBy || handoff.creditExpiry) && (
                        <p className="ticket-valid">
                          {handoff.registerBy
                            ? `등록 마감 ${handoff.registerBy}`
                            : ""}
                          {handoff.registerBy && handoff.creditExpiry
                            ? " · "
                            : ""}
                          {handoff.creditExpiry
                            ? `크레딧 ${handoff.creditExpiry}까지 유효`
                            : ""}
                        </p>
                      )}
                      <p className="ticket-foot">
                        <Gift className="ticket-foot-icon" />
                        {handoff.description ||
                          "더 스마트한 영어 수업, 스모트와 함께 시작하세요"}
                      </p>
                    </div>
                  </div>

                  <div className="ticket-perf" />

                  <div className="ticket-stub">
                    <span className="ticket-stub-label">LOGIN &amp; GET</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.qrImageUrl}
                      alt={`쿠폰 ${c.serialNumber} QR`}
                      className="ticket-qr"
                    />
                    <span className="ticket-stub-cap">QR 스캔 후 코드 등록</span>
                    <span className="ticket-stub-url">smoat.kr/coupon</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        .coupon-print-root { background: #e5e7eb; min-height: 100vh; }
        .coupon-print-pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 0; }
        /* 페이지를 꽉 채우는 2열×5행 그리드. 각 셀에 티켓형 쿠폰 1장(여백으로 분리 → 재단). */
        .coupon-page {
          width: 210mm; height: 297mm; background: #ffffff;
          display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(5, 1fr);
          gap: 0; box-sizing: border-box;
          box-shadow: 0 1px 6px rgba(0,0,0,0.12);
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        /* 셀을 꽉 채워 여백(흰색)이 안 보이게 — 격자 그대로 재단. */
        .coupon-card {
          box-sizing: border-box; padding: 0; overflow: hidden;
          page-break-inside: avoid; break-inside: avoid;
        }

        /* ── 티켓 본체 (풀블리드: 라운드·테두리·여백 없음, 흰 배경) ── */
        .ticket {
          position: relative; width: 100%; height: 100%; box-sizing: border-box;
          display: flex; overflow: hidden; background: #ffffff;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .ticket-main {
          flex: 1 1 auto; min-width: 0; padding: 4.4mm 5mm 4mm;
          display: flex; flex-direction: column;
        }
        .ticket-brand { display: flex; align-items: center; gap: 2mm; }
        .ticket-logo { width: 7mm; height: 7mm; border-radius: 1.6mm; flex: 0 0 auto; object-fit: cover; }
        .ticket-brand-text { display: flex; flex-direction: column; line-height: 1.06; min-width: 0; }
        .ticket-wordmark { font-size: 4mm; font-weight: 800; color: #0f172a; letter-spacing: 0.2mm; }
        .ticket-tagline-top { font-size: 2.1mm; color: #94a3b8; font-weight: 600; }
        .ticket-name {
          margin: 2mm 0 0; font-size: 2.8mm; font-weight: 700; color: #2563eb;
          letter-spacing: 0.1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ticket-headline {
          font-size: 5.2mm; font-weight: 800; color: #0f172a;
          margin: 1.6mm 0 0; line-height: 1.12; letter-spacing: -0.1mm;
        }
        .ticket-headline-num { color: #2563eb; font-size: 6.6mm; font-weight: 800; }
        .ticket-code {
          margin-top: 2.4mm; align-self: stretch; text-align: center;
          background: #eff6ff; border: 0.3mm dashed #93c5fd; border-radius: 2mm;
          padding: 1.9mm 1.5mm; font-family: ui-monospace, Menlo, monospace;
          font-weight: 800; font-size: 4.8mm; letter-spacing: 1.4mm; color: #1d4ed8;
        }
        .ticket-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 1mm; }
        .ticket-valid { margin: 0; font-size: 2.1mm; font-weight: 600; color: #64748b; }
        .ticket-foot {
          margin: 0; display: flex; align-items: center; gap: 1.3mm;
          font-size: 2.2mm; color: #64748b; line-height: 1.2;
        }
        .ticket-foot-icon { width: 3mm; height: 3mm; color: #2563eb; flex: 0 0 auto; }

        /* ── 절취선(점선만 — 흰 노치 없음) ── */
        .ticket-perf { width: 0; flex: 0 0 auto; border-left: 0.3mm dashed #a9c4ef; }

        /* ── 우측 스텁(QR) — 넓고 크게 ── */
        .ticket-stub {
          flex: 0 0 34mm; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1.4mm; padding: 3mm 2.5mm;
        }
        .ticket-stub-label { font-size: 2.2mm; font-weight: 800; letter-spacing: 0.4mm; color: #2563eb; }
        .ticket-qr { width: 25mm; height: 25mm; }
        .ticket-stub-cap { font-size: 2.1mm; color: #64748b; text-align: center; }
        .ticket-stub-url { font-size: 2.1mm; color: #94a3b8; }

        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .coupon-print-root { background: #fff; }
          .coupon-print-pages { gap: 0; padding: 0; }
          .coupon-page { box-shadow: none; break-after: page; }
          .coupon-page:last-child { break-after: auto; }
        }
      `}</style>
    </div>
  );
}
