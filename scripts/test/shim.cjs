// next 런타임 밖(tsx)에서 서버 액션을 실행하기 위한 최소 모킹
const Module = require("node:module");
const path = require("node:path");
const orig = Module._resolveFilename;
const stubs = {
  "next/cache": path.join(__dirname, "stub-next-cache.cjs"),
  "server-only": path.join(__dirname, "stub-empty.cjs"),
  "next/navigation": path.join(__dirname, "stub-next-nav.cjs"),
};
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  return orig.call(this, request, ...rest);
};
