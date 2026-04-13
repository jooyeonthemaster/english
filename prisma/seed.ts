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
  console.log("🌱 Seeding NARA ERP database...");

  // 1. Create Academy
  const academy = await prisma.academy.upsert({
    where: { slug: "darun" },
    update: {},
    create: {
      name: "다른 영어 학원",
      slug: "darun",
      phone: "02-1234-5678",
      address: "서울특별시 강동구",
      color: "#3B82F6",
    },
  });
  console.log(`✅ Academy created: ${academy.name}`);

  // 2. Create Schools (belong to academy)
  for (const school of SCHOOLS) {
    await prisma.school.upsert({
      where: { academyId_slug: { academyId: academy.id, slug: school.slug } },
      update: {},
      create: { ...school, academyId: academy.id },
    });
  }
  console.log(`✅ ${SCHOOLS.length} schools created`);

  // 3. Create Staff — Director
  const directorPassword = await bcrypt.hash("admin1234", 10);
  await prisma.staff.upsert({
    where: { email: "director@darun.academy" },
    update: {},
    create: {
      academyId: academy.id,
      email: "director@darun.academy",
      password: directorPassword,
      name: "원장님",
      role: "DIRECTOR",
      phone: "010-1234-5678",
    },
  });
  console.log("✅ Director created (director@darun.academy / admin1234)");

  // 4. Create Staff — Teacher
  const teacherPassword = await bcrypt.hash("teacher1234", 10);
  const teacher = await prisma.staff.upsert({
    where: { email: "teacher@darun.academy" },
    update: {},
    create: {
      academyId: academy.id,
      email: "teacher@darun.academy",
      password: teacherPassword,
      name: "김선생",
      role: "TEACHER",
      phone: "010-9876-5432",
    },
  });
  console.log("✅ Teacher created (teacher@darun.academy / teacher1234)");

  // 5. Create Classes
  const classA = await prisma.class.create({
    data: {
      academyId: academy.id,
      name: "중2 A반",
      teacherId: teacher.id,
      capacity: 15,
      fee: 300000,
      room: "301호",
      schedule: JSON.stringify([
        { day: "MON", startTime: "16:00", endTime: "18:00" },
        { day: "WED", startTime: "16:00", endTime: "18:00" },
        { day: "FRI", startTime: "16:00", endTime: "18:00" },
      ]),
    },
  });
  console.log("✅ Class created: 중2 A반");

  // 6. Create Sample Students
  const gangdongMs = await prisma.school.findFirst({
    where: { academyId: academy.id, slug: "gangdong-ms" },
  });

  const students = [
    { name: "홍길동", studentCode: "NAR001", grade: 2 },
    { name: "김철수", studentCode: "NAR002", grade: 2 },
    { name: "이영희", studentCode: "NAR003", grade: 2 },
    { name: "박지민", studentCode: "NAR004", grade: 1 },
    { name: "최수진", studentCode: "NAR005", grade: 3 },
  ];

  for (const s of students) {
    const student = await prisma.student.upsert({
      where: { studentCode: s.studentCode },
      update: {},
      create: {
        academyId: academy.id,
        schoolId: gangdongMs?.id,
        ...s,
        status: "ACTIVE",
        xp: Math.floor(Math.random() * 3000),
        level: Math.floor(Math.random() * 10) + 1,
        streak: Math.floor(Math.random() * 15),
      },
    });
    // Enroll in class
    await prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId: classA.id, studentId: student.id } },
      update: {},
      create: { classId: classA.id, studentId: student.id, status: "ENROLLED" },
    });
  }
  console.log(`✅ ${students.length} students created and enrolled`);

  // 7. Create Parent
  const parent = await prisma.parent.create({
    data: {
      academyId: academy.id,
      name: "홍부모",
      phone: "01012345678",
      relation: "MOTHER",
      loginToken: "demo-parent-token-12345",
    },
  });
  const hongStudent = await prisma.student.findUnique({ where: { studentCode: "NAR001" } });
  if (hongStudent) {
    await prisma.parentStudent.create({
      data: { parentId: parent.id, studentId: hongStudent.id },
    });
  }
  console.log("✅ Parent created (phone: 01012345678)");

  // 8. Create sample vocabulary list
  await prisma.vocabularyList.create({
    data: {
      academyId: academy.id,
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
  console.log("✅ Vocabulary list created (10 words)");

  // 9. Create Achievements
  const achievements = [
    { name: "7일 연속 출석", description: "7일 연속으로 출석했습니다", icon: "🔥", category: "STREAK", condition: JSON.stringify({ type: "STREAK", value: 7 }), xpReward: 100 },
    { name: "단어왕", description: "단어 시험 3회 연속 만점", icon: "👑", category: "VOCAB", condition: JSON.stringify({ type: "PERFECT", value: 100, count: 3 }), xpReward: 200 },
    { name: "문법 마스터", description: "문법 정답률 90% 이상", icon: "📚", category: "GRAMMAR", condition: JSON.stringify({ type: "SCORE", min: 90 }), xpReward: 150 },
    { name: "급성장", description: "한 달간 점수 20점 이상 상승", icon: "📈", category: "GROWTH", condition: JSON.stringify({ type: "GROWTH", value: 20 }), xpReward: 300 },
    { name: "올클리어", description: "과제 100% 완료", icon: "✅", category: "ASSIGNMENT", condition: JSON.stringify({ type: "COUNT", value: 100 }), xpReward: 150 },
    { name: "30일 연속 출석", description: "30일 연속 출석 달성!", icon: "💎", category: "STREAK", condition: JSON.stringify({ type: "STREAK", value: 30 }), xpReward: 500 },
  ];

  for (const a of achievements) {
    await prisma.achievement.create({
      data: { academyId: academy.id, ...a },
    });
  }
  console.log(`✅ ${achievements.length} achievements created`);

  // 10. Create Super Admin
  const adminPassword = await bcrypt.hash("@nadr1106", 10);
  await prisma.superAdmin.upsert({
    where: { email: "admin@nara.dev" },
    update: {},
    create: {
      email: "admin@nara.dev",
      password: adminPassword,
      name: "시스템 관리자",
      role: "SUPER_ADMIN",
    },
  });
  console.log("✅ Super Admin created (admin@nara.dev / @nadr1106)");

  // 11. Create Subscription Plans
  const plans = [
    {
      name: "스타터",
      tier: "STARTER",
      monthlyPrice: 300000,
      monthlyCredits: 500,
      maxStudents: 50,
      maxStaff: 3,
      rolloverPolicy: "RESET",
      rolloverMaxRate: 0,
      sortOrder: 1,
      description: "소규모 학원을 위한 기본 플랜",
      features: JSON.stringify({
        questionGenSingle: true,
        questionGenVocab: true,
        passageAnalysis: true,
        autoGeneration: false,
        learningSystem: false,
        parentReports: false,
        advancedAnalytics: false,
        customPrompts: true,
        examBuilder: true,
        studentApp: true,
        parentApp: false,
        apiAccess: false,
        customBranding: false,
        maxExamsPerMonth: 20,
        maxAiChatMessagesPerStudent: 30,
      }),
    },
    {
      name: "스탠다드",
      tier: "STANDARD",
      monthlyPrice: 500000,
      monthlyCredits: 1200,
      maxStudents: 150,
      maxStaff: 8,
      rolloverPolicy: "PARTIAL_ROLLOVER",
      rolloverMaxRate: 0.2,
      sortOrder: 2,
      description: "중규모 학원을 위한 표준 플랜",
      features: JSON.stringify({
        questionGenSingle: true,
        questionGenVocab: true,
        passageAnalysis: true,
        autoGeneration: true,
        learningSystem: true,
        parentReports: false,
        advancedAnalytics: false,
        customPrompts: true,
        examBuilder: true,
        studentApp: true,
        parentApp: true,
        apiAccess: false,
        customBranding: false,
        maxExamsPerMonth: 50,
        maxAiChatMessagesPerStudent: 50,
      }),
    },
    {
      name: "프리미엄",
      tier: "PREMIUM",
      monthlyPrice: 1000000,
      monthlyCredits: 3000,
      maxStudents: 500,
      maxStaff: 20,
      rolloverPolicy: "ROLLOVER",
      rolloverMaxRate: 1.0,
      sortOrder: 3,
      description: "대규모 학원을 위한 프리미엄 플랜",
      features: JSON.stringify({
        questionGenSingle: true,
        questionGenVocab: true,
        passageAnalysis: true,
        autoGeneration: true,
        learningSystem: true,
        parentReports: true,
        advancedAnalytics: true,
        customPrompts: true,
        examBuilder: true,
        studentApp: true,
        parentApp: true,
        apiAccess: false,
        customBranding: true,
        maxExamsPerMonth: -1,
        maxAiChatMessagesPerStudent: 100,
      }),
    },
    {
      name: "엔터프라이즈",
      tier: "ENTERPRISE",
      monthlyPrice: 0,
      monthlyCredits: 10000,
      maxStudents: 99999,
      maxStaff: 99999,
      rolloverPolicy: "ROLLOVER",
      rolloverMaxRate: 1.0,
      sortOrder: 4,
      description: "맞춤 솔루션이 필요한 대형 학원/프랜차이즈",
      features: JSON.stringify({
        questionGenSingle: true,
        questionGenVocab: true,
        passageAnalysis: true,
        autoGeneration: true,
        learningSystem: true,
        parentReports: true,
        advancedAnalytics: true,
        customPrompts: true,
        examBuilder: true,
        studentApp: true,
        parentApp: true,
        apiAccess: true,
        customBranding: true,
        maxExamsPerMonth: -1,
        maxAiChatMessagesPerStudent: -1,
      }),
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {},
      create: plan,
    });
  }
  console.log(`✅ ${plans.length} subscription plans created`);

  // 12. Create Subscription and Credit Balance for existing academy
  const standardPlan = await prisma.subscriptionPlan.findUnique({
    where: { tier: "STANDARD" },
  });

  if (standardPlan) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.academySubscription.upsert({
      where: { id: "seed-subscription" },
      update: {},
      create: {
        id: "seed-subscription",
        academyId: academy.id,
        planId: standardPlan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await prisma.creditBalance.upsert({
      where: { academyId: academy.id },
      update: {},
      create: {
        academyId: academy.id,
        balance: 1200,
        monthlyAllocation: 1200,
        totalAllocated: 1200,
      },
    });

    await prisma.creditTransaction.create({
      data: {
        academyId: academy.id,
        type: "ALLOCATION",
        amount: 1200,
        balanceAfter: 1200,
        description: "Initial STANDARD plan allocation",
      },
    });
    console.log("✅ Subscription (STANDARD) and credit balance created for academy");
  }

  console.log("\n🎉 NARA ERP seeding completed!");
  console.log("\n📋 Login credentials:");
  console.log("  원장: director@darun.academy / admin1234");
  console.log("  강사: teacher@darun.academy / teacher1234");
  console.log("  학생: NAR001 ~ NAR005");
  console.log("  학부모: 01012345678");
  console.log("  관리자: admin@nara.dev / superadmin1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
