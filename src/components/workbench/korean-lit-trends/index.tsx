"use client";

// 문학 출제 트렌드 분석 대시보드 — 기출 문학 546지문(수능·평가원 164 + 학평 382)에서
// 역산한 출제 경향을 서사 순서(체제 → 매트릭스 → 작품 선정 → 발췌 문법 → 묶음 공식 →
// 재출제 → <보기>)로 보여 준다. 모든 차트·칩은 클릭 시 실지문 드로어로 연결된다.

import { useMemo, useState } from "react";
import type { LitTrends } from "./types";
import { ChartCard, SectionHead } from "./chart-card";
import {
  RegimeChart,
  AuthorsChart,
  DecadesChart,
  DevicesChart,
  CombosChart,
} from "./charts";
import {
  StatTiles,
  MatrixCards,
  LengthRanges,
  ThemeGrid,
  ReappearTable,
  BogiSection,
  NotationCase,
  WorkChips,
  PassageChip,
} from "./sections";
import { PassageDrawer, type DrawerRequest } from "./passage-drawer";
import { GENRE_ORDER } from "./types";

export function KoreanLitTrendsDashboard({ trends }: { trends: LitTrends }) {
  const [drawer, setDrawer] = useState<DrawerRequest | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [decade, setDecade] = useState<string | null>(null);

  const open = (title: string, ids: string[]) =>
    setDrawer({ title, ids: ids.slice(0, 100) });

  const authorEntry = trends.authors.find((a) => a.author === author) ?? null;
  const decadeEntry = trends.decades.find((d) => d.decade === decade) ?? null;

  // 표 뷰 쌍둥이 데이터
  const regimeTable = useMemo(
    () => ({
      cols: ["학년도", ...GENRE_ORDER],
      rows: trends.regimeYears.map((y) => [
        y.year,
        ...GENRE_ORDER.map((g) => y.counts[g] ?? 0),
      ]),
    }),
    [trends],
  );
  const authorsTable = useMemo(
    () => ({
      cols: ["작가", "수능·평가원", "교육청 학평", "합계"],
      rows: trends.authors.map((a) => [
        a.author,
        a.kice,
        a.ebsi,
        a.kice + a.ebsi,
      ]),
    }),
    [trends],
  );
  const devicesTable = useMemo(
    () => ({
      cols: [
        "갈래",
        "표본",
        "[앞부분의 줄거리]",
        "[중략 부분의 줄거리]",
        "무표 (중략)",
        "두 토막 구조",
      ],
      rows: trends.devices.map((d) => [
        d.genre,
        `${d.n}개`,
        `${d.front} (${Math.round((d.front / d.n) * 100)}%)`,
        `${d.midBox} (${Math.round((d.midBox / d.n) * 100)}%)`,
        `${d.plainCut} (${Math.round((d.plainCut / d.n) * 100)}%)`,
        `${d.twoBlock} (${Math.round((d.twoBlock / d.n) * 100)}%)`,
      ]),
    }),
    [trends],
  );
  const combosTable = useMemo(
    () => ({
      cols: ["결합 공식", "세트 수"],
      rows: trends.combos.map((c) => [c.label, c.count]),
    }),
    [trends],
  );
  const decadesTable = useMemo(
    () => ({
      cols: ["발표 연대", "출제 작품 수", "대표작"],
      rows: trends.decades.map((d) => [
        d.decade,
        d.count,
        d.works.map((w) => w.title).join(", "),
      ]),
    }),
    [trends],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
      <div className="space-y-10 px-5 py-6 sm:px-8">
        {/* ── 인트로 ── */}
        <header className="space-y-3">
          <h2 className="text-[20px] font-bold leading-snug text-slate-900">
            평가원은 문학 작품을 어떻게 고르고, 어디를 오려내는가
          </h2>
          <p className="max-w-4xl text-[13px] leading-relaxed text-slate-600">
            {trends.hero.yearMin}~{trends.hero.yearMax}학년도 수능·평가원 모의평가
            문학 지문 전수와 교육청 학평 지문을 합쳐{" "}
            <strong className="text-slate-900">
              {trends.hero.passages.toLocaleString()}개 지문의 출전·구성·편집
              장치를 역산
            </strong>
            한 결과입니다. 수능·평가원 지문은 전량 정독 코딩했고, 아래 모든
            차트와 사례는 클릭하면 해당 기출 지문의 원문·분석·문항으로 바로
            연결됩니다.
          </p>
          <StatTiles hero={trends.hero} />
        </header>

        {/* ── 01 체제의 변천 ── */}
        <section className="space-y-4">
          <SectionHead no="01" title="출제 체제는 세 번 바뀌었습니다">
            <p>
              단독 지문이 흔하던 1기(2014~2016), (가)에 이론·비평문을 얹던
              2기(2017~2021)를 지나, 2022학년도부터는 이론 지문이 사라지고 그
              기능이 &lt;보기&gt;로 이관된 현행 체제가 확립됩니다. 막대의 색
              구성을 보면 갈래복합(청록)이 자리 잡는 과정이 그대로 보입니다.
            </p>
          </SectionHead>
          <ChartCard
            title="학년도별 문학 세트 구성 (수능·평가원)"
            lead="각 학년도에 출제된 문학 지문을 갈래 그룹별로 쌓았습니다."
            table={regimeTable}
            hint="막대의 색 구간을 클릭하면 그 학년도·갈래의 실지문이 열립니다."
          >
            <RegimeChart
              data={trends.regimeYears}
              eras={trends.eras}
              onOpen={open}
            />
          </ChartCard>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {trends.eras.map((e) => (
              <div
                key={e.label}
                className="rounded-2xl border border-slate-200 bg-white p-3.5"
              >
                <p className="text-[11px] font-bold text-blue-600">
                  {e.from}~{e.to}
                </p>
                <h4 className="mt-0.5 text-[12.5px] font-bold text-slate-800">
                  {e.label}
                </h4>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                  {e.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 02 현행 매트릭스 ── */}
        <section className="space-y-4">
          <SectionHead no="02" title="현행 체제는 4세트 고정 매트릭스입니다">
            <p>
              2022학년도 이후 문학 17문항은 네 자리로 고정됐습니다. 대세트와
              소세트는 고전/현대를 교차해, 한 회차에 현대시 세트와 고전시가
              세트가 반드시 공존합니다. 극·시나리오는 현행 공통 문학에서
              사라졌습니다.
            </p>
          </SectionHead>
          <MatrixCards data={trends.matrix} onOpen={open} />
        </section>

        {/* ── 03 작품 선정 ── */}
        <section className="space-y-4">
          <SectionHead no="03" title="어떤 작품을 고르는가 — 정전과 발굴의 이중 규칙">
            <p>
              작가 풀은 좁고 위계가 뚜렷합니다. 다만 평가원은 정전 작가의{" "}
              <strong>대표작이 아니라 인접 수작</strong>을 고르고(윤동주의
              「서시」가 아니라 「병원」), 그 짝으로 1980년대 이후 시인의
              평판작을 붙입니다. 작자 미상 고전이{" "}
              {trends.anonCount.toLocaleString()}개 지문에 걸릴 만큼 고전은
              저작권에서 자유로운 발굴의 영역입니다.
            </p>
          </SectionHead>
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            <ChartCard
              title="최다 출제 작가 15인"
              lead="파랑이 수능·평가원, 회색이 교육청 학평입니다. 작가를 클릭하면 출제 작품이 펼쳐집니다."
              table={authorsTable}
            >
              <AuthorsChart
                data={trends.authors}
                selected={author}
                onSelect={(a) => setAuthor(a === author ? null : a)}
              />
              {authorEntry ? (
                <div className="mt-2">
                  <WorkChips
                    title={`${authorEntry.author}의 출제 작품 (${
                      authorEntry.kice + authorEntry.ebsi
                    }회)`}
                    works={authorEntry.works.map((w) => ({
                      label: `「${w.work}」`,
                      ids: w.ids,
                    }))}
                    onOpen={open}
                  />
                </div>
              ) : null}
            </ChartCard>
            <ChartCard
              title="현대소설의 발표 연대 (수능·평가원 35편)"
              lead="1930년대와 1970년대의 쌍봉 분포입니다. 발표 후 약 25년이 지난 정전화 작품만 지면에 오릅니다 — 2000년 이후 발표작은 사실상 없습니다."
              table={decadesTable}
            >
              <DecadesChart
                data={trends.decades}
                selected={decade}
                onSelect={(d) => setDecade(d === decade ? null : d)}
              />
              {decadeEntry ? (
                <div className="mt-2">
                  <WorkChips
                    title={`${decadeEntry.decade} 출제 작품`}
                    works={decadeEntry.works.map((w) => ({
                      label: `「${w.title}」`,
                      ids: w.ids,
                    }))}
                    onOpen={open}
                  />
                </div>
              ) : null}
            </ChartCard>
          </div>
        </section>

        {/* ── 04 발췌 문법 ── */}
        <section className="space-y-4">
          <SectionHead no="04" title="어디를 오려내는가 — 지문은 역설계된 편집물입니다">
            <p>
              소설 지문은 “좋은 대목”이 아니라{" "}
              <strong>
                네 문항(서술·인물·구절·감상)이 미리 성립하도록 역설계된 편집물
              </strong>
              입니다. 한 장면으로 부족하면 대비되는 두 장면을 (중략)으로
              접합합니다 — 실제로 수능·평가원 소설 지문의 7할 이상이 두 토막
              구조입니다. 전투·박 타기 같은 스펙터클은 지면에 오르지 못하고
              줄거리 박스로 방출됩니다. 출제가 겨냥하는 것은 사건이 아니라{" "}
              <strong>관계와 심리의 낙차</strong>이기 때문입니다.
            </p>
          </SectionHead>
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            <ChartCard
              title="발췌 편집 장치 사용률 (수능·평가원 소설)"
              lead="줄거리 박스와 (중략)은 분량 장치가 아니라 대비 구조를 만드는 편집 도구입니다."
              table={devicesTable}
              hint="막대를 클릭하면 해당 장치가 쓰인 실지문이 열립니다."
            >
              <DevicesChart data={trends.devices} onOpen={open} />
            </ChartCard>
            <ChartCard
              title="갈래별 지문 분량 레인지"
              lead="점이 중앙값, 띠가 최소~최대 범위입니다. 소설 단독은 2,300자 안팎을 조준합니다."
            >
              <LengthRanges data={trends.lengths} />
            </ChartCard>
          </div>
        </section>

        {/* ── 05 갈래복합 공식 ── */}
        <section className="space-y-4">
          <SectionHead no="05" title="갈래복합은 공식이 있습니다 — 운문 1~2 + 수필 1">
            <p>
              복합 세트의 불변 규칙은 “운문 1~2편 + 수필 1편”입니다. 수필은 두
              운문의 공통 관념을 산문적 사유로 한 단계 추상화하는 자리에
              놓입니다. 묶음의 접점은 소재가 아니라{" "}
              <strong>태도·인식의 층위</strong>에서 설계되고, 반드시 대비 축
              하나를 함께 심습니다 — 공통점 문항과 차이 문항이 동시에 성립해야
              하기 때문입니다.
            </p>
          </SectionHead>
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            <ChartCard
              title="결합 공식 빈도 (수능·평가원)"
              lead="회색은 세부 구성이 표기되지 않은 세트입니다."
              table={combosTable}
              hint="막대를 클릭하면 해당 공식의 실지문 세트가 열립니다."
            >
              <CombosChart data={trends.combos} onOpen={open} />
            </ChartCard>
            <div className="space-y-2.5">
              <p className="text-[12px] font-bold text-slate-500">
                묶음의 주제 접점 8유형
              </p>
              <ThemeGrid data={trends.themes} onOpen={open} />
            </div>
          </div>
        </section>

        {/* ── 06 재출제 법칙 ── */}
        <section className="space-y-4">
          <SectionHead no="06" title="같은 작품이 돌아올 때는 반드시 다른 대목입니다">
            <p>
              동일 작품의 재출제 간격은 실측 5년 이상이고, 돌아올 때는 발췌
              대목·발췌 수·표기까지 바꿉니다. 두 시기의 지문을 나란히 열어
              비교해 보시기 바랍니다.
            </p>
          </SectionHead>
          <ReappearTable data={trends.reappear} onOpen={open} />
          {trends.notation ? (
            <ChartCard
              title="표기 표준의 전환 — 「한거십팔곡」 재출제가 남긴 증거"
              lead="같은 작품이 2019학년도에는 중세 원표기로, 2024학년도에는 현대역 절충으로 실렸습니다. 2022학년도 이후 고전시가 표기는 현대역 절충이 표준입니다."
            >
              <NotationCase data={trends.notation} onOpen={open} />
            </ChartCard>
          ) : null}
        </section>

        {/* ── 07 <보기> 층위 ── */}
        <section className="space-y-4">
          <SectionHead no="07" title="<보기>의 3할은 실존 작품이어야만 성립합니다">
            <p>
              문학 &lt;보기&gt;의 약 29%는 작가의 실제 생애·창작 배경·문학사적
              평가를 외적 준거로 공급하는 특정형입니다. 유배·전란·사행·은거처럼
              창작 배경이 문헌으로 확정되는 작품이 시가 풀에서 과대표집되는
              이유이며, 작품을 고르는 시점에 이미 “어떤 &lt;보기&gt;를 붙일 수
              있는가”가 선정 기준으로 작동합니다.
            </p>
          </SectionHead>
          <BogiSection data={trends.bogi} onOpen={open} />
        </section>

        {/* ── 푸터 ── */}
        <footer className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[12px] leading-relaxed text-slate-500">
            {trends.meta.note} 경향 수치는 수능·평가원 기출 전수 정독과 코퍼스
            정량 계측을 종합한 것으로, 지문 연결이 가능한 사례만 칩으로
            노출했습니다. 예컨대 재출제 사례{" "}
            {trends.reappear.length > 0 ? (
              <PassageChip
                label={`「${trends.reappear[0].work}」 두 시기 비교`}
                ids={[trends.reappear[0].first.id, trends.reappear[0].second.id]}
                onOpen={open}
              />
            ) : null}{" "}
            처럼 모든 주장 뒤에 실지문이 있습니다.
          </p>
        </footer>
      </div>

      <PassageDrawer request={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
