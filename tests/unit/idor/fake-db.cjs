// 가짜 Prisma(메모리) — 학원 범위(IDOR) 단위 테스트 전용. 운영 DB 무접촉.
// 실제 서버 액션·라우트 코드를 그대로 돌리고, where 절(스칼라·관계 필터)을 Prisma 의미대로
// 평가해 「남의 학원 행이 읽히거나 바뀌는지」를 본다. 테스트가 쓰는 연산만 구현한다:
// findMany/findFirst/findUnique/count/create/createMany/update/updateMany/delete/deleteMany/upsert,
// $transaction(배열·함수 — 함수형은 예외 시 되돌림), $queryRaw(passages … FOR UPDATE 잠금 흉내).
"use strict";

const RELATIONS = {
  passage: {
    questions: { model: "question", type: "many", fk: "passageId" },
    analysis: { model: "passageAnalysis", type: "one", fk: "passageId", reverse: true },
    notes: { model: "passageNote", type: "many", fk: "passageId" },
    collectionItems: { model: "passageCollectionItem", type: "many", fk: "passageId" },
    school: { model: "school", type: "one", local: "schoolId" },
  },
  passageAnalysis: { passage: { model: "passage", type: "one", local: "passageId" } },
  passageNote: { passage: { model: "passage", type: "one", local: "passageId" } },
  passageCollection: {
    items: { model: "passageCollectionItem", type: "many", fk: "collectionId" },
    children: { model: "passageCollection", type: "many", fk: "parentId" },
    parent: { model: "passageCollection", type: "one", local: "parentId" },
  },
  passageCollectionItem: {
    collection: { model: "passageCollection", type: "one", local: "collectionId" },
    passage: { model: "passage", type: "one", local: "passageId" },
  },
  question: {
    passage: { model: "passage", type: "one", local: "passageId" },
    explanation: { model: "questionExplanation", type: "one", fk: "questionId", reverse: true },
    examLinks: { model: "examQuestion", type: "many", fk: "questionId" },
    setItem: { model: "questionSetItem", type: "one", fk: "questionId", reverse: true },
  },
  questionExplanation: { question: { model: "question", type: "one", local: "questionId" } },
  questionCollection: {
    items: { model: "questionCollectionItem", type: "many", fk: "collectionId" },
    children: { model: "questionCollection", type: "many", fk: "parentId" },
  },
  questionCollectionItem: {
    collection: { model: "questionCollection", type: "one", local: "collectionId" },
    question: { model: "question", type: "one", local: "questionId" },
  },
  m1PassageDraftCollection: {
    items: { model: "m1PassageDraftCollectionItem", type: "many", fk: "collectionId" },
    children: { model: "m1PassageDraftCollection", type: "many", fk: "parentId" },
  },
  exam: {
    questions: { model: "examQuestion", type: "many", fk: "examId" },
    submissions: { model: "examSubmission", type: "many", fk: "examId" },
    class: { model: "class", type: "one", local: "classId" },
  },
  examQuestion: {
    exam: { model: "exam", type: "one", local: "examId" },
    question: { model: "question", type: "one", local: "questionId" },
  },
  examSubmission: {
    exam: { model: "exam", type: "one", local: "examId" },
    student: { model: "student", type: "one", local: "studentId" },
  },
  naeshinQuestion: {
    passage: { model: "passage", type: "one", local: "passageId" },
    explanation: { model: "naeshinExplanation", type: "one", fk: "questionId", reverse: true },
  },
  naeshinWrongAnswerLog: { question: { model: "naeshinQuestion", type: "one", local: "questionId" } },
  extractionM1PassageDraft: { job: { model: "extractionJob", type: "one", local: "jobId" } },
  class: { enrollments: { model: "classEnrollment", type: "many", fk: "classId" } },
};

class PrismaNotFound extends Error {
  constructor(model) {
    super(`No record found for ${model}`);
    this.code = "P2025";
  }
}

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const same = (a, b) =>
  a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;

