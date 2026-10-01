"use client";

// 단건 비교 — 지문 1개 × 팔 여러 개 동시 실행. 실행마다 「발사」 묶음이 위로 쌓인다(세션 메모리만).
// 실행은 클릭 핸들러에서만 시작(StrictMode 이중 마운트가 유료 호출을 두 번 쏘지 않게).

import { Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArmConfig } from "@/lib/qgen-lab/types";
import { customPassageId, type MetaPassage } from "./api-utils";
import { ArmPicker } from "./arm-picker";
import { CUSTOM_PASSAGE, PassagePicker } from "./passage-picker";
import { RunCard } from "./run-card";
import { startLabRun, type LabRun, type LiveRunSnapshot } from "./run-store-utils";
import { EmptyNote, Panel, SourceBadge } from "./ui-bits";

interface Launch {
  id: number;
  at: string;
  passageId: string;
  passageLabel: string;
  passageText: string;
  source: MetaPassage["source"];
  rep: number;
  runs: { armId: string; run: LabRun }[];
}

const PREFS_KEY = "qgen-lab:single:v1";
const MAX_LAUNCHES = 8;

function readPrefs(): { passageId?: string; armIds?: string[]; rep?: number } {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as { passageId?: string; armIds?: string[]; rep?: number }) : {};
  } catch {
    return {};
  }
}

function LaunchBlock({
  launch,
  arms,
  onRemove,
}: {
  launch: Launch;
  arms: ArmConfig[];
  onRemove: () => void;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2 border-b border-stone-300 pb-1.5">
        <SourceBadge source={launch.source} />
        <span className="truncate text-[0.8125rem] font-semibold text-stone-900">{launch.passageLabel}</span>
        <span className="font-mono text-[0.6875rem] text-stone-500">
          {launch.passageId} · rep {launch.rep} · 팔 {launch.runs.length} · {launch.at}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => launch.runs.forEach((r) => r.run.abort())}
            className="h-[24px] rounded px-2 text-[0.6875rem] font-semibold text-stone-500 hover:text-red-700"
            title="진행 중인 카드의 수신을 끊는다(서버 생성은 계속될 수 있다)"
          >
            모두 중단
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-[24px] items-center gap-1 rounded px-2 text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-900"
          >
            <Trash2 className="size-3" /> 지우기
          </button>
        </span>
      </header>
      <div className="grid gap-3 2xl:grid-cols-2">
        {launch.runs.map(({ armId, run }) => (
          <RunCard key={run.key} armId={armId} arm={arms.find((a) => a.id === armId)} run={run} passage={launch.passageText} />
        ))}
      </div>
    </section>
  );
}

export function SingleTab({
  arms,
  passages,
  onRunSettled,
}: {
  arms: ArmConfig[];
  passages: MetaPassage[];
  onRunSettled: (snap: LiveRunSnapshot) => void;
}) {
  const [passageId, setPassageId] = useState<string>("");
  const [customText, setCustomText] = useState("");
  const [armIds, setArmIds] = useState<string[]>([]);
  const [rep, setRep] = useState(1);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // UI 기본값 복원(결과는 서버에 있다 — 여기엔 선택값만).
  useEffect(() => {
    const p = readPrefs();
    if (p.passageId) setPassageId(p.passageId);
    if (Array.isArray(p.armIds)) setArmIds(p.armIds);
    if (typeof p.rep === "number" && p.rep >= 0) setRep(p.rep);
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ passageId, armIds, rep }));
    } catch {
      /* 사생활 모드 등 — 무시 */
    }
  }, [prefsLoaded, passageId, armIds, rep]);

  const validArmIds = armIds.filter((id) => arms.some((a) => a.id === id));
  const passage = passages.find((p) => p.id === passageId) ?? null;
  const isCustom = passageId === CUSTOM_PASSAGE;
  const text = isCustom ? customText.trim() : passage?.text ?? "";
  const canRun = validArmIds.length > 0 && text.length > 0;

  const launch = async () => {
    const t0 = performance.now(); // 실행 버튼 시점 — 모든 팔 공통 기준
    if (!canRun) return;
    const pid = isCustom ? await customPassageId(text) : passageId;
    const id = Date.now();
    const runs = validArmIds.map((armId) => {
      const arm = arms.find((a) => a.id === armId);
      const run = startLabRun({
        key: `${id}:${armId}`,
        t0,
        hasPlanner: !!arm && arm.planner.id !== "none",
        request: { armId, passageId: pid, rep, batchId: null, ...(isCustom ? { customText: text } : {}) },
      });
      void run.done.then(onRunSettled);
      return { armId, run };
    });
    const entry: Launch = {
      id,
      at: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
      passageId: pid,
      passageLabel: isCustom ? "직접 입력 지문" : passage?.label ?? pid,
      passageText: text,
      source: isCustom ? "custom" : passage?.source ?? "custom",
      rep,
      runs,
    };
    setLaunches((prev) => [entry, ...prev].slice(0, MAX_LAUNCHES));
  };

  return (
    <div className="grid grid-cols-[minmax(300px,360px)_minmax(0,1fr)] items-start gap-4">
      <aside className="sticky top-2 space-y-3">
        <Panel title="지문" bodyClassName="p-2.5">
          <PassagePicker
            passages={passages}
            value={passageId}
            onChange={setPassageId}
            customText={customText}
            onCustomText={setCustomText}
          />
        </Panel>
        <Panel title="팔" aside={<span className="font-mono text-[0.6875rem] text-stone-500">{validArmIds.length} 선택</span>} bodyClassName="p-2.5">
          <ArmPicker arms={arms} selected={validArmIds} onChange={setArmIds} />
        </Panel>
        <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-[#fffefa] p-2.5">
          <label className="flex items-center gap-1.5 text-[0.75rem] text-stone-600" title="seed = fnv1a32(passageId#rep) — 같은 rep 은 팔이 달라도 같은 넛지">
            rep
            <Input
              type="number"
              min={0}
              value={rep}
              onChange={(e) => setRep(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="h-[30px] w-16 border-stone-300 bg-white font-mono text-[0.75rem] md:text-[0.75rem]"
            />
          </label>
          <Button
            type="button"
            onClick={() => void launch()}
            disabled={!canRun}
            data-testid="qgen-run-single"
            className="ml-auto h-[32px] gap-1.5 rounded-md bg-stone-900 px-3 text-[0.8125rem] text-[#fffefa] hover:bg-orange-700"
          >
            <Play className="size-3.5" />
            실행 · 팔 {validArmIds.length}개 동시
          </Button>
        </div>
        <p className="px-1 text-[0.6875rem] leading-5 text-stone-500">
          팔 1개 = 유료 생성 1~2콜(재생성 포함) + 계획·검증 jev. 비용은 서버 원장에 기록되고 캡을 넘으면 서버가 거부합니다.
        </p>
      </aside>

      <div className="min-w-0 space-y-5">
        {launches.length === 0 ? (
          <EmptyNote>지문과 팔을 고르고 실행하면 팔마다 카드가 열려 스트림·타임라인·문항이 실시간으로 채워집니다.</EmptyNote>
        ) : (
          launches.map((l) => (
            <LaunchBlock
              key={l.id}
              launch={l}
              arms={arms}
              onRemove={() => {
                l.runs.forEach((r) => r.run.abort());
                setLaunches((prev) => prev.filter((x) => x.id !== l.id));
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
