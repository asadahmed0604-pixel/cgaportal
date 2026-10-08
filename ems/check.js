/* CGA EMS — quick safety check (no packages needed):  node check.js
   1. Every button / input handler (onclick="…", onchange="…" …) in index.html and parent.html
      must call a function that actually exists. (v52: "Confirm Paid" called a deleted function
      and silently did nothing.)
   2. The app scripts, parent-bot.js and server.js must parse. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BUILTIN = new Set(["if", "for", "while", "switch", "return", "function", "typeof", "new",
  "setTimeout", "clearTimeout", "parseInt", "parseFloat", "String", "Number", "Math", "JSON", "Object",
  "Array", "Date", "Promise", "encodeURIComponent", "decodeURIComponent", "fetch", "alert", "confirm",
  "event", "document", "navigator", "Notification", "isNaN"]);

let failed = 0;
const fail = (msg) => { failed++; console.error("✗ " + msg); };

function checkHtml(file) {
  const html = fs.readFileSync(path.join(__dirname, file), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const code = scripts.join("\n");
  scripts.forEach((s, i) => {
    try { new vm.Script(s, { filename: `${file} <script #${i + 1}>` }); }
    catch (e) { fail(`${file}: script #${i + 1} does not parse — ${e.message}`); }
  });
  const defined = new Set([
    ...[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    ...[...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    ...[...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
  ]);
  const missing = new Map();
  for (const m of html.matchAll(/\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g)) {
    for (const c of m[2].matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = c[1];
      if (!defined.has(name) && !BUILTIN.has(name)) missing.set(name, (missing.get(name) || 0) + 1);
    }
  }
  for (const [name, n] of missing) fail(`${file}: handler calls ${name}() (${n}×) but no such function exists`);
}

function checkJs(file) {
  try { new vm.Script(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file }); }
  catch (e) { fail(`${file} does not parse — ${e.message}`); }
}

checkHtml("index.html");
checkHtml("parent.html");
checkHtml("student.html");
checkJs("parent-bot.js");
checkJs("server.js");
checkJs("assignments.js");
checkJs("ai.js");

if (failed) { console.error(`\n${failed} problem(s) found`); process.exit(1); }
console.log("✓ EMS check passed — all button handlers point to real functions, all scripts parse");
