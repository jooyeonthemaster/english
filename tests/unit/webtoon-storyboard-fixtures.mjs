// 웹툰 v2 단위 테스트 공용 픽스처 — webtoon-storyboard.test.mjs 에서 분리(500줄 규칙).
// 테스트 러너는 *.test.* 만 실행하므로 이 모듈은 단독으로 돌지 않는다.

// ── 픽스처: 깨끗한 6컷 콘티(언어별 글자만 교체) ─────────────────────────────
export const CAST = [
  { name: "민지", role: "주인공 · 호기심 많은 고1", appearance: "16-year-old girl, black bob hair, yellow hairpin, navy blazer" },
  { name: "준호", role: "친구 · 장난꾸러기", appearance: "16-year-old boy, short brown hair, round glasses, grey hoodie" },
];
// [beat, shot, angle, size, 화자, 말풍선 종류]
export const SKELETON = [
  ["hook", "extreme_wide", "birds_eye", "wide", null, null],
  ["setup", "medium", "over_the_shoulder", "half", "민지", "speech"],
  ["development", "close_up", "eye_level", "half", "준호", "speech"],
  ["turn", "insert", "high_angle", "wide", null, null],
  ["climax", "medium_close_up", "low_angle", "large", "민지", "shout"],
  ["resolution", "full", "eye_level", "wide", "준호", "speech"],
];
export const KO_CAPTIONS = ["월요일 아침, 도서관 앞에 상자가 쌓였다.", "", "", "책마다 손글씨 쪽지가 붙어 있다.", "쪽지에는 다음 독자를 위한 응원이 적혀 있었다.", "나눔은 또 다른 나눔을 부른다."];
export const KO_LINES = ["", "이 상자들 다 뭐야?", "기부된 책이래!", "", "우리도 책을 나누자!", "좋아, 같이 하자!"];
export const EN_LINES = ["", "What are all these boxes?", "They are donated books!", "", "Let's share our books too!", "Sounds good, let's do it!"];
export const EN_CAPTIONS = ["Monday morning: boxes pile up at the library door.", "", "", "Every book carries a handwritten note.", "The notes cheer on the next reader.", "Sharing sparks more sharing."];
export const LETTERING = {
  KO: { captions: KO_CAPTIONS, lines: KO_LINES, translations: null, sfx: "툭" },
  KO_EN: { captions: KO_CAPTIONS, lines: EN_LINES, translations: KO_LINES, sfx: "툭" },
  EN: { captions: EN_CAPTIONS, lines: EN_LINES, translations: null, sfx: "THUD" },
};

export function cleanBoard(language) {
  const L = LETTERING[language];
  return {
    version: 1, title: "도서관의 기적", artNotes: "",
    loglineKo: "기부된 책 상자에서 나눔의 의미를 발견하는 이야기", keyMessageKo: "나눔은 또 다른 나눔을 부른다",
    world: "A modern Korean high school library in early spring.", palette: "Warm creams and soft sky blues, one red accent.",
    cast: structuredClone(CAST),
    panels: SKELETON.map(([beat, shot, angle, size, speaker, kind], i) => ({
      beat, shot, angle, size,
      composition: `Panel ${i + 1} subject framed by bookshelves, depth toward a bright window.`,
      action: `The friends react (${beat}) with clear facial expressions.`,
      setting: "School library entrance, morning.", mood: "Soft morning light.",
      caption: L.captions[i], sfx: i === 3 ? L.sfx : "", keyPhrase: "", sourceExcerpt: "",
      bubbles: speaker ? [{ speaker, kind, text: L.lines[i], translation: L.translations ? L.translations[i] : "" }] : [],
    })),
  };
}
export const mut = (lang, fn) => { const sb = cleanBoard(lang); fn(sb); return sb; };
/** 보이는 글자 정확히 n자(5자마다 공백 — 공백은 세지 않는다). */
export const koT = (n) => Array.from({ length: n }, (_, i) => (i % 5 === 4 ? "다 " : "가")).join("").trim();
export const vis = (t) => t.replace(/\s+/g, "").length;
