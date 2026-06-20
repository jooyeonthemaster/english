// 서버 컴포넌트. 자식 랜딩 씬은 각자 "use client" 경계를 가지므로
// 여기서는 SEO 메타/JSON-LD를 SSR HTML 에 정적으로 실을 수 있다.
import { HeroScene } from "@/components/landing/hero-scene";
import { AnnotationScene } from "@/components/landing/annotation-scene";
import { QuestionBurstScene } from "@/components/landing/question-burst-scene";
import { ExamPaperScene } from "@/components/landing/exam-paper-scene";
import { FolderScene } from "@/components/landing/folder-scene";
import { CtaScene } from "@/components/landing/cta-scene";
import { LandingHeader } from "@/components/landing/landing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { softwareApplicationSchema } from "@/lib/seo/structured-data";
import Link from "next/link";

// 홈(/)에서 4개 기능 페이지로 가는 내부 링크. 기능 클러스터 고립을 막아
// 링크 에쿼티를 전달한다. 라벨은 마케팅 헤더 정식 라벨과 통일.
const FEATURE_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/features/ai-question-generation", label: "AI 문제 생성" },
  { href: "/features/exam-builder", label: "Word 시험지" },
  { href: "/features/passage-analysis", label: "지문 분석" },
  { href: "/features/academy-erp", label: "학원 올인원" },
];

export default function RootPage() {
  return (
    <main className="w-full overflow-x-hidden bg-white text-gray-900 selection:bg-[#3B82F6] selection:text-white font-sans antialiased">
      <JsonLd id="ld-home-software" data={softwareApplicationSchema()} />
      <LandingHeader />
      <HeroScene />
      <div id="section-annotation" className="w-full">
        <AnnotationScene />
      </div>
      <div id="section-question" className="w-full">
        <QuestionBurstScene />
      </div>
      <div id="section-exam" className="w-full">
        <ExamPaperScene />
      </div>
      <div id="section-folder" className="w-full">
        <FolderScene />
      </div>
      <nav
        aria-label="기능"
        className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-8"
      >
        <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-blue-600">
          기능
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURE_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex h-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-black text-slate-800 transition hover:border-blue-200 hover:text-blue-700"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <CtaScene />
    </main>
  );
}
