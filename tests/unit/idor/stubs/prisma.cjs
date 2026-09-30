// 가짜 @/lib/prisma — globalThis.__idorEnv.db(FakeDb)로 위임한다.
"use strict";
const env = () => globalThis.__idorEnv;
exports.prisma = new Proxy({}, { get: (_t, key) => env().db[key] });
