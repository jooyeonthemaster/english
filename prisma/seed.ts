import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SCHOOLS = [
  // 중학교 (19개)
  { name: "강동중", slug: "gangdong-ms", type: "MIDDLE" },
  { name: "강명중", slug: "gangmyeong-ms", type: "MIDDLE" },
  { name: "강빛중", slug: "gangbit-ms", type: "MIDDLE" },
  { name: "강일중", slug: "gangil-ms", type: "MIDDLE" },
  { name: "고덕중", slug: "godeok-ms", type: "MIDDLE" },
  { name: "동북중", slug: "dongbuk-ms", type: "MIDDLE" },
  { name: "동신중", slug: "dongsin-ms", type: "MIDDLE" },
  { name: "둔촌중", slug: "dunchon-ms", type: "MIDDLE" },
  { name: "명일중", slug: "myeongil-ms", type: "MIDDLE" },
  { name: "배재중", slug: "baejae-ms", type: "MIDDLE" },
  { name: "상일중", slug: "sangil-ms", type: "MIDDLE" },
  { name: "성내중", slug: "seongnae-ms", type: "MIDDLE" },
  { name: "성덕여중", slug: "seongdeok-gms", type: "MIDDLE" },
  { name: "신명중", slug: "sinmyeong-ms", type: "MIDDLE" },
  { name: "신암중", slug: "sinam-ms", type: "MIDDLE" },
  { name: "천일중", slug: "cheonil-ms", type: "MIDDLE" },
  { name: "천호중", slug: "cheonho-ms", type: "MIDDLE" },
  { name: "한산중", slug: "hansan-ms", type: "MIDDLE" },
  { name: "한영중", slug: "hanyeong-ms", type: "MIDDLE" },

  // 고등학교 (14개)
  { name: "강동고", slug: "gangdong-hs", type: "HIGH" },
  { name: "강일고", slug: "gangil-hs", type: "HIGH" },
  { name: "광문고", slug: "gwangmun-hs", type: "HIGH" },
  { name: "동북고", slug: "dongbuk-hs", type: "HIGH" },
  { name: "둔촌고", slug: "dunchon-hs", type: "HIGH" },
  { name: "명일여고", slug: "myeongil-ghs", type: "HIGH" },
  { name: "선사고", slug: "seonsa-hs", type: "HIGH" },
  { name: "성덕고", slug: "seongdeok-hs", type: "HIGH" },
  { name: "상일여고", slug: "sangil-ghs", type: "HIGH" },
  { name: "한영고", slug: "hanyeong-hs", type: "HIGH" },
  { name: "한영외고", slug: "hanyeong-flhs", type: "HIGH" },
  { name: "배재고", slug: "baejae-hs", type: "HIGH" },
  { name: "서울컨벤션고", slug: "convention-hs", type: "HIGH" },
  { name: "상일미디어고", slug: "sangil-media-hs", type: "HIGH" },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Create schools
  for (const school of SCHOOLS) {
    await prisma.school.upsert({
      where: { slug: school.slug },
      update: {},
      create: school,
    });
  }
  console.log(`✅ ${SCHOOLS.length} schools created`);

  // Create admin user
  const hashedPassword = await bcrypt.hash("admin1234", 10);
  await prisma.admin.upsert({
    where: { email: "admin@darun.academy" },
    update: {},
    create: {
      email: "admin@darun.academy",
      password: hashedPassword,
      name: "관리자",
      role: "SUPER_ADMIN",
    },
  });
  console.log("✅ Admin user created (admin@darun.academy / admin1234)");

  // Create sample teacher
  const teacherPassword = await bcrypt.hash("teacher1234", 10);
  await prisma.admin.upsert({
    where: { email: "teacher@darun.academy" },
    update: {},
    create: {
      email: "teacher@darun.academy",
      password: teacherPassword,
      name: "김선생",
      role: "TEACHER",
    },
  });
  console.log("✅ Teacher user created (teacher@darun.academy / teacher1234)");

  // Create sample student
  const gangdongMs = await prisma.school.findUnique({
    where: { slug: "gangdong-ms" },
  });

  if (gangdongMs) {
    await prisma.student.upsert({
      where: { studentCode: "GD2401" },
      update: {},
      create: {
        name: "홍길동",
        studentCode: "GD2401",
        grade: 2,
        schoolId: gangdongMs.id,
      },
    });
    console.log("✅ Sample student created (홍길동 / GD2401)");

    // Create sample vocabulary list
    const vocabList = await prisma.vocabularyList.create({
      data: {
        schoolId: gangdongMs.id,
        title: "Lesson 1 핵심 단어",
        grade: 2,
        semester: "FIRST",
        unit: "Lesson 1",
        items: {
          create: [
            { english: "achieve", korean: "달성하다", partOfSpeech: "동사", exampleEn: "She achieved her goal.", exampleKr: "그녀는 목표를 달성했다.", order: 1 },
            { english: "brilliant", korean: "훌륭한, 빛나는", partOfSpeech: "형용사", exampleEn: "What a brilliant idea!", exampleKr: "정말 훌륭한 아이디어야!", order: 2 },
            { english: "courage", korean: "용기", partOfSpeech: "명사", exampleEn: "It takes courage to speak up.", exampleKr: "말하려면 용기가 필요하다.", order: 3 },
            { english: "determine", korean: "결정하다", partOfSpeech: "동사", exampleEn: "He determined to study harder.", exampleKr: "그는 더 열심히 공부하기로 결심했다.", order: 4 },
            { english: "enthusiasm", korean: "열정", partOfSpeech: "명사", exampleEn: "She showed great enthusiasm.", exampleKr: "그녀는 대단한 열정을 보였다.", order: 5 },
            { english: "flexible", korean: "유연한", partOfSpeech: "형용사", exampleEn: "Be flexible with your plans.", exampleKr: "계획에 유연하게 대처하세요.", order: 6 },
            { english: "generate", korean: "생성하다", partOfSpeech: "동사", exampleEn: "The machine generates electricity.", exampleKr: "그 기계는 전기를 생성한다.", order: 7 },
            { english: "hypothesis", korean: "가설", partOfSpeech: "명사", exampleEn: "We need to test this hypothesis.", exampleKr: "이 가설을 검증해야 한다.", order: 8 },
            { english: "interpret", korean: "해석하다", partOfSpeech: "동사", exampleEn: "How do you interpret this poem?", exampleKr: "이 시를 어떻게 해석하나요?", order: 9 },
            { english: "justify", korean: "정당화하다", partOfSpeech: "동사", exampleEn: "Can you justify your answer?", exampleKr: "답을 정당화할 수 있나요?", order: 10 },
          ],
        },
      },
    });
    console.log("✅ Sample vocabulary list created (10 words)");

    // Create sample passage
    const passage = await prisma.passage.create({
      data: {
        schoolId: gangdongMs.id,
        title: "The Power of Small Habits",
        content: `Many people want to change their lives, but they often try to make big changes all at once. This approach usually fails because it is too difficult to maintain. Instead, research shows that small habits can lead to remarkable results over time.

James Clear, the author of "Atomic Habits," explains that improving by just 1% each day can lead to being 37 times better by the end of a year. The key is to focus on systems rather than goals. A system is a set of daily habits that naturally lead you toward your desired outcome.

For example, if you want to become a better English speaker, don't just set a goal to be fluent. Instead, create a system: read one English article every morning, practice speaking for 10 minutes after lunch, and review new vocabulary before bed. These small, consistent actions will compound over time and produce significant improvements.

The most important thing is to start small and be consistent. Don't try to study English for three hours every day if you can't maintain it. Start with 15 minutes and gradually increase. Remember, it's not about perfection — it's about progress.`,
        source: "교과서 Lesson 1",
        grade: 2,
        semester: "FIRST",
        unit: "Lesson 1",
        order: 1,
        notes: {
          create: [
            {
              content: "이 문장에서 approach는 '접근법'이라는 뜻으로, method와 유사합니다. 시험에서 자주 출제됩니다.",
              noteType: "VOCAB",
              order: 1,
            },
            {
              content: "주어(This approach) + 동사(fails) 구조에서 because절이 이유를 설명합니다. 부사절 접속사 because의 활용을 주의하세요.",
              noteType: "GRAMMAR",
              order: 2,
            },
            {
              content: "핵심 포인트: 작은 습관의 복리 효과(compound effect)를 이해하는 것이 이 지문의 핵심입니다. 시험에서 주제 파악 문제로 출제될 가능성이 높습니다.",
              noteType: "EMPHASIS",
              order: 3,
            },
          ],
        },
      },
    });
    console.log("✅ Sample passage created with 3 notes");

    // Create sample exam
    const exam = await prisma.exam.create({
      data: {
        schoolId: gangdongMs.id,
        grade: 2,
        semester: "FIRST",
        examType: "MIDTERM",
        year: 2026,
        title: "2026년 1학기 중간고사",
        questions: {
          create: [
            {
              questionNumber: 1,
              questionText: "다음 글의 주제로 가장 적절한 것은?\n\nMany people want to change their lives, but they often try to make big changes all at once. This approach usually fails because it is too difficult to maintain. Instead, research shows that small habits can lead to remarkable results over time.",
              correctAnswer: "3",
              points: 3,
              passageId: passage.id,
            },
            {
              questionNumber: 2,
              questionText: "다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\nThe key is to focus on _______ rather than goals.",
              correctAnswer: "2",
              points: 3,
              passageId: passage.id,
            },
            {
              questionNumber: 3,
              questionText: "다음 밑줄 친 'compound'의 의미와 가장 가까운 것은?",
              correctAnswer: "4",
              points: 2,
              passageId: passage.id,
            },
          ],
        },
      },
    });

    // Add explanations
    const questions = await prisma.examQuestion.findMany({
      where: { examId: exam.id },
      orderBy: { questionNumber: "asc" },
    });

    await prisma.questionExplanation.create({
      data: {
        questionId: questions[0].id,
        content: "<p>이 글은 <strong>작은 습관의 힘</strong>에 대해 설명하고 있습니다.</p><p>첫 문장에서 'big changes'를 시도하면 실패한다고 하고, 'small habits'이 놀라운 결과를 가져온다고 합니다.</p><p>따라서 정답은 <strong>③ 작은 습관이 큰 변화를 만든다</strong>입니다.</p>",
        keyPoints: JSON.stringify(["주제 파악 문제 - 글의 핵심 키워드 파악", "small habits → remarkable results 관계", "첫 문단에 주제가 명시됨"]),
        difficulty: "medium",
      },
    });

    await prisma.questionExplanation.create({
      data: {
        questionId: questions[1].id,
        content: "<p>James Clear는 goals보다 <strong>systems</strong>에 집중해야 한다고 말합니다.</p><p>다음 문장에서 'A system is a set of daily habits'라고 정의하고 있으므로, 빈칸에는 <strong>② systems</strong>가 들어가야 합니다.</p>",
        keyPoints: JSON.stringify(["빈칸 추론 - 전후 문맥 파악", "rather than으로 대조 관계 파악", "다음 문장이 힌트"]),
        difficulty: "easy",
      },
    });

    await prisma.questionExplanation.create({
      data: {
        questionId: questions[2].id,
        content: "<p>'compound'는 여기서 <strong>'복합되다, 누적되다'</strong>라는 뜻입니다.</p><p>문맥상 '작은 행동들이 시간이 지나면서 <em>누적되어</em> 상당한 개선을 만들어낸다'는 의미입니다.</p><p>따라서 정답은 <strong>④ accumulate (축적되다)</strong>입니다.</p>",
        keyPoints: JSON.stringify(["어휘 문제 - 문맥 속 의미 파악", "compound의 다의어 주의", "over time과 함께 쓰여 누적 의미"]),
        difficulty: "medium",
      },
    });
    console.log("✅ Sample exam created with 3 questions and explanations");

    // Create teacher prompt
    await prisma.teacherPrompt.create({
      data: {
        schoolId: gangdongMs.id,
        passageId: passage.id,
        content: "이 지문은 Atomic Habits에서 영감을 받은 지문입니다. 학생들에게 1% 개선의 복리 효과를 강조해주세요. 특히 'system vs goal' 개념이 시험에 자주 출제됩니다. compound의 다의어적 성격(화학: 화합물, 일반: 복합의, 여기서: 누적되다)도 반드시 설명해주세요.",
        promptType: "GENERAL",
        isActive: true,
      },
    });
    console.log("✅ Sample teacher prompt created");
  }

  console.log("\n🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
