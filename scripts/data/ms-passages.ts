export const MS_PASSAGE_DATA: {
  grade: number;
  semester: "FIRST" | "SECOND";
  passages: {
    title: string;
    content: string;
    source: string;
    unit: string;
    order: number;
    notes: {
      content: string;
      noteType: "EMPHASIS" | "GRAMMAR" | "VOCAB" | "TIP";
      order: number;
    }[];
  }[];
}[] = [
  // ============================================================
  // GRADE 1, FIRST SEMESTER (중1 1학기)
  // ============================================================
  {
    grade: 1,
    semester: "FIRST",
    passages: [
      {
        title: "My New School Life",
        content: `Today is my first day at Hanbit Middle School. I feel both excited and nervous at the same time. The school building is much bigger than my old elementary school. There are so many classrooms, a big library, and even a science lab. I hope I can find my way around without getting lost.

In the morning, I met my homeroom teacher, Ms. Kim. She smiled warmly and welcomed all of us to the class. She told us to introduce ourselves one by one. When it was my turn, my heart was beating fast. I stood up and said, "Hello, everyone. My name is Jimin. I like reading books and playing soccer. I want to make many friends here." Some students clapped, and I felt a little better.

During lunch, a boy named Seonho sat next to me. He asked, "Do you want to eat together?" I was very happy because I did not know anyone yet. We talked about our favorite subjects. He likes math, but I prefer English. He also told me about the school clubs. There is a cooking club, a music club, and a science club. I think I will join the music club because I play the guitar.

After school, I walked home with a big smile on my face. My first day was not as scary as I thought. I already have a new friend, and I am looking forward to tomorrow. Middle school life is going to be a wonderful adventure.`,
        source: "중1 영어 교과서",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 주제는 '새로운 중학교 생활에 대한 기대와 설렘'입니다. 시험에서 주제(main idea) 묻는 문제가 자주 출제되므로, 글쓴이가 처음에는 긴장했지만 점차 적응하며 긍정적인 마음을 갖게 되었다는 흐름을 파악하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'I feel both excited and nervous at the same time.'에서 'both A and B' 구문은 'A와 B 둘 다'라는 뜻입니다. 형용사, 명사, 동사 등 다양한 품사와 함께 쓸 수 있습니다. 예: Both my brother and I like soccer.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'introduce'는 '소개하다'라는 뜻입니다. 'introduce oneself'는 '자기소개를 하다'라는 의미의 숙어 표현입니다. 명사형은 'introduction'(소개)입니다. 예: Let me give you a brief introduction.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "A Special Family",
        content: `Every family is special in its own way. My family has four members: my father, my mother, my younger sister Yuna, and me. We are not a perfect family, but we love each other very much. I think that is what makes a family truly special.

My father is a bus driver. He wakes up very early every morning to go to work. Even though he is tired when he comes home, he always asks us about our day. On weekends, he likes to cook breakfast for the whole family. His pancakes are the best in the world. My mother works at a flower shop. She knows the names of hundreds of flowers. Sometimes she brings beautiful flowers home, and our living room always smells wonderful. She also helps me with my homework every evening.

My younger sister Yuna is eight years old. She is in the second grade. She is very funny and always makes us laugh. She likes to draw pictures of our family. In her drawings, we are always smiling and holding hands. I sometimes fight with her over small things like the TV remote, but I really love her. When she is sad, I try to cheer her up by telling her jokes.

Every Friday night, we have a special tradition. We order chicken and watch a movie together. We take turns choosing the movie. It is my favorite time of the week. I am grateful for my family because they always support me and make me feel safe. No matter what happens, I know my family will always be there for me.`,
        source: "중1 영어 교과서",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '가족의 소중함과 각 가족 구성원의 역할'을 다루고 있습니다. 시험에서는 각 가족 구성원의 직업이나 특징을 묻는 세부 정보 파악 문제가 출제될 수 있으니, 아버지(버스 기사), 어머니(꽃집), 여동생(2학년, 그림 그리기)의 정보를 정리해 두세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Even though he is tired, he always asks us about our day.'에서 'even though'는 '비록 ~이지만'이라는 뜻의 양보 접속사입니다. 'although'와 같은 의미이며, 뒤에 주어+동사가 옵니다. 'even if'(설령 ~하더라도)와 혼동하지 않도록 주의하세요.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'grateful'은 '감사하는, 고마워하는'이라는 뜻의 형용사입니다. 'be grateful for ~'는 '~에 감사하다'라는 표현입니다. 비슷한 표현으로 'thankful'이 있습니다. 예: I am grateful for your help.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Hobbies Around the World",
        content: `People around the world enjoy many different hobbies. Some hobbies are common everywhere, like listening to music or playing sports. But some hobbies are unique to certain countries or cultures. Let us take a trip around the world and learn about interesting hobbies.

In Japan, many people enjoy origami, the art of folding paper. With just one square piece of paper, they can make birds, flowers, and even dragons. Origami has a long history in Japan. It started hundreds of years ago, and today it is still very popular. Children learn origami at school, and adults enjoy it as a relaxing hobby. Some origami artists make incredibly detailed works that look like real animals.

In Brazil, capoeira is a popular activity. Capoeira is a mix of martial arts, dance, and music. People move their bodies in powerful and graceful ways while music plays in the background. It was created by African people in Brazil a long time ago. Today, people of all ages practice capoeira in parks and gyms. It is a fun way to exercise and learn about Brazilian culture at the same time.

In South Korea, hiking is one of the most popular hobbies. On weekends, mountains like Bukhansan and Hallasan are full of hikers. Korean people enjoy climbing mountains with friends and family. They often bring kimbap and other snacks to eat at the top. Hiking is not only good exercise but also a great way to enjoy nature and spend time with loved ones. What hobbies are popular in your country?`,
        source: "중1 영어 교과서",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 세계 여러 나라의 독특한 취미를 소개하고 있습니다. 시험에서는 각 나라(일본-종이접기, 브라질-카포에이라, 한국-등산)와 취미를 연결 짓는 문제가 출제될 수 있습니다. 각 취미의 특징과 역사를 정리해 두세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Capoeira is a mix of martial arts, dance, and music.'에서 'a mix of A, B, and C'는 'A, B, C의 혼합'이라는 뜻입니다. 'mix'는 명사로 '혼합, 조합'이라는 의미이며, 동사로는 '섞다'라는 뜻입니다. 전치사 'of'와 함께 자주 사용됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'unique'는 '독특한, 유일한'이라는 뜻입니다. 'be unique to ~'는 '~에 고유한, ~만의 독특한'이라는 표현입니다. 예: This tradition is unique to Korea. 발음 주의: [유니크]로 읽습니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 1, SECOND SEMESTER (중1 2학기)
  // ============================================================
  {
    grade: 1,
    semester: "SECOND",
    passages: [
      {
        title: "My Daily Routine",
        content: `Having a good daily routine is important for everyone, especially for students. A daily routine helps us manage our time well and get things done. Here is what a typical school day looks like for me.

I wake up at 6:30 every morning. First, I wash my face and brush my teeth. Then I eat breakfast with my family. My mom usually makes rice, soup, and some side dishes. After breakfast, I pack my school bag and check if I have everything I need. I leave home at 7:40 and walk to school. It takes about fifteen minutes. I like walking because I can enjoy the fresh morning air and think about the day ahead.

School starts at 8:30 and ends at 3:30. I have seven classes a day, and my favorite class is English. During break time, I usually talk with my friends or read a book. After school, I go to the library to study for about an hour. I try to finish my homework at the library so I can have free time at home. Then I take the bus home and arrive around 5 o'clock.

In the evening, I have dinner with my family and share stories about our day. After dinner, I review what I learned at school and prepare for the next day. I also spend some time doing things I enjoy, like playing the guitar or watching short videos. I go to bed at 10:30. Getting enough sleep is very important because it helps me concentrate in class the next day. A good routine makes my life organized and less stressful.`,
        source: "중1 영어 교과서",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 핵심은 '규칙적인 일과의 중요성과 시간 관리'입니다. 시험에서는 시간 순서에 따른 배열 문제나 특정 시간에 무엇을 하는지 묻는 문제가 출제됩니다. 시간대별 활동(6:30 기상, 7:40 출발, 8:30 수업 시작 등)을 정리하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'I try to finish my homework at the library so I can have free time at home.'에서 'so (that) + 주어 + can'은 '~할 수 있도록, ~하기 위해서'라는 목적을 나타내는 구문입니다. 'so that' 다음에는 주어+동사가 옵니다. 예: I study hard so that I can pass the exam.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'concentrate'는 '집중하다'라는 뜻입니다. 'concentrate on ~'은 '~에 집중하다'라는 표현입니다. 명사형은 'concentration'(집중, 집중력)입니다. 예: Please concentrate on the lesson. 비슷한 표현: focus on.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Food and Health",
        content: `What we eat has a big effect on our health. Eating the right foods can give us energy, help us grow, and keep us from getting sick. But many students today eat too much junk food and do not get the nutrients they need. Let us learn about how to eat healthy.

Our body needs different kinds of nutrients to stay healthy. Proteins help build strong muscles. You can find proteins in foods like eggs, chicken, fish, and beans. Carbohydrates give us energy for daily activities. Rice, bread, and noodles are good sources of carbohydrates. Vitamins and minerals keep our body working properly. Fruits and vegetables are full of vitamins. For example, oranges have lots of vitamin C, which helps prevent colds. We also need to drink plenty of water every day. Water helps our body in many ways, like keeping our skin healthy and helping us digest food.

Many students skip breakfast because they wake up late or do not feel hungry in the morning. However, breakfast is the most important meal of the day. Without breakfast, it is hard to focus in class, and you may feel tired and hungry before lunch. A simple breakfast like a banana and a glass of milk is much better than eating nothing at all.

It is also important to limit snacks like chips, candy, and soda. These foods have a lot of sugar and salt but very few nutrients. Instead, try healthier snacks like nuts, yogurt, or fruit. Remember, healthy eating is not about eating less. It is about eating the right foods in the right amounts. Start making small changes today, and your body will thank you in the future.`,
        source: "중1 영어 교과서",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '올바른 식습관과 영양소의 중요성'을 다루고 있습니다. 시험에서는 각 영양소(단백질, 탄수화물, 비타민)와 해당 식품을 연결하는 문제, 그리고 아침 식사의 중요성에 대한 이유를 묻는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Without breakfast, it is hard to focus in class.'에서 'It is + 형용사 + to부정사' 구문은 가주어-진주어 구문입니다. 'it'은 가주어이고 'to focus in class'가 진주어입니다. 해석: '수업에 집중하기가 어렵다.' 예: It is important to eat breakfast.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'nutrient'는 '영양소'라는 뜻입니다. 형용사형은 'nutritious'(영양가 있는)입니다. 비슷한 단어로 'nutrition'(영양, 영양 섭취)이 있습니다. 예: Vegetables are full of important nutrients. / This meal is very nutritious.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Adventures in Travel",
        content: `Traveling is one of the best ways to learn about the world. When we visit new places, we can experience different foods, languages, and customs. Last summer, my family went on a trip to Jeju Island, and it was an amazing experience that I will never forget.

We took an airplane from Seoul to Jeju. It was my first time flying, and I was very excited. The flight was only about an hour, but I enjoyed every minute of it. Looking down from the sky, I could see the blue ocean and small islands below. When we arrived, the weather was warm and sunny. We rented a car and drove to our hotel near the beach.

On the first day, we visited Hallasan Mountain. It is the tallest mountain in South Korea. We did not climb all the way to the top because it was too far for my little sister. Instead, we hiked a shorter trail and enjoyed the beautiful scenery. We saw many interesting plants and colorful flowers along the way. On the second day, we went to the beach. I swam in the ocean for the first time. The water was clear and refreshing. My father taught me how to float on my back, and my sister built a huge sandcastle.

On the last day, we visited a traditional market and tried Jeju black pork and fresh oranges. Everything was delicious. We also bought some souvenirs for our grandparents. On the way back home, I felt a little sad that the trip was over, but I was grateful for the wonderful memories. Traveling taught me that there is so much to see and do in the world. I cannot wait for my next adventure.`,
        source: "중1 영어 교과서",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '제주도 여행 경험'을 시간 순서대로 서술하고 있습니다. 시험에서는 여행 일정의 순서를 묻는 문제(첫째 날-한라산, 둘째 날-해변, 마지막 날-전통시장)나 여행에서 느낀 점을 묻는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'It was an amazing experience that I will never forget.'에서 'that'은 목적격 관계대명사입니다. 선행사 'experience'를 수식하며 'I will never forget'의 목적어 역할을 합니다. 목적격 관계대명사는 생략 가능합니다. 예: The book (that) I read yesterday was interesting.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'scenery'는 '풍경, 경치'라는 뜻의 불가산 명사입니다. 비슷한 단어로 'view'(전망), 'landscape'(풍경)가 있습니다. 주의: sceneries (X) → scenery는 복수형을 쓰지 않습니다. 예: The scenery of Jeju is beautiful.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 2, FIRST SEMESTER (중2 1학기)
  // ============================================================
  {
    grade: 2,
    semester: "FIRST",
    passages: [
      {
        title: "The Power of Small Habits",
        content: `Have you ever wondered why some people seem to achieve their goals easily while others struggle? The secret often lies not in talent or luck, but in their daily habits. Small habits, repeated consistently over time, can lead to remarkable results. Understanding the power of habits can change your life in a very positive way.

Consider this simple example. If you read just ten pages of a book every day, you will finish about eighteen books in a year. That does not sound like much each day, but the total result is impressive. The same principle applies to exercise, studying, and even saving money. A student who reviews vocabulary for fifteen minutes daily will learn far more words by the end of the year than someone who studies for hours right before a test. This is because our brains remember information better when we study regularly in small amounts.

Building good habits is not always easy, though. Scientists say it takes about sixty-six days on average to form a new habit. The key is to start very small and stay consistent. For example, if you want to start exercising, begin with just five minutes of stretching each morning. Once that becomes automatic, gradually increase the time. Another helpful strategy is to connect a new habit to something you already do. For instance, you could practice English right after brushing your teeth every night.

Breaking bad habits is equally important. If you spend too much time on your phone, try leaving it in another room while you study. Replace the bad habit with a better one instead of simply trying to stop. Remember, you do not need to change everything at once. Small steps taken every day will eventually lead to big changes. As the saying goes, "A journey of a thousand miles begins with a single step."`,
        source: "중2 영어 교과서",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 주제는 '작은 습관의 반복이 가져오는 큰 변화'입니다. 시험에서는 글의 주제나 요지를 묻는 문제로 출제될 수 있습니다. 핵심 메시지는 '큰 변화는 매일의 작은 습관에서 시작된다'는 것이며, 구체적 예시(하루 10쪽 읽기, 15분 어휘 복습)를 근거로 활용합니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'A student who reviews vocabulary daily will learn far more words.'에서 'far + 비교급'은 비교급을 강조하는 표현입니다. 'far more'는 '훨씬 더 많은'이라는 뜻입니다. 비교급 강조 부사: much, even, still, a lot, far. 예: This book is much more interesting than that one.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'consistent'는 '꾸준한, 일관된'이라는 뜻입니다. 부사형 'consistently'(꾸준히), 명사형 'consistency'(꾸준함, 일관성)도 함께 외우세요. 반의어는 'inconsistent'(일관성 없는)입니다. 예: The key to success is being consistent.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Understanding Different Cultures",
        content: `We live in a world with thousands of different cultures, each with its own traditions, beliefs, and ways of life. Understanding and respecting cultural differences is becoming increasingly important as the world becomes more connected. When we learn about other cultures, we not only gain knowledge but also develop empathy and open-mindedness.

One interesting area of cultural difference is the way people greet each other. In Korea, people bow to show respect, especially to older people. In many Western countries, people shake hands or hug when they meet. In Thailand, people put their hands together in front of their chest and bow slightly. This greeting is called the "wai." In some Middle Eastern countries, it is common to greet someone by touching your heart with your right hand. Each greeting style carries deep cultural meaning and shows what that society values.

Food culture also varies greatly around the world. In India, many people eat with their right hand instead of using utensils because they believe that touching food creates a personal connection with the meal. In Japan, slurping noodles is not considered rude. In fact, it is a way to show that you are enjoying the food. Meanwhile, in France, meals are an important social event that can last for several hours. Understanding these differences helps us avoid misunderstandings when we travel or meet people from different backgrounds.

Learning about other cultures does not mean we have to give up our own. Instead, it helps us appreciate both the similarities and differences between people. When we approach other cultures with curiosity rather than judgment, we become better communicators and more thoughtful global citizens. The next time you meet someone from a different culture, ask them about their traditions. You might be surprised by how much you can learn.`,
        source: "중2 영어 교과서",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '문화적 다양성의 이해와 존중'을 주제로 하며, 인사 방식과 음식 문화를 예로 들고 있습니다. 시험에서는 각 나라의 문화적 특징을 연결하는 문제(한국-절, 태국-와이, 인도-오른손 식사, 일본-면 소리)가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'When we approach other cultures with curiosity rather than judgment'에서 'rather than'은 '~보다는, ~대신에'라는 뜻입니다. 'A rather than B'는 'B가 아니라 A'로 해석합니다. 예: I chose tea rather than coffee. 주의: 'rather than' 뒤에는 앞과 같은 형태(명사, 동사원형 등)가 옵니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'empathy'는 '공감, 감정이입'이라는 뜻입니다. 'sympathy'(동정)와 구별해야 합니다. empathy는 상대방의 입장에서 느끼는 것이고, sympathy는 안타깝게 여기는 것입니다. 예: Empathy means putting yourself in someone else's shoes.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Digital World",
        content: `Technology has changed the way we live, learn, and communicate. Just a few decades ago, people had to go to a library to find information or wait days to receive a letter. Today, we can search for anything on the internet in seconds and send messages to people on the other side of the world instantly. The digital world has brought incredible convenience to our daily lives.

For students, technology offers many useful tools for learning. Educational apps and websites make it possible to study subjects like math, science, and English anytime and anywhere. Online videos can explain difficult concepts in simple and visual ways. Many students also use digital tools to collaborate on group projects. They can share documents, edit them together in real time, and hold video meetings without being in the same room. These tools help students develop skills that will be valuable in the future workplace.

However, the digital world also comes with some challenges. One of the biggest problems is spending too much time on screens. Research shows that excessive screen time can cause eye strain, poor sleep, and difficulty concentrating. Social media can also create stress when people compare themselves to others online. Cyberbullying is another serious issue that affects many young people. It is important to be a responsible digital citizen who treats others with respect, even online.

Finding the right balance is the key to living well in the digital age. Use technology as a tool to improve your life, but do not let it control you. Set time limits for using your phone and take regular breaks from screens. Make time for face-to-face conversations, outdoor activities, and hobbies that do not involve technology. The digital world is a powerful resource when used wisely, but real life happens beyond the screen.`,
        source: "중2 영어 교과서",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '디지털 기술의 장점과 단점, 그리고 균형 잡힌 사용'을 주제로 합니다. 시험에서는 기술의 장점(편리한 학습, 협업 도구)과 단점(눈 피로, 수면 장애, 사이버 폭력)을 구분하는 문제가 자주 출제되므로 양면을 모두 정리해 두세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Use technology as a tool to improve your life, but do not let it control you.'에서 'let + 목적어 + 동사원형'은 사역동사 구문입니다. '~가 …하도록 허락하다/내버려두다'라는 뜻입니다. 사역동사: let, make, have. 예: My parents let me stay up late on weekends.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'collaborate'는 '협력하다, 공동 작업하다'라는 뜻입니다. 'collaborate on ~'은 '~에 대해 협력하다', 'collaborate with ~'은 '~와 협력하다'라는 표현입니다. 명사형은 'collaboration'(협력, 합작)입니다. 예: We collaborated on the science project.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 2, SECOND SEMESTER (중2 2학기)
  // ============================================================
  {
    grade: 2,
    semester: "SECOND",
    passages: [
      {
        title: "Green Living",
        content: `Our planet is facing serious environmental problems. Climate change, pollution, and the loss of natural habitats are threatening the health of the Earth. While these problems may seem too big for one person to solve, the truth is that small actions by millions of people can make a huge difference. Green living means making choices every day that are better for the environment.

One of the easiest ways to live green is to reduce waste. Every year, billions of plastic bottles and bags end up in oceans and landfills, harming wildlife and polluting the water. We can help by carrying reusable water bottles and shopping bags. Another effective way to reduce waste is to follow the three Rs: Reduce, Reuse, and Recycle. Before buying something new, ask yourself if you really need it. When something breaks, try to fix it instead of throwing it away. And when you do throw things away, make sure to sort your recyclables properly.

Saving energy is another important part of green living. Turning off lights when you leave a room, using energy-efficient appliances, and taking shorter showers can all help reduce energy consumption. Transportation is also a major source of pollution. Walking, cycling, or using public transportation instead of driving a car can significantly lower carbon emissions. Even small changes like eating less meat can help because the meat industry produces a large amount of greenhouse gases.

Many young people around the world are already taking action to protect the environment. Some organize beach cleanups, while others plant trees in their communities. Students in Sweden started a movement to demand stronger climate policies from their governments. You do not need to be an expert or a leader to make a difference. Start with your daily habits, inspire the people around you, and remember that every small action counts. Together, we can build a greener and healthier world for future generations.`,
        source: "중2 영어 교과서",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '환경 보호를 위한 일상 속 실천 방법'을 주제로 합니다. 핵심 메시지는 '개인의 작은 실천이 모여 큰 변화를 만든다'입니다. 시험에서는 3R(Reduce, Reuse, Recycle)의 구체적 실천 방법이나 에너지 절약 방법을 묻는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Before buying something new, ask yourself if you really need it.'에서 'before + 동명사(-ing)'는 '~하기 전에'라는 뜻입니다. 전치사(before, after, without, by 등) 뒤에는 동명사가 옵니다. 예: After finishing homework, I watched TV. / Without studying, you cannot pass the test.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'significantly'는 '상당히, 크게'라는 뜻의 부사입니다. 형용사형은 'significant'(중요한, 상당한), 명사형은 'significance'(중요성)입니다. 예: The number of tourists increased significantly. / This is a significant change.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Communication Matters",
        content: `Good communication is one of the most important skills in life. Whether we are talking to friends, presenting in class, or writing a message, how we communicate affects our relationships and our success. However, many people do not realize that communication is about much more than just the words we say.

Research shows that only about seven percent of communication comes from the actual words we use. The rest comes from our tone of voice and body language. For example, crossing your arms during a conversation may make you look defensive or uninterested, even if your words are friendly. Making eye contact shows that you are paying attention and that you care about what the other person is saying. A warm smile can make someone feel welcome and comfortable. Being aware of these nonverbal signals can help you become a much more effective communicator.

Listening is perhaps the most underrated part of communication. Many people listen only to respond, not to understand. Active listening means giving your full attention to the speaker, asking follow-up questions, and showing that you understand their feelings. When someone tells you about a problem, sometimes they do not want advice. They just want to feel heard. Phrases like "That sounds really difficult" or "I understand how you feel" can be more helpful than trying to fix the problem right away.

In the digital age, written communication has become equally important. When we send text messages or write comments online, the other person cannot see our facial expressions or hear our tone. This often leads to misunderstandings. To communicate clearly in writing, be specific, use polite language, and read your message before sending it. Adding a simple emoji or exclamation mark can help convey friendliness. Whether spoken or written, thoughtful communication builds trust and strengthens our connections with others.`,
        source: "중2 영어 교과서",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '효과적인 의사소통의 요소'를 다루며, 비언어적 의사소통(7% 법칙)과 적극적 경청(active listening)의 중요성을 강조합니다. 시험에서는 의사소통에서 단어가 차지하는 비율(7%), 비언어적 신호의 예시, 적극적 경청의 방법을 묻는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Many people listen only to respond, not to understand.'에서 'to부정사의 부사적 용법(목적)'이 사용되었습니다. '응답하기 위해 듣지, 이해하기 위해 듣지 않는다'라는 뜻입니다. 'not to + 동사원형'은 to부정사의 부정형입니다. 예: I decided not to go to the party.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'underrated'는 '과소평가된'이라는 뜻입니다. 'rate'(평가하다) + 'under-'(아래로) + '-ed'(과거분사)로 이루어져 있습니다. 반의어는 'overrated'(과대평가된)입니다. 예: Sleep is the most underrated health habit. 비슷한 구조: underestimate(과소평가하다).",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Dreams and Goals",
        content: `Everyone has dreams about what they want to be or what they want to achieve in the future. However, there is a big difference between simply having a dream and actually working toward it. The people who succeed are those who turn their dreams into clear goals and take concrete steps to reach them.

One effective method for setting goals is called SMART goals. SMART stands for Specific, Measurable, Achievable, Relevant, and Time-bound. Instead of saying "I want to be good at English," a SMART goal would be "I will learn twenty new English words every week for the next three months." This goal is specific because it states exactly what to do. It is measurable because you can count the words. It is achievable because twenty words a week is realistic. It is relevant because vocabulary is important for English ability. And it is time-bound because it has a clear deadline.

Of course, the path to achieving goals is rarely smooth. Obstacles and failures are a natural part of the journey. Thomas Edison failed thousands of times before he successfully invented the light bulb. When asked about his failures, he famously said, "I have not failed. I have just found ten thousand ways that do not work." This positive attitude toward failure is what separates successful people from others. Instead of giving up when things get hard, they learn from their mistakes and keep moving forward.

It also helps to share your goals with others. Studies show that people who tell their friends or family about their goals are more likely to achieve them. Having someone to encourage you and hold you accountable makes a big difference. Write your goals down, review them regularly, and celebrate small victories along the way. Your dream might feel far away right now, but with clear goals and persistent effort, you can make it a reality.`,
        source: "중2 영어 교과서",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 'SMART 목표 설정법과 실패에 대한 긍정적 태도'를 주제로 합니다. 시험에서는 SMART의 각 요소(Specific, Measurable, Achievable, Relevant, Time-bound)의 의미를 묻거나, 에디슨의 명언이 전달하는 메시지를 파악하는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'The people who succeed are those who turn their dreams into clear goals.'에서 관계대명사 'who'가 두 번 사용되었습니다. 첫 번째 'who'는 'The people'을, 두 번째 'who'는 'those'를 수식합니다. 'those who ~'는 '~하는 사람들'이라는 뜻의 중요한 표현입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'persistent'는 '끈기 있는, 지속적인'이라는 뜻입니다. 명사형은 'persistence'(끈기, 인내)입니다. 동사형 'persist'는 '지속하다, 고집하다'라는 뜻입니다. 'persist in ~ing'은 '~을 계속하다'라는 표현입니다. 예: Persistence is the key to success.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 3, FIRST SEMESTER (중3 1학기)
  // ============================================================
  {
    grade: 3,
    semester: "FIRST",
    passages: [
      {
        title: "Becoming a Global Citizen",
        content: `In today's interconnected world, the concept of citizenship extends far beyond national borders. A global citizen is someone who understands that they are part of a larger world community and takes responsibility for making it a better place. Becoming a global citizen does not require traveling abroad or speaking multiple languages. It begins with awareness, empathy, and a willingness to take action on issues that affect people everywhere.

Global issues such as poverty, climate change, and inequality do not respect national boundaries. A drought in one country can affect food prices around the world. A disease outbreak in one region can quickly spread to others. The clothes we wear and the electronics we use are often made by workers in developing countries under difficult conditions. Recognizing these connections is the first step toward thinking globally. When we understand that our daily choices have far-reaching consequences, we begin to see ourselves as part of a global community rather than just members of a single nation.

Education plays a crucial role in developing global citizenship. Learning about world history, geography, and current events helps us understand different perspectives. Studying foreign languages allows us to communicate with people from diverse backgrounds and access information beyond our own culture. Schools around the world are incorporating global citizenship education into their curricula, teaching students to think critically about issues like human rights, sustainable development, and cultural diversity.

Taking action as a global citizen can start small. Supporting fair trade products, reducing your carbon footprint, or volunteering for organizations that address global challenges are all meaningful steps. With the power of the internet, young people today can connect with others around the world, share ideas, and collaborate on solutions to common problems. The challenges facing humanity are immense, but so is the potential of a generation that thinks and acts globally. Every individual has the power to contribute to a more just and peaceful world.`,
        source: "중3 영어 교과서",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '세계 시민 의식의 개념과 실천 방법'을 주제로 합니다. 핵심 메시지는 '세계 시민이 되기 위해 인식, 공감, 행동이 필요하다'는 것입니다. 시험에서는 세계 시민의 정의, 글로벌 이슈의 상호 연결성, 교육의 역할 등을 묻는 주제/요지 파악 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Recognizing these connections is the first step toward thinking globally.'에서 동명사(Recognizing)가 주어로 사용되었습니다. 동명사 주어는 단수 취급하여 단수 동사(is)를 씁니다. 'toward + 동명사'는 '~을 향한, ~하기 위한'이라는 뜻입니다. 예: Reading books is a great way to learn.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'consequence'는 '결과, 영향'이라는 뜻입니다. 보통 행동의 결과(특히 부정적인 결과)를 나타낼 때 사용합니다. 'far-reaching consequences'는 '광범위한 영향'이라는 뜻입니다. 형용사형 'consequent'(결과로 일어나는), 부사 'consequently'(결과적으로)도 중요합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Future of Work",
        content: `The world of work is changing faster than ever before. Advances in artificial intelligence, robotics, and automation are transforming industries and creating entirely new types of jobs. Some experts predict that sixty-five percent of children entering elementary school today will work in jobs that do not yet exist. Understanding these changes is essential for students preparing for their future careers.

Artificial intelligence is already being used in many fields. In medicine, AI can analyze X-rays and detect diseases earlier than human doctors in some cases. In agriculture, robots can plant seeds, monitor crops, and harvest produce more efficiently. Self-driving cars may soon replace many driving-related jobs. While these developments bring many benefits, they also raise concerns about job displacement. Routine tasks that follow predictable patterns, such as data entry, assembly line work, and basic customer service, are the most likely to be automated.

However, experts emphasize that AI will not replace all human jobs. Instead, it will change the nature of work. Jobs that require creativity, critical thinking, emotional intelligence, and complex problem-solving will remain in high demand. Doctors will still be needed to communicate with patients and make difficult ethical decisions. Teachers will still be essential for inspiring and guiding students. Artists, designers, and writers will continue to create works that reflect the human experience. The key is to develop skills that machines cannot easily replicate.

To prepare for the future job market, students should focus on developing both technical and soft skills. Learning to code, understanding data analysis, and being comfortable with new technologies are increasingly important. Equally valuable are skills like communication, teamwork, adaptability, and the ability to learn continuously. The most successful workers of the future will not be those who compete with machines, but those who know how to work alongside them. Embracing change and maintaining a growth mindset will be crucial in navigating the evolving world of work.`,
        source: "중3 영어 교과서",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 'AI와 자동화가 미래 직업에 미치는 영향'을 다룹니다. 시험에서는 자동화될 가능성이 높은 직업의 특징(반복적, 예측 가능한 패턴)과 여전히 인간이 필요한 직업의 특징(창의성, 비판적 사고, 감성 지능)을 비교하는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'The most successful workers will not be those who compete with machines, but those who know how to work alongside them.'에서 'not A but B' 구문은 'A가 아니라 B'라는 뜻입니다. 이 문장에서는 'those who ~'(~하는 사람들)가 반복 사용되어 대조를 강조합니다. 예: Success is not about luck but about effort.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'adaptability'는 '적응력'이라는 뜻입니다. 동사 'adapt'(적응하다), 형용사 'adaptable'(적응력 있는), 명사 'adaptation'(적응, 각색)과 함께 기억하세요. 'adapt to ~'는 '~에 적응하다'라는 표현입니다. 예: The ability to adapt to change is important.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Science in Everyday Life",
        content: `Science is not just a subject we study in school. It is present in almost everything we do, from the food we cook to the technology we use. Understanding basic scientific principles can help us make better decisions, solve problems more effectively, and appreciate the world around us in deeper ways. Science truly is everywhere in our everyday lives.

Consider the simple act of cooking. When you boil an egg, you are using the principle of heat transfer. The heat from the stove moves through the water and into the egg, causing the proteins inside to change their structure and become solid. When you add baking soda to dough, a chemical reaction produces carbon dioxide gas, which makes the bread rise. Even keeping food fresh in the refrigerator involves science. Low temperatures slow down the growth of bacteria, which is why food lasts longer when it is cold. Every kitchen is essentially a science laboratory.

Science also plays a vital role in modern medicine and public health. Vaccines, which have saved millions of lives throughout history, work by training our immune system to recognize and fight specific diseases. When you wash your hands with soap, the soap molecules break apart the outer layer of viruses and bacteria, effectively destroying them. Antibiotics, one of the greatest scientific discoveries of the twentieth century, have made it possible to treat infections that were once fatal. Understanding the science behind these practices helps us take better care of our health.

The technology we rely on every day is built on decades of scientific research. The GPS in your smartphone uses signals from satellites orbiting the Earth to calculate your exact position. The touchscreen on your phone responds to the electrical charge in your fingertips. Even the internet itself was originally developed by scientists who needed a way to share research data across long distances. By understanding the science behind everyday objects and practices, we gain a greater appreciation for the incredible achievements of human knowledge and innovation.`,
        source: "중3 영어 교과서",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '일상생활 속 과학 원리'를 요리, 의학, 기술 분야로 나누어 설명합니다. 시험에서는 각 과학 원리와 실생활 예시를 연결하는 문제(열전달-계란 삶기, 화학반응-베이킹소다, 면역체계-백신, 전하-터치스크린)가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Vaccines, which have saved millions of lives, work by training our immune system.'에서 'which'는 계속적 용법의 관계대명사입니다. 콤마(,) + which는 선행사에 대한 부가 설명을 합니다. 제한적 용법(콤마 없음)과 구별하세요. 계속적 용법의 which는 'and it/they'로 바꿀 수 있습니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'vital'은 '필수적인, 극히 중요한'이라는 뜻입니다. 'important'보다 강한 의미를 가집니다. 'play a vital role in ~'은 '~에서 필수적인 역할을 하다'라는 중요한 표현입니다. 어원: 라틴어 'vita'(생명)에서 유래. 관련 단어: vitality(활력).",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 3, SECOND SEMESTER (중3 2학기)
  // ============================================================
  {
    grade: 3,
    semester: "SECOND",
    passages: [
      {
        title: "Art and Creativity",
        content: `Art has been an essential part of human civilization since the earliest cave paintings were created over thirty thousand years ago. Throughout history, art has served as a means of expression, communication, and cultural preservation. In the modern world, creativity and artistic thinking are valued not only in traditional art forms but also in business, science, and technology. Understanding the importance of art can enrich our lives and broaden our perspectives.

Many people think of art as something only talented individuals can do, but creativity is a skill that everyone possesses and can develop. Psychologists have found that engaging in creative activities such as painting, writing, playing music, or even cooking activates different parts of the brain and strengthens our ability to think in innovative ways. Companies like Google and Apple actively encourage their employees to pursue creative projects because they know that creative thinking leads to better problem-solving and more innovative products. Art is not a luxury reserved for the few; it is a fundamental human capacity that drives progress.

Art also has a profound impact on our emotional well-being. Studies have shown that viewing artwork can reduce stress, lower anxiety, and even decrease physical pain. Music therapy is used in hospitals to help patients recover from surgery. Dance therapy helps people process trauma and express emotions they cannot put into words. In schools, students who participate in art programs tend to have higher self-esteem, better social skills, and stronger academic performance. The arts provide a safe space for self-expression and help us make sense of complex emotions.

Furthermore, art serves as a powerful bridge between cultures and generations. Through literature, film, music, and visual arts, we can understand the experiences and perspectives of people who are very different from us. A painting from sixteenth-century Italy can teach us about the values and struggles of that era. A novel written by an African author can open our eyes to realities we have never encountered. By engaging with diverse forms of art, we cultivate empathy, expand our worldview, and become more thoughtful members of a global community.`,
        source: "중3 영어 교과서",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '예술과 창의성의 다양한 가치'를 다루며, 예술이 비즈니스/과학에서의 역할, 정서적 건강에 미치는 영향, 문화적 다리 역할을 한다고 설명합니다. 시험에서는 글의 주제(예술의 다면적 가치)와 각 단락의 소주제를 파악하는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Art has been an essential part of human civilization since the earliest cave paintings were created.'에서 'have/has been + 과거분사(수동태)'의 현재완료 수동태와 'since + 과거시제'가 함께 사용되었습니다. 현재완료(have been)는 과거부터 현재까지의 계속을 나타내고, since절은 그 시작 시점을 알려줍니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'profound'는 '깊은, 심오한, 지대한'이라는 뜻입니다. 'deep'보다 더 격식적이고 학술적인 표현입니다. 'a profound impact on ~'은 '~에 대한 지대한 영향'이라는 뜻입니다. 부사형 'profoundly'(심오하게, 매우)도 함께 외우세요. 예: The book had a profound influence on me.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Social Media and Society",
        content: `Social media has fundamentally transformed the way human beings communicate, share information, and form relationships. Platforms like Instagram, YouTube, and various messaging apps connect billions of people worldwide, enabling instant communication across vast distances. While social media offers remarkable benefits, it also presents significant challenges that society must carefully navigate. Developing a thoughtful and balanced approach to social media use is becoming one of the defining issues of our generation.

On the positive side, social media has democratized information sharing in unprecedented ways. Ordinary people can now share their stories, raise awareness about important issues, and even influence public policy. During natural disasters, social media platforms serve as vital communication tools, helping rescue teams locate people and enabling communities to organize relief efforts. Small business owners can reach customers around the world without expensive advertising. Artists and musicians who might never have been discovered through traditional channels can build audiences of millions through platforms like YouTube and TikTok.

However, the negative effects of social media deserve serious attention. Research conducted by leading universities has shown that excessive social media use is linked to increased rates of depression, anxiety, and loneliness among teenagers. The constant comparison with carefully curated images of other people's lives can damage self-esteem and create unrealistic expectations. The spread of misinformation is another critical concern. False stories and manipulated images can travel across the internet faster than factual corrections, leading to confusion and even real-world harm. Algorithms designed to maximize engagement often prioritize sensational content over accurate information.

The responsibility for addressing these challenges belongs to everyone: individuals, technology companies, educators, and governments alike. As users, we can practice mindful consumption by limiting screen time, verifying information before sharing it, and being intentional about who we follow. Schools should teach digital literacy skills that help students evaluate online content critically. Technology companies must be held accountable for the algorithms that shape what billions of people see every day. Social media is neither entirely good nor entirely bad. It is a powerful tool, and like any tool, its impact depends on how we choose to use it.`,
        source: "중3 영어 교과서",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '소셜 미디어의 긍정적/부정적 영향과 책임 있는 사용'을 주제로 합니다. 시험에서는 소셜 미디어의 장점(정보 민주화, 재난 시 소통, 소규모 사업 지원)과 단점(우울증, 자존감 저하, 허위 정보)을 비교하는 문제가 빈출됩니다. 마지막 단락의 해결책(개인/학교/기업의 역할)도 중요합니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Social media is neither entirely good nor entirely bad.'에서 'neither A nor B'는 'A도 B도 아닌'이라는 뜻의 상관접속사입니다. 'both A and B'(A와 B 둘 다), 'either A or B'(A 또는 B 중 하나)와 함께 세트로 외우세요. 주어-동사 수일치: neither A nor B가 주어일 때, 동사는 B에 일치시킵니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'unprecedented'는 '전례 없는, 유례없는'이라는 뜻입니다. 'un-(부정) + precedent(전례) + -ed'로 구성됩니다. 'precedent'는 '선례, 전례'라는 뜻의 명사입니다. 예: The pandemic caused an unprecedented global crisis. 유의어: unparalleled, unheard-of.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Making a Difference",
        content: `Throughout history, individuals who dared to stand up for what they believed in have changed the course of human events. From Mahatma Gandhi's nonviolent resistance movement in India to Malala Yousafzai's advocacy for girls' education in Pakistan, ordinary people have demonstrated extraordinary courage in the face of injustice. The desire to make a difference in the world is one of the most powerful forces driving human progress, and it is a quality that exists within every person, regardless of age, background, or circumstance.

Social responsibility means recognizing that our actions have an impact on the people around us and on society as a whole. It involves being aware of problems in our communities and taking steps to address them. This does not necessarily mean leading a revolution or making headline news. Social responsibility can be practiced in everyday life through simple acts of kindness, fairness, and compassion. Volunteering at a local food bank, tutoring younger students, standing up against bullying, or simply treating everyone with dignity and respect are all meaningful expressions of social responsibility.

Young people today are proving that age is no barrier to making a difference. Greta Thunberg began her climate activism at the age of fifteen by sitting outside the Swedish parliament every Friday to demand action on climate change. Her solitary protest grew into a global movement involving millions of young people in over one hundred and fifty countries. In South Korea, numerous youth-led organizations are tackling issues ranging from environmental protection to mental health awareness. These young activists demonstrate that passion combined with determination can create ripple effects that extend far beyond what anyone initially imagined.

Making a difference also requires the courage to persist when progress seems slow or when others discourage you. Change rarely happens overnight, and those who work for a better world often face criticism, setbacks, and moments of doubt. What sustains them is a deep conviction that their efforts matter, even when the results are not immediately visible. As anthropologist Margaret Mead once said, "Never doubt that a small group of thoughtful, committed citizens can change the world. Indeed, it is the only thing that ever has." Your journey toward making a difference begins with a single decision: the decision to care.`,
        source: "중3 영어 교과서",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 '사회적 책임과 변화를 만드는 힘'을 주제로, 역사적 인물(간디, 말랄라)과 현대 청소년 활동가(그레타 툰베리)의 사례를 들고 있습니다. 시험에서는 각 인물의 업적, 사회적 책임의 정의, 마가렛 미드의 명언이 전달하는 메시지를 묻는 문제가 출제될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 포인트: 'Young people today are proving that age is no barrier to making a difference.'에서 'prove + that절'은 '~을 증명하다'라는 뜻입니다. 'barrier to + 동명사'에서 전치사 to 다음에 동명사(-ing)가 오는 점에 주의하세요. 'to부정사의 to'가 아닌 '전치사 to'입니다. 비슷한 표현: look forward to -ing, be used to -ing.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 포인트: 'conviction'은 '신념, 확신'이라는 뜻입니다. 동사 'convince'(확신시키다, 설득하다)에서 파생되었습니다. 'a deep conviction that ~'은 '~라는 깊은 신념'이라는 표현입니다. 다른 뜻으로 법률 용어에서 '유죄 판결'이라는 의미도 있으니 문맥에 따라 구별하세요. 예: She spoke with great conviction.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },
];
