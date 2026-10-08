/* CGA EMS — v61: ASSIGNMENTS (AI generator + checker, student portal).
   Teacher (ya staff) assignment banata hai — Claude se topic par, ya apna paper upload karke — aur apni class ke
   bachon ko deta hai (Morning: poori class; Evening: sirf us subject wale). Bacha /student par parent ke phone + PIN
   se khol kar karta hai; timed ho to timer server par chalta hai. Jama hote hi (ya waqt khatam hote hi) Claude
   mark scheme ke mutabiq check karta hai aur bache ko usi waqt marked script dikh jata hai.
   Data db.json se alag: DATA_DIR/asg/assignments.json, DATA_DIR/asg/subs/<id>.json, DATA_DIR/asg/files/. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ai = require("./ai");

const GRACE_MS = 90e3;                        // timer khatam hone ke baad network ke liye thori mohlat
const MAX_WORK_FILES = 12;
const MAX_UPLOAD = 10 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const EXT_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const MAGIC = { jpg: [0xff, 0xd8], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46], pdf: [0x25, 0x50, 0x44, 0x46] };
const QTYPES = ["mcq", "short", "structured", "calculation", "essay"];

const uid = () => crypto.randomBytes(8).toString("hex");
const str = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const keyOf = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const subjLike = (a, b) => { const x = keyOf(a), y = keyOf(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const classesOf = (st) => [st.course, st.shift === "Evening" ? st.course2 : ""].filter(Boolean);
const pktDate = (ms = Date.now()) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
const dayEnd = (d) => Date.parse(`${d}T23:59:59+05:00`);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

module.exports = function setup(ctx) {
  const { DATA_DIR, send, sendJson, readBody, readRaw, sameOrigin, dbNow, logAct, actWho, accessFor, pinOk, childrenOf, phoneKey,
          clientIp, blocked, failed, fails, isHttps, escHtml, schoolName, teacherClasses } = ctx;

  const DIR = path.join(DATA_DIR, "asg"), SUBS = path.join(DIR, "subs"), FILES = path.join(DIR, "files");
  const ASG_FILE = path.join(DIR, "assignments.json");
  fs.mkdirSync(SUBS, { recursive: true });
  fs.mkdirSync(FILES, { recursive: true });
  const writeAtomic = (file, text) => { fs.writeFileSync(file + ".tmp", text); fs.renameSync(file + ".tmp", file); };

  /* ------------------------------- store ------------------------------- */
  let assignments = [];
  try { assignments = JSON.parse(fs.readFileSync(ASG_FILE, "utf8")); } catch { assignments = []; }
  const subs = new Map();
  for (const f of fs.readdirSync(SUBS)) {
    if (!f.endsWith(".json")) continue;
    try { const s = JSON.parse(fs.readFileSync(path.join(SUBS, f), "utf8")); subs.set(s.id, s); } catch {}
  }
  const saveAsg = () => writeAtomic(ASG_FILE, JSON.stringify(assignments));
  const saveSub = (s) => { s.updatedAt = new Date().toISOString(); subs.set(s.id, s); writeAtomic(path.join(SUBS, s.id + ".json"), JSON.stringify(s)); };
  const asgById = (id) => assignments.find((a) => a.id === id) || null;
  const subsOf = (aid) => [...subs.values()].filter((s) => s.assignmentId === aid);
  const subFor = (aid, sid) => [...subs.values()].find((s) => s.assignmentId === aid && s.studentId === sid) || null;

  function storeFile(buf, type, name) {
    const ext = TYPES[type];
    if (!ext) throw Object.assign(new Error("Only JPG, PNG, WEBP or PDF files."), { status: 415 });
    if (!buf.length || buf.length > MAX_UPLOAD || !MAGIC[ext].every((b, i) => buf[i] === b))
      throw Object.assign(new Error("This file is not a valid photo / PDF (max 10 MB)."), { status: 400 });
    const file = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    writeAtomic(path.join(FILES, file), buf);
    return { file, type, name: str(name, 120) || file };
  }
  const fileOk = (f) => f && /^[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(f.file || "") && fs.existsSync(path.join(FILES, f.file));
  const loadFiles = (list) => (list || []).filter(fileOk).map((f) => ({ type: f.type, data: fs.readFileSync(path.join(FILES, f.file)).toString("base64") }));

  /* ------------------------ who gets an assignment ----------------------- */
  /* Morning: class ke sab bache. Evening: usi class ke wo bache jin ke subjects mein ye subject ho
     (bache ke subject par koi aur teacher laga ho to wo us teacher ka hai). */
  function eligible(db, shift, course, subject, tid) {
    return (db.students || []).filter((st) => st.shift === shift && classesOf(st).includes(course) && st.status !== "Left"
      && (shift === "Morning" || !subject || (st.subjects || []).some((x) => (x.teacherId && tid ? x.teacherId === tid : true) && subjLike(x.name, subject))));
  }
  const canClass = (auth, db, shift, course) => auth.role !== "teacher" || teacherClasses(db, auth.tid).has(shift + "|" + course);
  const canAsg = (auth, a) => !!a && (auth.role !== "teacher" || a.teacherId === auth.tid);

  /* ----------------------------- validation ----------------------------- */
  function cleanQuestions(list) {
    const qs = (Array.isArray(list) ? list : []).slice(0, 60).map((q, i) => ({
      number: str(String(q.number ?? i + 1), 20) || String(i + 1),
      type: QTYPES.includes(q.type) ? q.type : "short",
      text: str(q.text, 10000),
      options: Array.isArray(q.options) ? q.options.map((o) => str(o, 600)).filter(Boolean).slice(0, 6) : [],
      marks: int(q.marks, 0, 100, 1),
      mark_scheme: Array.isArray(q.mark_scheme) ? q.mark_scheme.map((p) => str(p, 1500)).filter(Boolean).slice(0, 40) : [],
      model_answer: str(q.model_answer, 10000),
    }));
    const seen = new Set();
    qs.forEach((q) => { while (seen.has(q.number)) q.number += "'"; seen.add(q.number); });
    return qs;
  }
  function cleanSpec(b) {
    return {
      shift: b.shift === "Evening" ? "Evening" : "Morning",
      course: str(b.course, 60),
      subject: str(b.subject, 80),
      level: str(b.level, 30),
      code: str(b.code, 12).replace(/[^0-9A-Za-z/ -]/g, ""),
      topic: str(b.topic, 600),
    };
  }
  const total = (qs) => qs.reduce((s, q) => s + q.marks, 0);
  const teacherName = (db, tid) => { const e = (db.employees || []).find((x) => x.id === tid); return e ? e.name : ""; };

  /* ------------------------------- marking ------------------------------- */
  const queue = [];
  let running = 0;
  function enqueue(sub) {
    sub.status = "checking"; sub.checkError = ""; saveSub(sub);
    if (!queue.includes(sub.id)) queue.push(sub.id);
    pump();
  }
  function blankResult(a) {
    return { questions: a.questions.map((q) => ({ number: q.number, student_answer: "", awarded: 0, available: q.marks, marks_annotation: "", points_credited: [], examiner_comment: "" })),
             overall_feedback: "", strengths: [], improvements: [], needs_teacher_review: [], total_awarded: 0, total_available: a.total };
  }
  function pump() {
    while (running < 3 && queue.length) {
      const sub = subs.get(queue.shift()), a = sub && asgById(sub.assignmentId);
      if (!sub || !a) continue;
      running++;
      ai.check(a, sub, loadFiles(a.files), loadFiles(sub.files)).then((r) => {
        /* model ke jod par bharosa nahi — har sawal ke marks had ke andar, total dobara */
        const byNum = new Map(r.questions.map((q) => [String(q.number), q]));
        r.questions = a.questions.map((q) => {
          const m = byNum.get(String(q.number)) || { student_answer: "", awarded: 0, marks_annotation: "", points_credited: [], examiner_comment: "Not marked — please ask your teacher." };
          const out = { ...m, number: q.number, available: q.marks, awarded: Math.max(0, Math.min(Number(m.awarded) || 0, q.marks)) };
          /* MCQ ka faisla seedha: mark scheme ka pehla harf (A–F) aur bache ka chuna harf */
          const key = q.type === "mcq" && /^\s*([A-F])\b/.exec(q.mark_scheme[0] || ""), pick = /^\s*([A-F])\b/.exec((sub.answers || {})[q.number] || "");
          if (key && pick) {
            const ok = key[1] === pick[1];
            Object.assign(out, { awarded: ok ? q.marks : 0, student_answer: pick[1], marks_annotation: ok ? `✓ ${q.marks}/${q.marks}` : `✗ 0/${q.marks}`,
              points_credited: ok ? [`Correct option ${key[1]}`] : [], examiner_comment: ok ? (m.examiner_comment || "Correct.") : `The correct answer is ${key[1]}. ${m.examiner_comment || ""}`.trim() });
          }
          return out;
        });
        r.total_awarded = r.questions.reduce((s, q) => s + q.awarded, 0);
        r.total_available = a.total;
        sub.result = r; sub.status = "marked"; sub.markedAt = new Date().toISOString();
      }).catch((e) => {
        console.error("assignment check", e && e.message);
        sub.status = "error"; sub.checkError = ai.friendly(e);
        if (!sub.result) sub.result = blankResult(a);
      }).finally(() => { saveSub(sub); running--; pump(); });
    }
  }
  /* server dobara chala to jo check ho rahe thay unhein phir se */
  for (const s of subs.values()) if (s.status === "checking") queue.push(s.id);
  setImmediate(pump);

  /* waqt khatam → jo likha tha wohi jama (khud) */
  function settle(sub) {
    if (sub && sub.status === "in_progress" && sub.deadline && Date.now() > sub.deadline + GRACE_MS) {
      sub.status = "submitted"; sub.submittedAt = new Date(sub.deadline).toISOString(); sub.auto = true;
      enqueue(sub);
    }
    return sub;
  }
  setInterval(() => { for (const s of subs.values()) settle(s); }, 30e3).unref();

  /* ------------------------------- views ------------------------------- */
  function summary(a) {
    const list = subsOf(a.id).map(settle), marked = list.filter((s) => s.result && s.status === "marked");
    return {
      id: a.id, title: a.title, subject: a.subject, level: a.level, code: a.code, course: a.course, shift: a.shift,
      teacherId: a.teacherId, teacherName: a.teacherName, source: a.source, status: a.status, total: a.total, questions: a.questions.length,
      timed: a.timed, minutes: a.minutes, openFrom: a.openFrom, dueDate: a.dueDate, createdAt: a.createdAt,
      recipients: (a.studentIds || []).length, started: list.length, submitted: list.filter((s) => s.status !== "in_progress").length,
      marked: marked.length,
      avg: marked.length ? Math.round(marked.reduce((s, x) => s + (x.result.total_awarded / (x.result.total_available || 1)) * 100, 0) / marked.length) : null,
    };
  }
  const forStudent = (a) => ({
    id: a.id, title: a.title, subject: a.subject, level: a.level, code: a.code, course: a.course, instructions: a.instructions,
    total: a.total, timed: a.timed, minutes: a.minutes, dueDate: a.dueDate, teacherName: a.teacherName,
    questions: a.questions.map((q) => ({ number: q.number, type: q.type, text: q.text, options: q.options, marks: q.marks })),
    files: (a.files || []).map((f) => ({ file: f.file, type: f.type, name: f.name })),
  });
  const subForStudent = (s) => ({
    id: s.id, status: s.status, startedAt: s.startedAt, deadline: s.deadline, submittedAt: s.submittedAt, auto: !!s.auto,
    answers: s.answers || {}, files: (s.files || []).map((f) => ({ file: f.file, type: f.type, name: f.name })),
    result: s.status === "marked" || s.teacherEdited ? s.result : null, now: Date.now(),
  });

  /* =============================== STAFF API =============================== */
  async function staff(req, res, url, auth) {
    const p = url.pathname, db = dbNow() || {};
    const body = req.method === "POST" && !p.startsWith("/api/asg/upload") ? JSON.parse((await readBody(req)) || "{}") : {};
    if (req.method === "POST" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
    const who = actWho(auth);

    if (p === "/api/asg/list" && req.method === "GET") {
      const list = assignments.filter((a) => canAsg(auth, a)).map(summary).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return sendJson(res, 200, { aiReady: ai.ready(), aiWhy: ai.whyNot(), list });
    }

    if (p === "/api/asg/eligible" && req.method === "GET") {
      const shift = url.searchParams.get("shift") === "Evening" ? "Evening" : "Morning", course = str(url.searchParams.get("course"), 60);
      if (!canClass(auth, db, shift, course)) return sendJson(res, 403, { error: "Not your class." });
      const list = eligible(db, shift, course, str(url.searchParams.get("subject"), 80), auth.role === "teacher" ? auth.tid : "")
        .map((st) => ({ id: st.id, name: st.name, regNo: st.regNo || "" })).sort((a, b) => a.name.localeCompare(b.name));
      return sendJson(res, 200, list);
    }

    if (p.startsWith("/api/asg/upload") && req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const f = storeFile(await readRaw(req, MAX_UPLOAD + 1024), type, url.searchParams.get("name"));
      return sendJson(res, 200, f);
    }

    /* AI se banao (generate) ya upload se parho (extract) — dono draft bana kar dete hain */
    if ((p === "/api/asg/generate" || p === "/api/asg/extract") && req.method === "POST") {
      const spec = cleanSpec(body);
      if (!spec.course || !spec.subject) return sendJson(res, 400, { error: "Choose the class and subject." });
      if (!canClass(auth, db, spec.shift, spec.course)) return sendJson(res, 403, { error: "You can only make assignments for your own classes." });
      if (!ai.ready()) return sendJson(res, 503, { error: "AI is not switched on: " + ai.whyNot() });
      let out, files = [], scheme = [];
      if (p === "/api/asg/generate") {
        if (!spec.topic) return sendJson(res, 400, { error: "Write the topic." });
        const types = (Array.isArray(body.types) ? body.types : []).filter((t) => QTYPES.includes(t));
        try {
          out = await ai.generate({ ...spec, count: int(body.count, 1, 40, 6), total: int(body.total, 1, 300, 30),
            difficulty: str(body.difficulty, 40) || "Mixed", types, notes: str(body.notes, 2000) });
        } catch (e) { return sendJson(res, 502, { error: ai.friendly(e) }); }
      } else {
        files = (Array.isArray(body.files) ? body.files : []).filter(fileOk).slice(0, 20);
        scheme = (Array.isArray(body.scheme) ? body.scheme : []).filter(fileOk).slice(0, 20);
        if (!files.length) return sendJson(res, 400, { error: "Upload the question paper first." });
        try { out = await ai.extract({ ...spec, notes: str(body.notes, 2000) }, loadFiles(files), loadFiles(scheme)); }
        catch (e) { return sendJson(res, 502, { error: ai.friendly(e) }); }
      }
      const questions = cleanQuestions(out.questions);
      const a = { id: uid(), ...spec, title: str(out.title, 200) || `${spec.subject} — ${spec.topic || "Assignment"}`, instructions: str(out.instructions, 4000),
        questions, total: total(questions), source: p.endsWith("generate") ? "ai" : "upload", files, schemeFiles: scheme,
        teacherId: auth.role === "teacher" ? auth.tid : str(body.teacherId, 40), teacherName: "", status: "draft",
        timed: false, minutes: 0, openFrom: pktDate(), dueDate: "", studentIds: [], createdAt: new Date().toISOString(), createdBy: who.name };
      a.teacherName = teacherName(db, a.teacherId) || who.name;
      assignments.push(a); saveAsg();
      logAct(req, who, "Assignment drafted", `${a.title} · ${a.course} ${a.shift} · ${a.subject} (${a.source === "ai" ? "AI generated" : "uploaded paper"})`);
      return sendJson(res, 200, a);
    }

    if (p === "/api/asg/get" && req.method === "GET") {
      const a = asgById(url.searchParams.get("id"));
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      const names = new Map((db.students || []).map((st) => [st.id, st]));
      const roster = (a.studentIds || []).map((sid) => {
        const st = names.get(sid) || {}, s = settle(subFor(a.id, sid));
        return { studentId: sid, name: st.name || "(removed student)", regNo: st.regNo || "", subId: s ? s.id : "", status: s ? s.status : "not_started",
          submittedAt: s ? s.submittedAt || "" : "", auto: !!(s && s.auto), score: s && s.result && (s.status === "marked" || s.teacherEdited) ? s.result.total_awarded : null,
          review: s && s.result ? (s.result.needs_teacher_review || []).length : 0, teacherEdited: !!(s && s.teacherEdited) };
      }).sort((x, y) => x.name.localeCompare(y.name));
      return sendJson(res, 200, { ...a, roster, aiReady: ai.ready() });
    }

    /* naya (khud likha) ya mojooda badalna; status "published" = bachon ko de diya */
    if (p === "/api/asg/save" && req.method === "POST") {
      const old = body.id ? asgById(body.id) : null;
      if (body.id && !canAsg(auth, old)) return sendJson(res, 404, { error: "Not found" });
      const spec = cleanSpec({ ...(old || {}), ...body });
      if (!spec.course || !spec.subject) return sendJson(res, 400, { error: "Choose the class and subject." });
      if (!canClass(auth, db, spec.shift, spec.course)) return sendJson(res, 403, { error: "You can only make assignments for your own classes." });
      const questions = cleanQuestions(body.questions);
      if (!questions.length) return sendJson(res, 400, { error: "Add at least one question." });
      const hasPaper = (Array.isArray(body.files) ? body.files.filter(fileOk) : (old && old.files) || []).length > 0;
      if (questions.some((q) => !q.text && !hasPaper)) return sendJson(res, 400, { error: "Every question needs its text." });
      const ok = new Set(eligible(db, spec.shift, spec.course, spec.subject, auth.role === "teacher" ? auth.tid : "").map((st) => st.id));
      const studentIds = (Array.isArray(body.studentIds) ? body.studentIds : []).filter((id) => ok.has(id));
      const publish = body.status === "published";
      if (publish && !studentIds.length) return sendJson(res, 400, { error: "Choose at least one student." });
      const timed = !!body.timed, minutes = timed ? int(body.minutes, 1, 600, 30) : 0;
      const openFrom = isDate(body.openFrom) ? body.openFrom : pktDate(), dueDate = isDate(body.dueDate) ? body.dueDate : "";
      if (dueDate && dueDate < openFrom) return sendJson(res, 400, { error: "The due date is before the start date." });
      const started = old ? subsOf(old.id).length : 0;
      if (started && JSON.stringify(cleanQuestions(old.questions).map((q) => [q.number, q.marks])) !== JSON.stringify(questions.map((q) => [q.number, q.marks])))
        return sendJson(res, 409, { error: `${started} student(s) already started — you can fix wording and the mark scheme, but not add / remove questions or change marks.` });
      const a = old || { id: uid(), files: [], schemeFiles: [], source: "manual", createdAt: new Date().toISOString(), createdBy: who.name,
        teacherId: auth.role === "teacher" ? auth.tid : str(body.teacherId, 40) };
      Object.assign(a, spec, { title: str(body.title, 200) || `${spec.subject} assignment`, instructions: str(body.instructions, 4000), questions, total: total(questions),
        studentIds, timed, minutes, openFrom, dueDate, status: publish ? "published" : (old && old.status === "published" && body.status !== "draft" ? "published" : "draft") });
      if (Array.isArray(body.files)) a.files = body.files.filter(fileOk).slice(0, 20);
      a.teacherName = teacherName(db, a.teacherId) || a.teacherName || who.name;
      if (!old) assignments.push(a);
      saveAsg();
      logAct(req, who, publish ? "Assignment published" : "Assignment saved", `${a.title} · ${a.course} ${a.shift} · ${a.subject} · ${studentIds.length} students${a.timed ? ` · timed ${a.minutes} min` : ""}${a.dueDate ? ` · due ${a.dueDate}` : ""}`);
      return sendJson(res, 200, a);
    }

    if (p === "/api/asg/delete" && req.method === "POST") {
      const a = asgById(body.id);
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      for (const s of subsOf(a.id)) { subs.delete(s.id); try { fs.unlinkSync(path.join(SUBS, s.id + ".json")); } catch {} }
      assignments = assignments.filter((x) => x.id !== a.id); saveAsg();
      logAct(req, who, "Assignment deleted", a.title);
      return sendJson(res, 200, { ok: true });
    }

    /* ek bache ki copy (marked script) */
    if (p === "/api/asg/sub" && req.method === "GET") {
      const s = settle(subs.get(url.searchParams.get("id"))), a = s && asgById(s.assignmentId);
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      return sendJson(res, 200, { ...s, assignment: a });
    }

    /* teacher marks / comment badle — bache ko foran yahi dikhte hain */
    if (p === "/api/asg/mark" && req.method === "POST") {
      const s = subs.get(body.id), a = s && asgById(s.assignmentId);
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      if (s.status === "in_progress" || s.status === "checking") return sendJson(res, 409, { error: "Wait until the work is submitted and checked." });
      if (!s.result) s.result = blankResult(a);
      for (const q of s.result.questions) {
        const e = (Array.isArray(body.questions) ? body.questions : []).find((x) => String(x.number) === String(q.number));
        if (!e) continue;
        if (e.awarded !== undefined) q.awarded = Math.max(0, Math.min(Number(e.awarded) || 0, q.available));
        if (typeof e.examiner_comment === "string") q.examiner_comment = str(e.examiner_comment, 4000);
      }
      if (typeof body.overall_feedback === "string") s.result.overall_feedback = str(body.overall_feedback, 6000);
      s.result.total_awarded = s.result.questions.reduce((t, q) => t + q.awarded, 0);
      s.result.total_available = a.total;
      s.teacherEdited = true; s.status = "marked"; s.checkError = "";
      saveSub(s);
      logAct(req, who, "Assignment marks changed", `${a.title} · ${(db.students || []).find((x) => x.id === s.studentId)?.name || s.studentId} → ${s.result.total_awarded}/${a.total}`);
      return sendJson(res, 200, s);
    }

    if (p === "/api/asg/recheck" && req.method === "POST") {
      const s = subs.get(body.id), a = s && asgById(s.assignmentId);
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      if (s.status === "in_progress") return sendJson(res, 409, { error: "The student has not submitted yet." });
      if (!ai.ready()) return sendJson(res, 503, { error: "AI is not switched on: " + ai.whyNot() });
      s.teacherEdited = false; enqueue(s);
      return sendJson(res, 200, { ok: true });
    }

    /* bacha dobara kar sake (copy mita do) */
    if (p === "/api/asg/reset" && req.method === "POST") {
      const s = subs.get(body.id), a = s && asgById(s.assignmentId);
      if (!canAsg(auth, a)) return sendJson(res, 404, { error: "Not found" });
      subs.delete(s.id); try { fs.unlinkSync(path.join(SUBS, s.id + ".json")); } catch {}
      logAct(req, who, "Assignment attempt reset", `${a.title} · ${(db.students || []).find((x) => x.id === s.studentId)?.name || s.studentId}`);
      return sendJson(res, 200, { ok: true });
    }

    const fm = p.match(/^\/api\/asg\/file\/([a-f0-9]{24}\.(jpg|png|webp|pdf))$/);
    if (fm && req.method === "GET") {
      const name = fm[1];
      const mine = assignments.some((a) => canAsg(auth, a) && [...(a.files || []), ...(a.schemeFiles || [])].some((f) => f.file === name))
        || [...subs.values()].some((s) => (s.files || []).some((f) => f.file === name) && canAsg(auth, asgById(s.assignmentId)));
      /* abhi upload hua, kisi assignment mein nahi laga (naam random 96-bit hai) — staff / teacher preview ke liye */
      const loose = !mine && !assignments.some((a) => [...(a.files || []), ...(a.schemeFiles || [])].some((f) => f.file === name));
      if ((!mine && !loose) || !fs.existsSync(path.join(FILES, name))) return send(res, 404, "Not found");
      return send(res, 200, fs.readFileSync(path.join(FILES, name)), EXT_TYPE[fm[2]], { "Cache-Control": "private, max-age=86400", "Content-Disposition": "inline", "X-Frame-Options": "SAMEORIGIN" });
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  /* =========================== STUDENT PORTAL (/student) =========================== */
  const STUDENT_HTML = fs.readFileSync(path.join(__dirname, "student.html"), "utf8");
  const SKEY = crypto.createHash("sha256").update(fs.readFileSync(path.join(DATA_DIR, ".secret"), "utf8") + "|students").digest();
  const ssign = (x) => crypto.createHmac("sha256", SKEY).update(x).digest("base64url");
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  function studentToken(acc) {
    const exp = Date.now() + 60 * 864e5, tag = acc.hash.slice(0, 12);
    return `${acc.phone}.${exp}.${tag}.${ssign(`s|${acc.phone}|${exp}|${tag}`)}`;
  }
  function familyOf(req) {
    const m = /(?:^|;\s*)ems_st=([^;]+)/.exec(req.headers.cookie || "");
    const [key, exp, tag, sig] = String(m ? m[1] : "").split(".");
    if (!key || !exp || !tag || !sig || +exp < Date.now() || !safeEq(sig, ssign(`s|${key}|${exp}|${tag}`))) return null;
    const db = dbNow() || {}, acc = accessFor(db, key);
    if (!acc || !acc.hash.startsWith(tag)) return null;
    return { key, db, kids: childrenOf(db, key) };
  }
  const setCookie = (req, res, val, age) => res.setHeader("Set-Cookie", `ems_st=${val}; Path=/student; HttpOnly; SameSite=Lax; Max-Age=${age}${isHttps(req) ? "; Secure" : ""}`);
  const open = (a, today) => a.status === "published" && (!a.openFrom || a.openFrom <= today);
  const late = (a) => !!a.dueDate && Date.now() > dayEnd(a.dueDate);

  async function student(req, res, url) {
    const p = url.pathname;
    if (p === "/student" && req.method === "GET")
      return send(res, 200, STUDENT_HTML.replace(/\{\{SCHOOL\}\}/g, escHtml(schoolName(dbNow()))), "text/html; charset=utf-8");

    if (p === "/student/login" && req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const ip = clientIp(req), body = JSON.parse((await readBody(req)) || "{}"), key = phoneKey(body.phone);
      if (blocked("st:" + ip) || (key && blocked("stp:" + key))) return sendJson(res, 429, { error: "Too many wrong attempts — try again in 15 minutes." });
      const acc = key && accessFor(dbNow() || {}, key);
      if (!acc || !pinOk(acc, String(body.pin || "").trim())) {
        failed("st:" + ip); if (key) failed("stp:" + key);
        logAct(req, { role: "student", name: "Student 0" + (key || "?") }, "Failed login", "Student portal — wrong phone or PIN");
        return sendJson(res, 401, { error: "Wrong phone number or PIN." });
      }
      fails.delete("st:" + ip); fails.delete("stp:" + key);
      logAct(req, { role: "student", name: "Student 0" + key }, "Login", "Student portal");
      setCookie(req, res, studentToken(acc), 60 * 86400);
      return sendJson(res, 200, { ok: true });
    }
    if (p === "/student/logout") { setCookie(req, res, "", 0); return send(res, 303, "", "text/plain", { Location: "/student" }); }

    const fam = familyOf(req);
    if (!fam) return sendJson(res, 401, { error: "login" });
    const kid = (id) => fam.kids.find((k) => k.id === id) || null;
    const who = (st) => ({ role: "student", name: "Student: " + st.name });

    const fm = p.match(/^\/student\/file\/([a-f0-9]{24}\.(jpg|png|webp|pdf))$/);
    if (fm && req.method === "GET") {
      const st = kid(url.searchParams.get("s")), name = fm[1];
      const ok = st && (assignments.some((a) => open(a, pktDate()) && (a.studentIds || []).includes(st.id) && subFor(a.id, st.id) && (a.files || []).some((f) => f.file === name))
        || [...subs.values()].some((s) => s.studentId === st.id && (s.files || []).some((f) => f.file === name)));
      if (!ok || !fs.existsSync(path.join(FILES, name))) return send(res, 404, "Not found");
      return send(res, 200, fs.readFileSync(path.join(FILES, name)), EXT_TYPE[fm[2]], { "Cache-Control": "private, max-age=86400", "Content-Disposition": "inline", "X-Frame-Options": "SAMEORIGIN" });
    }

    if (p === "/student/api/me" && req.method === "GET")
      return sendJson(res, 200, { school: schoolName(fam.db), children: fam.kids.map((k) => ({ id: k.id, name: k.name, course: k.course, shift: k.shift })) });

    if (p === "/student/api/list" && req.method === "GET") {
      const st = kid(url.searchParams.get("studentId"));
      if (!st) return sendJson(res, 400, { error: "Choose a student." });
      const today = pktDate();
      const list = assignments.filter((a) => open(a, today) && (a.studentIds || []).includes(st.id)).map((a) => {
        const s = settle(subFor(a.id, st.id));
        return { id: a.id, title: a.title, subject: a.subject, level: a.level, code: a.code, total: a.total, questions: a.questions.length,
          timed: a.timed, minutes: a.minutes, dueDate: a.dueDate, teacherName: a.teacherName, late: late(a),
          state: s ? s.status : "new", score: s && s.result && (s.status === "marked" || s.teacherEdited) ? s.result.total_awarded : null, deadline: s ? s.deadline : null };
      }).sort((x, y) => (x.state === "marked") - (y.state === "marked") || String(x.dueDate || "9").localeCompare(String(y.dueDate || "9")));
      return sendJson(res, 200, list);
    }

    if (req.method !== "POST") return sendJson(res, 404, { error: "Not found" });
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });

    /* photo upload: raw body, ?studentId=&subId= */
    if (p === "/student/api/upload") {
      const st = kid(url.searchParams.get("studentId")), s = settle(subs.get(url.searchParams.get("subId")));
      if (!st || !s || s.studentId !== st.id) return sendJson(res, 404, { error: "Not found" });
      if (s.status !== "in_progress") return sendJson(res, 409, { error: "This assignment is already submitted." });
      if ((s.files || []).length >= MAX_WORK_FILES) return sendJson(res, 400, { error: `Maximum ${MAX_WORK_FILES} photos.` });
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      let f;
      try { f = storeFile(await readRaw(req, MAX_UPLOAD + 1024), type, url.searchParams.get("name")); }
      catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
      s.files = (s.files || []).concat(f); saveSub(s);
      return sendJson(res, 200, subForStudent(s));
    }

    const body = JSON.parse((await readBody(req)) || "{}");
    const st = kid(body.studentId);
    if (!st) return sendJson(res, 400, { error: "Choose a student." });

    /* kholo: pehli dafa timer yahin se shuru hota hai */
    if (p === "/student/api/open") {
      const a = asgById(body.assignmentId);
      if (!a || !open(a, pktDate()) || !(a.studentIds || []).includes(st.id)) return sendJson(res, 404, { error: "This assignment is not available." });
      let s = settle(subFor(a.id, st.id));
      if (!s) {
        if (!body.start) return sendJson(res, 200, { assignment: { ...forStudent(a), questions: [], files: [] }, submission: null, late: late(a) });
        if (late(a)) return sendJson(res, 409, { error: "The due date has passed — ask your teacher." });
        const now = Date.now();
        let deadline = a.timed ? now + a.minutes * 60e3 : null;
        if (a.dueDate) deadline = deadline ? Math.min(deadline, dayEnd(a.dueDate)) : dayEnd(a.dueDate);
        s = { id: uid(), assignmentId: a.id, studentId: st.id, studentName: st.name, phone: fam.key, status: "in_progress",
          startedAt: new Date(now).toISOString(), deadline, answers: {}, files: [] };
        saveSub(s);
        logAct(req, who(st), "Assignment started", `${a.title}${a.timed ? ` (timer ${a.minutes} min)` : ""}`);
      }
      return sendJson(res, 200, { assignment: forStudent(a), submission: subForStudent(s), late: late(a) });
    }

    const s = settle(subs.get(body.subId)), a = s && asgById(s.assignmentId);
    if (!s || !a || s.studentId !== st.id) return sendJson(res, 404, { error: "Not found" });
    const answers = (raw) => Object.fromEntries(a.questions.map((q) => [q.number, str(raw && raw[q.number], 20000)]));

    if (p === "/student/api/save") {
      if (s.status !== "in_progress") return sendJson(res, 200, subForStudent(s));
      s.answers = answers(body.answers); saveSub(s);
      return sendJson(res, 200, { ok: true, now: Date.now(), deadline: s.deadline });
    }
    if (p === "/student/api/remove-file") {
      if (s.status !== "in_progress") return sendJson(res, 409, { error: "Already submitted." });
      s.files = (s.files || []).filter((f) => f.file !== body.file); saveSub(s);
      return sendJson(res, 200, subForStudent(s));
    }
    if (p === "/student/api/submit") {
      if (s.status !== "in_progress") return sendJson(res, 200, subForStudent(s));      // waqt khatam ho kar khud jama ho chuka
      s.answers = answers(body.answers);
      s.status = "submitted"; s.submittedAt = new Date().toISOString();
      if (ai.ready()) enqueue(s);
      else { s.result = blankResult(a); s.status = "error"; s.checkError = "AI checking is off — your teacher will mark this."; saveSub(s); }
      logAct(req, who(st), "Assignment submitted", `${a.title}${(s.files || []).length ? ` · ${s.files.length} photo(s)` : ""}`);
      return sendJson(res, 200, subForStudent(s));
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  return { staff, student };
};
