// server-only 가드 우회 shim — 검증 스크립트 전용 (tsx --require 로 주입)
const Module = require("module");
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return orig.apply(this, arguments);
};
