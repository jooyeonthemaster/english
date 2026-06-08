"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TemplateId } from "@/lib/passage-report/schema";

interface TemplateMeta {
  id: TemplateId;
  label: string;
  description: string;
  thumbnail?: string;
  paletteName: string;
  primary: string;
  accent: string;
}

interface NewReportClientProps {
  passageId: string;
  passageTitle: string;
  hasAnalysis: boolean;
  templates: TemplateMeta[];
}

export function NewReportClient({
  passageId,
  passageTitle,
  hasAnalysis,
  templates,
}: NewReportClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<TemplateId>(templates[0]?.id ?? "modern");
  const [mode, setMode] = useState<"FROM_ANALYSIS" | "EMPTY">(
    hasAnalysis ? "FROM_ANALYSIS" : "EMPTY",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/workbench/passage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          passageId,
          templateId: selected,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "보고서를 만들지 못했습니다.");
      }
      router.push(`/director/workbench/passages/${passageId}/reports/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <Link
          href={`/director/workbench/passages/${passageId}/reports`}
          style={{ fontSize: 13, color: "rgb(71, 85, 105)" }}
        >
          ← 보고서 목록
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
          새 학습자료
        </h1>
        <span style={{ color: "rgb(100, 116, 139)", fontSize: 13 }}>{passageTitle}</span>
      </div>

      {/* 모드 선택 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "rgb(71, 85, 105)", margin: "0 0 8px" }}>
          1. 시작 방법
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <ModeOption
            label="분석에서 변환"
            description="이미 분석된 데이터로 본문/어휘/문법/요약을 자동으로 채워서 시작"
            active={mode === "FROM_ANALYSIS"}
            disabled={!hasAnalysis}
            onClick={() => setMode("FROM_ANALYSIS")}
          />
          <ModeOption
            label="빈 보고서"
            description="템플릿 레이아웃만 적용. 콘텐츠는 직접 채움"
            active={mode === "EMPTY"}
            onClick={() => setMode("EMPTY")}
          />
        </div>
        {!hasAnalysis ? (
          <p style={{ fontSize: 12, color: "rgb(71, 85, 105)", marginTop: 8 }}>
            아직 학습지 생성이 완료되지 않아 &ldquo;분석에서 변환&rdquo;을 쓸 수 없습니다.
          </p>
        ) : null}
      </section>

      {/* 디자인 템플릿 선택 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "rgb(71, 85, 105)", margin: "0 0 8px" }}>
          2. 디자인 템플릿
        </h2>
        <p style={{ fontSize: 12, color: "rgb(100, 116, 139)", margin: "0 0 12px" }}>
          콘텐츠는 모두 동일 — 시각 스타일만 다릅니다.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              style={{
                padding: 12,
                border: `2px solid ${selected === t.id ? t.primary : "rgb(226, 232, 240)"}`,
                borderRadius: 10,
                background: "white",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "210/297",
                  background: `linear-gradient(135deg, ${t.primary}10, ${t.accent}10)`,
                  border: `1px solid ${t.primary}30`,
                  borderRadius: 6,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  padding: 8,
                }}
              >
                <div
                  style={{
                    width: "70%",
                    height: 14,
                    background: t.primary,
                    borderRadius: 2,
                    marginBottom: 4,
                  }}
                />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: "rgb(100, 116, 139)", marginTop: 2 }}>
                {t.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "rgb(254, 226, 226)",
            color: "rgb(153, 27, 27)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={handleCreate}
          disabled={submitting}
          style={{
            padding: "10px 22px",
            background: submitting ? "rgb(148, 163, 184)" : "rgb(37, 99, 235)",
            color: "white",
            fontWeight: 700,
            fontSize: 14,
            borderRadius: 8,
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "만드는 중..." : "보고서 만들기"}
        </button>
      </div>
    </div>
  );
}

function ModeOption({
  label,
  description,
  active,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        textAlign: "left",
        padding: 14,
        border: `2px solid ${active ? "rgb(37, 99, 235)" : "rgb(226, 232, 240)"}`,
        borderRadius: 10,
        background: disabled ? "rgb(248, 250, 252)" : "white",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 12, color: "rgb(100, 116, 139)", marginTop: 2 }}>{description}</div>
    </button>
  );
}
