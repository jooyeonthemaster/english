// @ts-nocheck
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { renderFormatted } from "./render-formatted";
import type { ParsedSection } from "./types";

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
    </span>
  );
}

export function RenderedSections({
  sections,
  expanded,
}: {
  sections: ParsedSection[];
  expanded: boolean;
}) {
  return (
    <div className="space-y-2">
      {sections.map((section, i) => {
        switch (section.type) {
          case "direction":
            return (
              <div
                key={i}
                className="text-[13px] font-bold text-slate-900 leading-relaxed whitespace-pre-line"
              >
                {renderFormatted(section.content)}
              </div>
            );

          case "passage":
            return (
              <div
                key={i}
                className="rounded-lg bg-slate-50 border border-slate-200 p-3"
              >
                <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap">
                  {renderFormatted(section.content)}
                </div>
              </div>
            );

          case "marker":
            return (
              <div
                key={i}
                className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"
              >
                <SectionLabel label={section.label!} />
                <p className="text-[13px] text-slate-800 leading-relaxed font-medium mt-0.5">
                  {renderFormatted(section.content)}
                </p>
              </div>
            );

          case "conditions":
            return (
              <div
                key={i}
                className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-3 space-y-1.5"
              >
                <SectionLabel label={section.label || "조건"} />
                <ol className="space-y-1 list-decimal list-inside">
                  {(section.items || []).map((item, ci) => (
                    <li
                      key={ci}
                      className="text-[12px] text-slate-700 leading-relaxed"
                    >
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            );

          case "paragraphs":
            return (
              <div key={i} className="space-y-1.5">
                {(section.items || []).map((item, pi) => {
                  const labelMatch = item.match(/^\(([A-C])\)\s*(.*)/);
                  return (
                    <div
                      key={pi}
                      className="rounded-lg bg-slate-50 border border-slate-200 p-3"
                    >
                      {labelMatch ? (
                        <>
                          <span className="text-[11px] font-bold text-slate-600 mr-2">
                            ({labelMatch[1]})
                          </span>
                          <span className="text-[12px] text-slate-700 leading-relaxed">
                            {labelMatch[2]}
                          </span>
                        </>
                      ) : (
                        <span className="text-[12px] text-slate-700 leading-relaxed">
                          {item}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );

          case "scrambled":
            return (
              <div key={i}>
                <SectionLabel label={section.label || "배열 단어"} />
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 mt-1">
                  {(section.items || []).map((word, wi) => (
                    <span
                      key={wi}
                      className="inline-block px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            );

          case "error":
            return (
              <div
                key={i}
                className="rounded-lg bg-white border border-red-200 p-3"
              >
                <SectionLabel label="오류 문장" />
                <p className="text-[13px] text-slate-700 leading-relaxed mt-0.5">
                  {renderFormatted(section.content)}
                </p>
              </div>
            );

          case "summary":
            return (
              <div
                key={i}
                className="rounded-lg bg-slate-50 border border-slate-200 p-3"
              >
                <SectionLabel label="요약문" />
                <div className="font-mono text-[12px] leading-[1.8] text-slate-700 whitespace-pre-wrap mt-1">
                  {renderFormatted(section.content)}
                </div>
              </div>
            );

          case "blanks":
            return (
              <div
                key={i}
                className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"
              >
                <SectionLabel label="빈칸 정답" />
                <p className="text-[12px] text-slate-700 mt-0.5">
                  {section.content}
                </p>
              </div>
            );

          case "target":
            return (
              <div
                key={i}
                className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"
              >
                <SectionLabel label="대상 단어" />
                <p className="text-[15px] font-bold text-slate-800 mt-0.5">
                  {section.content}
                </p>
              </div>
            );

          case "context":
            return (
              <div
                key={i}
                className="text-[12px] text-slate-600 italic leading-relaxed px-1"
              >
                {section.content}
              </div>
            );

          case "hint":
            return (
              <div key={i} className="text-[12px] text-slate-500 italic px-1">
                {section.content}
              </div>
            );

          case "matchType":
            return (
              <div
                key={i}
                className="text-[11px] font-medium text-slate-500 px-1"
              >
                유형:{" "}
                <Badge variant="outline" className="text-[9px] ml-1">
                  {section.content}
                </Badge>
              </div>
            );

          default:
            return (
              <div
                key={i}
                className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line"
              >
                {renderFormatted(section.content)}
              </div>
            );
        }
      })}
    </div>
  );
}
