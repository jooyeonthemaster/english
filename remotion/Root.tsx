import { Composition, Sequence } from 'remotion';
import { FPS, VIDEO_WIDTH, VIDEO_HEIGHT, SCENES, sceneFrames } from './utils/constants';

// 13 scenes - rapid montage style
import IntroScene from './scenes/IntroScene';
import OverviewScene from './scenes/OverviewScene';
import DashboardScene from './scenes/DashboardScene';
import StudentMgmtScene from './scenes/StudentMgmtScene';
import ClassAttendanceScene from './scenes/ClassAttendanceScene';
import AIWorkbenchScene from './scenes/AIWorkbenchScene';
import ExamFlowScene from './scenes/ExamFlowScene';
import QuestionAssignmentScene from './scenes/QuestionAssignmentScene';
import BusinessScene from './scenes/BusinessScene';
import CommunicationScene from './scenes/CommunicationScene';
import StudentAppScene from './scenes/StudentAppScene';
import ParentAppScene from './scenes/ParentAppScene';
import TechOutroScene from './scenes/TechOutroScene';
import AIFlowMobilePromo from './scenes/AIFlowMobilePromo';
import PassageAnalysisDeepDive, { PASSAGE_DEEP_DIVE_TOTAL } from './scenes/PassageAnalysisDeepDive';
import HiggsfieldPromo, { HIGGSFIELD_PROMO_TOTAL, HIGGSFIELD_PROMO_FPS, HIGGSFIELD_PROMO_WIDTH, HIGGSFIELD_PROMO_HEIGHT } from './scenes/HiggsfieldPromo';
import OrderShuffleMeme, { ORDER_MEME_TOTAL, ORDER_MEME_FPS, ORDER_MEME_W, ORDER_MEME_H } from './scenes/OrderShuffleMeme';
import SmoatNaeshinPromo, { SMOAT_PROMO_TOTAL, SMOAT_PROMO_FPS, SMOAT_PROMO_W, SMOAT_PROMO_H } from './scenes/SmoatNaeshinPromo';

const NaraDemoVideo: React.FC = () => {
  return (
    <>
      <Sequence {...sceneFrames(SCENES.intro)}><IntroScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.overview)}><OverviewScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.dashboard)}><DashboardScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.studentMgmt)}><StudentMgmtScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.classAttendance)}><ClassAttendanceScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.aiWorkbench)}><AIWorkbenchScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.examFlow)}><ExamFlowScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.questionAssignment)}><QuestionAssignmentScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.business)}><BusinessScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.communication)}><CommunicationScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.studentApp)}><StudentAppScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.parentApp)}><ParentAppScene /></Sequence>
      <Sequence {...sceneFrames(SCENES.techOutro)}><TechOutroScene /></Sequence>
    </>
  );
};

export const RemotionRoot: React.FC = () => {
  const totalFrames = (SCENES.techOutro.start + SCENES.techOutro.duration) * FPS;

  return (
    <>
      <Composition
        id="NaraDemoVideo"
        component={NaraDemoVideo}
        durationInFrames={totalFrames}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      {/* Individual scenes for preview */}
      {Object.entries(SCENES).map(([key, scene]) => {
        const components: Record<string, React.FC> = {
          intro: IntroScene,
          overview: OverviewScene,
          dashboard: DashboardScene,
          studentMgmt: StudentMgmtScene,
          classAttendance: ClassAttendanceScene,
          aiWorkbench: AIWorkbenchScene,
          examFlow: ExamFlowScene,
          questionAssignment: QuestionAssignmentScene,
          business: BusinessScene,
          communication: CommunicationScene,
          studentApp: StudentAppScene,
          parentApp: ParentAppScene,
          techOutro: TechOutroScene,
        };
        return (
          <Composition
            key={key}
            id={key.charAt(0).toUpperCase() + key.slice(1)}
            component={components[key]}
            durationInFrames={scene.duration * FPS}
            fps={FPS}
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
          />
        );
      })}

      {/* Mobile Promo Video (1080x1920) */}
      <Composition
        id="AIFlowMobilePromo"
        component={AIFlowMobilePromo}
        durationInFrames={1140}
        fps={FPS}
        width={1080}
        height={1920}
      />

      {/* Passage Analysis Deep Dive (1080x1920) */}
      <Composition
        id="PassageAnalysisDeepDive"
        component={PassageAnalysisDeepDive}
        durationInFrames={PASSAGE_DEEP_DIVE_TOTAL}
        fps={FPS}
        width={1080}
        height={1920}
      />

      {/* Higgsfield Promo: 8-cut 40s vertical ad */}
      <Composition
        id="HiggsfieldPromo"
        component={HiggsfieldPromo}
        durationInFrames={HIGGSFIELD_PROMO_TOTAL}
        fps={HIGGSFIELD_PROMO_FPS}
        width={HIGGSFIELD_PROMO_WIDTH}
        height={HIGGSFIELD_PROMO_HEIGHT}
      />

      {/* Order Shuffle Meme: 9:16 high-energy promo for sentence-ordering test */}
      <Composition
        id="OrderShuffleMeme"
        component={OrderShuffleMeme}
        durationInFrames={ORDER_MEME_TOTAL}
        fps={ORDER_MEME_FPS}
        width={ORDER_MEME_W}
        height={ORDER_MEME_H}
      />

      <Composition
        id="SmoatNaeshinPromo"
        component={SmoatNaeshinPromo}
        durationInFrames={SMOAT_PROMO_TOTAL}
        fps={SMOAT_PROMO_FPS}
        width={SMOAT_PROMO_W}
        height={SMOAT_PROMO_H}
      />
    </>
  );
};
