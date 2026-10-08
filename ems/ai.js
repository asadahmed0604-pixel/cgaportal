/* CGA EMS — v61: Claude se assignment banana, upload kiye paper ko parhna, aur student ka kaam check karna.
   Sab Cambridge (O / A Level, IGCSE) ke andaaz mein. ANTHROPIC_API_KEY na ho to ready() false deta hai. */
"use strict";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
let client = null, loadError = "";
try {
  const Anthropic = require("@anthropic-ai/sdk");
  if (process.env.ANTHROPIC_API_KEY) client = new Anthropic();
  else loadError = "ANTHROPIC_API_KEY is not set on the server.";
} catch (e) {
  loadError = "The @anthropic-ai/sdk package is not installed (run npm install).";
}
const ready = () => !!client;
const whyNot = () => loadError;

/* ---------------------------------- schemas ---------------------------------- */

const QUESTION = {
  type: "object", additionalProperties: false,
  required: ["number", "type", "text", "options", "marks", "mark_scheme", "model_answer"],
  properties: {
    number: { type: "string" },
    type: { type: "string", enum: ["mcq", "short", "structured", "calculation", "essay"] },
    text: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    marks: { type: "integer" },
    mark_scheme: { type: "array", items: { type: "string" } },
    model_answer: { type: "string" },
  },
};
const ASSIGNMENT = {
  type: "object", additionalProperties: false,
  required: ["title", "instructions", "questions"],
  properties: { title: { type: "string" }, instructions: { type: "string" }, questions: { type: "array", items: QUESTION } },
};
const CHECK = {
  type: "object", additionalProperties: false,
  required: ["questions", "overall_feedback", "strengths", "improvements", "needs_teacher_review"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["number", "student_answer", "awarded", "marks_annotation", "points_credited", "examiner_comment"],
        properties: {
          number: { type: "string" },
          student_answer: { type: "string" },
          awarded: { type: "number" },
          marks_annotation: { type: "string" },
          points_credited: { type: "array", items: { type: "string" } },
          examiner_comment: { type: "string" },
        },
      },
    },
    overall_feedback: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    needs_teacher_review: { type: "array", items: { type: "string" } },
  },
};

/* ---------------------------------- prompts ---------------------------------- */

const CAMBRIDGE = `You work for Cambridge Grads Academy (CGA), Pakistan, as a senior Cambridge International examiner.
Follow Cambridge International conventions exactly:
- When a syllabus code is given (e.g. O Level Physics 5054, A Level Mathematics 9709), stay strictly inside that syllabus's content and assessment objectives, at the depth that level expects.
- Questions use Cambridge command words (state, define, describe, explain, suggest, calculate, determine, compare, evaluate, discuss) and show the mark allocation for every part.
- Mark schemes are written the way Cambridge writes them: one creditable point per mark; "allow" for acceptable alternatives, "ignore" for irrelevant additions, "reject"/"do not accept" for wrong or vague answers; ORA (or reverse argument) where relevant.
- Mathematics, Additional Mathematics, Statistics and the sciences' calculations use M (method), A (accuracy, dependent on M) and B (independent) marks, with ECF / FT (error carried forward / follow through) noted where it applies, and units required where Cambridge would require them.
- Essay and extended-response questions (e.g. Islamiyat, Pakistan Studies, English, Economics, Sociology, Business) use Cambridge-style level descriptors (Level 1 / Level 2 / Level 3 ... with mark ranges) plus the indicative content an examiner credits.
- Number questions like "1", "2(a)", "2(b)(i)". For MCQ give exactly four options A–D and put the correct letter first in the mark scheme; for every other type, options is an empty array.`;

const GEN_SYSTEM = `${CAMBRIDGE}
Write an original assignment for the teacher's specification. The marks of all questions must add up exactly to the requested total. Give a concise model answer for each question. Write in English unless the subject itself is in another language (e.g. Urdu papers in Urdu).`;

const EXTRACT_SYSTEM = `${CAMBRIDGE}
A teacher has uploaded a question paper (and sometimes its mark scheme). Transcribe every question faithfully into the structured format, keeping the paper's own numbering, wording and mark allocations. Describe any diagram, graph or table a student would need in square brackets inside the question text.
If a mark scheme was uploaded, copy its points into mark_scheme. If not, write a Cambridge-style mark scheme and model answer yourself.`;

const CHECK_SYSTEM = `${CAMBRIDGE}
You are now marking a student's script. Apply Cambridge marking principles:
- Mark positively: award a mark whenever the creditable point is present, even if expressed differently; never deduct marks for wrong extra material unless it contradicts a correct point.
- Follow the mark scheme exactly; use "allow" alternatives, apply ECF / FT where the scheme allows, and never award more than the marks available for the question.
- For levels-marked answers, decide the level from the descriptors, then the mark within the level.
- The script may be typed answers and/or photos of handwriting. Read handwriting carefully and transcribe what the student wrote into student_answer (shortened if very long). If something is illegible or missing, say so and credit only what you can read. Unanswered = 0 with the comment "Not attempted".
- marks_annotation is what an examiner writes in the margin, e.g. "✓✓✗ 2/3", "M1 A0 B1", "L2 — 4/6".
- examiner_comment speaks to the student: what earned credit, exactly what was missing for the remaining marks, and one tip.
- needs_teacher_review lists any question where you are unsure (illegible writing, borderline level, possible mark-scheme problem). Empty array if none.`;

