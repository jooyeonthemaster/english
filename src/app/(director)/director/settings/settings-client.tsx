"use client";

import { useState } from "react";
import { User, SlidersHorizontal } from "lucide-react";
import AccountTab from "./account-tab";
import PreferencesTab from "./preferences-tab";

type TabKey = "account" | "preferences";

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "account", label: "계정 설정", icon: User },
  { key: "preferences", label: "환경 설정", icon: SlidersHorizontal },
];

export default function SettingsClient() {
  const [tab, setTab] = useState<TabKey>("account");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-foreground">설정</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          계정 및 환경 설정을 관리합니다
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" strokeWidth={1.8} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "account" ? <AccountTab /> : <PreferencesTab />}
    </div>
  );
}
