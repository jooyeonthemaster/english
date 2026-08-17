import { UserRound, Mail } from "lucide-react";

interface DirectorProviderStats {
  total: number;
  google: number;
  kakao: number;
  other: number;
}

type ProviderKey = "google" | "kakao" | "other";

interface ProviderConfig {
  key: ProviderKey;
  label: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    key: "google",
    label: "Google",
    color: "#3b82f6",
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
  },
  {
    key: "kakao",
    label: "Kakao",
    color: "#1e293b",
    badgeBg: "bg-slate-800",
    badgeText: "text-white",
  },
  {
    key: "other",
    label: "기타 / 직접",
    color: "#cbd5e1",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-500",
  },
];

const RADIUS = 50;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DirectorProviderCard({ stats }: { stats: DirectorProviderStats }) {
  const data = PROVIDERS.map((p) => ({ ...p, value: stats[p.key] }));
  const visible = data.filter((d) => d.value > 0);
  const hasData = stats.total > 0 && visible.length > 0;
  const gap = visible.length > 1 ? 2 : 0;

  let cumulative = 0;
  const segments = visible.map((s) => {
    const fraction = s.value / stats.total;
    const length = Math.max(0, CIRCUMFERENCE * fraction - gap);
    const offset = -CIRCUMFERENCE * cumulative;
    cumulative += fraction;
    return { ...s, length, offset };
  });

  const dominant = hasData
    ? data.reduce((a, b) => (b.value > a.value ? b : a))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <UserRound
            className="size-4 text-gray-400"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <h3 className="text-[14px] font-semibold text-gray-800">
            원장 가입 경로
          </h3>
        </div>
        <span className="text-[11px] text-gray-400 tabular-nums">
          총 {stats.total.toLocaleString("ko-KR")}명
        </span>
      </div>

      {hasData ? (
        <div className="px-5 pt-5 pb-5">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <svg
                viewBox="0 0 120 120"
                className="size-32"
                role="img"
                aria-label={`총 ${stats.total}명 중 ${dominant?.label} ${dominant?.value}명이 가장 많음`}
              >
                <circle
                  cx={60}
                  cy={60}
                  r={RADIUS}
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth={STROKE}
                />
                {segments.map((s) => (
                  <circle
                    key={s.key}
                    cx={60}
                    cy={60}
                    r={RADIUS}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                    strokeDashoffset={s.offset}
                    strokeLinecap="butt"
                    transform="rotate(-90 60 60)"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[26px] font-bold text-gray-900 tabular-nums leading-none">
                  {stats.total}
                </span>
                <span className="text-[10px] text-gray-400 mt-1 tracking-wide uppercase">
                  Directors
                </span>
              </div>
            </div>
          </div>

          <ul className="space-y-3">
            {data.map((p) => {
              const pct = stats.total > 0 ? (p.value / stats.total) * 100 : 0;
              const isDominant = dominant?.key === p.key && p.value > 0;
              return (
                <li key={p.key} className="flex items-center gap-3">
                  <span
                    className={`flex items-center justify-center size-7 rounded-md shrink-0 ${p.badgeBg} ${p.badgeText}`}
                    aria-hidden="true"
                  >
                    <ProviderMark providerKey={p.key} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-gray-800">
                          {p.label}
                        </span>
                        {isDominant && (
                          <span className="text-[9px] font-semibold tracking-wider uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            Top
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] tabular-nums shrink-0">
                        <span className="font-semibold text-gray-900">
                          {p.value}
                        </span>
                        <span className="text-gray-400">
                          {" "}
                          명 · {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="px-5 py-12 flex flex-col items-center justify-center text-center">
          <div className="size-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
            <UserRound
              className="size-5 text-gray-300"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>
          <p className="text-[13px] text-gray-500 font-medium">
            아직 가입한 원장이 없습니다
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            첫 가입이 발생하면 여기에 분포가 표시됩니다
          </p>
        </div>
      )}
    </div>
  );
}

function ProviderMark({ providerKey }: { providerKey: ProviderKey }) {
  if (providerKey === "google") {
    return (
      <span className="text-[12px] font-bold leading-none tracking-tighter">
        G
      </span>
    );
  }
  if (providerKey === "kakao") {
    return (
      <span className="text-[12px] font-bold leading-none tracking-tighter">
        K
      </span>
    );
  }
  return <Mail className="size-3.5" strokeWidth={2} aria-hidden="true" />;
}
