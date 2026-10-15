/* v68: Student report — student portal (/student) ke "My Report" tab ke liye.
   Sirf usi bache ka data: attendance, class attendance, classes + times + teachers, marks, remarks.
   Server par har request pe live DB se banta hai (koi cache nahi) — teacher marks daale to agle refresh par nazar aate hain. */
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_SET = { "Mon–Fri": [1, 2, 3, 4, 5], "Mon–Sat": [1, 2, 3, 4, 5, 6], "Mon, Wed, Fri": [1, 3, 5], "Tue, Thu, Sat": [2, 4, 6], "Sat–Sun": [6, 0], "Daily": [0, 1, 2, 3, 4, 5, 6] };
const keyOf = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const subjLike = (a, b) => { const x = keyOf(a), y = keyOf(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const classesOf = (st) => [st.course, st.shift === "Evening" ? st.course2 : ""].filter(Boolean);
const asgDays = (a) => (a.dayList && a.dayList.length ? a.dayList : DAY_SET[a.days] || (a.from ? DAY_SET["Mon–Fri"] : []));
const slotOf = (a, wd) => (!asgDays(a).includes(wd) ? null : a.slots && a.slots[wd] ? a.slots[wd] : a.from ? { from: a.from, to: a.to || "" } : null);
const okT = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || ""));        // "HH:MM" — ghalat waqt timetable mein nahi
const pct = (n, d) => (d ? Math.round((n * 100) / d) : null);
const ATT_KEYS = ["P", "L", "A", "E"];

function attCount(att, sid, dates) {
  const c = { P: 0, L: 0, A: 0, E: 0 };
  dates.forEach((d) => { const r = att[d] && att[d][sid]; if (r && ATT_KEYS.includes(r.s)) c[r.s]++; });
  c.marked = c.P + c.L + c.A + c.E;
  c.pct = pct(c.P + c.L, c.P + c.L + c.A);       // leave attendance % mein nahi ginti
  return c;
}

/* Bache ki classes: Employees → Assign (shift + class + subject + din/waqt) aur student ke subject par laga teacher */
function classesFor(db, st) {
  const emps = db.employees || [], cls = classesOf(st), mine = (st.subjects || []).filter((x) => x && x.name);
  const out = [];
  emps.forEach((e) => (e.assignments || []).forEach((a) => {
    if (a.shift !== st.shift || !cls.includes(a.course)) return;
    if (a.subject && mine.length && !mine.some((x) => subjLike(x.name, a.subject))) return;
    /* bina subject wali class: bache ke subjects maloom hon to sirf tab dikhayen jab is teacher ka koi subject is bache par laga ho */
    let subject = a.subject || "";
    if (!subject && mine.length) { const t = mine.find((x) => x.teacherId === e.id); if (!t) return; subject = t.name; }
    /* is subject ka teacher student par koi aur laga ho to ye class us bache ki nahi */
    const own = a.subject && mine.find((x) => subjLike(x.name, a.subject));
    if (own && own.teacherId && own.teacherId !== e.id) return;
    const times = [1, 2, 3, 4, 5, 6, 0].map((d) => { const s = slotOf(a, d); return s && okT(s.from) ? { d, day: WEEK[d], from: s.from, to: okT(s.to) ? s.to : "" } : null; }).filter(Boolean);
    /* v75: wohi class + subject + teacher do dafa assign ho to aik hi row (din / waqt jor kar) */
    const same = out.find((c) => c.course === a.course && keyOf(c.subject) === keyOf(subject) && c.teacherId === e.id);
    if (same) { times.forEach((t) => { if (!same.times.some((x) => x.d === t.d && x.from === t.from)) same.times.push(t); }); same.times.sort((x, y) => ((x.d + 6) % 7) - ((y.d + 6) % 7) || x.from.localeCompare(y.from)); return; }
    out.push({ subject, course: a.course, teacher: e.name || "", teacherId: e.id, times });
  }));
  /* v75: sirf Employees → Assign wali classes / subjects — bina assignment ke subject (teacher / waqt maloom nahi) nahi dikhaye jate */
  return out.map(({ teacherId, ...c }) => c)
    .sort((a, b) => (a.times.length ? 0 : 1) - (b.times.length ? 0 : 1) || a.subject.localeCompare(b.subject) || a.course.localeCompare(b.course));
}

