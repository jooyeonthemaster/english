// 서버 컴포넌트. 자식 랜딩 씬은 각자 "use client" 경계를 가지므로
// 여기서는 SEO 메타/JSON-LD를 SSR HTML 에 정적으로 실을 수 있다.
import { HeroScene } from "@/components/landing/hero-scene";
import { IntakeScene } from "@/components/landing/intake-scene";
import { AnnotationScene } from "@/components/landing/annotation-scene";
import { QuestionBurstScene } from "@/components/landing/question-burst-scene";
import { ExamPaperScene } from "@/components/landing/exam-paper-scene";
import { ReportScene } from "@/components/landing/report-scene";
import { WebtoonScene } from "@/components/landing/webtoon-scene";
import { FolderScene } from "@/components/landing/folder-scene";
import { SampleScene } from "@/components/landing/sample-scene";
import { CtaScene } from "@/components/landing/cta-scene";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingSnap } from "@/components/landing/landing-snap";
import { ScrollToTopButton } from "@/components/landing/scroll-to-top-button";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { LandingBannerStrip } from "@/components/landing/landing-banner-strip";
import { LandingPopup } from "@/components/landing/landing-popup";
import { OnboardingOfferSection } from "@/components/landing/onboarding-offer-section";
import { JsonLd } from "@/components/seo/json-ld";
import { softwareApplicationSchema } from "@/lib/seo/structured-data";
import { getActiveLandingBanner, getActiveLandingPopups } from "@/lib/platform-settings";

export default async function RootPage() {
  const [landingBanner, landingPopups] = await Promise.all([
    getActiveLandingBanner(),
    getActiveLandingPopups(),
  ]);
  return (
    <main
      data-landing-page
      className={`w-full overflow-x-hidden bg-white text-gray-900 selection:bg-[#3B82F6] selection:text-white font-sans antialiased ${
        landingBanner ? "pt-11" : ""
      }`}
    >
      <JsonLd id="ld-home-software" data={softwareApplicationSchema()} />
      {landingBanner && <LandingBannerStrip banner={landingBanner} />}
      <LandingHeader offsetTop={!!landingBanner} />
      <LandingSnap />
      <ScrollProgress />
      <div data-snap className="lg:snap-start">
        <HeroScene />
      </div>
      <div data-snap data-landing-feature className="w-full lg:snap-start">
        <OnboardingOfferSection />
      </div>
      {landingPopups.length > 0 && <LandingPopup popups={landingPopups} />}
      <div id="section-question" data-snap data-landing-feature className="w-full lg:snap-start">
        <QuestionBurstScene />
      </div>
      <div id="section-annotation" data-snap data-landing-feature className="w-full lg:snap-start">
        <AnnotationScene />
      </div>
      <div id="section-exam" data-snap data-landing-feature className="w-full lg:snap-start">
        <ExamPaperScene />
      </div>
      <div id="section-intake" data-snap data-landing-feature className="w-full lg:snap-start">
        <IntakeScene />
      </div>
      <div id="section-report" data-snap data-landing-feature className="w-full lg:snap-start">
        <ReportScene />
      </div>
      <div id="section-webtoon" data-snap data-landing-feature className="w-full lg:snap-start">
        <WebtoonScene />
      </div>
      <div id="section-folder" data-snap data-landing-feature className="w-full lg:snap-start">
        <FolderScene />
      </div>
      <div id="section-samples" data-snap data-landing-feature className="w-full lg:snap-start">
        <SampleScene />
      </div>
      <div data-snap className="lg:snap-start">
        <CtaScene />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
