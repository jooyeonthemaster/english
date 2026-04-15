"use client";

import { HeroScene } from "@/components/landing/hero-scene";
import { AnnotationScene } from "@/components/landing/annotation-scene";
import { QuestionBurstScene } from "@/components/landing/question-burst-scene";
import { ExamPaperScene } from "@/components/landing/exam-paper-scene";
import { FolderScene } from "@/components/landing/folder-scene";
import { ApplicationScene } from "@/components/landing/application-scene";
import { CtaScene } from "@/components/landing/cta-scene";
import { StickyCreditBar } from "@/components/landing/sticky-credit-bar";

export default function RootPage() {
  return (
    <main className="w-full overflow-x-hidden bg-white text-gray-900 selection:bg-[#3B82F6] selection:text-white font-sans antialiased">
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
      <div id="section-apply" className="w-full">
        <ApplicationScene />
      </div>
      <CtaScene />
      <StickyCreditBar />
    </main>
  );
}
