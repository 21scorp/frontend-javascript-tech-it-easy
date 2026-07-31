#!/usr/bin/env bash
# WISP release check: syntax, data sanity, packaging. No browser needed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── syntax"
for f in js/*.js sw.js; do node --check "$f"; done
echo "   ok ($(ls js/*.js sw.js | wc -l) files)"

echo "── data sanity"
node - << 'EOF'
const fs = require("fs");
const vm = require("vm");
const ctx = vm.createContext({ Date, Math, JSON, Object, Array, Number, String, isFinite, console });
ctx.window = ctx;
for (const f of ["js/util.js", "js/config.js", "js/state.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}
const C = ctx.W.config;
const problems = [];

// building costs and rates must both strictly increase
for (let i = 1; i < C.BUILDINGS.length; i++) {
  if (C.BUILDINGS[i].baseCost <= C.BUILDINGS[i - 1].baseCost) problems.push("cost order: " + C.BUILDINGS[i].id);
  if (C.BUILDINGS[i].rate <= C.BUILDINGS[i - 1].rate) problems.push("rate order: " + C.BUILDINGS[i].id);
}
// stage levels strictly increase
for (let i = 1; i < C.STAGES.length; i++) {
  if (C.STAGES[i].level <= C.STAGES[i - 1].level) problems.push("stage order: " + C.STAGES[i].name);
}
// unique ids everywhere
for (const [name, list] of [["buildings", C.BUILDINGS], ["upgrades", C.UPGRADES], ["achievements", C.ACHIEVEMENTS], ["accessories", C.ACCESSORIES]]) {
  const ids = list.map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate ids in " + name);
}
// upgrade targets and needs must reference real buildings
for (const u of C.UPGRADES) {
  if (u.target && !C.BUILDINGS.some((b) => b.id === u.target)) problems.push("bad target: " + u.id);
  if (u.needs && !C.BUILDINGS.some((b) => b.id === u.needs[0])) problems.push("bad needs: " + u.id);
}
// every achievement check must run without throwing on a fresh state
const S = ctx.W.state.S;
const helpers = { totalBuildings: () => 0 };
for (const a of C.ACHIEVEMENTS) {
  try { a.check(S, helpers); } catch (e) { problems.push("achievement throws: " + a.id); }
}
if (problems.length) { console.error("   PROBLEMS:\n   " + problems.join("\n   ")); process.exit(1); }
console.log("   ok (" + C.BUILDINGS.length + " buildings, " + C.UPGRADES.length + " boosts, " +
  C.ACHIEVEMENTS.length + " memories, " + C.TALES.length + " tales)");
EOF

echo "── package"
./scripts/package.sh
echo "── all good"
