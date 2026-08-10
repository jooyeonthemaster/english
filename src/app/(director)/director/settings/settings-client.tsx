"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
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

      {/* 앱 전체에서 유일한 useSession 소비처(AccountTab.update) — 전역 루트가
          아니라 여기서만 세션을 붙인다. 루트에 두면 학생·응시 표면까지
          /api/auth/session 을 왕복한다(providers/session-provider.tsx 주석). */}
      {tab === "account" ? (
        <SessionProvider refetchOnWindowFocus={false}>
          <AccountTab />
        </SessionProvider>
      ) : (
        <PreferencesTab />
      )}
    </div>
  );
}