const mine = (st) => (st.subjects || []).filter((x) => x && x.name);
/* v100: class mein position — 4 cheezon ka mila jula score (weights POS_W, jo na ho us ka weight baqi mein bant jata hai):
   marks (mahine ke tests ka total %, absent / na liya hua Morning subject nahi) · homework waqt par (on time 100, late 50, missed 0)
   · behaviour & discipline (100 se: "Behaviour" remark −15, "Issue" −10, class bunk −10, "Appreciation" +5) · attendance & punctuality
   (Present 100, Late 50, Absent 0). Class + shift ke sab bache (Left nahi) jin ke us mahine marks hain; barabar score = aik position.
   index.html ka posParts bilkul yehi hisaab karta hai (report cards). */
/* v103: PTM tak Morning ke results parents se chhupe (PTM par "Hide results until this PTM") — PTM ka waqt khatam hote hi khud wapas */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const t12 = (t) => { const x = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); if (!x) return ""; const h = +x[1]; return `${((h + 11) % 12) + 1}:${x[2]} ${h < 12 ? "AM" : "PM"}`; };
function resultsHold(db, st, now = Date.now()) {
  if (!st || st.shift !== "Morning") return null;
  const L = (db.ptms || []).filter((x) => x && x.hideResults && /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") && (x.classes || []).some((c) => classesOf(st).includes(c)))
    .map((x) => ({ x, end: Date.parse(`${x.date}T${/^\d{2}:\d{2}$/.test(x.to || "") ? x.to : "23:59"}:00+05:00`) }))
    .filter((r) => r.end > now).sort((a, b) => a.end - b.end);
  if (!L.length) return null;
  const x = L[0].x, d = new Date(x.date + "T12:00:00Z"), when = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${x.from ? `, ${t12(x.from)}${x.to ? "–" + t12(x.to) : ""}` : ""}`;
  return { date: x.date, from: x.from || "", to: x.to || "", title: x.title || "Parent-Teacher Meeting", when,
    text: `Results will be announced at the PTM — ${when}. Please come to the school to collect your child's result.` };
}
const POS_W = { marks: 60, hw: 15, beh: 10, att: 15 };
function posParts(db, st, month) {
  const L = (db.exams || []).filter((e) => e.studentId === st.id && +e.total > 0 && !e.absent && takesSubj(st, e.subject) && String(e.date).startsWith(month));
  const tot = L.reduce((a, e) => a + +e.total, 0), obt = L.reduce((a, e) => a + (+e.obtained || 0), 0);
  const marks = tot ? Math.round((obt * 100) / tot) : null;
  if (marks === null) return null;
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  let hs = 0, hn = 0;
  homeworkOf(db, st).forEach((h) => { const due = h.dueDate || h.dateGiven || ""; if (!String(due).startsWith(month)) return;
    const d = (h.done || {})[st.id];
    if (d) { hn++; hs += typeof d === "string" && h.dueDate && d > h.dueDate ? 50 : 100; } else if (due < today) hn++; });
  const att = db.attendance || {}; let P = 0, La = 0, A = 0;
  Object.keys(att).forEach((d) => { if (!d.startsWith(month)) return; const r = att[d] && att[d][st.id]; if (!r) return; if (r.s === "P") P++; else if (r.s === "L") La++; else if (r.s === "A") A++; });
  let beh = 100;
  (st.remarks || []).forEach((r) => { if (!String(r.d || "").startsWith(month)) return;
    beh += r.type === "Behaviour" ? -15 : r.type === "Issue" ? -10 : r.type === "Appreciation" ? 5 : 0; });
  (st.warnings || []).forEach((w) => { if (String(w.d || "").startsWith(month)) beh -= w.level === "Final" ? 40 : w.level === "2nd" ? 30 : 20; });   // v106: warning letter
  (db.classAtt || []).forEach((c) => { if (!String(c.date).startsWith(month) || !c.marks || c.marks[st.id] !== "A") return;
    const g = att[c.date] && att[c.date][st.id]; if (g && (g.s === "P" || g.s === "L")) beh -= 10; });
  const parts = { marks, hw: hn ? Math.round(hs / hn) : null, beh: Math.max(0, Math.min(100, beh)), att: P + La + A ? Math.round(((P + La * 0.5) * 100) / (P + La + A)) : null };
  let w = 0, sum = 0; Object.entries(POS_W).forEach(([k, v]) => { if (parts[k] !== null) { w += v; sum += v * parts[k]; } });
  return { ...parts, score: Math.round((sum / w) * 10) / 10 };
}
function classPosition(db, st) {
  const months = [...new Set((db.exams || []).filter((e) => e.studentId === st.id && +e.total > 0 && !e.absent && takesSubj(st, e.subject))
    .map((e) => String(e.date || "").slice(0, 7)).filter(Boolean))].sort();
  const month = months.pop(); if (!month) return null;
  const rows = (db.students || []).filter((s) => s.shift === st.shift && s.course === st.course && s.status !== "Left")
    .map((s) => ({ id: s.id, x: posParts(db, s, month) })).filter((r) => r.x).sort((a, b) => b.x.score - a.x.score);
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].x.score === r.x.score ? rows[i - 1].rank : i + 1; });
  const me = rows.find((r) => r.id === st.id); if (!me) return null;
  return { month, rank: me.rank, of: rows.length, pct: me.x.marks, score: me.x.score, parts: me.x, weights: POS_W,
    classAvg: Math.round(rows.reduce((a, r) => a + r.x.marks, 0) / rows.length) };
}
/* v97: index.html ka takesSubject — wohi naam ya aik doosre ka shuru; subjects darj na hon to haan. Sirf Morning par lagta hai. */
function takesSubj(st, subject) {
  const t = keyOf(subject); if (!t || st.shift !== "Morning") return true;
  const L = mine(st).map((x) => keyOf(x.name)).filter(Boolean);
  return !L.length || L.some((k) => k === t || k.startsWith(t) || t.startsWith(k));
}
/* v69 / v90: bache ka homework (uski class + shift; subject wala sirf us subject ke bachon ko) — naya pehle */
const homeworkOf = (db, st) => (db.homework || []).filter((h) => h && h.shift === st.shift && classesOf(st).includes(h.course)
    && (!h.subject || !mine(st).length || mine(st).some((x) => subjLike(x.name, h.subject))))
  .sort((a, b) => String(b.dateGiven).localeCompare(String(a.dateGiven)));
