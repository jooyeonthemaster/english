"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { FOLDER_TREE, type FolderNode } from "./shared/mock-data";
import { useReducedMotionPref } from "./shared/use-typewriter";

const EXPAND_SEQUENCE = ["school-1", "y26-1", "g3", "mid"];

function FolderRow({ node, depth, expanded, highlight }: any) {
  const isOpen = expanded.has(node.id);
  const isHi = node.id === highlight;
  return (
    <div>
      <div className={`flex items-center gap-2 py-2.5 rounded-lg pr-3 transition-all ${isHi ? 'bg-blue-50' : 'hover:bg-blue-50/50'}`} style={{ paddingLeft: 16 + depth * 24, borderLeft: isHi ? "3px solid #3B82F6" : "3px solid transparent" }}>
        {node.kind === "folder" ? (
          <>
            <span className="text-blue-300 text-[11px] transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            <span className="text-[14px] font-bold text-gray-800">{node.name}</span>
          </>
        ) : (
          <>
            <span className="w-3" />
            <span className="inline-block w-3.5 h-4 rounded-[2px] bg-blue-200 shrink-0" />
            <span className="text-[14px] font-medium text-gray-600">{node.name}</span>
          </>
        )}
      </div>
      <AnimatePresence>
        {isOpen && node.children && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            {node.children.map((c: any) => <FolderRow key={c.id} node={c} depth={depth + 1} expanded={expanded} highlight={highlight} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FolderScene() {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showDocs, setShowDocs] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setExpanded(new Set(EXPAND_SEQUENCE)); setShowDocs(true); return; }
    const timers: any[] = [];
    EXPAND_SEQUENCE.forEach((id, i) => timers.push(setTimeout(() => setExpanded(p => new Set(p).add(id)), 400 + i * 400)));
    timers.push(setTimeout(() => setShowDocs(true), 400 + EXPAND_SEQUENCE.length * 400 + 200));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced]);

  return (
    <section ref={ref} id="folder" className="relative w-full min-h-screen bg-white py-24 lg:py-32 border-t border-blue-100">
      <div className="px-6 lg:px-16 max-w-[1480px] mx-auto">
        <div className="mb-20 max-w-[900px] text-center mx-auto">
          <div className="text-[13px] uppercase tracking-[0.25em] text-[#3B82F6] font-bold mb-4 justify-center flex items-center gap-3">
            <span className="w-8 h-[2px] bg-[#3B82F6]" />
            Step 4. 완벽한 파일 시스템
            <span className="w-8 h-[2px] bg-[#3B82F6]" />
          </div>
          <h2 className="font-extrabold text-gray-900 leading-[1.2]" style={{ fontSize: "clamp(28px, 4vw, 52px)", letterSpacing: "-0.02em" }}>
            이 모든 것들을 철저하게 <br/>
            <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">파일 시스템 기반으로 관리</span>합니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium max-w-2xl mx-auto">
            1회성으로 쓰고 날아가는 웹 데이터가 아닙니다. 모든 지문 분석 결과와 생성된 시험지들은 
            마치 내 컴퓨터의 폴더처럼 학교별, 학년별, 연도별 트리 구조에 안전하게 아카이빙 됩니다. 
            내년 시험 기간에 작년 자료를 완벽하게 꺼내어 바로 사용할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-10 items-start max-w-5xl mx-auto">
          {/* Tree */}
          <div className="rounded-2xl border border-blue-100 bg-white shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)] overflow-hidden">
            <div className="px-6 py-4 border-b border-blue-50 flex items-center justify-between bg-blue-50/50">
              <div className="text-[13px] font-mono font-bold text-blue-500">Workspace / 2026 / 3학년</div>
            </div>
            <div className="p-4 max-h-[460px] overflow-auto custom-scrollbar">
              {FOLDER_TREE.map((n) => <FolderRow key={n.id} node={n} depth={0} expanded={expanded} highlight="mid" />)}
            </div>
          </div>

          {/* Docs grid */}
          <div className="rounded-2xl border border-blue-100 bg-[#F8FAFC] p-8 shadow-sm flex items-center justify-center min-h-[500px]">
             <div className="text-center">
               <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-white border border-blue-200 shadow-sm flex items-center justify-center">
                 <span className="text-5xl">📁</span>
               </div>
               <h3 className="text-2xl font-extrabold text-blue-900 mb-3">클라우드 파일 보관함</h3>
               <p className="text-[16px] text-blue-600 font-medium leading-relaxed max-w-xs mx-auto">
                 생성된 모든 분석 및 시험지 파일은<br/> 안전하게 영구 보관됩니다.
               </p>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
