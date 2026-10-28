// The browser's entry (index2.html): the bench, round 2 and Jolt in one bundle — esbuild:
//   npx esbuild browser-jolt.mjs --bundle --format=esm --outfile=dist/jolt.js --minify --external:'node:*'
export { run } from "./bench.mjs";
export { joltEngine as engine } from "./jolt.mjs";
export * as R2 from "./round2.mjs";