class FakeDb {
  constructor(seed) {
    this.tables = clone(seed);
    this.seq = 0;
    this.raw = [];
    this.calls = [];
    this.onQueryRaw = null;
    this.__proxy = null;
    return new Proxy(this, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key !== "string") return undefined;
        return target.model(key);
      },
    });
  }

  rows(model) {
    if (!this.tables[model]) this.tables[model] = [];
    return this.tables[model];
  }

  relOne(model, row, name) {
    const rel = RELATIONS[model]?.[name];
    if (rel.local) return this.rows(rel.model).find((r) => r.id === row[rel.local]) ?? null;
    return this.rows(rel.model).find((r) => r[rel.fk] === row.id) ?? null;
  }

  relMany(model, row, name) {
    const rel = RELATIONS[model]?.[name];
    return this.rows(rel.model).filter((r) => r[rel.fk] === row.id);
  }

  matchScalar(value, cond) {
    if (cond === null || !isObj(cond)) return same(value ?? null, cond);
    for (const [op, arg] of Object.entries(cond)) {
      if (arg === undefined) continue;
      switch (op) {
        case "equals": if (!same(value ?? null, arg)) return false; break;
        case "in": if (!arg.some((a) => same(value, a))) return false; break;
        case "notIn": if (arg.some((a) => same(value, a))) return false; break;
        case "not":
          if (arg === null || !isObj(arg)) { if (same(value ?? null, arg)) return false; }
          else if (this.matchScalar(value, arg)) return false;
          break;
        case "contains": if (typeof value !== "string" || !value.includes(arg)) return false; break;
        case "startsWith": if (typeof value !== "string" || !value.startsWith(arg)) return false; break;
        case "gt": if (!(value > arg)) return false; break;
        case "gte": if (!(value >= arg)) return false; break;
        case "lt": if (!(value < arg)) return false; break;
        case "lte": if (!(value <= arg)) return false; break;
        case "mode": break;
        default: throw new Error(`fake-db: unsupported operator ${op}`);
      }
    }
    return true;
  }

  match(model, row, where) {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === "AND") { if (![].concat(cond).every((w) => this.match(model, row, w))) return false; continue; }
      if (key === "OR") { if (!cond.some((w) => this.match(model, row, w))) return false; continue; }
      if (key === "NOT") { if ([].concat(cond).some((w) => this.match(model, row, w))) return false; continue; }
      const rel = RELATIONS[model]?.[key];
      if (rel && rel.type === "one") {
        const target = this.relOne(model, row, key);
        if (cond === null) { if (target) return false; continue; }
        if ("is" in cond || "isNot" in cond) {
          if ("is" in cond) {
            if (cond.is === null ? target !== null : !(target && this.match(rel.model, target, cond.is))) return false;
          }
          if ("isNot" in cond) {
            if (cond.isNot === null ? target === null : target && this.match(rel.model, target, cond.isNot)) return false;
          }
          continue;
        }
        if (!target || !this.match(rel.model, target, cond)) return false;
        continue;
      }
      if (rel && rel.type === "many") {
        const targets = this.relMany(model, row, key);
        if (cond.some && !targets.some((t) => this.match(rel.model, t, cond.some))) return false;
        if (cond.none && targets.some((t) => this.match(rel.model, t, cond.none))) return false;
        if (cond.every && !targets.every((t) => this.match(rel.model, t, cond.every))) return false;
        continue;
      }
      if (!(key in row) && isObj(cond) && Object.keys(cond).every((k) => k in row)) {
        // 복합 유니크(passageId_category_sessionSeq 등)
        if (!Object.entries(cond).every(([k, v]) => same(row[k], v))) return false;
        continue;
      }
      if (!this.matchScalar(row[key], cond)) return false;
    }
    return true;
  }

  project(model, row, args) {
    const out = { ...row };
    const spec = { ...(args?.select ?? {}), ...(args?.include ?? {}) };
    for (const [key, val] of Object.entries(spec)) {
      if (!val) continue;
      if (key === "_count") {
        const counts = {};
        for (const [relName, relSpec] of Object.entries(val.select ?? {})) {
          const rel = RELATIONS[model]?.[relName];
          if (!rel) { counts[relName] = 0; continue; }
          const many = this.relMany(model, row, relName);
          counts[relName] = many.filter((r) => this.match(rel.model, r, relSpec === true ? null : relSpec.where)).length;
        }
        out._count = counts;
        continue;
      }
      const rel = RELATIONS[model]?.[key];
      if (!rel) continue;
      const sub = val === true ? {} : val;
      if (rel.type === "one") {
        const target = this.relOne(model, row, key);
        out[key] = target ? this.project(rel.model, target, sub) : null;
      } else {
        let many = this.relMany(model, row, key).filter((r) => this.match(rel.model, r, sub.where));
        many = this.sort(many, sub.orderBy);
        out[key] = many.map((r) => this.project(rel.model, r, sub));
      }
    }
    return clone(out);
  }

  sort(list, orderBy) {
    if (!orderBy) return list;
    const keys = [].concat(orderBy).flatMap((o) => Object.entries(o));
    return [...list].sort((a, b) => {
      for (const [k, dir] of keys) {
        if (typeof dir !== "string") continue;
        if (a[k] === b[k]) continue;
        const r = a[k] < b[k] ? -1 : 1;
        return dir === "desc" ? -r : r;
      }
      return 0;
    });
  }

  applyData(row, data) {
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined) continue;
      if (isObj(v) && "increment" in v) row[k] = (row[k] ?? 0) + v.increment;
      else if (isObj(v) && ("create" in v || "connect" in v)) continue;
      else row[k] = clone(v);
    }
    row.updatedAt = new Date("2026-09-30T00:00:00Z");
  }

  newRow(model, data) {
    this.seq += 1;
    const row = { id: `${model}_${this.seq}`, createdAt: new Date("2026-09-30T00:00:00Z") };
    this.applyData(row, data);
    if (data?.id) row.id = data.id;
    // 중첩 create(explanation: { create }) — 단일 관계만
    for (const [k, v] of Object.entries(data ?? {})) {
      const rel = RELATIONS[model]?.[k];
      if (rel && isObj(v) && v.create && rel.fk) {
        this.newRow(rel.model, { ...v.create, [rel.fk]: row.id });
      }
    }
    this.rows(model).push(row);
    return row;
  }

  model(model) {
    const db = this.__proxy ?? this;
    const log = (op, args) => db.calls.push({ model, op, args: clone(args) });
    const find = (args) => db.sort(db.rows(model).filter((r) => db.match(model, r, args?.where)), args?.orderBy);
    return {
      async findMany(args) {
        log("findMany", args);
        let list = find(args);
        if (args?.skip) list = list.slice(args.skip);
        if (args?.take !== undefined) list = list.slice(0, args.take);
        return list.map((r) => db.project(model, r, args));
      },
      async findFirst(args) {
        log("findFirst", args);
        const r = find(args)[0];
        return r ? db.project(model, r, args) : null;
      },
      async findUnique(args) {
        log("findUnique", args);
        const r = find(args)[0];
        return r ? db.project(model, r, args) : null;
      },
      async count(args) {
        log("count", args);
        return find(args).length;
      },
      async create(args) {
        log("create", args);
        return db.project(model, db.newRow(model, args.data), args);
      },
      async createMany(args) {
        log("createMany", args);
        for (const d of [].concat(args.data)) db.newRow(model, d);
        return { count: [].concat(args.data).length };
      },
      async update(args) {
        log("update", args);
        const r = find(args)[0];
        if (!r) throw new PrismaNotFound(model);
        db.applyData(r, args.data);
        return db.project(model, r, args);
      },
      async updateMany(args) {
        log("updateMany", args);
        const list = find(args);
        for (const r of list) db.applyData(r, args.data);
        return { count: list.length };
      },
      async delete(args) {
        log("delete", args);
        const r = find(args)[0];
        if (!r) throw new PrismaNotFound(model);
        db.tables[model] = db.rows(model).filter((x) => x !== r);
        return clone(r);
      },
      async deleteMany(args) {
        log("deleteMany", args);
        const list = find(args);
        db.tables[model] = db.rows(model).filter((x) => !list.includes(x));
        return { count: list.length };
      },
      async upsert(args) {
        log("upsert", args);
        const r = find(args)[0];
        if (r) { db.applyData(r, args.update); return clone(r); }
        return clone(db.newRow(model, args.create));
      },
    };
  }

  async $transaction(arg) {
    if (Array.isArray(arg)) {
      const out = [];
      for (const p of arg) out.push(await p);
      return out;
    }
    const before = clone(this.tables);
    try {
      return await arg(this.__proxy ?? this);
    } catch (e) {
      this.tables = before;
      throw e;
    }
  }

  async $queryRaw(strings, ...values) {
    const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
    this.raw.push({ sql, values });
    if (this.onQueryRaw) {
      const r = await this.onQueryRaw(sql, values, this);
      if (r !== undefined) return r;
    }
    if (/FROM passages/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      const [id, academyId] = values;
      return this.rows("passage").filter((p) => p.id === id && p.academyId === academyId).map((p) => ({ id: p.id }));
    }
    return [];
  }
}

function createFakeDb(seed) {
  const proxy = new FakeDb(seed);
  proxy.__proxy = proxy;
  return proxy;
}

module.exports = { createFakeDb, RELATIONS };
