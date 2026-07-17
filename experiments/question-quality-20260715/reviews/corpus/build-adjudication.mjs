import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(here, "../../corpus");
const privatePath = path.join(corpusDir, "private/manifest-private.json");
const publicPath = path.join(corpusDir, "manifest-public.json");
const rater1Path = path.join(here, "rater-1.json");
const rater2Path = path.join(here, "rater-2.json");
const outputPath = path.join(here, "adjudication.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const privateManifest = readJson(privatePath);
const publicManifest = readJson(publicPath);
const rater1 = readJson(rater1Path);
const rater2 = readJson(rater2Path);

const normalizeContent = (text) => text
  .normalize("NFKC")
  .replace(/\r\n?/g, "\n")
  .replace(/[\t\f\v ]+/g, " ")
  .replace(/ *\n+ */g, "\n")
  .replace(/\s+/g, " ")
  .trim();
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const stableStringify = (value, space = 2) => {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sort(child)]));
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, space)}\n`;
};

const P = "PASS";
const E = "EXCLUDE";
const D = "DOMAIN_REVIEW";

// The arrays are intentionally positional and are checked against the private manifest.
// They make omissions and accidental reordering visible during regeneration.
const finalStatusBySplit = {
  dev: [
    E,P,P,D,D,P,P,P,P,P,P,P,P,P,D,P,P,P,P,P,P,P,E,P,E,P,E,D,P,P,
    E,D,D,E,E,E,E,P,E,D,E,P,D,E,P,E,P,E,D,E,P,E,P,P,D,P,P,E,D,P,
  ],
  holdout: [
    P,P,P,P,P,P,E,E,E,P,P,P,D,P,P,D,P,D,P,P,P,P,P,D,D,D,P,P,P,P,
    E,E,E,E,E,E,P,E,E,E,E,E,E,E,E,D,E,D,E,E,P,E,E,E,E,P,D,E,P,D,
  ],
};

const finalGrammarBySplit = {
  dev: [
    "normal","rich","rich","rich","rich","rich","rich","rich","normal","rich",
    "rich","rich","rich","rich","normal","rich","rich","normal","rich","rich",
    "rich","normal","rich","rich","rich","rich","rich","rich","normal","rich",
    "normal","rich","rich","rich","rich","rich","rich","normal","rich","rich",
    "normal","rich","normal","rich","rich","rich","rich","rich","rich","rich",
    "rich","rich","rich","rich","rich","rich","rich","rich","rich","rich",
  ],
  holdout: [
    "normal","rich","rich","rich","rich","rich","rich","rich","rich","rich",
    "normal","rich","rich","normal","rich","rich","rich","rich","rich","normal",
    "rich","rich","rich","rich","rich","rich","normal","rich","rich","normal",
    "rich","rich","rich","rich","scarce","rich","rich","rich","rich","rich",
    "rich","rich","rich","rich","rich","normal","rich","rich","rich","rich",
    "rich","rich","rich","rich","rich","rich","rich","rich","rich","rich",
  ],
};

const finalBlankBySplit = {
  dev: [
    "central","central","central","central","central","local","central","central","central","central",
    "local","central","central","central","central","central","central","central","central","central",
    "central","central","central","central","central","central","central","central","central","central",
    "unsuitable","central","central","central","unsuitable","unsuitable","central","central","unsuitable","central",
    "unsuitable","central","central","unsuitable","central","central","central","central","central","central",
    "central","unsuitable","central","central","central","central","central","central","central","central",
  ],
  holdout: [
    "local","central","central","central","local","central","central","central","central","central",
    "local","local","central","central","central","central","central","central","local","central",
    "central","local","central","central","central","central","central","central","central","central",
    "central","unsuitable","unsuitable","unsuitable","unsuitable","unsuitable","central","unsuitable","central","central",
    "unsuitable","central","central","central","central","central","central","central","central","central",
    "central","unsuitable","central","unsuitable","central","central","central","central","central","central",
  ],
};

const duplicateClusters = {
  "DUP-NUMBER-SUPERSTITION": {
    basis: "동일 숫자 미신 원문의 OCR·관사·문구 변형본",
    keep: "cmqanec030005ic04e2e7rryn",
    members: ["cmqanec030005ic04e2e7rryn", "cmpnwuz3l00bnmmyk39jucvka", "cmqkuogfd0001jd0b65526r18", "cmq2capq3000ammm8iftgy9tp"],
  },
  "DUP-GIG-WORKER": {
    basis: "동일 Jackie gig-economy 문항의 표식·OCR·뜻풀이 표 변형본",
    keep: null,
    members: ["cmpyx7b260001jp04vjeholew", "cmq23oovd0015mmcsd9fjq8gf", "cmq20um9t000mmmcs8wc3qpj3"],
  },
  "DUP-UNIVERSAL-DESIGN-DOCUMENT": {
    basis: "Jaccard 임계값 아래지만 정의→건축→교통→패션으로 연속되는 동일 문서 계열",
    keep: "cmpnzxhf000ebmmykkcjht729",
    manualSemanticFamily: true,
    members: ["cmpnzxhf000ebmmykkcjht729", "cmpnzw5sd00d9mmykdtoiyyb9", "cmpchv9xq0003ky0484e1e7y4", "cmpnzw9ay00dbmmykw8e1lclh"],
  },
  "DUP-GESTURE-THOUGHT": {
    basis: "동일 gestural foreshadowing 원문의 오염본·정상본·문장순서 변형본",
    keep: "cmpcjkklg0007mmekwcm6abax",
    members: ["cmqespvyu001cmm1wqpn5spu6", "cmpcjkklg0007mmekwcm6abax", "cmpv7gfl00001mmbc0u8d49ep"],
  },
  "DUP-SPICE-EVOLUTION": {
    basis: "동일 향신료 항균·기후 가설의 관사/전치사 변형본",
    keep: "cmpx1dv0o0001l404hw03gfmr",
    members: ["cmpx1dv0o0001l404hw03gfmr", "cmpr52qe10003k40442ys37jt", "cmpaqf99o000dl204pyve3pdv"],
  },
  "DUP-SHARED-FOOD": {
    basis: "동일 shared taste 원문의 삽입 교란문 변형과 정상본이 dev/holdout에 걸침",
    keep: null,
    members: ["cmpaqf9e5000zl2049ba7eosv", "cmpaqf96q0001l204lnt7f5y9"],
  },
  "DUP-BODY-DEVELOPMENT": {
    basis: "동일 random variation/nonrandom selection 지문의 논리 변형본",
    keep: "cmpqvdzht0001mmu80piqom02",
    members: ["cmpaqf9ey0013l204nnoouqbe", "cmpqvdzht0001mmu80piqom02", "cmpaqf9a4000fl2042odbrdj0"],
  },
  "DUP-WATER-POLICY": {
    basis: "동일 perfect-vs-good 정책 지문의 clean water 문장부호 변형본",
    keep: "cmpczyrsu000emmfkzbyivz87",
    members: ["cmpczyrsu000emmfkzbyivz87", "cmpaqf97v0005l204xjjvssdr"],
  },
  "DUP-MEMORY-RECALL": {
    basis: "동일 recall/recognition 지문의 정상·번호·선지부착·확장 변형본",
    keep: "cmpr7xftn0013mm3cad44usfx",
    members: ["cmq5hc1u3000fmmsgd1dr5yp5", "cmpr6wbbt0002mm3coikj9suy", "cmpr7xftn0013mm3cad44usfx", "cmpaqf97g0003l204jhi59d8z", "cmq742ju90015mm1gk4pzfggd"],
  },
  "DUP-BAYESIAN-UPDATING": {
    basis: "Bayesian updating 문단의 문장부호만 다른 토큰 동일본",
    keep: "cmpaqf9dr000xl204fygq66tv",
    members: ["cmpaqf9dr000xl204fygq66tv", "cmq5hc0l8000dmmsgr6tozs5b"],
  },
  "DUP-STRESS-HIPPOCAMPUS": {
    basis: "동일 stress/hippocampus/cortisol 설명의 동사 변형본",
    keep: "cmpnwv10r00brmmykiusnyi5u",
    members: ["cmpnwv10r00brmmykiusnyi5u", "cmpaqf997000bl204g2nptcrl"],
  },
  "DUP-DATA-MINING": {
    basis: "동일 data tombs/data mining 지문의 의역·문장부호 변형본",
    keep: "cmpvm7wwx0010mmbcwneeym36",
    members: ["cmpvm7wwx0010mmbcwneeym36", "cmq56mbbc0001mm6cabjbecw8", "cmpaqf9fr0017l204rcz69oyr"],
  },
  "DUP-WINNING-WATCHED": {
    basis: "dev 병합 지문 후반과 holdout 독립본이 동일하며 양쪽 모두 표면 손상",
    keep: null,
    members: ["cmpwuhv4u001nmm1ch5ypzx9f", "cmpaqf9ay000jl204pew667f2"],
  },
  "DUP-FRUIT-BRAIN": {
    basis: "동일 fruit/brain-volume 지문의 절단·선지부착본과 정상본",
    keep: "cmpaqf9aj000hl20466bzeiga",
    members: ["cmq5c5cip001lmmrwty0eg9zg", "cmpaqf9aj000hl20466bzeiga"],
  },
  "DUP-REASON-EMOTION": {
    basis: "동일 reason/emotion 지문 뒤에 선지들이 붙은 두 오염본",
    keep: null,
    members: ["cmq50ifrc003ummm8xv9ppk4g", "cmq5gpplq0001mmsg2fi1puqg"],
  },
  "DUP-SHARING-ECONOMY": {
    basis: "동일 sharing-economy 지문의 문항 스캐폴드 두 본과 정제 본",
    keep: "cmqb48s000001l70497mch8x0",
    members: ["cmq23op900017mmcsgdlfr18c", "cmq20ulw9000kmmcsd6rn4vv1", "cmqb48s000001l70497mch8x0"],
  },
};

const clusterById = new Map();
for (const [clusterId, cluster] of Object.entries(duplicateClusters)) {
  for (const id of cluster.members) {
    if (clusterById.has(id)) throw new Error(`duplicate cluster membership collision: ${id}`);
    clusterById.set(id, {
      clusterId,
      disposition: cluster.keep === id ? "KEEP" : "DROP",
      basis: cluster.basis,
      manualSemanticFamily: cluster.manualSemanticFamily === true,
    });
  }
}

const rationaleOverride = {
  "repo:2006_SN_3000977-q44": "대시 뒤가 독립절 없는 수사적 단편이고 집단명도 현재 사용 기준에 민감하다. 중심 논리는 읽히지만 깨끗한 생성 원문 요건에는 미달하므로 제외한다.",
  "repo:2012_SN_3001002-q34": "생리적 항상성에서 습관·사고·삶의 질의 고정성으로 곧바로 확장하는 인과가 강하다. 표면과 중심성은 양호하나 과학적 범위 확인 전에는 투입하지 않는다.",
  "repo:2011_SN_3000996-q45": "‘the primitive society/man’이 다양한 사회를 단일 범주로 일반화하고 표현도 시대 의존적이다. 구조는 풍부하므로 문화·인류학 검토 대상으로 남긴다.",
  "repo:ebsi_go2_20091117-q37": "여러 안경원숭이 종을 소개한 뒤 전 종의 임박한 멸종처럼 단정하고 눈·뇌 비교도 확인이 필요하다. 논리는 온전하지만 생물학 검토 전에는 보류한다.",
  "repo:2024_09_5085155-q40": "‘had strongly held the strict academic standards’의 결합 오류와 두 독립절의 comma splice가 원문에 이미 있다. 생성기가 새 오류를 하나만 설계해야 하는 실험 원문으로는 제외한다.",
  "repo:ebsi_go2_20190307-q25": "1882년 출생·1974년 사망과 ‘age eighty-two’가 산술적으로 모순된다. 전기문 전체의 사실 기반을 훼손하므로 제외한다.",
  "repo:2021_SN_5061633-q22": "발매 전 음원을 뜻하는 자리의 ‘advanced releases’는 ‘advance releases’가 맞다. 기존 어휘 오류가 정답 수와 설명을 오염시키므로 제외한다.",
  "repo:2021_SN_5061633-q40": "Amazonia의 정치 리더십·통제·여성 지배를 넓게 일반화한다. 논증과 표면은 좋지만 문화인류학 확인 전에는 보류한다.",
  "cmqanec030005ic04e2e7rryn": "숫자 미신 원문 군집에서 표면이 가장 온전한 dev 본을 남긴다. 다만 astrology를 science/nature의 근거처럼 묶고 ‘Norwegian mythology’·13의 보편성을 단정해 문화사 검토가 필요하다.",
  "cmqkuogfd0001jd0b65526r18": "동일 숫자 미신 원문의 중복본이며 ‘have basis’ 관사 누락도 있다. 군집 대표본을 별도로 남겼으므로 제외한다.",
  "cmpnzxhf000ebmmykkcjht729": "건축의 경사로·자동문·점자블록이 접근성이라는 단일 개념을 지지한다. 동일 universal-design 문서 계열에서는 이 dev 단락 하나만 대표로 유지한다.",
  "cmpx1dv0o0001l404hw03gfmr": "향신료 군집에서 관사와 문장 표면이 가장 온전한 dev 본이다. 항균 상관을 진화적 생존 기원으로 확대하는 주장은 전문 확인 전까지 DOMAIN_REVIEW로 둔다.",
  "cmq272tkj001qmmcsvh7zb296": "Eric의 Norway 추방 사유가 부친 이력과 혼동됐을 가능성과 Greenland plague 서술을 직접 확인해야 한다. 시간 흐름은 온전하므로 역사 검토 대상으로 둔다.",
  "cmpaqf9e5000zl2049ba7eosv": "공유된 미각이 평화를 만든다는 흐름에 논거로 통합되지 않는 반대 문장이 삽입돼 바로 뒤 결론과 충돌한다. holdout 정상본과도 겹쳐 양쪽 모두 제외한다.",
  "cmpr52qe10003k40442ys37jt": "동일 향신료 지문의 중복본이고 ‘has evolutionary root’에 관사가 빠졌다. 대표 dev 본 외에는 제외한다.",
  "cmpaqf9ey0013l204nnoouqbe": "‘selection favors some cells and preserves others’가 뒤의 제거 논리와 어긋나며 정상 교정본과 중복된다. 교정된 dev 대표본만 유지한다.",
  "cmqjjnqp6000wkz04f6gbsna2": "무의식적 위험 감지에서 ‘most human decisions’가 감정적으로 결정된다는 전면적 일반화로 확장한다. 표면은 양호하나 심리학적 범위 검토 전에는 보류한다.",
  "cmpnzw5sd00d9mmykdtoiyyb9": "교통 단락 자체는 온전하지만 건축·정의·패션 단락과 한 문서의 연속 계열이다. 표본 독립성을 위해 dev에서는 건축 대표본만 남기고 제외한다.",
  "cmpaqf9dr000xl204fygq66tv": "동일 Bayesian 문단 중 한 dev 본만 보존한다. Bayesian updating을 경쟁 변형의 반복 시험으로 축약한 설명은 통계 검토 전에는 사용하지 않는다.",
  "cmpqvdzht0001mmu80piqom02": "같은 신체 발달 군집 중 ‘eliminates others’로 선택 논리가 일관된 dev 본이다. cross-split 및 결함 변형본은 제거하고 이 대표본만 유지한다.",
  "cmq5hc0l8000dmmsgr6tozs5b": "Bayesian 문단이 dev 대표본과 토큰 수준에서 사실상 동일하다. 사실 검토 여부와 무관하게 독립 표본이 아니므로 제외한다.",
  "repo:2027_06_5095396-q20": "‘If participants understand ..., it enables them’의 it은 명확한 선행사가 없고 ‘improves their performances’도 수 용법이 불안정하다. frozen holdout에는 기존 오류가 없는 원문만 남기므로 제외한다.",
  "repo:ebsi_go3_20251014-q23": "introductory 전치사구 뒤 주어 앞 쉼표가 없어 ‘redevelopment towns’로 잘못 결합되고 문장 골격이 흔들린다. holdout 표면 무결성 기준으로 제외한다.",
  "repo:2005_09_3001156-q48-49-50": "‘log in details’는 이 문맥에서 타동사 ‘log details’가 맞다. 기존 결합 오류가 있는 holdout은 문항 생성의 정답 유일성을 해칠 수 있어 제외한다.",
  "repo:ebsi_go2_20201118-q21": "Newton의 연금술을 ‘failed laws’ 및 단순한 납→금 시도로 묶는 서술은 과학사적 왜곡 소지가 있다. 중심 논리는 좋으나 역사 검토 전까지 보류한다.",
  "repo:ebsi_go2_20210831-q24": "Wheatfield의 면적·수확량·기부 경로와 ‘return ... back’ 표현을 확인해야 한다. 서사는 온전하지만 미술사 사실 검토 전에는 사용하지 않는다.",
  "repo:ebsi_go3_20241015-q20": "유아 음악 연습이 열거된 역량을 모두 발달시키며 최우선 개입이라는 인과는 연구 범위를 넘을 수 있다. 교육·발달 전문가 확인 전에는 보류한다.",
  "repo:ebsi_go1_20130903-q40": "복리 예시의 은퇴 시점·복리 주기가 생략돼 숫자를 독립 검증하기 어렵다. 논지는 온전하지만 금융 수치 확인 전에는 보류한다.",
  "cmq2capq3000ammm8iftgy9tp": "dev 숫자 미신 대표본과 거의 동일해 holdout 독립성이 없다. holdout은 더 보수적으로 제거한다.",
  "cmpaqf99o000dl204pyve3pdv": "dev 향신료 대표본과 사실상 동일한 cross-split 변형이다. 전문 사실 여부와 별개로 frozen holdout 누출을 막기 위해 제외한다.",
  "cmq272sfm001kmmcsay23lmyc": "‘doing it all perfect’는 부사 ‘perfectly’가 필요한 기존 문법 오류다. holdout에서 생성기가 만든 오류와 경쟁할 수 있으므로 제외한다.",
  "cmpaqf9ay000jl204pew667f2": "대시 두 곳이 유실돼 삽입구와 주절 경계가 깨지고, dev 병합 레코드 후반과 같은 텍스트다. 표면·독립성 모두 미달해 제외한다.",
  "cmpaqf96q0001l204lnt7f5y9": "문단 자체는 깨끗하지만 dev의 삽입 교란 변형과 같은 원문이어서 튜닝/검수 노출 가능성이 있다. 보수적 holdout 원칙에 따라 양쪽 모두 제외한다.",
  "cmq56mbbc0001mm6cabjbecw8": "dev 데이터 마이닝 대표본의 강한 의역 준중복이다. frozen holdout의 독립 표본으로 인정하지 않는다.",
  "cmpaqf97g0003l204jhi59d8z": "dev recall/recognition 대표본과 토큰열이 동일하고 대시도 하이픈으로 손상됐다. holdout에서 제외한다.",
  "cmpaqf9a4000fl2042odbrdj0": "dev 신체 발달 대표본과 거의 동일하다. 문장 자체는 온전하지만 cross-split 누출 때문에 제외한다.",
  "cmq272t6z001ommcsbneh6fby": "1875년 ping을 전기로 전송된 ‘최초의 sound’로 단정하는 표현은 전신 역사와 범주 정의를 확인해야 한다. 표면은 온전하므로 역사 검토 대상으로 둔다.",
  "cmpaqf9fr0017l204rcz69oyr": "다른 data-mining 본과 중복되고 ‘data tombs’ 뒤 대시/쉼표가 유실됐다. holdout 독립성과 표면 무결성 모두 미달한다.",
  "cmpaqf997000bl204g2nptcrl": "dev 스트레스·해마 문단의 준중복이며 신경내분비 인과도 검토 대상이다. holdout에서는 중복을 우선 사유로 제외한다.",
  "cmpchv9xq0003ky0484e1e7y4": "정의→건축→교통→패션으로 이어지는 universal-design 동일 문서 계열이 dev에 이미 있다. Jaccard가 낮아도 frozen holdout의 문서 단위 누출로 보고 제외한다.",
  "cmpnzw9ay00dbmmykw8e1lclh": "universal-design 동일 문서의 후속 패션 단락이며 앞선 건축·교통 내용을 직접 참조한다. holdout 독립성을 위해 제외한다.",
  "cmqg66544000emm60nvhh17iu": "손필기만의 neural network 활성과 디지털 전환의 숨은 인지 비용을 강하게 인과화한다. 표면·중심성은 좋지만 교육·신경과학 검토 전에는 보류한다.",
  "cmpv7gfl00001mmbc0u8d49ep": "dev gesture 대표본과 거의 동일하고 일부 문장 순서만 바뀌었다. cross-split 독립성이 없으므로 제외한다.",
  "cmqfkcut40032mmzcjq5riqxl": "측정오차와 공간 대표성·표본오차를 섞고 평균이 국소 조건을 ‘neutralize’한다고 단정한다. 통계적 개념 확인 전에는 보류한다.",
};

const extraIssueCodes = {
  "repo:2024_09_5085155-q40": ["SOURCE_GRAMMAR_ERROR", "PUNCTUATION_COMMA_SPLICE"],
  "repo:2021_SN_5061633-q22": ["SOURCE_LEXICAL_ERROR"],
  "repo:2027_06_5095396-q20": ["SOURCE_REFERENT_ERROR", "SOURCE_NUMBER_USAGE"],
  "repo:ebsi_go3_20251014-q23": ["PUNCTUATION_CORRUPTION"],
  "repo:2005_09_3001156-q48-49-50": ["SOURCE_LEXICAL_ERROR"],
  "cmq272sfm001kmmcsay23lmyc": ["SOURCE_GRAMMAR_ERROR"],
  "cmpnzw5sd00d9mmykdtoiyyb9": ["DOCUMENT_FAMILY_DUPLICATE"],
  "cmpaqf96q0001l204lnt7f5y9": ["CROSS_SPLIT_DOCUMENT_LEAK"],
  "cmpchv9xq0003ky0484e1e7y4": ["CROSS_SPLIT_DOCUMENT_FAMILY"],
  "cmpnzw9ay00dbmmykw8e1lclh": ["CROSS_SPLIT_DOCUMENT_FAMILY"],
};

const allPrivate = [
  ...privateManifest.splits.dev.map((record, index) => ({ ...record, split: "dev", sequence: index + 1 })),
  ...privateManifest.splits.holdout.map((record, index) => ({ ...record, split: "holdout", sequence: index + 1 })),
];
const allPublic = [
  ...publicManifest.splits.dev.map((record, index) => ({ ...record, split: "dev", sequence: index + 1 })),
  ...publicManifest.splits.holdout.map((record, index) => ({ ...record, split: "holdout", sequence: index + 1 })),
];
const byId = (records, label) => {
  const map = new Map();
  for (const record of records) {
    if (map.has(record.id)) throw new Error(`${label} duplicate id: ${record.id}`);
    map.set(record.id, record);
  }
  return map;
};
const publicById = byId(allPublic, "public");
const r1ById = byId(rater1.records, "rater-1");
const r2ById = byId(rater2.records, "rater-2");

const signalByPair = new Map();
for (const signal of rater2.duplicateSignals) {
  const key = [signal.left.id, signal.right.id].sort().join("|");
  signalByPair.set(key, signal.tokenFiveGramJaccard);
}
const maxClusterJaccard = (id, clusterId) => {
  const cluster = duplicateClusters[clusterId];
  const scores = cluster.members
    .filter((other) => other !== id)
    .map((other) => signalByPair.get([id, other].sort().join("|")))
    .filter((score) => score !== undefined);
  return scores.length ? Math.max(...scores) : null;
};

const integrityErrors = [];
if (allPrivate.length !== 120) integrityErrors.push(`private count ${allPrivate.length}`);
if (allPublic.length !== 120) integrityErrors.push(`public count ${allPublic.length}`);
if (rater1.records.length !== 120) integrityErrors.push(`rater-1 count ${rater1.records.length}`);
if (rater2.records.length !== 120) integrityErrors.push(`rater-2 count ${rater2.records.length}`);

for (const split of ["dev", "holdout"]) {
  for (const [label, values] of Object.entries({
    status: finalStatusBySplit[split],
    grammar: finalGrammarBySplit[split],
    blank: finalBlankBySplit[split],
  })) {
    if (values.length !== 60) integrityErrors.push(`${split} ${label} decisions ${values.length}`);
  }
}

const records = allPrivate.map((record) => {
  const publicRecord = publicById.get(record.id);
  const one = r1ById.get(record.id);
  const two = r2ById.get(record.id);
  if (!publicRecord || !one || !two) {
    integrityErrors.push(`missing linked record ${record.id}`);
    return null;
  }
  const recomputedHash = sha256(normalizeContent(record.content));
  for (const [label, candidate] of [["private", record], ["public", publicRecord], ["rater-1", one], ["rater-2", two]]) {
    if (candidate.contentHash !== record.contentHash) integrityErrors.push(`${label} hash mismatch ${record.id}`);
    if (candidate.split !== record.split) integrityErrors.push(`${label} split mismatch ${record.id}`);
  }
  if (recomputedHash !== record.contentHash) integrityErrors.push(`recomputed content hash mismatch ${record.id}`);
  if (publicRecord.sequence !== undefined && publicRecord.sequence !== record.sequence) integrityErrors.push(`public sequence mismatch ${record.id}`);
  if (two.sequence !== record.sequence) integrityErrors.push(`rater-2 sequence mismatch ${record.id}`);

  const cluster = clusterById.get(record.id) ?? null;
  const finalDecision = finalStatusBySplit[record.split][record.sequence - 1];
  const grammarRichness = finalGrammarBySplit[record.split][record.sequence - 1];
  const blankSuitability = finalBlankBySplit[record.split][record.sequence - 1];
  const issueCodes = [...new Set([
    ...(one.issueCodes ?? []),
    ...(two.issueCodes ?? []),
    ...(extraIssueCodes[record.id] ?? []),
    ...(cluster && cluster.disposition === "DROP" ? [cluster.clusterId.startsWith("DUP-") ? "DUPLICATE_OR_DOCUMENT_LEAK" : "DUPLICATE"] : []),
  ])].sort();
  const rationale = rationaleOverride[record.id]
    ?? `원문을 직접 재검토해 두 평가자의 공통 판정을 확인했다. ${one.rationale}`;

  return {
    sequence: record.sequence,
    id: record.id,
    contentHash: record.contentHash,
    split: record.split,
    origin: record.origin,
    rater1: {
      status: one.status,
      grammarRichness: one.grammarSuitabilityHuman,
      blankSuitability: one.blankSuitabilityHuman,
      issueCodes: one.issueCodes,
    },
    rater2: {
      status: two.status,
      grammarRichness: two.grammarRichness,
      blankSuitability: two.blankSuitability,
      issueCodes: two.issueCodes,
    },
    finalDecision,
    grammarRichness,
    blankSuitability,
    issueCodes,
    rationale,
    duplicateCluster: cluster ? {
      id: cluster.clusterId,
      disposition: cluster.disposition,
      basis: cluster.basis,
      maxObservedTokenFiveGramJaccard: maxClusterJaccard(record.id, cluster.clusterId),
      manualSemanticFamily: cluster.manualSemanticFamily,
    } : null,
    keepOrDrop: cluster?.disposition ?? "NOT_CLUSTERED",
  };
}).filter(Boolean);

const countBy = (items, key) => Object.fromEntries([...new Set(items.map((item) => item[key]))]
  .sort()
  .map((value) => [value, items.filter((item) => item[key] === value).length]));
const bySplitSummary = {};
for (const split of ["dev", "holdout"]) {
  const items = records.filter((record) => record.split === split);
  const status = countBy(items, "finalDecision");
  const origin = {};
  for (const originName of [...new Set(items.map((item) => item.origin))].sort()) {
    const originItems = items.filter((item) => item.origin === originName);
    origin[originName] = {
      total: originItems.length,
      status: countBy(originItems, "finalDecision"),
      replacementsForCertifiedPass: originItems.filter((item) => item.finalDecision !== P).length,
    };
  }
  bySplitSummary[split] = {
    total: items.length,
    status,
    grammarRichness: countBy(items, "grammarRichness"),
    blankSuitability: countBy(items, "blankSuitability"),
    origin,
    replacementsRequired: {
      forSixtyCertifiedPassages: items.filter((item) => item.finalDecision !== P).length,
      ifAllDomainReviewsAreLaterCleared: items.filter((item) => item.finalDecision === E).length,
    },
  };
}

const holdout = records.filter((record) => record.split === "holdout");
const focusHoldoutEligibility = {
  policy: {
    grammar: "finalDecision=PASS and grammarRichness=rich",
    blank: "finalDecision=PASS and blankSuitability=central",
    jointGrammarBlank: "finalDecision=PASS, grammarRichness=rich, blankSuitability=central",
    domainReviewTreatment: "DOMAIN_REVIEW is ineligible until independently cleared",
  },
  grammar: holdout.filter((item) => item.finalDecision === P && item.grammarRichness === "rich").length,
  blank: holdout.filter((item) => item.finalDecision === P && item.blankSuitability === "central").length,
  jointGrammarBlank: holdout.filter((item) => item.finalDecision === P && item.grammarRichness === "rich" && item.blankSuitability === "central").length,
  byOrigin: Object.fromEntries([...new Set(holdout.map((item) => item.origin))].sort().map((originName) => {
    const items = holdout.filter((item) => item.origin === originName);
    return [originName, {
      grammar: items.filter((item) => item.finalDecision === P && item.grammarRichness === "rich").length,
      blank: items.filter((item) => item.finalDecision === P && item.blankSuitability === "central").length,
      jointGrammarBlank: items.filter((item) => item.finalDecision === P && item.grammarRichness === "rich" && item.blankSuitability === "central").length,
    }];
  })),
};

const clusterSummaries = Object.entries(duplicateClusters).map(([id, cluster]) => ({
  id,
  basis: cluster.basis,
  keep: cluster.keep,
  memberCount: cluster.members.length,
  members: cluster.members,
  manualSemanticFamily: cluster.manualSemanticFamily === true,
  crossSplit: new Set(cluster.members.map((member) => records.find((record) => record.id === member)?.split)).size > 1,
}));

const output = {
  schemaVersion: 1,
  adjudicator: "fresh-eyes-corpus-adjudicator",
  adjudicatedOn: "2026-07-15",
  scope: {
    recordCount: records.length,
    reviewedSplits: ["dev", "holdout"],
    sourcesUsed: [
      "corpus/private/manifest-private.json",
      "corpus/manifest-public.json",
      "reviews/corpus/rater-1.json",
      "reviews/corpus/rater-2.json",
    ],
    sourcesDeliberatelyNotUsed: ["research-note.md", "experiment result files"],
    externalCalls: 0,
    databaseWrites: 0,
    productionCodeChanges: 0,
  },
  decisionPolicy: {
    pass: "표면·논리·출처가 깨끗하고 독립 표본으로 즉시 사용 가능",
    exclude: "질문/선지 잔존, 병합, OCR·문법·문장부호·논리 손상, 또는 중복/holdout 누출",
    domainReview: "표면·논리 구조는 사용 가능하지만 사실·문화·의학·정책 검토 전에는 투입 금지",
    duplicatePolicy: "5-token Jaccard는 신호로만 사용하고 원문을 cluster 단위로 판정했다. holdout은 cross-split 문서 계열도 보수적으로 제외했다.",
  },
  integrity: {
    privateManifestRecordCount: allPrivate.length,
    publicManifestRecordCount: allPublic.length,
    rater1RecordCount: rater1.records.length,
    rater2RecordCount: rater2.records.length,
    uniqueIds: new Set(records.map((record) => record.id)).size,
    uniqueContentHashes: new Set(records.map((record) => record.contentHash)).size,
    recomputedPublicManifestSha256: sha256(stableStringify(publicManifest)),
    storedPublicManifestSha256: privateManifest.publicManifestSha256,
    tokenFiveGramSignalsReviewed: rater2.duplicateSignals.length,
    manualSemanticClusterCount: clusterSummaries.filter((cluster) => cluster.manualSemanticFamily).length,
    errors: integrityErrors,
    passed: integrityErrors.length === 0,
  },
  aggregate: {
    total: records.length,
    status: countBy(records, "finalDecision"),
    grammarRichness: countBy(records, "grammarRichness"),
    blankSuitability: countBy(records, "blankSuitability"),
    bySplit: bySplitSummary,
    focusHoldoutEligibility,
    duplicateClusters: {
      count: clusterSummaries.length,
      memberRecords: records.filter((record) => record.duplicateCluster).length,
      keptRepresentatives: records.filter((record) => record.keepOrDrop === "KEEP").length,
      droppedMembers: records.filter((record) => record.keepOrDrop === "DROP").length,
    },
  },
  duplicateClusters: clusterSummaries,
  records,
};

if (output.integrity.recomputedPublicManifestSha256 !== output.integrity.storedPublicManifestSha256) {
  integrityErrors.push("public manifest SHA-256 mismatch");
}
if (records.length !== 120) integrityErrors.push(`output record count ${records.length}`);
if (new Set(records.map((record) => record.id)).size !== 120) integrityErrors.push("output IDs are not unique");
if (new Set(records.map((record) => `${record.split}:${record.sequence}`)).size !== 120) integrityErrors.push("split/sequence keys are not unique");
output.integrity.passed = integrityErrors.length === 0;
if (!output.integrity.passed) throw new Error(`adjudication integrity failed:\n${integrityErrors.join("\n")}`);

fs.writeFileSync(outputPath, stableStringify(output), "utf8");
console.log(JSON.stringify({
  outputPath,
  recordCount: records.length,
  aggregate: output.aggregate,
  integrity: output.integrity,
}, null, 2));
