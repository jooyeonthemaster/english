// ============================================================================
// Art-style bible for the image prompt (English — the image model's native
// register). Brand/studio names are deliberately avoided: describing the look
// is as effective and does not trip provider moderation.
// ============================================================================

export const STYLE_BIBLE: Record<string, string> = {
  KOREAN_WEBTOON: [
    "Modern Korean vertical-scroll webtoon art, full color.",
    "Clean confident digital line art with slightly thicker outer contours; soft cel shading with gentle gradient highlights.",
    "Characters have appealing semi-realistic proportions and very readable facial expressions (eyebrows and mouths carry the emotion).",
    "Backgrounds are clear and uncluttered, simplified but specific; bright, friendly educational tone.",
  ].join(" "),
  PIXAR_3D: [
    "Stylized 3D animated feature-film look.",
    "Soft global illumination, subtle subsurface scattering on skin, rounded appealing character designs with big expressive eyes,",
    "rich but simple materials, cinematic depth of field, warm key light with cool rim light.",
  ].join(" "),
  GHIBLI: [
    "Hand-painted Japanese animation film look.",
    "Warm watercolor and gouache textures, lush painterly backgrounds with natural light, gentle thin linework,",
    "calm nostalgic atmosphere, soft greens, sky blues and sunlit ochres.",
  ].join(" "),
  MANHWA_ROMANCE: [
    "Delicate romance manhwa illustration.",
    "Fine thin lines, pastel palette, luminous large eyes, soft bloom lighting with sparkles and gentle screen-tone textures,",
    "elegant slender proportions, dreamy emotional atmosphere.",
  ].join(" "),
  REALISTIC: [
    "Cinematic semi-realistic digital painting.",
    "Realistic anatomy and lighting, detailed believable environments, filmic color grading and dramatic but clean compositions,",
    "painterly finish rather than photographic.",
  ].join(" "),
};

export function styleBibleFor(style: string): string {
  return STYLE_BIBLE[style] ?? STYLE_BIBLE.KOREAN_WEBTOON;
}
