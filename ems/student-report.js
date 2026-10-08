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
  const empName = (id) => ((emps.find((e) => e.id === id) || {}).name || "");
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
    const times = [1, 2, 3, 4, 5, 6, 0].map((d) => { const s = slotOf(a, d); return s ? { d, day: WEEK[d], from: s.from || "", to: s.to || "" } : null; }).filter(Boolean);
    out.push({ subject, course: a.course, teacher: e.name || "", teacherId: e.id, times });
  }));
  const setT = (db.settings || {}).subjTeacher || {};
  mine.forEach((x) => {
    if (out.some((c) => c.subject && subjLike(c.subject, x.name))) return;
    let tid = x.teacherId || "";
    if (!tid) cls.some((c) => { const t = setT[`${st.shift}|${c}|${keyOf(x.name)}`]; if (t) tid = t; return !!t; });
    out.push({ subject: x.name, course: st.course, teacher: empName(tid), teacherId: tid, times: [] });
  });
  return out.map(({ teacherId, ...c }) => c)
    .sort((a, b) => (a.times.length ? 0 : 1) - (b.times.length ? 0 : 1) || a.subject.localeCompare(b.subject));
}

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

  const exams = (db.exams || []).filter((e) => e.studentId === st.id && +e.total > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const p = (e) => (e.absent ? 0 : Math.round((+e.obtained * 100) / +e.total));
  const bySub = {};
  exams.forEach((e) => { const k = e.subject || "General"; (bySub[k] = bySub[k] || []).push(p(e)); });
  const avg = (l) => (l.length ? Math.round(l.reduce((a, x) => a + x, 0) / l.length) : null);

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
    marks: {
      list: exams.slice(0, 25).map((e) => ({ date: e.date, exam: e.exam || "Test", subject: e.subject || "", obtained: e.absent ? null : +e.obtained, total: +e.total,
        pct: p(e), absent: !!e.absent, comment: e.comment || "", by: e.byName || "" })),
      average: avg(exams.slice(0, 10).map(p)), count: exams.length,
      bySubject: Object.entries(bySub).map(([k, l]) => ({ subject: k, avg: avg(l), n: l.length, last: l[0] })).sort((a, b) => a.subject.localeCompare(b.subject)),
    },
    remarks: (st.remarks || []).filter((r) => r.parentVisible !== false).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 8)
      .map((r) => ({ d: r.d, type: r.type || "Remark", note: r.note || "", by: r.by || "" })),
  };
}

module.exports = { studentReport, classesFor };
