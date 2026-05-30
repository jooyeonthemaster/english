/** 분석 엔진 라이브 테스트용 다양한 영어 지문 10종. (유형 다양성 확보) */
export interface TestPassage {
  id: string;
  type: string;
  schoolType: "MIDDLE" | "HIGH";
  grade: number;
  content: string;
}

export const TEST_PASSAGES: TestPassage[] = [
  {
    id: "01-contrast", type: "대조/비교", schoolType: "HIGH", grade: 2,
    content: `Introverts and extroverts are often misunderstood as simply "shy" versus "outgoing," but the real difference lies in how they recharge their energy. Extroverts gain energy from social interaction; a busy party leaves them feeling alive and refreshed. Introverts, by contrast, spend energy in social settings and must withdraw into quiet solitude to restore it. This does not mean introverts dislike people or that extroverts cannot enjoy being alone. Rather, each personality has an internal "battery" that charges through opposite means. Recognizing this distinction helps teams assign tasks wisely: extroverts may thrive in brainstorming sessions, while introverts often produce their best work in focused, independent settings.`,
  },
  {
    id: "02-process", type: "과정/순차", schoolType: "HIGH", grade: 2,
    content: `Vaccines work by training the immune system without causing the disease itself. First, a vaccine introduces a harmless piece of a pathogen — such as a protein or a weakened virus — into the body. Next, the immune system detects this foreign material and begins producing antibodies designed to attack it. Then, specialized memory cells record the pathogen's identity and remain in the body long after the threat is gone. Finally, if the real pathogen ever invades, these memory cells recognize it immediately and launch a rapid defense, often stopping the infection before symptoms appear. This step-by-step rehearsal is why a brief vaccination can grant years of protection.`,
  },
  {
    id: "03-cause-effect", type: "인과", schoolType: "HIGH", grade: 3,
    content: `The blue light emitted by smartphones and laptops has a measurable effect on our sleep. When we stare at screens late at night, this light suppresses the production of melatonin, the hormone that signals the brain that it is time to sleep. As melatonin levels drop, the body's internal clock is pushed later, making it harder to fall asleep. The consequences accumulate: shorter sleep leads to reduced concentration, weaker memory consolidation, and irritability the next day. Over weeks and months, chronic screen-induced sleep loss has been linked to higher stress and even weakened immunity. The cause is small and habitual, but the downstream effects ripple through nearly every system of the body.`,
  },
  {
    id: "04-problem-solution", type: "문제-해결", schoolType: "HIGH", grade: 2,
    content: `Roughly one-third of all food produced for human consumption is lost or wasted every year, even as millions go hungry. The problem begins on farms, where imperfect-looking produce is discarded, and continues in homes, where families throw away food that has merely passed an over-cautious expiration date. This waste squanders water, land, and labor, and rotting food in landfills releases methane, a potent greenhouse gas. Fortunately, solutions exist at every level. Supermarkets can sell "ugly" vegetables at a discount, governments can standardize clearer date labels, and households can plan meals and compost scraps. None of these steps is difficult; together they could cut food waste dramatically.`,
  },
  {
    id: "05-argument", type: "주장/설득", schoolType: "HIGH", grade: 3,
    content: `Schools should make computer programming a required subject, not an optional elective. In a world increasingly governed by software, understanding how code works is no longer a niche skill but a basic form of literacy, much like reading or arithmetic. Students who learn to program develop logical thinking, break large problems into manageable steps, and gain the confidence to build rather than merely consume technology. Critics argue that not everyone will become a programmer, but that misses the point: we teach algebra without expecting everyone to become a mathematician. The goal is to cultivate a way of thinking. Denying students this skill leaves them unprepared for the economy they are about to enter.`,
  },
  {
    id: "06-narrative", type: "서사/문학", schoolType: "HIGH", grade: 1,
    content: `Min-jun had always feared the open water. As a child, a wave had knocked him down and dragged him under, and ever since, the sea had seemed like a living thing that wanted to swallow him. On the morning of the school trip, he stood at the shoreline while his friends splashed and laughed. His heart pounded. Slowly, he stepped forward until the cold water reached his knees, then his waist. He breathed. Nothing pulled him down. A small wave lifted him gently and set him back on his feet, almost kindly. For the first time, Min-jun understood that the thing he feared had been mostly in his mind.`,
  },
  {
    id: "07-science", type: "과학 설명", schoolType: "HIGH", grade: 3,
    content: `A black hole forms when a massive star runs out of fuel and can no longer resist its own gravity. During most of its life, a star is balanced between two forces: the outward push of nuclear fusion and the inward pull of gravity. When the fuel is exhausted, fusion stops, and gravity wins. If the star is large enough, its core collapses into a point of nearly infinite density called a singularity. Around this point lies the event horizon, a boundary beyond which nothing — not even light — can escape. Because no light escapes, black holes are invisible, yet astronomers detect them indirectly by observing how their immense gravity bends light and flings nearby stars into rapid orbits.`,
  },
  {
    id: "08-abstract", type: "추상/철학", schoolType: "HIGH", grade: 3,
    content: `We tend to believe that more choices make us freer and happier, but psychologist Barry Schwartz calls this the "paradox of choice." When faced with dozens of options, people often feel paralyzed rather than liberated. Each rejected alternative becomes a source of regret, and the fear of making the wrong decision grows heavier as options multiply. A shopper choosing among six jams is more likely to buy one than a shopper facing twenty-four. Abundance, it turns out, can erode satisfaction. True freedom may lie not in having endless options but in knowing which ones to ignore, allowing us to commit fully to a single, sufficient good.`,
  },
  {
    id: "09-expository", type: "설명문(중등)", schoolType: "MIDDLE", grade: 3,
    content: `Honeybees communicate the location of food through a remarkable behavior called the "waggle dance." When a bee finds a rich source of nectar, it returns to the hive and moves in a figure-eight pattern on the honeycomb. The angle of the dance shows the direction of the food relative to the sun, and the length of the central "waggle" run tells the other bees how far away it is. Amazingly, the watching bees can translate this dance into a flight plan and travel straight to the flowers. Through this silent language, a single hive can gather food efficiently across a wide area.`,
  },
  {
    id: "10-compare-debate", type: "논쟁/양면", schoolType: "HIGH", grade: 3,
    content: `For centuries, thinkers have debated whether our character is shaped more by nature or by nurture. Those who emphasize nature point to twin studies, where identical twins raised apart still share striking similarities in temperament and intelligence, suggesting genes set powerful limits. Those who emphasize nurture highlight how language, values, and habits are absorbed from family and culture, noting that a child raised in poverty faces very different odds than one raised in comfort. Modern science increasingly rejects the either-or framing. Genes and environment are not rivals but partners: our DNA provides a range of possibilities, and our experiences determine which of those possibilities are realized.`,
  },
];
