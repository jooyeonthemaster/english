export const HS_PASSAGE_DATA: {
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
  // GRADE 1 (고1) - FIRST SEMESTER
  // ============================================================
  {
    grade: 1,
    semester: "FIRST",
    passages: [
      {
        title: "The Art of Effective Communication",
        content: `Communication is far more than the simple exchange of words between individuals. It is a complex, multifaceted process that involves not only the message being conveyed but also the manner in which it is delivered, the context in which it occurs, and the relationship between the parties involved. Effective communication, therefore, requires a deep understanding of both verbal and nonverbal cues, as well as the ability to adapt one's approach depending on the situation at hand.

One of the most critical yet frequently overlooked aspects of communication is active listening. While many people focus on what they want to say next, truly skilled communicators devote the majority of their attention to understanding what the other person is expressing. Active listening involves maintaining eye contact, nodding to show engagement, and paraphrasing the speaker's points to confirm understanding. Research conducted at major universities has consistently demonstrated that individuals who practice active listening are perceived as more trustworthy and are significantly more successful in both their personal and professional relationships.

Nonverbal communication, which accounts for a substantial portion of the meaning we convey, plays an equally vital role. Facial expressions, gestures, posture, and even the physical distance maintained between speakers all contribute to the overall message being communicated. For instance, crossing one's arms during a conversation may signal defensiveness or disagreement, regardless of the words being spoken. Being aware of these subtle signals can greatly enhance one's ability to interpret and respond to others accurately.

Furthermore, the rise of digital communication has introduced entirely new challenges and opportunities. Text messages, emails, and social media posts lack the tonal and visual cues present in face-to-face interactions, making misunderstandings far more likely. Emoticons and carefully chosen words have become essential tools for conveying tone in written communication. As our world becomes increasingly connected through technology, the ability to communicate effectively across multiple platforms has become not merely an advantage but an absolute necessity for success in the modern era.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 주제는 '효과적인 의사소통은 단순한 말의 교환이 아니라 경청, 비언어적 소통, 디지털 소통 능력을 모두 포함하는 복합적인 과정'이라는 것입니다. 시험에서 주제문(topic sentence) 찾기 문제로 자주 출제되며, 첫 번째 문단의 마지막 문장이 thesis statement 역할을 합니다. '주제 파악' 유형에서는 각 문단의 핵심 키워드(active listening, nonverbal communication, digital communication)를 연결하여 전체 주제를 도출하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'While many people focus on what they want to say next, truly skilled communicators devote the majority of their attention to understanding what the other person is expressing.' - 이 문장은 양보의 접속사 while로 시작하는 부사절과 주절이 결합된 복문 구조입니다. while절은 '~하는 반면에'라는 대조의 의미로 사용되었으며, 'what they want to say'와 'what the other person is expressing'은 각각 명사절로 동사의 목적어 역할을 합니다. 내신 서술형에서 while의 대조 용법과 what 관계대명사절을 묻는 문제가 자주 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'multifaceted' [멀티패시티드] - '다면적인, 여러 측면을 가진'이라는 뜻의 형용사입니다. multi-(여러) + facet(면, 측면) + -ed(형용사 접미사)로 구성된 합성어입니다. 수능 빈칸 추론이나 어휘 문제에서 자주 등장하며, 유의어로는 complex, diverse, varied 등이 있습니다. 예문: 'The issue is multifaceted and cannot be resolved with a simple solution.'",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Wonders of the Natural World",
        content: `The natural world, with its breathtaking diversity and extraordinary complexity, has captivated human beings since the dawn of civilization. From the microscopic organisms that thrive in the deepest ocean trenches to the vast ecosystems that stretch across entire continents, nature presents an endless array of phenomena that continue to astonish scientists and laypeople alike. Understanding these wonders is not merely an academic pursuit; it is essential for our survival as a species on this planet.

Consider the remarkable process of photosynthesis, through which plants convert sunlight, water, and carbon dioxide into glucose and oxygen. This seemingly simple chemical reaction is, in fact, one of the most sophisticated processes in all of biology. It sustains virtually all life on Earth by producing the oxygen we breathe and forming the foundation of nearly every food chain. Despite decades of intensive research, scientists have yet to fully replicate this process artificially, a testament to the extraordinary ingenuity embedded within natural systems.

Equally fascinating are the migratory patterns exhibited by countless animal species around the globe. Arctic terns, for example, travel approximately 70,000 kilometers annually, navigating from the Arctic to the Antarctic and back again with astonishing precision. Monarch butterflies undertake a multi-generational journey spanning thousands of kilometers, with no single individual completing the entire round trip. These remarkable feats of navigation, accomplished without any technological assistance, rely on a combination of magnetic field detection, celestial navigation, and inherited genetic memory that scientists are only beginning to comprehend.

Perhaps most humbling of all is the sheer interconnectedness of natural ecosystems. The removal of a single species from an ecosystem can trigger a cascade of consequences that ripple through the entire community of organisms. The reintroduction of wolves to Yellowstone National Park in the 1990s, for instance, not only regulated the elk population but ultimately altered the course of rivers by allowing vegetation to recover along their banks. Such examples powerfully illustrate that nature operates as an intricately woven tapestry, in which every thread, no matter how seemingly insignificant, plays a vital role in maintaining the integrity of the whole.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 자연계의 경이로움을 세 가지 예시(광합성, 동물의 이동 패턴, 생태계의 상호연결성)를 통해 설명하고 있습니다. 시험에서는 '글의 목적' 또는 '필자의 주장' 유형으로 출제될 수 있으며, 핵심 메시지는 '자연의 복잡성을 이해하는 것이 인류 생존에 필수적'이라는 점입니다. 마지막 문단의 Yellowstone 늑대 재도입 사례는 구체적 근거로 자주 출제되므로 인과관계를 정확히 파악해 두세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Monarch butterflies undertake a multi-generational journey spanning thousands of kilometers, with no single individual completing the entire round trip.' - 이 문장에서 'spanning thousands of kilometers'는 현재분사구문으로 앞의 명사 journey를 수식하는 형용사적 용법입니다. 'with no single individual completing...'은 with + 목적어 + 현재분사(~ing) 형태의 부대상황 구문으로, '어떤 개체도 전체 왕복을 완료하지 못한 채'라는 동시 상황을 나타냅니다. 수능 어법 문제에서 분사의 능동/수동 구별과 with 부대상황 구문이 핵심 출제 포인트입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'cascade' [캐스케이드] - '연쇄적으로 일어나는 일련의 사건, 폭포처럼 쏟아지다'라는 뜻입니다. 원래 '작은 폭포'를 의미하지만, 비유적으로 '연쇄 반응'을 뜻하는 데 자주 사용됩니다. 'a cascade of consequences'는 '연쇄적인 결과들'로 해석합니다. 수능 지문에서 과학적 현상이나 사회적 영향을 설명할 때 자주 등장하는 고급 어휘이며, 유의어로는 chain reaction, domino effect가 있습니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Culture and Identity",
        content: `Culture is often described as the invisible architecture that shapes our thoughts, behaviors, and sense of self. From the moment we are born, we are immersed in a particular cultural environment that profoundly influences how we perceive the world, interact with others, and define our own identities. While we may not always be consciously aware of its effects, culture operates as a powerful lens through which we interpret every experience and make meaning of our lives.

The relationship between culture and identity is particularly evident in the way language functions within a community. Language is not merely a tool for communication; it embodies the values, history, and worldview of an entire people. The Korean concept of "jeong," for example, describes a deep emotional bond that transcends simple friendship or love, yet no single English word can fully capture its meaning. Similarly, the Japanese notion of "wabi-sabi," which finds beauty in imperfection and impermanence, reflects a philosophical orientation that is deeply embedded in Japanese cultural consciousness. These linguistic phenomena demonstrate that language does not simply describe reality but actively participates in constructing it.

In an era of rapid globalization, many individuals find themselves navigating between multiple cultural identities simultaneously. Third-culture kids, who grow up in countries different from their parents' homeland, often develop a unique hybrid identity that draws upon diverse cultural influences. Rather than belonging exclusively to any single culture, these individuals create their own distinctive blend of values, customs, and perspectives. While this cultural fluidity can sometimes lead to feelings of displacement or confusion, it also fosters remarkable adaptability, empathy, and the capacity to bridge cultural divides that might otherwise seem insurmountable.

The preservation of cultural heritage in the face of globalization remains one of the defining challenges of our time. As Western cultural products proliferate through mass media and the internet, there is a growing concern that smaller, indigenous cultures may gradually lose their distinctive traditions and practices. However, many communities around the world have found innovative ways to maintain their cultural identity while simultaneously embracing modernity. By integrating traditional practices with contemporary technology and global communication networks, these communities demonstrate that cultural preservation and modernization need not be mutually exclusive endeavors.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 중심 주제는 '문화와 정체성의 관계'이며, 특히 언어가 문화적 정체성을 형성하는 역할, 글로벌 시대의 다중 문화 정체성, 문화유산 보존의 중요성을 다루고 있습니다. 수능 '주제 추론' 유형에서 핵심 키워드는 culture, identity, language, globalization입니다. 마지막 문단의 'cultural preservation and modernization need not be mutually exclusive'가 필자의 최종 입장이므로 빈칸 추론 문제에서 이 논지를 파악하는 것이 중요합니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Rather than belonging exclusively to any single culture, these individuals create their own distinctive blend of values, customs, and perspectives.' - 'Rather than + 동명사(~ing)'는 '~하기보다는'이라는 의미의 구문입니다. 여기서 rather than은 전치사 역할을 하므로 뒤에 동명사가 옵니다. 주의할 점은 rather than이 접속사로 쓰일 때는 원형부정사(동사원형)가 올 수도 있다는 것입니다. (예: He decided to walk rather than take the bus.) 내신 어법 문제에서 rather than 뒤의 동사 형태를 묻는 문제가 빈출됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'insurmountable' [인서마운터블] - '극복할 수 없는, 넘을 수 없는'이라는 뜻의 형용사입니다. in-(부정 접두사) + surmount(극복하다, 넘다) + -able(가능 접미사)로 구성됩니다. surmount는 sur-(위에) + mount(오르다)에서 유래했습니다. 반의어는 surmountable(극복 가능한)이며, 유의어로는 unconquerable, invincible, overwhelming 등이 있습니다. 수능에서 어휘의 접두사/접미사를 활용한 의미 추론 문제에 대비하세요.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 1 (고1) - SECOND SEMESTER
  // ============================================================
  {
    grade: 1,
    semester: "SECOND",
    passages: [
      {
        title: "Technology and Human Life",
        content: `The rapid advancement of technology over the past few decades has fundamentally transformed virtually every aspect of human existence. From the way we communicate and work to how we entertain ourselves and manage our health, technological innovation has become so deeply woven into the fabric of daily life that imagining a world without it seems almost inconceivable. Yet, as we embrace these remarkable tools and systems, it is imperative that we also critically examine the profound ways in which they are reshaping our behavior, relationships, and sense of what it means to be human.

One of the most significant transformations brought about by technology is the revolution in how we access and process information. The internet has placed an unprecedented volume of knowledge at our fingertips, enabling anyone with a connected device to explore topics that once required years of specialized study. However, this abundance of information has also given rise to new challenges, including the proliferation of misinformation, the shortening of attention spans, and a phenomenon researchers call "information overload," in which the sheer quantity of available data paradoxically impairs our ability to make informed decisions.

The impact of technology on interpersonal relationships presents an equally complex picture. Social media platforms have enabled people to maintain connections across vast geographical distances and to form communities around shared interests that might never have coalesced in the physical world. At the same time, numerous studies have linked excessive social media use to increased rates of anxiety, depression, and loneliness, particularly among young people. The curated, idealized versions of life presented on these platforms can create unrealistic expectations and foster a pervasive sense of inadequacy among those who compare their everyday realities to the highlight reels of others.

Looking ahead, emerging technologies such as artificial intelligence, biotechnology, and quantum computing promise to bring about changes even more dramatic than those we have witnessed thus far. The key challenge facing humanity is not whether to adopt these technologies but how to do so in a manner that amplifies our strengths while mitigating their potential risks. Developing thoughtful frameworks for the ethical deployment of new technologies will require collaboration among scientists, policymakers, ethicists, and ordinary citizens alike, ensuring that the benefits of innovation are distributed equitably across all segments of society.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 기술이 인간 생활에 미치는 영향을 긍정적 측면과 부정적 측면 모두 균형 있게 다루고 있습니다. 시험에서 '글의 요지' 유형으로 출제될 경우, 핵심은 '기술을 무조건 수용하는 것이 아니라 비판적으로 검토하며 윤리적으로 활용해야 한다'는 점입니다. 각 문단이 정보 접근, 대인 관계, 미래 기술이라는 세 가지 측면을 다루므로, '글의 흐름/순서' 문제에도 대비하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'The key challenge facing humanity is not whether to adopt these technologies but how to do so in a manner that amplifies our strengths while mitigating their potential risks.' - 이 문장은 'not A but B' (A가 아니라 B) 상관접속사 구문과 'whether to V' / 'how to V' 의문사 + to부정사 구문이 결합되어 있습니다. 'that amplifies our strengths'는 관계대명사절로 a manner를 수식하고, 'while mitigating'은 동시동작을 나타내는 분사구문입니다. 내신에서 not A but B 병렬 구조와 의문사 + to부정사의 명사적 용법을 묻는 문제가 자주 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'proliferation' [프롤리퍼레이션] - '급증, 확산, 급격한 증가'라는 뜻의 명사입니다. 동사형은 proliferate(급증하다, 확산하다)이며, prolific(다작의, 많이 생산하는)과 어근이 같습니다. 라틴어 proles(자손)에서 유래하여 '빠르게 번식하듯 늘어나는 것'을 의미합니다. 'the proliferation of misinformation'은 '허위 정보의 확산'으로 해석합니다. 수능 지문에서 사회 현상을 설명할 때 빈번히 등장하는 어휘입니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Global Challenges",
        content: `The twenty-first century has ushered in an era of unprecedented global challenges that demand collective action on a scale never before attempted in human history. Climate change, pandemics, resource depletion, and widening economic inequality are not problems confined to any single nation or region; they are systemic issues that transcend borders and require coordinated international responses. Understanding the interconnected nature of these challenges is the first step toward developing effective and lasting solutions.

Climate change stands as perhaps the most urgent and far-reaching of these global threats. The scientific consensus is overwhelming: human activities, particularly the burning of fossil fuels and widespread deforestation, have significantly increased the concentration of greenhouse gases in the atmosphere, leading to a measurable rise in global temperatures. The consequences of this warming are already being felt around the world in the form of more frequent and severe weather events, rising sea levels, and the disruption of ecosystems upon which millions of people depend for their livelihoods. Addressing this crisis requires not only reducing emissions dramatically but also investing in adaptation strategies that will help vulnerable communities withstand the changes already underway.

The challenge of economic inequality, both within and between nations, presents another formidable obstacle to global well-being. While technological advancement and globalization have lifted hundreds of millions of people out of extreme poverty over the past several decades, the benefits of economic growth have been distributed profoundly unevenly. The wealthiest one percent of the global population now controls a disproportionate share of the world's resources, while billions of people continue to lack access to basic necessities such as clean water, adequate nutrition, and quality education. Bridging this divide is not merely a matter of moral imperative; it is essential for maintaining social stability and fostering the kind of inclusive innovation needed to address other global challenges.

Despite the enormity of these problems, there is reason for cautious optimism. Advances in renewable energy technology have made solar and wind power increasingly competitive with fossil fuels, and international agreements such as the Paris Accord demonstrate a growing political will to confront environmental degradation. Grassroots movements led by young people around the world are demanding accountability from leaders and corporations, injecting a new sense of urgency into public discourse. The path forward will undoubtedly be difficult and fraught with setbacks, but the combination of human ingenuity, collective determination, and emerging technological capabilities provides a foundation upon which a more sustainable and equitable future can be constructed.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 기후 변화와 경제적 불평등이라는 두 가지 주요 글로벌 과제를 다루면서, 마지막 문단에서 낙관적인 전망을 제시합니다. 시험에서 '글의 제목' 또는 '요약문 완성' 유형으로 출제될 수 있습니다. 핵심 논리 구조는 '문제 제시 → 구체적 설명 → 해결 가능성'이며, 이러한 problem-solution 구조를 파악하는 것이 순서 배열이나 문장 삽입 문제 풀이에 매우 중요합니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'While technological advancement and globalization have lifted hundreds of millions of people out of extreme poverty over the past several decades, the benefits of economic growth have been distributed profoundly unevenly.' - while이 양보(~에도 불구하고)의 접속사로 사용된 복문입니다. 'have lifted'와 'have been distributed'는 모두 현재완료 시제로, 과거부터 현재까지의 결과를 나타냅니다. 특히 'have been distributed'는 현재완료 수동태(have been + p.p.)입니다. 수능 어법 문제에서 시제 일치와 능동/수동 판별이 핵심 출제 포인트이므로, 주어와 동사의 관계를 정확히 파악하는 연습이 필요합니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'fraught' [프롯] - '~으로 가득 찬, ~이 수반되는'이라는 뜻의 형용사로, 주로 부정적인 의미와 함께 사용됩니다. 'fraught with setbacks'는 '좌절로 가득 찬'으로 해석합니다. 비슷한 표현으로 'filled with', 'laden with', 'beset with' 등이 있습니다. 수능 고난도 어휘로 자주 출제되며, 'The negotiation process was fraught with difficulties.'와 같이 어려움, 위험, 긴장 등 부정적 상황을 묘사할 때 주로 쓰입니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Power of Storytelling",
        content: `Since the earliest days of human civilization, storytelling has served as one of our most fundamental and enduring means of making sense of the world around us. Long before the invention of writing, our ancestors gathered around fires to share tales of heroism, tragedy, and wonder, transmitting knowledge, values, and cultural identity from one generation to the next through the spoken word alone. This ancient tradition, far from being rendered obsolete by modern technology, continues to exert a profound influence on virtually every aspect of contemporary life.

At its core, storytelling is an act of empathy. When we engage with a well-crafted narrative, whether in the form of a novel, a film, or a personal anecdote, we are invited to step outside the boundaries of our own experience and inhabit the perspective of another person. Neuroscience research has revealed that reading fiction actually activates the same regions of the brain that are engaged during real social interactions, effectively providing a form of simulated experience that enhances our capacity for understanding and compassion. This ability to foster empathy across the divides of culture, class, and circumstance makes storytelling an invaluable tool for building social cohesion and mutual understanding.

The power of narrative extends far beyond the realm of entertainment and personal enrichment. In the fields of marketing, politics, and social activism, the ability to craft and communicate a compelling story has proven to be one of the most effective means of persuading and motivating audiences. Politicians who frame their messages within clear, emotionally resonant narratives tend to garner significantly more support than those who rely solely on statistics and policy details. Similarly, charitable organizations have discovered that individual stories of struggle and resilience generate far greater donations than abstract descriptions of systemic problems, a phenomenon psychologists refer to as the "identifiable victim effect."

However, the tremendous persuasive power of storytelling also carries inherent risks. Propaganda, misinformation campaigns, and manipulative advertising all exploit the human brain's natural affinity for narrative to promote agendas that may not serve the public interest. Recognizing this dual nature of storytelling is essential for developing the critical literacy skills needed in the modern information landscape. By learning to analyze not only the content but also the structure, intent, and emotional appeals embedded within the stories we encounter daily, we can harness the extraordinary power of narrative while guarding ourselves against its potential for manipulation.`,
        source: "고등학교 영어 (고1)",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 스토리텔링의 세 가지 측면을 다룹니다 - (1) 공감 능력 향상, (2) 설득과 동기 부여 도구로서의 역할, (3) 조작의 위험성. 수능 '빈칸 추론' 유형에서 마지막 문단의 'dual nature of storytelling'이 핵심 개념으로 출제될 가능성이 높습니다. 또한 'identifiable victim effect'는 구체적 사례를 통한 논증이므로, 실험/연구 결과를 근거로 제시하는 지문의 논리 구조를 파악하는 연습에 활용하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Long before the invention of writing, our ancestors gathered around fires to share tales of heroism, tragedy, and wonder, transmitting knowledge, values, and cultural identity from one generation to the next through the spoken word alone.' - 이 문장에서 'Long before the invention of writing'은 시간 부사구이고, 'to share'는 목적을 나타내는 부사적 용법의 to부정사입니다. 'transmitting knowledge...'는 결과/동시동작을 나타내는 분사구문으로, 주절의 동작(gathered)과 동시에 일어나는 부수적 행위를 설명합니다. 분사구문의 의미상 주어가 주절의 주어(our ancestors)와 일치하는지 확인하는 것이 어법 문제의 핵심입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'cohesion' [코히전] - '결속력, 응집력, 통합'이라는 뜻의 명사입니다. 형용사형은 cohesive(응집력 있는)이며, 동사형은 cohere(결합하다, 일관성이 있다)입니다. 'social cohesion'은 '사회적 결속력'으로, 사회 구성원들 사이의 유대감과 연대감을 의미합니다. 라틴어 cohaerere(함께 붙다)에서 유래했습니다. 수능에서 사회/문화 관련 지문에 빈출되며, 유의어로는 unity, solidarity, togetherness가 있고, 반의어로는 division, fragmentation이 있습니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 2 (고2) - FIRST SEMESTER
  // ============================================================
  {
    grade: 2,
    semester: "FIRST",
    passages: [
      {
        title: "The Philosophy of Happiness",
        content: `Throughout the annals of philosophical inquiry, few questions have commanded as much sustained attention as the deceptively simple query: what constitutes a good life? From the ancient Greeks to contemporary psychologists, thinkers across every era and culture have grappled with the nature of happiness, producing a rich tapestry of perspectives that continue to inform and challenge our understanding of human well-being. Examining these diverse viewpoints reveals not only the complexity of happiness itself but also the profound ways in which cultural, economic, and psychological factors shape our pursuit of it.

The ancient Greek philosopher Aristotle proposed that happiness, or "eudaimonia," is not a fleeting emotional state but rather a condition achieved through the sustained practice of virtue and the fulfillment of one's inherent potential. According to this framework, genuine happiness cannot be attained through the accumulation of wealth, pleasure, or social status alone; it requires the cultivation of moral character and the active engagement of one's highest capacities in service of a meaningful purpose. This conception of happiness as an activity rather than a passive state stands in stark contrast to the hedonistic view, which equates well-being with the maximization of pleasure and the minimization of pain.

Modern psychological research has added considerable nuance to this ancient debate. The field of positive psychology, pioneered by Martin Seligman and others in the late twentieth century, has identified several empirically supported components of lasting well-being. These include positive emotions, deep engagement in activities that produce a state of "flow," meaningful relationships with others, a sense of accomplishment, and a connection to something larger than oneself. Notably, studies consistently demonstrate that beyond a certain threshold of income sufficient to meet basic needs, additional wealth contributes remarkably little to subjective well-being, a finding that challenges the materialistic assumptions prevalent in many contemporary societies.

Perhaps the most provocative insight to emerge from this research is the concept of the "hedonic treadmill," which suggests that human beings possess a remarkable tendency to adapt to both positive and negative changes in their circumstances, returning relatively quickly to a baseline level of happiness. This phenomenon implies that the relentless pursuit of external achievements and acquisitions, which forms the foundation of much modern economic activity, may be fundamentally misguided as a strategy for enhancing long-term well-being. Instead, research increasingly points toward practices such as gratitude, mindfulness, and the cultivation of deep social connections as more reliable pathways to enduring satisfaction and fulfillment.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 행복의 본질을 철학적(아리스토텔레스의 eudaimonia) 및 심리학적(긍정 심리학, hedonic treadmill) 관점에서 탐구합니다. 수능 '빈칸 추론' 유형에서 핵심이 되는 개념은 'hedonic treadmill'로, '외적 성취의 추구가 장기적 행복 증진에 근본적으로 잘못된 전략일 수 있다'는 역설적 주장입니다. 또한 아리스토텔레스의 행복관(activity/virtue)과 쾌락주의(hedonistic view)의 대조 구조가 '요약문 완성' 문제로 출제될 수 있으므로 두 관점의 차이를 명확히 정리하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'According to this framework, genuine happiness cannot be attained through the accumulation of wealth, pleasure, or social status alone; it requires the cultivation of moral character and the active engagement of one's highest capacities in service of a meaningful purpose.' - 세미콜론(;)은 밀접하게 관련된 두 독립절을 연결하는 역할을 합니다. 첫째 절은 수동태(cannot be attained), 둘째 절은 능동태(requires)로, 행복의 부정적 조건(~로는 얻을 수 없다)과 긍정적 조건(~을 필요로 한다)을 대비시킵니다. 'in service of'는 '~에 봉사하여, ~을 위해'라는 전치사구입니다. 내신에서 세미콜론의 기능과 능동/수동 전환 문제가 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'eudaimonia' [유다이모니아] - 아리스토텔레스가 제시한 그리스어 개념으로, 단순한 '행복(happiness)'보다 더 깊은 의미를 가집니다. '인간으로서의 잠재력을 최대한 발휘하며 덕(virtue)을 실천하는 삶의 번영 상태'를 뜻합니다. eu-(좋은) + daimon(영혼, 정신)의 합성어입니다. 수능 지문에서 외국어 개념이 등장할 때는 반드시 문맥 속에서 그 의미가 설명되므로, 앞뒤 문장의 정의나 설명을 통해 의미를 추론하는 연습이 중요합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Psychology of Decision Making",
        content: `Every day, from the moment we wake until we fall asleep, we are confronted with an endless stream of decisions, ranging from the trivial, such as what to eat for breakfast, to the consequential, such as which career path to pursue. While we tend to think of ourselves as rational agents who carefully weigh evidence and probabilities before arriving at our conclusions, decades of research in cognitive psychology and behavioral economics have revealed that human decision-making is far less logical and far more susceptible to systematic biases than we would like to believe.

Among the most well-documented of these cognitive biases is the anchoring effect, which describes our tendency to rely disproportionately on the first piece of information we encounter when making subsequent judgments. In one classic experiment, researchers asked participants to estimate the percentage of African countries in the United Nations after first spinning a wheel that randomly landed on either the number 10 or the number 65. Those who saw the number 65 consistently gave significantly higher estimates than those who saw 10, despite the fact that the wheel's result was entirely irrelevant to the question. This finding illustrates how initial reference points, even arbitrary ones, can profoundly skew our assessments in ways we are typically unaware of.

Equally influential is the phenomenon known as confirmation bias, our deeply ingrained tendency to seek out, interpret, and remember information that confirms our preexisting beliefs while simultaneously discounting evidence that contradicts them. This bias operates at every level of cognition, from the news sources we choose to consume to the way we interpret ambiguous data. In the age of social media algorithms that curate content based on our past behavior, confirmation bias has been amplified to an unprecedented degree, creating what researchers call "filter bubbles" or "echo chambers" that insulate individuals from perspectives that challenge their worldview.

Understanding these cognitive biases does not render us immune to their influence, but it does provide valuable tools for improving the quality of our decisions. Strategies such as actively seeking out disconfirming evidence, consulting diverse perspectives before making important choices, and implementing structured decision-making frameworks can help mitigate the impact of these inherent mental shortcuts. Moreover, cultivating what psychologists call "metacognition," the ability to think critically about our own thinking processes, represents perhaps the most powerful defense against the subtle distortions that cognitive biases introduce into our reasoning. In a world of ever-increasing complexity and information overload, the capacity for metacognitive reflection has become not merely an intellectual luxury but an essential survival skill.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 인간의 의사결정이 비합리적인 인지 편향(cognitive biases)에 의해 영향받는다는 것을 anchoring effect와 confirmation bias라는 두 가지 구체적 사례로 설명합니다. 수능 '제목 추론'이나 '주제 파악' 유형에서 핵심은 '인간은 스스로 합리적이라 믿지만 실제로는 체계적 편향에 취약하다'는 점입니다. 마지막 문단의 metacognition 개념이 해결책으로 제시되며, 이는 빈칸 추론 문제의 정답 키워드가 될 수 있습니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Understanding these cognitive biases does not render us immune to their influence, but it does provide valuable tools for improving the quality of our decisions.' - 동명사구 'Understanding these cognitive biases'가 주어 역할을 하며 단수 취급(does)됩니다. 'render + 목적어 + 형용사(보어)'는 5형식 구문으로 '~을 ...하게 만들다'라는 뜻입니다. 'it does provide'에서 does는 강조의 조동사로 '실제로 제공한다'는 의미를 강화합니다. 수능 어법에서 동명사 주어의 수 일치와 5형식 동사(render, make, find 등)의 구조를 묻는 문제가 빈출됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'metacognition' [메타코그니션] - '초인지, 메타인지'라는 뜻으로, '자신의 사고 과정에 대해 생각하는 능력'을 의미합니다. meta-(넘어선, 상위의) + cognition(인지)의 합성어입니다. 지문에서 'the ability to think critically about our own thinking processes'로 정의하고 있습니다. 이처럼 수능 지문에서 전문 용어가 등장하면 반드시 동격 표현이나 관계절을 통해 정의가 제시되므로, 쉼표나 대시(—) 뒤의 설명을 놓치지 않는 것이 중요합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Innovation and Entrepreneurship",
        content: `Innovation, the process of translating creative ideas into tangible products, services, or systems that generate value, has long been recognized as a primary engine of economic growth and social progress. From the invention of the printing press to the development of the smartphone, breakthrough innovations have repeatedly reshaped the contours of human civilization, creating entirely new industries while rendering established ones obsolete. In today's rapidly evolving global economy, understanding the dynamics of innovation and the role of entrepreneurship in bringing novel ideas to market has become essential knowledge for anyone seeking to navigate an increasingly uncertain future.

Contrary to popular mythology, most successful innovations do not emerge from sudden flashes of individual genius. Rather, they tend to arise from the systematic recombination of existing ideas, technologies, and practices in novel configurations. Steven Johnson, in his influential work "Where Good Ideas Come From," describes this process as the "adjacent possible," a concept borrowed from evolutionary biology that suggests innovation typically occurs at the boundaries of what is currently achievable, extending the realm of possibility incrementally rather than through revolutionary leaps. This perspective helps explain why many groundbreaking inventions have been developed simultaneously and independently by multiple individuals, a phenomenon known as "multiple discovery" that underscores the importance of the broader intellectual and technological ecosystem in which innovation takes place.

The entrepreneurial mindset required to transform innovative ideas into viable businesses encompasses far more than technical expertise or creative talent. Successful entrepreneurs must also possess resilience in the face of repeated failure, the ability to identify and respond to unmet market needs, and the interpersonal skills necessary to attract collaborators, investors, and customers. Silicon Valley's culture of celebrating failure as a valuable learning experience, while sometimes romanticized, reflects a genuine insight: the path from initial concept to successful enterprise is rarely linear, and the willingness to iterate, pivot, and persevere through setbacks is often the distinguishing factor between those who merely conceive of innovations and those who actually bring them to fruition.

Furthermore, the most impactful innovations increasingly emerge not from isolated individual efforts but from collaborative ecosystems that bring together diverse perspectives and complementary skill sets. Open-source software development, university-industry research partnerships, and cross-disciplinary innovation hubs all exemplify this trend toward collective creativity. As the challenges facing humanity grow ever more complex and interconnected, the ability to foster and participate in such collaborative innovation networks will become an increasingly critical determinant of success, not only for individual entrepreneurs but for entire economies and societies seeking to remain competitive and resilient in the face of accelerating change.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문의 핵심 논점은 세 가지입니다: (1) 혁신은 천재적 개인의 돌발적 발상이 아니라 기존 아이디어의 체계적 재조합(adjacent possible), (2) 기업가 정신에서 실패에 대한 회복력이 핵심, (3) 가장 영향력 있는 혁신은 협업 생태계에서 나온다는 점입니다. 수능 '빈칸 추론'에서 'adjacent possible' 개념이나 multiple discovery 현상의 의미를 추론하는 문제가 출제될 수 있으며, '글의 순서 배열' 문제에서는 일반론→구체적 이론→기업가 정신→협업이라는 논리적 흐름을 파악하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'This perspective helps explain why many groundbreaking inventions have been developed simultaneously and independently by multiple individuals, a phenomenon known as \"multiple discovery\" that underscores the importance of the broader intellectual and technological ecosystem in which innovation takes place.' - 이 문장은 help + 동사원형(explain) 구문으로 시작하며, why절은 명사절로 explain의 목적어입니다. 'a phenomenon known as...'는 앞 절 전체를 부연 설명하는 동격 표현이며, 'known as'는 과거분사구로 phenomenon을 수식합니다. 'in which innovation takes place'는 전치사 + 관계대명사 구문입니다. 내신에서 help + (to) V 구문, 동격 명사구, 전치사 + 관계대명사를 묻는 문제가 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'iterate' [이터레이트] - '반복하다, 되풀이하다'라는 뜻의 동사입니다. 명사형은 iteration(반복), 형용사형은 iterative(반복적인)입니다. 비즈니스/IT 맥락에서는 '제품이나 프로세스를 반복적으로 개선하다'라는 의미로 자주 사용됩니다. 지문에서 'iterate, pivot, and persevere'는 기업가가 실패 후 취하는 세 가지 행동(반복 개선, 방향 전환, 인내)을 나열한 것입니다. 수능에서 동사 나열 구조는 문맥상 의미 추론 문제에 자주 활용됩니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 2 (고2) - SECOND SEMESTER
  // ============================================================
  {
    grade: 2,
    semester: "SECOND",
    passages: [
      {
        title: "Literature and the Human Experience",
        content: `Literature, in its myriad forms, has served as one of humanity's most enduring and powerful vehicles for exploring the depths of the human experience. From the epic poems of ancient civilizations to the experimental novels of the postmodern era, literary works have consistently provided readers with a unique lens through which to examine the fundamental questions that define our existence: What does it mean to love? How do we confront mortality? What obligations do we bear toward one another and toward the societies in which we live? By engaging with these questions through the medium of narrative, literature enables a form of understanding that transcends the purely intellectual and touches upon the emotional, moral, and spiritual dimensions of human life.

One of literature's most remarkable qualities is its capacity to transport readers across the boundaries of time, geography, and social circumstance, granting them intimate access to experiences and perspectives radically different from their own. Reading Chinua Achebe's "Things Fall Apart" offers a profound window into the devastating impact of colonialism on traditional Igbo society in Nigeria. Similarly, Gabriel Garcia Marquez's "One Hundred Years of Solitude" immerses readers in the cyclical rhythms of life in a fictional Colombian town, illuminating the broader patterns of Latin American history through the lens of magical realism. These works do not merely describe distant realities; they cultivate in readers a form of empathetic understanding that fosters tolerance, intellectual humility, and a recognition of the vast diversity of human experience.

The relationship between literature and social change has been documented throughout history. Harriet Beecher Stowe's "Uncle Tom's Cabin" is widely credited with galvanizing anti-slavery sentiment in the United States prior to the Civil War, to such an extent that Abraham Lincoln reportedly remarked upon meeting Stowe, "So you're the little woman who wrote the book that started this great war." More recently, literary movements such as feminist literature, postcolonial writing, and environmental fiction have challenged dominant narratives and amplified marginalized voices, contributing to significant shifts in public consciousness and policy.

Yet literature's value extends beyond its capacity for social commentary or political influence. At its most intimate level, reading offers individuals a mirror in which they can recognize and make sense of their own experiences, emotions, and inner conflicts. The solitary act of engaging deeply with a text can provide consolation in times of grief, clarity in moments of confusion, and companionship in periods of isolation. In an age increasingly dominated by the rapid consumption of fragmented digital content, the slow, contemplative practice of literary reading represents a vital counterbalance, one that nurtures the kind of deep reflection and sustained attention that are essential for maintaining our full humanity.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 문학의 가치를 세 가지 차원에서 논합니다: (1) 다양한 경험과 관점에 대한 공감적 이해 촉진, (2) 사회 변화에 대한 기여(Uncle Tom's Cabin 사례), (3) 개인적 차원의 성찰과 위안. 수능 '주제 추론' 유형에서 핵심 문장은 마지막 문단의 'the slow, contemplative practice of literary reading represents a vital counterbalance'입니다. 또한 구체적 작품명(Things Fall Apart, One Hundred Years of Solitude)이 예시로 사용된 논증 구조를 파악하는 것이 '문장 삽입' 문제에 중요합니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'By engaging with these questions through the medium of narrative, literature enables a form of understanding that transcends the purely intellectual and touches upon the emotional, moral, and spiritual dimensions of human life.' - 'By + 동명사(engaging)'는 수단/방법을 나타내는 전치사구입니다. 'that transcends... and touches upon...'은 하나의 관계대명사 that이 두 동사(transcends, touches)를 이끄는 구조입니다. 'the purely intellectual'에서 'the + 형용사'는 추상명사('순수한 지적 차원')를 나타냅니다. 수능에서 'the + 형용사'의 추상명사 용법과 관계절 내 병렬 구조를 묻는 어법 문제가 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'galvanize' [갤버나이즈] - '자극하여 행동하게 하다, 활기를 불어넣다'라는 뜻의 동사입니다. 원래는 전기 자극을 통해 근육을 움직이게 하는 것에서 유래한 단어로, 비유적으로 '사람들을 강하게 자극하여 행동에 나서게 하다'라는 의미로 확장되었습니다. 'galvanize anti-slavery sentiment'는 '반노예 감정을 촉발시키다'로 해석합니다. 유의어로는 stimulate, provoke, spur, catalyze가 있으며, 수능 사회/역사 관련 지문에서 자주 등장합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Ethics in the Modern World",
        content: `The ethical dilemmas confronting contemporary society are characterized by a level of complexity and urgency that few previous generations have encountered. Advances in technology, medicine, and global commerce have created situations in which traditional moral frameworks, developed in far simpler times, often prove inadequate for guiding our decisions. From the ethical implications of artificial intelligence and genetic engineering to the moral responsibilities associated with climate change and global economic inequality, the challenges we face demand not only sophisticated ethical reasoning but also a willingness to engage with perspectives and value systems that may differ fundamentally from our own.

Consider the moral questions raised by the rapid development of autonomous vehicles. A self-driving car, confronted with an unavoidable accident, must be programmed to make split-second decisions about how to minimize harm. Should the vehicle prioritize the safety of its passengers over that of pedestrians? Should it factor in the number, age, or health status of potential victims? These questions, reminiscent of the classic "trolley problem" in philosophical ethics, are no longer merely abstract thought experiments; they are practical engineering decisions that must be resolved before autonomous vehicles can be widely deployed. The answers we arrive at will inevitably reflect deeply held cultural values and assumptions about the relative worth of different human lives, making these decisions profoundly political as well as technical.

The field of bioethics presents equally daunting challenges. The CRISPR gene-editing technology, which enables scientists to modify the DNA of living organisms with unprecedented precision, holds enormous promise for treating genetic diseases and enhancing agricultural productivity. However, it also raises troubling questions about the potential for creating "designer babies," exacerbating social inequalities by making genetic enhancements available only to the wealthy, and fundamentally altering the human genome in ways whose long-term consequences cannot be predicted. The tension between the potential benefits and risks of such technologies exemplifies the broader ethical challenge of our age: how to harness the power of innovation while preserving the values of justice, equality, and human dignity.

Navigating these complex ethical landscapes requires more than adherence to rigid moral rules or intuitive judgments about right and wrong. It demands the cultivation of what philosopher Martha Nussbaum has termed "moral imagination," the capacity to envision the full range of consequences that our actions may produce and to empathize with those who will be affected by our decisions. Education systems around the world have an essential role to play in developing this capacity, by exposing students to diverse ethical perspectives, encouraging critical engagement with real-world moral dilemmas, and fostering the intellectual courage to question established norms when the evidence and circumstances demand it.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 현대 사회의 윤리적 딜레마를 자율주행차의 도덕적 판단과 CRISPR 유전자 편집이라는 두 가지 구체적 사례로 설명합니다. 수능 '글의 요지' 문제에서 핵심 메시지는 '현대의 기술적 발전이 전통적 도덕 체계로는 해결할 수 없는 새로운 윤리적 문제를 만들고 있으며, 이를 해결하려면 도덕적 상상력(moral imagination)이 필요하다'는 것입니다. trolley problem과 designer babies는 배경지식으로 알아두면 지문 이해에 도움됩니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'The answers we arrive at will inevitably reflect deeply held cultural values and assumptions about the relative worth of different human lives, making these decisions profoundly political as well as technical.' - 'The answers (that/which) we arrive at'에서 목적격 관계대명사가 생략되었으며, arrive at의 전치사 at이 관계절 끝에 남아 있는 구조입니다(= the answers at which we arrive). 'making these decisions...'는 결과를 나타내는 분사구문이며, 'as well as'는 'A뿐만 아니라 B도'라는 의미의 상관 접속사입니다. 내신에서 관계대명사 생략과 전치사 잔류(stranded preposition) 구조를 묻는 문제가 출제됩니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'exacerbate' [이그재서베이트] - '악화시키다, 더 심하게 만들다'라는 뜻의 동사입니다. 라틴어 exacerbare(더 거칠게 하다)에서 유래했으며, ex-(강조) + acerbus(쓴, 거친)가 어원입니다. 'exacerbating social inequalities'는 '사회적 불평등을 악화시키는'으로 해석합니다. 유의어로는 aggravate, worsen, intensify가 있고, 반의어로는 alleviate, mitigate, ameliorate가 있습니다. 수능에서 부정적 변화를 묘사하는 맥락에 자주 등장하며, 어휘 추론 문제에 대비하세요.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Economics of Sustainability",
        content: `For much of the modern industrial era, economic growth and environmental sustainability were widely perceived as fundamentally incompatible objectives. The dominant paradigm held that prosperity could be achieved only through the relentless extraction and consumption of natural resources, an approach that treated the environment as an inexhaustible reservoir of raw materials and a limitless receptacle for waste. However, the mounting evidence of ecological degradation, coupled with a growing recognition that natural capital underpins all economic activity, has prompted a fundamental reassessment of the relationship between economic development and environmental stewardship.

The concept of sustainable development, most famously articulated in the 1987 Brundtland Report as "development that meets the needs of the present without compromising the ability of future generations to meet their own needs," represents an attempt to reconcile these seemingly competing imperatives. This framework recognizes that economic growth, social equity, and environmental protection are not mutually exclusive but rather deeply interdependent dimensions of human well-being. An economy that depletes its natural resource base or generates levels of pollution that undermine public health is not truly growing; it is merely borrowing prosperity from the future and accumulating debts that subsequent generations will be forced to repay.

The transition toward a more sustainable economic model has been accelerated by remarkable advances in clean energy technology and the emergence of what economists call the "circular economy." Unlike the traditional linear model of "take, make, dispose," the circular economy seeks to minimize waste and maximize resource efficiency by designing products for durability, reuse, and recycling. Companies that have embraced this approach have often discovered that sustainability and profitability are not only compatible but mutually reinforcing, as reducing waste and improving energy efficiency directly translate into lower operating costs and enhanced competitiveness.

Nevertheless, significant obstacles remain on the path to a fully sustainable global economy. The externalization of environmental costs, whereby the true ecological impact of production and consumption is not reflected in market prices, continues to incentivize environmentally destructive behavior. Carbon pricing mechanisms, such as carbon taxes and cap-and-trade systems, represent promising policy tools for addressing this market failure by ensuring that polluters bear the full cost of their emissions. However, implementing such measures on a global scale requires overcoming formidable political resistance, addressing concerns about economic competitiveness, and ensuring that the costs of transition do not fall disproportionately on the poorest and most vulnerable segments of society, who have contributed least to the environmental crisis yet stand to suffer its most severe consequences.`,
        source: "고등학교 영어 (고2)",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 경제 성장과 환경 지속가능성의 관계를 재조명하며, 핵심 개념으로 '지속가능한 발전(sustainable development)', '순환경제(circular economy)', '외부비용의 내재화(carbon pricing)'를 제시합니다. 수능 '요약문 완성' 유형에서 핵심은 '경제 성장과 환경 보호는 상호 배타적이 아니라 상호 의존적'이라는 논지입니다. 마지막 문단의 역접(Nevertheless)으로 시작되는 한계점 제시 구조는 '글의 흐름과 무관한 문장' 문제에서 핵심 판단 기준이 됩니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'An economy that depletes its natural resource base or generates levels of pollution that undermine public health is not truly growing; it is merely borrowing prosperity from the future and accumulating debts that subsequent generations will be forced to repay.' - 이 문장에는 관계대명사 that이 세 번 사용되었습니다. 첫 번째 that(depletes...or generates)은 An economy를, 두 번째 that(undermine)은 levels of pollution을, 세 번째 that(subsequent generations...)은 debts를 각각 수식합니다. 주절의 주어는 'An economy'이고 동사는 'is'입니다. 긴 관계절 사이에서 주어-동사 일치를 파악하는 것이 수능 어법 문제의 핵심입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'externalization' [익스터널라이제이션] - '외부화, 외재화'라는 뜻의 명사입니다. external(외부의) + -ize(동사화 접미사) + -ation(명사화 접미사)으로 구성됩니다. 경제학에서 'externalization of costs'는 '비용의 외부화'로, 기업이 생산 과정에서 발생하는 환경 오염 등의 비용을 스스로 부담하지 않고 사회나 환경에 전가하는 것을 말합니다. 반의어 개념으로 internalization(내재화)이 있으며, 수능 경제/환경 관련 지문에서 자주 등장하는 전문 어휘입니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 3 (고3) - FIRST SEMESTER (수능 prep level)
  // ============================================================
  {
    grade: 3,
    semester: "FIRST",
    passages: [
      {
        title: "Critical Thinking in the Information Age",
        content: `The unprecedented proliferation of information that characterizes the digital age has paradoxically rendered the task of distinguishing truth from falsehood more difficult than at any previous point in human history. While earlier generations confronted the challenge of accessing sufficient information to form well-grounded judgments, citizens of the twenty-first century face the inverse problem: an overwhelming deluge of data, claims, and narratives, many of which are deliberately designed to mislead, manipulate, or confuse. In this environment, the capacity for critical thinking, defined broadly as the disciplined ability to evaluate evidence, identify logical fallacies, and withhold judgment until adequate grounds for belief have been established, has become an indispensable prerequisite for meaningful participation in democratic society.

The mechanisms through which misinformation propagates in the digital ecosystem are both sophisticated and deeply troubling. Social media algorithms, optimized to maximize user engagement rather than to promote truthfulness, systematically amplify content that provokes strong emotional reactions, regardless of its accuracy. This creates a perverse incentive structure in which sensational, divisive, and misleading content consistently outperforms nuanced, evidence-based reporting in the competition for public attention. Furthermore, the ease with which digital content can be created, modified, and disseminated means that fabricated images, manipulated videos, and entirely fictional news articles can reach millions of people within hours, often outpacing the ability of fact-checkers and credible journalists to identify and correct the falsehoods.

Compounding these challenges is the psychological phenomenon of motivated reasoning, whereby individuals evaluate information not on the basis of its objective merit but rather according to whether it supports conclusions they are already predisposed to accept. Research in cognitive science has demonstrated that when confronted with evidence that contradicts deeply held beliefs, people often experience a physiological stress response similar to that triggered by physical threats, leading them to reject the disconfirming evidence and cling more tenaciously to their original positions. This "backfire effect," as it is sometimes called, helps explain why simply presenting people with factual corrections is frequently insufficient to change their minds and may, counterintuitively, strengthen the very misconceptions it seeks to address.

Developing robust critical thinking skills in the face of these formidable obstacles requires a multifaceted educational approach that goes far beyond teaching students to identify logical fallacies or evaluate the credibility of sources, though these remain essential competencies. Equally important is the cultivation of intellectual virtues such as epistemic humility, the recognition that one's own beliefs may be mistaken; intellectual courage, the willingness to follow evidence wherever it leads, even when the conclusions are uncomfortable; and charitable interpretation, the practice of engaging with opposing viewpoints in their strongest rather than weakest formulations. Together, these cognitive skills and dispositions constitute what might be called a critical thinking disposition, an orientation toward knowledge that is simultaneously open-minded and rigorously analytical, receptive to new evidence yet resistant to manipulation.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 1",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 수능 고난도 독해의 전형적 구조를 따릅니다. 핵심 논지는 '정보 과잉 시대에 비판적 사고력이 민주 사회 참여의 필수 전제 조건'이라는 것입니다. 특히 'backfire effect'(역효과)는 수능 빈칸 추론에서 자주 출제되는 역설적 개념입니다 - 사실적 교정이 오히려 잘못된 믿음을 강화할 수 있다는 점을 정확히 이해해야 합니다. 마지막 문단에서 제시하는 세 가지 지적 덕목(epistemic humility, intellectual courage, charitable interpretation)은 요약문 완성 문제의 핵심 키워드입니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Research in cognitive science has demonstrated that when confronted with evidence that contradicts deeply held beliefs, people often experience a physiological stress response similar to that triggered by physical threats, leading them to reject the disconfirming evidence and cling more tenaciously to their original positions.' - 이 문장은 매우 복잡한 구조입니다. that절 안에 'when confronted with...'는 'when (they are) confronted with'의 축약형(분사구문)이며, 'similar to that triggered by...'에서 that은 대명사로 'a stress response'를 대신합니다. 'triggered by physical threats'는 과거분사구로 that을 수식합니다. 수능 어법 문제에서 접속사 축약, 대명사 that의 지칭, 분사의 능동/수동 구별이 핵심입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'epistemic' [에피스테믹] - '인식론적인, 지식과 관련된'이라는 뜻의 형용사입니다. 그리스어 episteme(지식, 앎)에서 유래했으며, epistemology(인식론)의 형용사형입니다. 'epistemic humility'는 '인식론적 겸손'으로, '자신의 믿음이 틀릴 수 있다는 것을 인정하는 태도'를 의미합니다. 수능 고난도 지문에서 철학적 개념어가 등장할 때는 반드시 문맥 속 정의(여기서는 'the recognition that one's own beliefs may be mistaken')를 찾아 의미를 확인하세요.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Nature of Scientific Discovery",
        content: `The popular conception of scientific discovery as a linear, methodical process in which hypotheses are systematically tested against empirical evidence until the truth is revealed bears little resemblance to the actual practice of science as it has been conducted throughout history. In reality, scientific progress is a far messier, more contingent, and more deeply human endeavor than the sanitized narratives presented in textbooks would suggest. Understanding the true nature of scientific discovery, with all its ambiguities, false starts, and serendipitous breakthroughs, is essential not only for aspiring scientists but for any citizen who wishes to engage thoughtfully with the scientific claims that increasingly shape public policy and private decision-making.

Thomas Kuhn's seminal work "The Structure of Scientific Revolutions," published in 1962, fundamentally challenged the prevailing view of scientific progress as a steady, cumulative march toward truth. Kuhn argued that science typically advances not through the gradual accumulation of knowledge within an established framework but rather through dramatic "paradigm shifts," in which an entirely new conceptual structure replaces one that can no longer adequately account for observed phenomena. The transition from Newtonian mechanics to Einstein's theory of relativity, and from classical physics to quantum mechanics, exemplify such revolutionary transformations. During these periods of upheaval, Kuhn contended, the criteria for evaluating scientific claims themselves undergo fundamental revision, making it impossible to assess competing paradigms by any neutral, paradigm-independent standard.

The role of serendipity in scientific discovery further complicates the idealized picture of the scientific method. Alexander Fleming's discovery of penicillin, which resulted from his accidental observation that a mold contaminating one of his bacterial cultures was inhibiting bacterial growth, is perhaps the most celebrated example of a chance observation leading to a revolutionary breakthrough. However, as Louis Pasteur famously observed, "chance favors the prepared mind." Fleming's ability to recognize the significance of what he had stumbled upon depended critically on his extensive training, his deep familiarity with the relevant scientific literature, and his willingness to pursue an unexpected observation rather than dismissing it as mere contamination, qualities that distinguished him from the numerous other researchers who had likely encountered similar phenomena without grasping their implications.

The philosophical implications of these observations extend far beyond the academy. If scientific knowledge is not the product of a purely objective, algorithmic process but is instead shaped by social contexts, cognitive biases, and historical contingencies, then the relationship between science and certainty is considerably more complex than is commonly assumed. This recognition does not, as some have mistakenly concluded, undermine the authority of scientific knowledge or license the rejection of well-established scientific findings. Rather, it invites a more sophisticated understanding of science as a self-correcting enterprise whose provisional conclusions, while never absolutely certain, nonetheless represent the most reliable knowledge available to humanity at any given time, precisely because the scientific community has developed rigorous mechanisms for identifying and eliminating error over extended periods of systematic inquiry.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 2",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 수능 최고 난도 수준의 추상적 논증입니다. 핵심 논지는 '과학적 발견은 교과서에서 묘사하는 것처럼 선형적이고 체계적인 과정이 아니라, 패러다임 전환(Kuhn)과 우연한 발견(serendipity)을 포함하는 복잡한 인간적 활동'이라는 것입니다. 마지막 문단의 핵심 주장 - '과학적 지식이 완전히 객관적이지 않다는 인정이 과학의 권위를 훼손하는 것이 아니라 더 정교한 이해를 초대한다' - 은 수능 빈칸 추론/주제 파악에서 가장 출제 가능성이 높은 부분입니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Fleming's ability to recognize the significance of what he had stumbled upon depended critically on his extensive training, his deep familiarity with the relevant scientific literature, and his willingness to pursue an unexpected observation rather than dismissing it as mere contamination.' - 이 문장의 주어는 'Fleming's ability'이고 동사는 'depended'입니다. 'what he had stumbled upon'은 what 관계대명사절로 '그가 우연히 발견한 것'을 의미하며, had stumbled(과거완료)는 주절 동사 depended(과거)보다 앞선 시점을 나타냅니다. 'rather than dismissing'은 'rather than + 동명사'로 '~하기보다는'이라는 대조를 표현합니다. 수능에서 과거완료의 대과거 용법과 긴 주어에서 동사 찾기가 빈출 포인트입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'serendipity' [세렌디피티] - '뜻밖의 행운, 우연한 발견'이라는 뜻의 명사입니다. 형용사형은 serendipitous(우연히 발견한)입니다. 1754년 영국 작가 Horace Walpole이 페르시아 동화 'The Three Princes of Serendip'에서 영감을 받아 만든 조어입니다. 과학사에서 '준비된 마음에 우연이 중요한 발견으로 이어지는 현상'을 설명할 때 핵심 어휘로 사용됩니다. 수능에서 지문의 핵심 개념어를 빈칸에 넣는 유형에 자주 활용되므로 정확한 의미 파악이 중요합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Globalization and Cultural Exchange",
        content: `Globalization, broadly understood as the accelerating interconnection of economies, cultures, and populations across national boundaries, has generated one of the most contentious and multifaceted debates of our era. Proponents celebrate its capacity to promote economic growth, facilitate cross-cultural understanding, and disseminate technological innovations that improve living standards around the world. Critics, conversely, decry its tendency to exacerbate economic inequality, homogenize cultural landscapes, and concentrate power in the hands of multinational corporations that operate beyond the effective reach of democratic governance. Navigating this debate productively requires moving beyond simplistic either-or framings and engaging with the nuanced, often contradictory realities that globalization produces on the ground.

The cultural dimension of globalization is particularly complex and resistant to straightforward characterization. The global circulation of cultural products, from Hollywood films and K-pop music to Japanese anime and Brazilian telenovelas, has created unprecedented opportunities for cross-cultural exposure and appreciation. Young people in Seoul listen to American hip-hop, teenagers in Kansas follow Korean beauty trends, and audiences worldwide stream content produced on every inhabited continent. Yet this seemingly democratizing cultural exchange is far from symmetrical. The dominance of English as the global lingua franca and the outsized market power of Western, particularly American, media conglomerates mean that the flow of cultural influence remains heavily tilted in favor of wealthy, English-speaking nations, raising legitimate concerns about cultural imperialism and the gradual erosion of linguistic and cultural diversity.

However, characterizing globalization exclusively as a force for cultural homogenization overlooks the creative and often subversive ways in which local communities engage with global cultural flows. The concept of "glocalization," coined by sociologist Roland Robertson, captures the process by which global cultural products are adapted, reinterpreted, and infused with local meaning by the communities that receive them. The phenomenal global success of Korean popular culture, often referred to as the "Korean Wave" or "Hallyu," provides a compelling illustration of this dynamic. Korean producers have not simply imitated Western cultural formats but have synthesized influences from diverse sources to create distinctive cultural products that resonate with audiences across vastly different cultural contexts, thereby transforming South Korea from a cultural importer to one of the world's most influential cultural exporters.

The implications of cultural globalization for individual identity formation are equally profound and ambiguous. On one hand, exposure to diverse cultural perspectives can broaden horizons, challenge parochial assumptions, and foster a cosmopolitan sensibility that transcends the limitations of any single cultural tradition. On the other hand, the constant bombardment of globalized cultural messages can generate anxiety, confusion, and a sense of cultural rootlessness, particularly among young people who may struggle to reconcile the values and expectations of their local communities with the seductive but often superficial allure of globalized consumer culture. The challenge for individuals and societies alike lies in cultivating the capacity to engage selectively and critically with global cultural flows, embracing those elements that enrich and expand human experience while maintaining the distinctive cultural traditions and values that provide a sense of belonging, continuity, and meaning.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 3",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 세계화의 문화적 차원을 찬반 양론을 넘어 다층적으로 분석합니다. 수능 '빈칸 추론' 유형에서 핵심 개념은 'glocalization'(글로컬라이제이션 - 글로벌 문화가 지역적으로 재해석되는 과정)입니다. 한류(Hallyu) 사례가 glocalization의 구체적 예시로 제시되어 있어, 한국 학생들에게 친숙한 소재입니다. 마지막 문단의 'engage selectively and critically with global cultural flows'가 필자의 최종 입장이며, 주제문으로 출제될 가능성이 높습니다. 글의 구조는 찬성론 → 반대론 → 절충론(glocalization) → 결론으로 전개됩니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Korean producers have not simply imitated Western cultural formats but have synthesized influences from diverse sources to create distinctive cultural products that resonate with audiences across vastly different cultural contexts, thereby transforming South Korea from a cultural importer to one of the world's most influential cultural exporters.' - 'not simply A but (have) B'는 'not only A but also B'의 변형으로 병렬 구조입니다. 'thereby + 현재분사(transforming)'는 '그렇게 함으로써 ~하다'라는 결과를 나타내는 분사구문입니다. 'from A to B' 구조에서 A(cultural importer)와 B(one of the world's most influential cultural exporters)가 대조됩니다. 수능에서 thereby/thus + ~ing 결과 분사구문은 고빈출 어법 포인트입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'parochial' [퍼로키얼] - '편협한, 시야가 좁은, 지엽적인'이라는 뜻의 형용사입니다. 원래 parish(교구, 지역 교회)에서 유래한 단어로, '자기 교구만 아는 → 좁은 시야의'라는 의미로 확장되었습니다. 'challenge parochial assumptions'는 '편협한 가정에 도전하다'로 해석합니다. 유의어로는 narrow-minded, provincial, insular가 있고, 반의어로는 cosmopolitan, broad-minded, open-minded가 있습니다. 수능에서 글의 논조를 파악할 때 이런 가치 평가 형용사의 긍정/부정 뉘앙스를 정확히 읽는 것이 중요합니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },

  // ============================================================
  // GRADE 3 (고3) - SECOND SEMESTER (수능 prep level)
  // ============================================================
  {
    grade: 3,
    semester: "SECOND",
    passages: [
      {
        title: "The Role of Art in Society",
        content: `The question of what role art should play in society has provoked passionate debate among philosophers, artists, politicians, and ordinary citizens for millennia. Should art serve a social or political purpose, functioning as a vehicle for moral instruction, social commentary, or revolutionary change? Or does its value reside precisely in its autonomy from utilitarian concerns, in its capacity to create beauty, provoke contemplation, and expand the boundaries of human perception for their own sake? This tension between instrumental and intrinsic conceptions of artistic value has animated aesthetic discourse from Plato's Republic, in which the philosopher famously proposed banishing poets from the ideal state, to the contemporary debates surrounding government funding for the arts and the role of aesthetics in public education.

Those who advocate for art's social function point to its unparalleled capacity to crystallize complex human experiences into forms that resonate across cultural and temporal boundaries. Picasso's "Guernica," painted in response to the bombing of a Spanish town during the Civil War, communicates the horror and absurdity of armed conflict with an immediacy and emotional power that no historical account or statistical analysis can match. Similarly, the protest songs of the American civil rights movement, the anti-apartheid literature of South Africa, and the political theater traditions of Latin America have all demonstrated art's extraordinary ability to galvanize collective action, sustain hope in the face of oppression, and articulate visions of justice that inspire subsequent generations to continue the struggle for a more equitable world.

The opposing perspective, often associated with the doctrine of "art for art's sake" articulated by nineteenth-century aestheticists, maintains that subordinating art to political or moral agendas inevitably diminishes its power and distorts its fundamental nature. According to this view, the greatest works of art succeed not because they deliver a particular message but because they create experiences of formal beauty, emotional depth, and cognitive complexity that cannot be reduced to any propositional content. Oscar Wilde captured this sensibility memorably when he declared that "all art is quite useless," meaning not that art lacks value but that its value transcends the categories of practical utility through which we typically assess the worth of human activities.

A more productive approach to this enduring debate may lie in recognizing that the apparent opposition between art's social function and its aesthetic autonomy is, in many respects, a false dichotomy. The most powerful works of art throughout history have frequently been those that achieved both social relevance and formal excellence simultaneously, precisely because their aesthetic sophistication enabled them to communicate their social vision with a depth, complexity, and persuasive force that more straightforward forms of advocacy could not approximate. Toni Morrison's novels, for instance, are at once profound meditations on the African American experience and masterful achievements in literary form, and it is precisely the inseparability of these dimensions that accounts for their enduring impact. Understanding art's role in society, therefore, requires resisting the temptation to reduce it to a single function and instead embracing the irreducible multiplicity of purposes that great art serves.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 4",
        order: 1,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 예술의 사회적 역할에 대한 두 가지 대립적 관점(도구적 가치 vs. 내재적 가치)을 제시한 후, 마지막 문단에서 '이분법적 대립은 허위 이분법(false dichotomy)'이라는 통합적 결론을 도출합니다. 수능 '빈칸 추론'에서 마지막 문단의 핵심 개념인 'false dichotomy'와 'irreducible multiplicity of purposes'가 출제 포인트입니다. 논증 구조는 '정(thesis) → 반(antithesis) → 합(synthesis)'의 변증법적 구조이므로, 이러한 논리 전개를 파악하는 것이 순서 배열 문제에 필수적입니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Those who advocate for art's social function point to its unparalleled capacity to crystallize complex human experiences into forms that resonate across cultural and temporal boundaries.' - 'Those who'는 '~하는 사람들'이라는 의미의 관계대명사 구문이며, 주어 역할을 합니다. 'its capacity to crystallize A into B'에서 to crystallize는 capacity를 수식하는 형용사적 용법의 to부정사이고, 'crystallize A into B'는 'A를 B로 결정화하다/구체화하다'라는 구문입니다. 'that resonate across...'는 forms를 수식하는 관계절입니다. 수능 어법에서 'Those who + 복수동사'와 to부정사의 형용사적 용법은 필수 점검 사항입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'dichotomy' [다이카터미] - '이분법, 양분, 대립'이라는 뜻의 명사입니다. 그리스어 dicha(둘로) + temnein(자르다)에서 유래했습니다. 'false dichotomy'는 논리학 용어로 '허위 이분법' - 실제로는 두 가지 이상의 선택지가 있는데 마치 두 가지만 있는 것처럼 제시하는 논리적 오류를 말합니다. 수능 고난도 지문에서 필자가 기존의 대립적 관점을 비판하고 제3의 관점을 제시할 때 자주 등장하는 핵심 어휘입니다. 유의어: binary opposition, either-or fallacy.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "Language and Thought",
        content: `The relationship between language and thought constitutes one of the most fascinating and consequential questions in the cognitive sciences, one whose implications extend far beyond academic linguistics into the realms of philosophy, psychology, education, and even artificial intelligence. At the heart of this inquiry lies a deceptively profound question: does language merely serve as a neutral vehicle for expressing thoughts that exist independently of it, or does it actively shape, constrain, and even determine the very nature of the thoughts we are capable of thinking? The answer to this question has profound implications for how we understand human cognition, cultural diversity, and the possibilities and limitations of cross-cultural communication.

The most radical position in this debate is associated with the Sapir-Whorf hypothesis, named after the American linguists Edward Sapir and Benjamin Lee Whorf, who proposed in the early twentieth century that the language one speaks fundamentally determines the categories and concepts through which one perceives and interprets reality. In its strongest form, this hypothesis of linguistic determinism suggests that speakers of different languages literally inhabit different cognitive worlds, unable to fully access thoughts or perceptions that their language does not provide the means to express. Whorf's studies of the Hopi language of Native Americans, which he claimed lacked tense markers and therefore embodied a fundamentally different conception of time from that of European languages, became the most famous illustration of this provocative thesis.

Subsequent empirical research has largely discredited the strong version of linguistic determinism while lending considerable support to a weaker formulation known as linguistic relativity. Speakers of languages that make grammatical distinctions not present in other languages have been shown to exhibit measurably different patterns of perception, memory, and categorization in controlled experimental settings. For example, speakers of Russian, which obligatorily distinguishes between light blue and dark blue with separate basic color terms, have been found to discriminate between these shades more rapidly than English speakers, who use the single term "blue" for both. Similarly, speakers of languages that use absolute spatial reference frames, such as cardinal directions rather than relative terms like "left" and "right," demonstrate superior spatial orientation abilities compared to speakers of languages that rely primarily on relative spatial reference.

These findings suggest that while language does not imprison thought within inescapable conceptual boundaries, as the strongest version of the Sapir-Whorf hypothesis would have it, it does function as a powerful cognitive tool that highlights certain aspects of experience while leaving others in relative shadow. The implications for education are considerable: learning a second language, far from being merely a practical skill for communication, may literally expand the cognitive resources available to the learner, providing access to alternative ways of categorizing, perceiving, and reasoning about the world. In an increasingly interconnected global society, this cognitive dimension of multilingualism represents perhaps its most underappreciated benefit, suggesting that the preservation of linguistic diversity is not merely a matter of cultural heritage but a vital resource for the collective cognitive enrichment of humanity as a whole.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 5",
        order: 2,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 언어와 사고의 관계를 사피어-워프 가설(Sapir-Whorf hypothesis)의 강한 버전(linguistic determinism)과 약한 버전(linguistic relativity)으로 구분하여 설명합니다. 수능 '빈칸 추론'에서 핵심은 마지막 문단의 비유적 표현 'language highlights certain aspects of experience while leaving others in relative shadow'입니다. 러시아어 색상 실험과 절대 공간 참조 체계 사례는 '글의 내용 일치/불일치' 유형에서 세부 정보 확인 문제로 출제될 수 있으므로 정확히 기억하세요.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Speakers of languages that make grammatical distinctions not present in other languages have been shown to exhibit measurably different patterns of perception, memory, and categorization in controlled experimental settings.' - 이 문장의 핵심 구조는 'Speakers(주어) have been shown(동사) to exhibit(to부정사)'입니다. 'that make grammatical distinctions'는 languages를 수식하는 관계절이고, 'not present in other languages'는 과거분사구로 distinctions를 후위 수식합니다. 'have been shown to V'는 '~하는 것으로 나타났다/밝혀졌다'라는 수동태 + to부정사 구문입니다. 수능에서 긴 수식어구 속에서 주어-동사를 정확히 찾는 능력이 핵심입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'obligatorily' [오블리가토릴리] - '의무적으로, 필수적으로'라는 뜻의 부사입니다. 형용사형 obligatory(의무적인)에서 파생되었으며, 어근은 oblige(의무를 지우다)입니다. 언어학에서 'obligatorily distinguishes'는 '문법적으로 반드시 구분해야 하는'이라는 의미로, 러시아어에서 밝은 파란색(goluboy)과 진한 파란색(siniy)을 문법적으로 반드시 구별해야 한다는 것을 설명합니다. 수능에서 학술적 맥락의 부사 의미를 정확히 파악하는 것이 독해 정확도를 높이는 핵심입니다.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
      {
        title: "The Future of Human Civilization",
        content: `As humanity enters an era defined by the convergence of transformative technologies, accelerating environmental pressures, and profound shifts in global power dynamics, the question of what the future holds for our civilization has acquired an urgency unprecedented in human history. While predictions about the future have an notorious track record of spectacular failure, from the confident assertions of mid-twentieth-century futurists that we would all be commuting by flying car by the year 2000 to the persistent predictions of imminent civilizational collapse that have accompanied every age, the exercise of thinking carefully and systematically about potential trajectories for human civilization remains invaluable, not because it enables us to predict the future with certainty but because it illuminates the choices and trade-offs we face in the present.

Among the most consequential forces shaping the trajectory of human civilization is the rapid development of artificial intelligence. While the prospect of artificial general intelligence, a system capable of performing any intellectual task that a human can, remains a subject of intense debate among researchers, narrower forms of AI are already transforming industries, reshaping labor markets, and raising fundamental questions about the nature of human cognition and agency. The automation of an ever-expanding range of cognitive tasks previously considered uniquely human, from medical diagnosis and legal analysis to artistic creation and scientific research, suggests that the relationship between human beings and intelligent machines will be the defining challenge of the coming decades, requiring not only new economic and political arrangements but also a fundamental rethinking of what constitutes meaningful human activity in a world where many traditional forms of work may no longer be necessary.

The existential risks posed by advanced technology, climate change, and the potential for geopolitical conflict represent the darker dimension of humanity's future prospects. Philosopher Nick Bostrom has argued that existential risks, defined as threats that could permanently curtail humanity's potential or lead to outright extinction, deserve far greater attention and resources than they currently receive, given that even a small probability of civilizational catastrophe carries an almost incomprehensibly large expected cost when measured against the vast number of potential future lives at stake. Nuclear proliferation, engineered pandemics, and the possibility of unaligned superintelligent AI systems all represent scenarios in which human civilization could be catastrophically and perhaps irreversibly damaged within a remarkably short timeframe.

Yet it would be profoundly misleading to reduce the future of human civilization to a catalog of existential threats. Throughout our history, humanity has demonstrated a remarkable capacity for adaptation, innovation, and moral progress that has repeatedly defied the predictions of pessimists. The dramatic expansion of human rights, the near-elimination of several devastating diseases, and the unprecedented reduction in global poverty over the past century all testify to our species' capacity for transformative positive change. The critical variable determining which of these divergent futures ultimately materializes is not technological capability or resource availability but rather the quality of the collective decisions we make in the coming years about how to govern emerging technologies, distribute their benefits equitably, and preserve the ecological foundations upon which all human flourishing depends. In this sense, the future of human civilization is not something that will simply happen to us; it is something we are actively, if often unconsciously, in the process of creating through the aggregation of billions of individual choices, institutional decisions, and political commitments made every single day.`,
        source: "고등학교 영어 (고3)",
        unit: "Lesson 6",
        order: 3,
        notes: [
          {
            content:
              "핵심 포인트: 이 지문은 수능 최고 난도 수준으로, 인류 문명의 미래를 AI의 발전, 존재적 위험(existential risks), 그리고 인류의 적응 능력이라는 세 축으로 분석합니다. 가장 중요한 수능 출제 포인트는 마지막 문단의 결론: '문명의 미래를 결정하는 핵심 변수는 기술이나 자원이 아니라 우리의 집단적 의사결정의 질'이라는 주장입니다. '빈칸 추론' 유형에서 'The critical variable... is not technological capability or resource availability but rather the quality of the collective decisions'가 핵심 문장이 될 수 있으며, not A but B 구조의 정확한 파악이 필수입니다.",
            noteType: "EMPHASIS",
            order: 1,
          },
          {
            content:
              "문법 분석: 'Philosopher Nick Bostrom has argued that existential risks, defined as threats that could permanently curtail humanity's potential or lead to outright extinction, deserve far greater attention and resources than they currently receive, given that even a small probability of civilizational catastrophe carries an almost incomprehensibly large expected cost when measured against the vast number of potential future lives at stake.' - 이 문장은 수능에서 볼 수 있는 초장문의 전형입니다. 'defined as threats that...'는 삽입된 과거분사구(existential risks를 부연 설명), 'given that...'은 '~을 고려하면'이라는 분사구문(= considering that), 'when measured against...'는 'when (it is) measured'의 축약형입니다. 수능 어법에서 삽입구를 건너뛰고 주절 구조를 파악하는 능력이 핵심입니다.",
            noteType: "GRAMMAR",
            order: 2,
          },
          {
            content:
              "어휘 분석: 'curtail' [커테일] - '축소하다, 삭감하다, 제한하다'라는 뜻의 동사입니다. 중세 프랑스어 courtauld(짧게 자르다)에서 유래했으며, 원래 동물의 꼬리를 자르는 것에서 '줄이다, 제한하다'라는 의미로 확장되었습니다. 'curtail humanity's potential'은 '인류의 잠재력을 영구적으로 축소하다'로 해석합니다. 유의어로는 reduce, diminish, restrict, limit, truncate가 있고, 반의어로는 expand, extend, augment가 있습니다. 수능 어휘 문제에서 문맥상 적절한 어휘 고르기 유형에 대비하세요.",
            noteType: "VOCAB",
            order: 3,
          },
        ],
      },
    ],
  },
];