function studentReport(db, st, today) {
  const att = db.attendance || {}, month = today.slice(0, 7);
  const since = new Date(Date.parse(today + "T00:00:00Z") - 30 * 864e5).toISOString().slice(0, 10);
  const days = Object.keys(att).filter((d) => att[d] && att[d][st.id]).sort();
  const mDays = days.filter((d) => d.startsWith(month));
  const tRec = att[today] && att[today][st.id];
  const recent = days.filter((d) => d >= since && ["A", "L", "E"].includes(att[d][st.id].s)).reverse().slice(0, 10)
    .map((d) => ({ date: d, s: att[d][st.id].s, t: att[d][st.id].t || "" }));
  const last14 = days.slice(-14).map((d) => ({ date: d, s: att[d][st.id].s }));

  /* teacher ki class attendance (subject wise) — is mahine */
  const subj = {}, bunks = [];
  (db.classAtt || []).forEach((c) => {
    const k = c && c.marks && c.marks[st.id]; if (!k) return;
    if (String(c.date).startsWith(month)) { const r = subj[c.subject || c.course] = subj[c.subject || c.course] || { P: 0, L: 0, A: 0 }; if (r[k] !== undefined) r[k]++; }
    const g = att[c.date] && att[c.date][st.id];
    if (k === "A" && g && (g.s === "P" || g.s === "L") && c.date >= since) bunks.push({ date: c.date, subject: c.subject || c.course });
  });

  /* v97: Morning — jo subject bacha nahi leta (subjects darj hain) us ke marks report mein nahi */
  const exams = (db.exams || []).filter((e) => e.studentId === st.id && +e.total > 0 && takesSubj(st, e.subject))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  /* v95: absent = koi % / grade nahi; average mein gina nahi jata */
  const p = (e) => (e.absent ? null : Math.round((+e.obtained * 100) / +e.total));
  const bySub = {};
  exams.forEach((e) => { const k = e.subject || "General"; if (!e.absent) (bySub[k] = bySub[k] || []).push(p(e)); });
  const avg = (l) => (l.length ? Math.round(l.reduce((a, x) => a + x, 0) / l.length) : null);

  const hold = resultsHold(db, st);                    // v103: PTM tak results band
  const classes = classesFor(db, st), wd = new Date(Date.parse(today + "T12:00:00Z")).getUTCDay();
  const todays = classes.map((c) => { const t = c.times.find((x) => x.d === wd); return t ? { subject: c.subject, course: c.course, teacher: c.teacher, from: t.from, to: t.to } : null; })
    .filter(Boolean).sort((a, b) => String(a.from).localeCompare(String(b.from)));

  return {
    asOf: new Date().toISOString(), today,
    student: { name: st.name, regNo: st.regNo || "", course: classesOf(st).join(" + "), shift: st.shift || "", mode: st.mode || "", status: st.status || "" },
    attendance: {
      today: tRec ? { s: tRec.s, t: tRec.t || "" } : null, month, monthCount: attCount(att, st.id, mDays), last30: attCount(att, st.id, days.filter((d) => d >= since)),
      recent, last14, bunks: bunks.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
      bySubject: Object.entries(subj).map(([k, r]) => ({ subject: k, P: r.P, L: r.L, A: r.A, pct: pct(r.P + r.L, r.P + r.L + r.A) })),
    },
    classes, todayClasses: todays,
    marks: hold ? { hold, list: [], position: null, average: null, count: 0, bySubject: [] } : {
      list: exams.slice(0, 25).map((e) => ({ date: e.date, exam: e.exam || "Test", subject: e.subject || "", obtained: e.absent ? null : +e.obtained, total: +e.total,
        pct: p(e), absent: !!e.absent, comment: e.comment || "", by: e.byName || "" })),
      position: classPosition(db, st),           // v99
      average: avg(exams.filter((e) => !e.absent).slice(0, 10).map(p)), count: exams.filter((e) => !e.absent).length,
      bySubject: Object.entries(bySub).map(([k, l]) => ({ subject: k, avg: avg(l), n: l.length, last: l[0] })).sort((a, b) => a.subject.localeCompare(b.subject)),
    },
    /* v69: homework — subject wala sirf us subject ke bachon ko */
    homework: homeworkOf(db, st).slice(0, 12).map((h) => {
        const d = (h.done || {})[st.id], due = h.dueDate || "";
        return { id: h.id, title: h.title || "", subject: h.subject || "", detail: h.detail || "", given: h.dateGiven || "", due,
          teacher: h.teacherId ? ((db.employees || []).find((e) => e.id === h.teacherId) || {}).name || "" : "",
          state: d ? (typeof d === "string" && due && d > due ? "late" : "done") : due && due < today ? "missed" : "pending", on: typeof d === "string" ? d : "" };
      }),
    /* v106: warning letters (Behaviour & discipline) */
    warnings: (st.warnings || []).filter((w) => w && w.parentVisible !== false).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 10)
      .map((w) => ({ d: w.d, no: w.no || "", level: w.level || "1st", reason: w.reason || "", note: w.note || "", by: w.by || "" })),
    remarks: (st.remarks || []).filter((r) => r.parentVisible !== false).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 8)
      .map((r) => ({ d: r.d, type: r.type || "Remark", note: r.note || "", by: r.by || "" })),
  };
}

module.exports = { studentReport, classesFor, homeworkOf, takesSubj, classPosition, resultsHold };
