/**
 * SEO 학교 페이지 타겟 선정용 집계 — 읽기 전용.
 *
 * 목적: 어느 학교로 공개 페이지를 만들지를 "찍지 않고" 실제 고객 분포로 정한다.
 *
 * ⚠️ 개인정보/테넌트 격리 원칙
 *   - academyId 는 절대 출력하지 않는다. 학원 단위 식별이 불가능하도록 집계만 낸다.
 *   - 출력은 (학교명, 학교유형, 교과서 출판사, 이 학교를 등록한 학원 수) 뿐이다.
 *   - 학원 수가 임계값 미만인 학교는 역추적 위험이 있어 기본적으로 마스킹한다(MIN_ACADEMIES).
 *   - 이 스크립트 결과를 그대로 페이지에 싣지 말고, "어느 학교부터 만들지" 우선순위에만 쓴다.
 *
 * 실행: npx tsx scripts/_seo-school-targets.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 이 수 미만의 학원만 등록한 학교는 개별 노출하지 않는다(역추적 방지). */
const MIN_ACADEMIES = 2;

/** 주소 문자열에서 시·도를 뽑는다. 표기 흔들림을 흡수한다. */
function sidoOf(address: string | null): string {
  if (!address) return "(미기재)";
  const a = address.trim();
  const table: [RegExp, string][] = [
    [/^서울/, "서울"],
    [/^부산/, "부산"],
    [/^대구/, "대구"],
    [/^인천/, "인천"],
    [/^(광주광역|광주시|광주 )/, "광주"],
    [/^대전/, "대전"],
    [/^울산/, "울산"],
    [/^세종/, "세종"],
    [/^경기/, "경기"],
    [/^(강원)/, "강원"],
    [/^충(청)?북/, "충북"],
    [/^충(청)?남/, "충남"],
    [/^전(라)?북/, "전북"],
    [/^전(라)?남/, "전남"],
    [/^경(상)?북/, "경북"],
    [/^경(상)?남/, "경남"],
    [/^제주/, "제주"],
  ];
  for (const [re, name] of table) if (re.test(a)) return name;
  return "(기타)";
}

/** 학군지로 분류되는 구·시 — 여기는 자료가 포화라 우선순위를 낮춘다. */
const SATURATED = /강남구|서초구|송파구|양천구 목동|분당|수지|대치|중계|평촌|일산/;

async function main() {
  const academies = await prisma.academy.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true, address: true, status: true },
  });

  const regionByAcademy = new Map<string, { sido: string; saturated: boolean }>();
  const regionCount = new Map<string, number>();
  for (const a of academies) {
    const sido = sidoOf(a.address);
    const saturated = a.address ? SATURATED.test(a.address) : false;
    regionByAcademy.set(a.id, { sido, saturated });
    regionCount.set(sido, (regionCount.get(sido) ?? 0) + 1);
  }

  console.log("=".repeat(78));
  console.log(`고객 학원 ${academies.length}곳의 지역 분포`);
  console.log("=".repeat(78));
  const sorted = [...regionCount.entries()].sort((a, b) => b[1] - a[1]);
  const total = academies.length || 1;
  for (const [sido, n] of sorted) {
    const bar = "█".repeat(Math.min(40, Math.round((n / total) * 100)));
    console.log(`  ${sido.padEnd(8)} ${String(n).padStart(4)}곳 ${((n / total) * 100).toFixed(1).padStart(5)}%  ${bar}`);
  }
  const saturatedN = [...regionByAcademy.values()].filter((r) => r.saturated).length;
  console.log(`\n  학군지 소재: ${saturatedN}곳 (${((saturatedN / total) * 100).toFixed(1)}%)`);
  console.log(`  비학군지  : ${total - saturatedN}곳 (${(((total - saturatedN) / total) * 100).toFixed(1)}%)`);

  // ── 학교 집계 (academyId 미출력) ──
  const schools = await prisma.school.findMany({
    select: { name: true, type: true, publisher: true, academyId: true },
  });

  type Agg = {
    name: string;
    type: string;
    publishers: Map<string, number>;
    academies: Set<string>;
    sidos: Map<string, number>;
    nonDistrict: number;
  };
  const agg = new Map<string, Agg>();
  for (const s of schools) {
    const key = `${s.name}__${s.type}`;
    let e = agg.get(key);
    if (!e) {
      e = { name: s.name, type: s.type, publishers: new Map(), academies: new Set(), sidos: new Map(), nonDistrict: 0 };
      agg.set(key, e);
    }
    e.academies.add(s.academyId);
    if (s.publisher) e.publishers.set(s.publisher, (e.publishers.get(s.publisher) ?? 0) + 1);
    const r = regionByAcademy.get(s.academyId);
    if (r) {
      e.sidos.set(r.sido, (e.sidos.get(r.sido) ?? 0) + 1);
      if (!r.saturated) e.nonDistrict += 1;
    }
  }

  const rows = [...agg.values()]
    .map((e) => ({
      name: e.name,
      type: e.type,
      academyCount: e.academies.size,
      nonDistrict: e.nonDistrict,
      topPublisher: [...e.publishers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      publisherKinds: e.publishers.size,
      topSido: [...e.sidos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    }))
    .sort((a, b) => b.academyCount - a.academyCount);

  const withPub = rows.filter((r) => r.topPublisher);
  console.log("\n" + "=".repeat(78));
  console.log(`등록된 학교 ${rows.length}개 (고유) · 교과서 출판사가 채워진 학교 ${withPub.length}개`);
  console.log("=".repeat(78));

  console.log("\n[A] 페이지 1순위 — 고객이 가장 많이 등록한 학교 (학원 2곳 이상)");
  console.log("    " + "학교명".padEnd(20) + "유형".padEnd(10) + "학원수".padStart(6) + "  비학군지" + "  출판사");
  for (const r of rows.filter((x) => x.academyCount >= MIN_ACADEMIES).slice(0, 40)) {
    console.log(
      `    ${r.name.padEnd(20)}${r.type.padEnd(10)}${String(r.academyCount).padStart(6)}` +
        `${String(r.nonDistrict).padStart(8)}  ${r.topPublisher}${r.publisherKinds > 1 ? ` (+${r.publisherKinds - 1})` : ""}`,
    );
  }

  const masked = rows.filter((x) => x.academyCount < MIN_ACADEMIES).length;
  console.log(`\n    (학원 1곳만 등록한 학교 ${masked}개는 역추적 방지를 위해 개별 미출력)`);

  console.log("\n[B] 교과서 출판사 분포 — /textbooks 페이지와 연결할 축");
  const pubCount = new Map<string, number>();
  for (const r of withPub) pubCount.set(r.topPublisher, (pubCount.get(r.topPublisher) ?? 0) + 1);
  for (const [p, n] of [...pubCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${p.padEnd(16)} ${String(n).padStart(4)}개교  ${"█".repeat(Math.min(40, n))}`);
  }

  console.log("\n[C] 학교유형 분포");
  const typeCount = new Map<string, number>();
  for (const r of rows) typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);
  for (const [t, n] of [...typeCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(12)} ${String(n).padStart(4)}개`);
  }

  console.log("\n요약 — 이 결과로 결정할 것");
  console.log("  1) [A] 상위 학교부터 페이지를 만든다 (실제 고객이 가르치는 학교 = 검색해도 우리 고객)");
  console.log("  2) [B] 출판사별 /textbooks 아티클과 학교 페이지를 상호 링크한다");
  console.log("  3) 지역 분포에서 비학군지 비중이 높으면 학교 축 확장을 그 지역 위주로 잡는다");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
