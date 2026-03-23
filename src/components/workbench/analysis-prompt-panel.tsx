"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
}

const FOCUS_AREAS = [
  { id: "grammar", label: "문법 포인트 집중 분석" },
  { id: "vocabulary", label: "핵심 어휘 상세 분석" },
  { id: "structure", label: "문장 구조 분석" },
  { id: "examPoints", label: "출제 포인트 하이라이팅" },
  { id: "grammarLevel", label: "난이도별 문법 분류" },
] as const;

const TARGET_LEVELS = [
  { value: "middle-basic", label: "중학교 기초" },
  { value: "middle-advanced", label: "중학교 심화" },
  { value: "high-basic", label: "고등학교 기초" },
  { value: "high-advanced", label: "고등학교 심화" },
  { value: "csat", label: "수능" },
] as const;

interface AnalysisPromptPanelProps {
  onRunAnalysis: (config: AnalysisPromptConfig) => void;
  analyzing: boolean;
  hasExistingAnalysis: boolean;
  initialConfig?: AnalysisPromptConfig;
}

export function AnalysisPromptPanel({
  onRunAnalysis,
  analyzing,
  hasExistingAnalysis,
  initialConfig,
}: AnalysisPromptPanelProps) {
  const [expanded, setExpanded] = useState(!hasExistingAnalysis);
  const [customPrompt, setCustomPrompt] = useState(
    initialConfig?.customPrompt || ""
  );
  const [focusAreas, setFocusAreas] = useState<string[]>(
    initialConfig?.focusAreas || []
  );
  const [targetLevel, setTargetLevel] = useState(
    initialConfig?.targetLevel || ""
  );

  function toggleFocusArea(areaId: string) {
    setFocusAreas((prev) =>
      prev.includes(areaId)
        ? prev.filter((a) => a !== areaId)
        : [...prev, areaId]
    );
  }

  function handleRun() {
    onRunAnalysis({ customPrompt, focusAreas, targetLevel });
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-2">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-blue-600" />
            AI 분석 설정
            {(customPrompt || focusAreas.length > 0 || targetLevel) && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                설정됨
              </Badge>
            )}
          </CardTitle>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Custom prompt */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-600">
              추가 지시사항 (선택)
            </Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="예: 관계대명사 who/which 구분 위주로 분석해줘, 시제 변화에 집중, 서술형 출제 포인트 위주로..."
              className="text-sm min-h-[80px] bg-white resize-none"
            />
          </div>

          {/* Focus areas */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-600">
              분석 집중 영역
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_AREAS.map((area) => (
                <label
                  key={area.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-white/60 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={focusAreas.includes(area.id)}
                    onCheckedChange={() => toggleFocusArea(area.id)}
                  />
                  <span className="text-xs text-slate-700">{area.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Target level */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-600">
              대상 수준
            </Label>
            <Select value={targetLevel} onValueChange={setTargetLevel}>
              <SelectTrigger className="bg-white text-sm h-9">
                <SelectValue placeholder="수준 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run button */}
          <Button
            onClick={handleRun}
            disabled={analyzing}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                {hasExistingAnalysis ? "다시 분석하기" : "AI 분석 실행"}
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