/* ---------------------------------- helpers ---------------------------------- */

function block(file) {
  return file.type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
    : { type: "image", source: { type: "base64", media_type: file.type, data: file.data } };
}

async function callJSON(system, content, schema) {
  if (!client) throw Object.assign(new Error(loadError || "AI is not available."), { ai: true });
  /* Streaming: bade max_tokens par SDK non-streaming request khud rok deta hai ("streaming is required") —
     finalMessage() poora jawab ikattha kar ke deta hai */
  const response = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (response.stop_reason === "refusal") throw Object.assign(new Error("Claude declined this request — please rephrase it."), { ai: true });
  if (response.stop_reason === "max_tokens") throw Object.assign(new Error("The paper is too long for one go — split it into two assignments."), { ai: true });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("The AI's answer was incomplete — please try again."), { ai: true, detail: `stop_reason=${response.stop_reason} text=${text.slice(0, 200)}` }); }
}

function friendly(e) {
  /* asal wajah Render ke Logs mein — agli dafa foran pata chale */
  console.error("[ai]", e && (e.status ? `status ${e.status}` : ""), e && e.message, e && e.detail ? e.detail : "");
  try {
    const A = require("@anthropic-ai/sdk");
    if (e instanceof A.AuthenticationError) return "The Claude API key on the server is invalid.";
    if (e instanceof A.RateLimitError) return "Claude is busy right now — please try again in a minute.";
    if (e instanceof A.APIConnectionError) return "Could not reach Claude — check the server's internet.";
    if (e instanceof A.APIError) return `Claude API error (${e.status}) — please try again.`;
  } catch {}
  return e && e.ai ? e.message : `The AI could not finish this — please try again. (${String(e && e.message || e).slice(0, 160)})`;
}

const specLines = (s) => [
  `Subject: ${s.subject}`,
  s.level && `Level: ${s.level}`,
  s.code && `Cambridge syllabus code: ${s.code}`,
  s.course && `Class: ${s.course}`,
].filter(Boolean).join("\n");

/* ------------------------------ public functions ----------------------------- */

function generate(spec) {
  const text = [
    specLines(spec),
    `Topic(s): ${spec.topic}`,
    `Number of questions: ${spec.count}`,
    `Total marks: ${spec.total}`,
    `Difficulty: ${spec.difficulty}`,
    `Question types: ${spec.types.length ? spec.types.join(", ") : "mix as Cambridge would for this topic"}`,
    spec.notes && `Teacher's instructions: ${spec.notes}`,
  ].filter(Boolean).join("\n");
  return callJSON(GEN_SYSTEM, [{ type: "text", text: `Develop the assignment.\n\n${text}` }], ASSIGNMENT);
}

function extract(spec, paperFiles, schemeFiles) {
  const content = [];
  paperFiles.forEach((f) => content.push(block(f)));
  if (schemeFiles.length) {
    content.push({ type: "text", text: "The files above are the QUESTION PAPER. The files below are its MARK SCHEME." });
    schemeFiles.forEach((f) => content.push(block(f)));
  }
  content.push({ type: "text", text: `${specLines(spec)}${spec.notes ? `\nTeacher's note: ${spec.notes}` : ""}\n\nTranscribe this paper into the structured format.` });
  return callJSON(EXTRACT_SYSTEM, content, ASSIGNMENT);
}

function paperText(a) {
  return a.questions.map((q) => {
    const opts = q.options && q.options.length ? "\nOptions: " + q.options.map((o, i) => `${"ABCDEF"[i]}) ${o}`).join("  ") : "";
    return `Question ${q.number} [${q.marks} marks] (${q.type})\n${q.text}${opts}\nMark scheme:\n- ${q.mark_scheme.join("\n- ")}`;
  }).join("\n\n");
}

async function check(a, sub, paperFiles, workFiles) {
  const content = [];
  if (paperFiles.length) {
    paperFiles.forEach((f) => content.push(block(f)));
    content.push({ type: "text", text: "Above: the original question paper (for diagrams and context)." });
  }
  workFiles.forEach((f) => content.push(block(f)));
  const typed = a.questions.map((q) => `${q.number}: ${(sub.answers && sub.answers[q.number] || "").trim() || "(no typed answer)"}`).join("\n");
  content.push({ type: "text", text: [
    `${specLines(a)}\nAssignment: ${a.title} — total ${a.total} marks`,
    paperText(a),
    `STUDENT'S TYPED ANSWERS:\n${typed}`,
    workFiles.length ? `The student's handwritten work is in the ${workFiles.length} photo/PDF file(s) attached above${paperFiles.length ? " (after the question paper)" : ""}.` : "",
    "Mark every question in the assignment.",
  ].filter(Boolean).join("\n\n") });
  return callJSON(CHECK_SYSTEM, content, CHECK);
}

module.exports = { ready, whyNot, generate, extract, check, friendly, MODEL };
