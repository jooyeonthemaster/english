"use client";

// ============================================================================
// 학습지 스터디 모드 — 아이템 렌더러 레지스트리 (공유 파일 — 본체 소관)
//
// StudyItem.type → 렌더러 매핑. 플레이어 셸은 이 레지스트리만 안다.
// 각 렌더러는 item-shared.tsx 의 ItemRendererProps 계약을 따른다.
// ============================================================================

import type { ComponentType } from "react";
import type { StudyItem, StudyItemType } from "@/lib/worksheet-study/types";
import type { ItemRendererProps } from "./item-shared";
import { ItemMc } from "./item-mc";
import { ItemRead } from "./item-read";
import { ItemFlash } from "./item-flash";
import { ItemMatch } from "./item-match";
import { ItemOrder, ItemSentenceOrder } from "./item-order";
import { ItemCloze } from "./item-cloze";
import { ItemOx, ItemInlineChoice } from "./item-grammar";
import { ItemSelfGrade, ItemTyping } from "./item-production";

// 각 렌더러는 자기 유형으로 좁힌 props 를 받는다 — 레지스트리 경계에서만 단언.
const REGISTRY: Record<StudyItemType, ComponentType<ItemRendererProps<never>>> = {
  read: ItemRead as ComponentType<ItemRendererProps<never>>,
  flash: ItemFlash as ComponentType<ItemRendererProps<never>>,
  mc: ItemMc as ComponentType<ItemRendererProps<never>>,
  match: ItemMatch as ComponentType<ItemRendererProps<never>>,
  order: ItemOrder as ComponentType<ItemRendererProps<never>>,
  "sentence-order": ItemSentenceOrder as ComponentType<ItemRendererProps<never>>,
  cloze: ItemCloze as ComponentType<ItemRendererProps<never>>,
  ox: ItemOx as ComponentType<ItemRendererProps<never>>,
  "inline-choice": ItemInlineChoice as ComponentType<ItemRendererProps<never>>,
  "self-grade": ItemSelfGrade as ComponentType<ItemRendererProps<never>>,
  typing: ItemTyping as ComponentType<ItemRendererProps<never>>,
};

export function rendererFor(item: StudyItem): ComponentType<ItemRendererProps<never>> {
  return REGISTRY[item.type];
}
