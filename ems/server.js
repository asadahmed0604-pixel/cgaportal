/* CGA EMS — online server.
   Aik office password se login, aur sara data aik jagah (DATA_DIR/db.json) taake har browser
   par wahi data nazar aaye. Sirf aik npm package: @anthropic-ai/sdk (v61, AI assignments) — Node 18+.

   Environment:
     EMS_PASSWORD  (zaroori) office ka password, kam az kam 8 characters
     DATA_DIR      data ka folder (Render disk: /var/data). Default: ./data
     PORT          default 3000
     ANTHROPIC_API_KEY  (v61, optional) AI assignments — iske baghair assignments khud likh kar haath se mark hote hain
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PASSWORD = process.env.EMS_PASSWORD || "";
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const FILES_DIR = path.join(DATA_DIR, "files");     // v27: expense receipts (tasveer / PDF)
const FEE_RCPT_DIR = path.join(DATA_DIR, "fee-receipts");   // v43: parents ki app se bheji fee receipts
const MAX_FILE = 8 * 1024 * 1024;
const FILE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const EXT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const KEEP_BACKUPS = 45;                      // din
const MAX_BODY = 60 * 1024 * 1024;            // photos ke saath bhi kaafi
const SESSION_DAYS = 30;

if (PASSWORD.length < 8) {
  console.error("Set EMS_PASSWORD (at least 8 characters). Render: service → Environment.");
  process.exit(1);
}
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(FEE_RCPT_DIR, { recursive: true });

/* ---------- session cookie: password badalte hi purane login khud khatam ---------- */
const SECRET_FILE = path.join(DATA_DIR, ".secret");
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
const SIGN_KEY = crypto.createHash("sha256").update(fs.readFileSync(SECRET_FILE, "utf8") + "|" + PASSWORD).digest();
const sign = (s) => crypto.createHmac("sha256", SIGN_KEY).update(s).digest("base64url");
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
/* v31: do roles — "exec" (Executive, office password = EMS_PASSWORD) aur "admin" (password Executive
   EMS ki Settings se rakhta hai; PBKDF2 hash DB.settings.adminAuth mein). Admin ka token us hash ke
   tag se bandha hai — password badla to sab admin logins khatam. */
/* v32: teesra role "feeadmin" — admin jaisa, magar Fee / Billing bhi (password settings.feeAdminAuth).
   Aam "admin" ko fees ka koi data nahi jata. */
const ROLE_AUTH = { admin: "adminAuth", feeadmin: "feeAdminAuth" };
function newToken(role, tag) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  if (ROLE_AUTH[role]) return `${role}.${exp}.${tag}.${sign(`ems|${role}|${exp}|${tag}`)}`;
  return `${exp}.${sign("ems|" + exp)}`;
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((c) => {
    const i = c.indexOf("=");
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
/* v36: Teacher — har teacher ka apna Login ID + password (Executive Settings → Logins se rakhta hai;
   PBKDF2 hash employee.login mein). Token mein teacher ki id; password badla ya login band → token khatam. */
function teacherToken(e) {
  const exp = Date.now() + SESSION_DAYS * 864e5, tag = e.login.hash.slice(0, 12);
  return `teacher.${e.id}.${exp}.${tag}.${sign(`ems|teacher|${e.id}|${exp}|${tag}`)}`;
}
const teacherById = (id) => ((dbNow() || {}).employees || []).find((e) => e.id === id && e.category === "Teacher" && e.login && e.login.hash);
/* v78: → {e} ya {why} — "noid" (ye Login ID kisi ka nahi), "off" (employee Teacher category mein nahi), "pw" (password ghalat) */
const teacherKey = (user) => String(user || "").trim().toLowerCase().replace(/\s+/g, "");
function teacherLogin(user, pw) {
  const u = teacherKey(user);
  const any = u && ((dbNow() || {}).employees || []).find((x) => x.login && x.login.hash && x.login.user === u);
  if (!any) return { why: "noid" };
  if (any.category !== "Teacher") return { why: "off", e: any };
  const a = any.login, p = String(pw || "");
  const h = crypto.pbkdf2Sync(p, Buffer.from(a.salt, "hex"), +a.iter || 100000, 32, "sha256").toString("hex");
  if (safeEq(h, a.hash)) return { ok: true, e: any };
  /* phone keyboard ne aakhir mein space laga di ho */
  if (p !== p.trim() && safeEq(crypto.pbkdf2Sync(p.trim(), Buffer.from(a.salt, "hex"), +a.iter || 100000, 32, "sha256").toString("hex"), a.hash)) return { ok: true, e: any };
  return { why: "pw", e: any };
}
/* → {role, tid} ya null */
function authed(req) {
  const parts = String(cookies(req).ems_s || "").split(".");
  if (parts.length === 2) {                                   // Executive (purana format bhi yahi)
    const [exp, sig] = parts;
    return !!exp && !!sig && +exp > Date.now() && safeEq(sig, sign("ems|" + exp)) ? { role: "exec" } : null;
  }
  if (parts.length === 4 && ROLE_AUTH[parts[0]]) {
    const [role, exp, tag, sig] = parts;
    if (!(+exp > Date.now()) || !safeEq(sig, sign(`ems|${role}|${exp}|${tag}`))) return null;
    const a = roleAuth(role);
    return a && a.hash.startsWith(tag) ? { role } : null;
  }
  if (parts.length === 5 && parts[0] === "teacher") {
    const [, tid, exp, tag, sig] = parts;
    if (!(+exp > Date.now()) || !safeEq(sig, sign(`ems|teacher|${tid}|${exp}|${tag}`))) return null;
    const e = teacherById(tid);
    return e && e.login.hash.startsWith(tag) ? { role: "teacher", tid } : null;
  }
  return null;
}
function roleAuth(role) {
  const d = dbNow();
  const a = d && d.settings && d.settings[ROLE_AUTH[role]];
  return a && a.hash && a.salt ? a : null;
}
function rolePwOk(role, pw) {
  const a = roleAuth(role);
  if (!a || String(pw).length < 8) return false;
  const h = crypto.pbkdf2Sync(String(pw), Buffer.from(a.salt, "hex"), +a.iter || 100000, 32, "sha256").toString("hex");
  return safeEq(h, a.hash);
}
/* ================= v44: FEE ADMIN — 4 digit code =================
   Executive Settings se code rakhta hai (PBKDF2 hash settings.feeAdminCode). Jab tak Fee Admin code nahi
   likhta, server use Admin jaisa data deta hai (fees, receipts, income/expense nahi). Code sahi → 30 minute
   ke liye "ems_u" cookie, jo isi login aur isi code se bandhi hai. */
const UNLOCK_MIN = 30;
const feeCode = () => { const c = ((dbNow() || {}).settings || {}).feeAdminCode; return c && c.hash && c.salt ? c : null; };
const sessSig = (req) => String(cookies(req).ems_s || "").split(".").pop();
function feeUnlocked(req) {
  const c = feeCode(); if (!c) return { on: true, exp: 0, gated: false };
  const [exp, tag, sig] = String(cookies(req).ems_u || "").split(".");
  const ok = !!exp && +exp > Date.now() && c.hash.startsWith(tag || "x") && !!sig && safeEq(sig, sign(`unlock|${exp}|${tag}|${sessSig(req)}`));
  return { on: ok, exp: ok ? +exp : 0, gated: true };
}
function codeOk(code) {
  const c = feeCode(); if (!c || !/^\d{4}$/.test(String(code))) return false;
  const h = crypto.pbkdf2Sync(String(code), Buffer.from(c.salt, "hex"), +c.iter || 100000, 32, "sha256").toString("hex");
  return safeEq(h, c.hash);
}

/* Admin / Fee Admin ko hisaab-kitaab nahi jata: income/expense, salaries, teacher pay, login hashes.
   Aam Admin ko fees bhi nahi: challans, students ki monthly fee, one-time charges, subject fees. */
const redactCache = {};
const keyOf = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function dataFor(role, tid) {
  if (role === "exec") return state.dataText;
  const ck = role === "teacher" ? "teacher:" + tid : role;
  const c = redactCache[ck];
  if (c && c.v === state.version) return c.text;
  if (role === "teacher") {
    redactCache[ck] = { v: state.version, text: JSON.stringify(teacherView(JSON.parse(state.dataText) || {}, tid)) };
    return redactCache[ck].text;
  }
  const d = JSON.parse(state.dataText) || {};
  /* v44: Fee Admin (code se khula) ko Income / Expense bhi — salaries ke baghair */
  d.txns = role === "feeadmin" ? (d.txns || []).filter((t) => t.category !== SALARY_CAT) : [];
  d.classCosts = {};
  if (d.settings) { delete d.settings.adminAuth; delete d.settings.feeAdminAuth; delete d.settings.feeAdminCode; }
  (d.employees || []).forEach((e) => { delete e.salary; delete e.login; });
  if (role === "admin") {
    d.fees = []; d.feeReceipts = [];
    (d.students || []).forEach((st) => { delete st.monthlyFee; delete st.charges; (st.subjects || []).forEach((x) => { delete x.fee; }); });
  }
  redactCache[ck] = { v: state.version, text: JSON.stringify(d) };
  return redactCache[ck].text;
}

/* ---------- v36: teacher ko sirf apni classes — tests, marks aur Evening class attendance ----------
   Teacher ki classes = Employees mein assign ki gayi (shift + class) + jin students ke subject par wo teacher laga hai. */
/* v48: Evening bacha 2 classes mein (course + course2) */
const stuClasses = (st) => [st.course, st.shift === "Evening" ? st.course2 : ""].filter(Boolean);
const stuIn = (st, sh, c) => st.shift === sh && stuClasses(st).includes(c);
/* v79: teacher sirf apni shift ki classes — Evening teacher ko Morning ki class kabhi nahi (chahe kisi Morning bache ke subject par
   us ka naam laga ho), aur ulta. Both / Online → dono shifts. */
const teachShifts = (e) => (!e || !e.shift ? ["Morning", "Evening"] : e.shift === "Morning" ? ["Morning"] : e.shift === "Evening" ? ["Evening"] : ["Morning", "Evening"]);
function teacherClasses(d, tid) {
  const me = (d.employees || []).find((e) => e.id === tid) || {}, ok = teachShifts(me);
  const cls = new Set((me.assignments || []).filter((a) => ok.includes(a.shift)).map((a) => a.shift + "|" + a.course));
  (d.students || []).forEach((st) => { if (!ok.includes(st.shift)) return; (st.subjects || []).forEach((x) => { if (x.teacherId === tid) stuClasses(st).forEach((c) => cls.add(st.shift + "|" + c)); }); });
  return cls;
}
/* v46: teacher ke subjects har class mein — assignment ka subject, student ke subject par laga teacher,
   Create Exam mein chuna teacher, ya us ke naam ka test. Kisi class ki assignment bina subject ho → us class ke sab subjects. */
function teacherSubjects(d, tid, cls) {
  const me = (d.employees || []).find((e) => e.id === tid) || {};
  const map = new Map(), all = new Set();
  const add = (k, subj) => { if (!subj || (cls && !cls.has(k))) return; if (!map.has(k)) map.set(k, new Set()); map.get(k).add(keyOf(subj)); };
  (me.assignments || []).forEach((a) => { const k = a.shift + "|" + a.course; if (a.subject) add(k, a.subject); else all.add(k); });
  (d.students || []).forEach((st) => (st.subjects || []).forEach((x) => { if (x.teacherId === tid) stuClasses(st).forEach((c) => add(st.shift + "|" + c, x.name)); }));
  Object.entries((d.settings || {}).subjTeacher || {}).forEach(([key, t]) => { if (t !== tid) return; const [sh, c, sk] = key.split("|"); add(sh + "|" + c, sk); });
  (d.tests || []).forEach((t) => { if (t.teacherId === tid) add(t.shift + "|" + t.course, t.subject); });
  /* v60: class ke subjects kahin se bhi maloom hon to sirf wohi (bina-subject assignment ab poori class nahi kholti);
     kuch bhi maloom na ho tab hi poori class */
  return (k) => (map.has(k) ? map.get(k) : null);      // null = poori class
}
const subjHit = (set, name) => { const n = keyOf(name); for (const k of set) if (n === k || n.includes(k) || k.includes(n)) return true; return false; };
const testSeen = (t, tid, cls) => !!t && cls.has(t.shift + "|" + t.course) && (!t.teacherId || t.teacherId === tid);
const testOwn = (t, tid, cls) => !!t && t.by === "teacher" && t.teacherId === tid && t.shift === "Evening" && cls.has("Evening|" + t.course);
const catOwn = (c, tid, cls) => !!c && c.teacherId === tid && c.shift === "Evening" && cls.has("Evening|" + c.course);
/* v69: homework — teacher apni classes ka homework dekhta hai; apna banaya poora badal sakta hai,
   admin wale (bina teacher) mein sirf receival (done) update kar sakta hai, kisi aur teacher ka nahi chhoo sakta */
/* v70: teacher ko sirf is mahine ke active students — client wala activeIn / inMonth (roster + join + status) */
function activeNow(d) {
  const m = pktToday().slice(0, 7), RM = new Set();
  (d.students || []).forEach((s) => { if (s.roster) Object.keys(s.roster).forEach((k) => RM.add(k)); });
  const rm = [...RM].sort(), has = RM.has(m), lastR = rm.filter((k) => k < m).pop();
  return (s) => {
    if (s.joinMonth && m < s.joinMonth) return false;
    if (has) return !!(s.roster && s.roster[m] === "Active") || (s.joinMonth === m && !(s.roster && s.roster[m]) && s.status === "Active");
    if (lastR && s.roster && Object.keys(s.roster).length && !s.roster[lastR] && !Object.keys(s.roster).some((k) => k > lastR)) return false;
    if (s.doj && s.doj.slice(0, 7) > m) return false;
    return s.status === "Active" || !!(s.statusSince && s.statusSince.slice(0, 7) > m);
  };
}
const hwSeen = (h, tid, cls) => !!h && cls.has(h.shift + "|" + h.course) && (!h.teacherId || h.teacherId === tid);
function teacherView(d, tid) {
  const cls = teacherClasses(d, tid);
  const tests = (d.tests || []).filter((t) => testSeen(t, tid, cls));
  const ids = new Set(tests.map((t) => t.id));
  const s = d.settings || {}, subjOf = teacherSubjects(d, tid, cls);
  /* sirf apne subjects ke students — aur un ke subjects mein se sirf apne */
  /* jin classes mein teacher hai un mein se kisi mein bhi — aur un ke subjects mein se sirf apne */
  const keys = (st) => stuClasses(st).map((c) => st.shift + "|" + c).filter((k) => cls.has(k));
  /* v70: subject jis par koi aur teacher laga ho wo kabhi nahi; bina-subject class mein baqi sab, warna sirf apne */
  const mine = (st) => { const sets = keys(st).map(subjOf), L = (st.subjects || []).filter((x) => !x.teacherId || x.teacherId === tid);
    if (!sets.length || sets.some((x) => !x)) return L;
    return L.filter((x) => x.teacherId === tid || sets.some((set) => subjHit(set, x.name))); };
  const act = activeNow(d), today = pktToday(), since = new Date(Date.now() + 5 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10);
  const students = (d.students || []).filter((st) => act(st) && keys(st).length && (keys(st).some((k) => k.startsWith("Morning|") || !subjOf(k)) || mine(st).length));
  /* teacher ke apne subjects — Create test / homework ki list mein sirf yehi */
  const mySub = new Set();
  [...cls].forEach((k) => { const x = subjOf(k); if (x) x.forEach((v) => mySub.add(v)); });
  students.forEach((st) => mine(st).forEach((x) => mySub.add(keyOf(x.name))));
  ((d.employees || []).find((e) => e.id === tid) || {}).assignments?.forEach((a) => { if (a.subject) mySub.add(keyOf(a.subject)); });
  return {
    /* v60: Morning class ke sab bache khud (class se); Evening mein sirf apne subject wale (client wahi hisaab lagata hai) */
    students: students.map((st) => ({
      id: st.id, name: st.name, regNo: st.regNo, course: st.course, course2: st.course2, shift: st.shift, status: st.status, mode: st.mode,
      statusSince: st.statusSince, doj: st.doj, joinMonth: st.joinMonth, roster: st.roster, group: st.group,
      subjects: mine(st).map((x) => ({ name: x.name, teacherId: x.teacherId || "" })) })),
    /* v46: apni KPI checklist aur class audits — live KPI ke liye (sirf parhne ko) */
    kpis: (d.kpis || []).filter((k) => k.teacherId === tid),
    employees: (d.employees || []).filter((e) => e.id === tid).map((e) => e.id === tid      // v70: sirf apna record
      ? { id: e.id, name: e.name, category: e.category, shift: e.shift, teach: e.teach, assignments: (e.assignments || []).filter((a) => teachShifts(e).includes(a.shift)), online: !!e.online, schedule: e.schedule || {},
          /* v60: har class mein teacher ke subjects (null = subject maloom nahi, poori class) */
          scope: Object.fromEntries([...cls].map((k) => { const x = subjOf(k); return [k, x ? [...x] : null]; })) }
      : { id: e.id, name: e.name, category: e.category, shift: e.shift, online: !!e.online }),
    tests, exams: (d.exams || []).filter((e) => ids.has(e.testId)),
    classAtt: (d.classAtt || []).filter((c) => catOwn(c, tid, cls)),
    /* v71: admin ka "class li / nahi li" record — sirf is teacher ki entries (key = shift|class|subject|teacherId); teacherMerge ise nahi leta */
    classLog: Object.fromEntries(Object.entries(d.classLog || {}).map(([dt, day]) => [dt, Object.fromEntries(Object.entries(day || {}).filter(([k]) => k.endsWith("|" + tid)))])
      .filter(([, day]) => Object.keys(day).length)),
    subjects: (d.subjects || []).filter((x) => x && mySub.has(keyOf(x.name))),       // sirf wahi subject, milte-julte nahi
    /* v70: inquiry ki demo class jo is teacher ke saath rakhi gayi — sirf naam / class / waqt (phone nahi) */
    inquiries: (d.inquiries || []).filter((i) => i && i.demo && i.demo.teacherId === tid && String(i.demo.date || "") >= since)
      .map((i) => ({ id: i.id, name: i.name, course: i.course, shift: i.shift, mode: i.mode, stage: i.stage, date: i.date, log: [], demo: i.demo })),
    fees: [], txns: [], homework: (d.homework || []).filter((h) => hwSeen(h, tid, cls)), inventory: [], issues: [], attendance: {},
    /* v41: sirf apni staff attendance — dekhne ke liye; teacherMerge ise kabhi nahi leta */
    empAttendance: Object.fromEntries(Object.entries(d.empAttendance || {}).filter(([, day]) => day && day[tid]).map(([dt, day]) => [dt, { [tid]: day[tid] }])),
    classCosts: {}, parentAccess: [], studentAccess: [], parentMsgs: [], audits: (d.audits || []).filter((a) => a.teacherId === tid), counters: d.counters || {},
    settings: { name: s.name, addr: s.addr, phone: s.phone, logo: s.logo, latePolicy: s.latePolicy },
  };
}
/* Teacher ke save se sirf us ke apne hisse badalte hain — baaki sab server wala hi rehta hai */
function teacherMerge(data, tid) {
  const cur = JSON.parse(state.dataText) || {};
  const cls = teacherClasses(cur, tid);
  const arr = (x) => (Array.isArray(x) ? x.filter((y) => y && typeof y === "object" && y.id) : []);
  const curTests = arr(cur.tests), curById = new Map(curTests.map((t) => [t.id, t]));
  const tests = curTests.filter((t) => !testOwn(t, tid, cls))
    .concat(arr(data.tests).filter((t) => testOwn(t, tid, cls) && (!curById.has(t.id) || testOwn(curById.get(t.id), tid, cls))));
  const outIds = new Set(tests.map((t) => t.id));
  const gone = new Set(curTests.filter((t) => !outIds.has(t.id)).map((t) => t.id));        // teacher ne apna test hataya
  const testOf = new Map(tests.map((t) => [t.id, t]));
  const stu = new Map((cur.students || []).map((st) => [st.id, st]));
  const vis = (e) => { const t = e && testOf.get(e.testId); return !!t && testSeen(t, tid, cls); };
  const fits = (e) => { const t = testOf.get(e.testId), st = stu.get(e.studentId); return !!st && stuIn(st, t.shift, t.course); };
  const curEx = arr(cur.exams), curExById = new Map(curEx.map((e) => [e.id, e]));
  const exams = curEx.filter((e) => !gone.has(e.testId) && !vis(e))
    .concat(arr(data.exams).filter((e) => vis(e) && fits(e) && (!curExById.has(e.id) || vis(curExById.get(e.id)))));
  const curCa = arr(cur.classAtt), curCaById = new Map(curCa.map((c) => [c.id, c]));
  const classAtt = curCa.filter((c) => !catOwn(c, tid, cls))
    .concat(arr(data.classAtt).filter((c) => catOwn(c, tid, cls) && (!curCaById.has(c.id) || catOwn(curCaById.get(c.id), tid, cls))));
  /* v69: homework */
  const inCls = (h) => new Set((cur.students || []).filter((st) => stuIn(st, h.shift, h.course)).map((st) => st.id));
  const cleanDone = (h, done) => { const ok = inCls(h), out = {};
    if (done && typeof done === "object") for (const k of Object.keys(done)) if (ok.has(k) && done[k]) out[k] = typeof done[k] === "string" ? done[k].slice(0, 10) : true;
    return out; };
  const curHw = arr(cur.homework), newHw = new Map(arr(data.homework).map((h) => [h.id, h]));
  const homework = [];
  curHw.forEach((h) => {
    if (!hwSeen(h, tid, cls)) return homework.push(h);
    const n = newHw.get(h.id);
    if (!n) { if (h.teacherId !== tid) homework.push(h); return; }               // apna hi delete ho sakta hai
    if (h.teacherId === tid && hwSeen(n, tid, cls)) return homework.push({ ...n, teacherId: tid, by: "teacher", done: cleanDone(n, n.done) });
    homework.push({ ...h, done: cleanDone(h, n.done), checkedOn: n.checkedOn || h.checkedOn });   // sirf receival
  });
  const curIds = new Set(curHw.map((h) => h.id));
  newHw.forEach((n) => { if (!curIds.has(n.id) && hwSeen({ ...n, teacherId: tid }, tid, cls)) homework.push({ ...n, teacherId: tid, by: "teacher", done: cleanDone(n, n.done) }); });
  return Object.assign(cur, { tests, exams, classAtt, homework });
}
/* Admin ke save mein chhupaye hue hisse server wale hi rehte hain */
const SALARY_CAT = "Salary & Wages";
function keepProtected(data, role) {
  const cur = JSON.parse(state.dataText) || {};
  /* Fee Admin (khula hua) apni income / expense entries badal sakta hai; salary entries server wali hi */
  data.txns = role === "feeadmin"
    ? (Array.isArray(data.txns) ? data.txns : []).filter((t) => t && t.category !== SALARY_CAT).concat((cur.txns || []).filter((t) => t.category === SALARY_CAT))
    : cur.txns || [];
  data.classCosts = cur.classCosts || {};
  data.settings = Object.assign({}, data.settings || {});
  const cs = cur.settings || {};
  ["adminAuth", "feeAdminAuth", "feeAdminCode", "salaryAuto"].forEach((k) => { if (cs[k] !== undefined) data.settings[k] = cs[k]; else delete data.settings[k]; });
  const sal = new Map((cur.employees || []).map((e) => [e.id, e.salary]));
  const login = new Map((cur.employees || []).map((e) => [e.id, e.login]));
  (data.employees || []).forEach((e) => {
    if (sal.has(e.id)) e.salary = sal.get(e.id);
    if (login.get(e.id)) e.login = login.get(e.id); else delete e.login;          // teacher passwords sirf Executive
  });
  if (role === "admin") {
    data.feeReceipts = cur.feeReceipts || [];                                 // v43: fee receipts sirf fee wale dekhte hain
    const ids = new Set((data.students || []).map((st) => st.id));
    data.fees = (cur.fees || []).filter((f) => ids.has(f.studentId));       // admin ne student hataya to us ke challan bhi
    const old = new Map((cur.students || []).map((st) => [st.id, st]));
    (data.students || []).forEach((st) => {
      const o = old.get(st.id); if (!o) return;
      st.monthlyFee = o.monthlyFee; st.charges = o.charges;
      const fee = new Map((o.subjects || []).map((x) => [keyOf(x.name), x.fee]));
      (st.subjects || []).forEach((x) => { const k = keyOf(x.name); if (fee.has(k)) x.fee = fee.get(k); else delete x.fee; });
    });
  }
  return data;
}
const isHttps = (req) => String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
function setSession(req, res, token, maxAge) {
  res.setHeader("Set-Cookie",
    `ems_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`);
}

/* ---------- login ki ghalat koshishon par rok ---------- */
const fails = new Map();                       // ip → {n, until}
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
function blocked(ip, max = 10) {
  const f = fails.get(ip);
  return f && f.until > Date.now() && f.n >= max;
}
function failed(ip) {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) fails.set(ip, { n: 1, until: Date.now() + 15 * 60e3 });
  else f.n++;
}

/* ---------- data: memory mein + disk par ---------- */
let state = { version: 0, updatedAt: null, dataText: "null" };
if (fs.existsSync(DB_FILE)) {
  const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  state = { version: raw.version || 0, updatedAt: raw.updatedAt || null, dataText: JSON.stringify(raw.data ?? null) };
}
const fileText = (s) => `{"version":${s.version},"updatedAt":${JSON.stringify(s.updatedAt)},"data":${s.dataText}}`;
function writeAtomic(file, text) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function persist(next, label) {
  /* Import (poora data badalna) se pehle ka haal alag rakh lo */
  if (label === "import" && state.version > 0)
    writeAtomic(path.join(BACKUP_DIR, `before-import-${stamp()}.json`), fileText(state));
  writeAtomic(DB_FILE, fileText(next));
  writeAtomic(path.join(BACKUP_DIR, `db-${next.updatedAt.slice(0, 10)}.json`), fileText(next));   // din ka aakhri haal
  state = next;
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).sort();
  const daily = old.filter((f) => f.startsWith("db-"));
  daily.slice(0, Math.max(0, daily.length - KEEP_BACKUPS)).forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  const imports = old.filter((f) => f.startsWith("before-import-"));
  imports.slice(0, Math.max(0, imports.length - 10)).forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/* ================= v58: ACTIVITY LOG =================
   Kis ne kab login kiya, kaunsa hissa khola, kya daala / badla / mitaya — server khud likhta hai (DATA_DIR/activity.jsonl),
   is liye browser se badla ya mitaya nahi ja sakta. Sirf Executive parh sakta hai (/api/activity). */
const ACT_FILE = path.join(DATA_DIR, "activity.jsonl");
const ACT_KEEP_DAYS = 180, ACT_MAX_BYTES = 12 * 1024 * 1024;
const shortUA = (ua) => { ua = String(ua || "");
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "";
  return [br, os].filter(Boolean).join(" · ") || ua.slice(0, 40); };
function actWho(auth) {
  const d = dbNow() || {}, s = d.settings || {};
  if (!auth) return { role: "", name: "" };
  if (auth.role === "exec") return { role: "exec", name: "Executive" };
  if (auth.role === "feeadmin") return { role: "feeadmin", name: "Fee Admin" + (s.feeAdminAuth && s.feeAdminAuth.who ? " (" + s.feeAdminAuth.who + ")" : "") };
  if (auth.role === "admin") return { role: "admin", name: "Admin" };
  if (auth.role === "teacher") { const e = (d.employees || []).find((x) => x.id === auth.tid); return { role: "teacher", name: "Teacher: " + (e ? e.name : auth.tid) }; }
  return { role: auth.role, name: auth.role };
}
function logAct(req, who, action, detail) {
  try {
    let raw = String((req && req.headers["x-ems-me"]) || ""); try { raw = decodeURIComponent(raw); } catch {}
    const me = raw.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40);
    const line = { t: new Date().toISOString(), role: who.role || "", name: who.name || "", as: me && me !== who.name ? me : "",
      ip: req ? clientIp(req) : "", dev: req ? shortUA(req.headers["user-agent"]) : "", action, detail: String(detail || "").slice(0, 1500) };
    fs.appendFileSync(ACT_FILE, JSON.stringify(line) + "\n");
    if (fs.statSync(ACT_FILE).size > ACT_MAX_BYTES) actTrim();
  } catch (e) { console.error("activity log", e.message); }
}
function actTrim() {
  try {
    if (!fs.existsSync(ACT_FILE)) return;
    const cut = new Date(Date.now() - ACT_KEEP_DAYS * 864e5).toISOString();
    let lines = fs.readFileSync(ACT_FILE, "utf8").split("\n").filter((l) => l && l.slice(6, 30) >= cut);
    while (lines.join("\n").length > ACT_MAX_BYTES * 0.7) lines = lines.slice(Math.ceil(lines.length * 0.1));
    writeAtomic(ACT_FILE, lines.join("\n") + (lines.length ? "\n" : ""));
  } catch (e) { console.error("activity trim", e.message); }
}
function actRead(q) {
  if (!fs.existsSync(ACT_FILE)) return [];
  let rows = fs.readFileSync(ACT_FILE, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (q.role) rows = rows.filter((r) => r.role === q.role);
  if (q.date) rows = rows.filter((r) => String(r.t).slice(0, 10) === q.date || pktDate(r.t) === q.date);
  if (q.kind === "changes") rows = rows.filter((r) => r.action === "Saved changes" || /import|delete/i.test(r.action));
  if (q.kind === "logins") rows = rows.filter((r) => /login|logout|unlock/i.test(r.action));
  if (q.q) { const k = q.q.toLowerCase(); rows = rows.filter((r) => (r.name + " " + r.as + " " + r.action + " " + r.detail + " " + r.ip).toLowerCase().includes(k)); }
  return rows.reverse();
}
const pktDate = (iso) => new Date(new Date(iso).getTime() + 5 * 3600e3).toISOString().slice(0, 10);

/* key ki tarteeb se farq na pare (server admin ke liye chhupi fields wapas jorta hai to tarteeb badal jati hai) */
const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
/* Save se pehle aur baad ka data — kya badla, insaani zabaan mein */
const ACT_COLS = { students: "Students", fees: "Fee challans", employees: "Employees", txns: "Income / Expense", inquiries: "Inquiries",
  exams: "Exam marks", tests: "Tests", homework: "Homework", inventory: "Inventory", issues: "Issuance", audits: "Class audits", kpis: "KPI checklists",
  subjects: "Subjects", feeReceipts: "Fee receipts (app)", parentAccess: "Parent access", studentAccess: "Student logins (Evening)", parentMsgs: "Parent messages", classAtt: "Class attendance" };
const ACT_SKIP_FIELDS = new Set(["hash", "salt", "iter"]);
const recLabel = (r, col) => {
  if (!r || typeof r !== "object") return "?";
  if (col === "fees") return [r.chNo, r.month].filter(Boolean).join(" ") || r.id;
  if (col === "exams") return [r.exam, r.subject].filter(Boolean).join(" · ") || r.id;
  if (col === "txns") return `${r.type || ""} ${r.desc || ""} Rs ${r.amount || 0}`.trim();
  if (col === "studentAccess") return "login" + (r.active === false ? " (closed)" : "");
  return r.name || r.studentName || r.title || r.chNo || r.desc || r.subject || r.phone || r.id || "?";
};
const shortVal = (v) => { if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : "{…}";
  const t = String(v); return t.startsWith("data:") ? "(image)" : t.length > 40 ? t.slice(0, 37) + "…" : t; };
function fieldDiff(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]), out = [];
  keys.forEach((k) => { if (ACT_SKIP_FIELDS.has(k)) return;
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    if (canon(x) === canon(y)) return;
    out.push(k === "photo" ? "photo changed" : (typeof x === "object" && x) || (typeof y === "object" && y) ? `${k} changed` : `${k}: ${shortVal(x)} → ${shortVal(y)}`); });
  return out;
}
function diffData(before, after) {
  before = before || {}; after = after || {};
  const parts = [], names = (stu) => (id) => { const st = (after.students || before.students || []).find((x) => x.id === id); return st ? st.name : ""; };
  Object.keys(ACT_COLS).forEach((col) => {
    const A = Array.isArray(before[col]) ? before[col] : [], B = Array.isArray(after[col]) ? after[col] : [];
    if (!A.length && !B.length) return;
    const ma = new Map(A.filter((r) => r && r.id).map((r) => [r.id, r])), mb = new Map(B.filter((r) => r && r.id).map((r) => [r.id, r]));
    const add = [...mb.keys()].filter((k) => !ma.has(k)), del = [...ma.keys()].filter((k) => !mb.has(k));
    const chg = [...mb.keys()].filter((k) => ma.has(k) && canon(ma.get(k)) !== canon(mb.get(k)));
    if (!add.length && !del.length && !chg.length) return;
    const who = (r) => { const n = col !== "students" && r && r.studentId ? names()(r.studentId) : ""; return recLabel(r, col) + (n ? ` (${n})` : ""); };
    const bits = [];
    if (add.length) bits.push(`+${add.length} added: ${add.slice(0, 5).map((k) => who(mb.get(k))).join(", ")}${add.length > 5 ? " …" : ""}`);
    if (chg.length) bits.push(`~${chg.length} changed: ${chg.slice(0, 4).map((k) => { const f = fieldDiff(ma.get(k), mb.get(k)); return `${who(mb.get(k))} [${f.slice(0, 5).join("; ")}${f.length > 5 ? "; …" : ""}]`; }).join(", ")}${chg.length > 4 ? " …" : ""}`);
    if (del.length) bits.push(`−${del.length} deleted: ${del.slice(0, 5).map((k) => who(ma.get(k))).join(", ")}${del.length > 5 ? " …" : ""}`);
    parts.push(`${ACT_COLS[col]}: ${bits.join(" · ")}`);
  });
  [["attendance", "Student attendance"], ["empAttendance", "Staff attendance"], ["classLog", "Classes taken"]].forEach(([col, label]) => {
    const A = before[col] || {}, B = after[col] || {};
    const days = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((d) => canon(A[d]) !== canon(B[d])).sort();
    if (!days.length) return;
    parts.push(`${label}: ${days.slice(0, 4).map((d) => { const a = A[d] || {}, b = B[d] || {};
      const n = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => canon(a[k]) !== canon(b[k])).length;
      return `${d} (${n} ${col === "attendance" ? "students" : col === "classLog" ? "classes" : "staff"})`; }).join(", ")}${days.length > 4 ? " …" : ""}`);
  });
  const sa = before.settings || {}, sb = after.settings || {};
  const sk = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter((k) => canon(sa[k]) !== canon(sb[k]));
  if (sk.length) parts.push("Settings: " + sk.map((k) => ({ adminAuth: "Admin password", feeAdminAuth: "Fee Admin password", feeAdminCode: "Fee Admin code", logo: "logo", appIcons: "app icons" }[k] ||
    (typeof sb[k] === "object" ? k + " changed" : `${k}: ${shortVal(sa[k])} → ${shortVal(sb[k])}`))).join(" · "));
  const ea = new Map((before.employees || []).map((e) => [e.id, e])), loginChg = (after.employees || []).filter((e) => canon((ea.get(e.id) || {}).login) !== canon(e.login));
  if (loginChg.length) parts.push("Teacher logins: " + loginChg.map((e) => e.name + (e.login ? " (password set)" : " (disabled)")).join(", "));
  return parts;
}

/* ================= v28: PARENTS CHATBOT =================
   Parents ka login staff se bilkul alag: phone + 6 digit PIN (admin EMS ke "Parents" page se banata hai,
   PBKDF2 hash DB mein). Parent sirf apne bachon ka data dekh sakta hai — jawab yahin server par
   banta hai aur poora database kabhi browser tak nahi jata. */
const bot = require("./parent-bot");
const PARENT_HTML = fs.readFileSync(path.join(__dirname, "parent.html"), "utf8");
const PARENT_KEY = crypto.createHash("sha256").update(fs.readFileSync(SECRET_FILE, "utf8") + "|parents").digest();
const psign = (x) => crypto.createHmac("sha256", PARENT_KEY).update(x).digest("base64url");
const LOGINS_FILE = path.join(DATA_DIR, "parent-logins.json");
let parentLogins = {};
try { parentLogins = JSON.parse(fs.readFileSync(LOGINS_FILE, "utf8")); } catch { parentLogins = {}; }
let parsed = { v: -1, db: null };
function dbNow() {
  if (parsed.v !== state.version) parsed = { v: state.version, db: JSON.parse(state.dataText) || {} };
  return parsed.db;
}
/* Server khud data badle (parent ka message) — version barhta hai, staff ke browsers 8 sec mein utha lete hain */
function mutateDb(fn) {
  const data = JSON.parse(state.dataText) || {};
  fn(data);
  persist({ version: state.version + 1, updatedAt: new Date().toISOString(), dataText: JSON.stringify(data) }, "");
}
const accessFor = (db, key) => (db.parentAccess || []).find((a) => a.phone === key && a.active !== false && a.hash);
function pinOk(acc, pin) {
  if (!acc || !/^\d{6}$/.test(String(pin))) return false;
  const h = crypto.pbkdf2Sync(String(pin), Buffer.from(acc.salt, "hex"), +acc.iter || 100000, 32, "sha256").toString("hex");
  return safeEq(h, acc.hash);
}
function parentToken(acc) {
  const exp = Date.now() + 60 * 864e5, tag = acc.hash.slice(0, 12);
  return `${acc.phone}.${exp}.${tag}.${psign(`p|${acc.phone}|${exp}|${tag}`)}`;
}
/* PIN badla ya access band hua to purana login khud khatam (tag match nahi karega) */
function parentOf(req) {
  const [key, exp, tag, sig] = String(cookies(req).ems_p || "").split(".");
  if (!key || !exp || !tag || !sig || +exp < Date.now() || !safeEq(sig, psign(`p|${key}|${exp}|${tag}`))) return null;
  const db = dbNow(), acc = accessFor(db, key);
  if (!acc || !acc.hash.startsWith(tag)) return null;
  return { key, db, acc };
}
function setParentCookie(req, res, token, maxAge) {
  res.setHeader("Set-Cookie", `ems_p=${token}; Path=/parent; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`);
}
const hits = new Map();
function tooMany(key, limit, windowMs) {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < windowMs);
  h.push(now); hits.set(key, h);
  return h.length > limit;
}
const pktToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   // Pakistan time (UTC+5)
const schoolName = (db) => (db && db.settings && db.settings.name) || "Cambridge Grads Academy";
const childView = (st) => ({ id: st.id, name: st.name, course: st.course, shift: st.shift, regNo: st.regNo });
const escHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* v61: assignments — AI generator / checker aur student portal (/student). Data DATA_DIR/asg mein, db.json se alag. */
const asg = require("./assignments")({
  DATA_DIR, send: (...a) => send(...a), sendJson: (...a) => sendJson(...a), readBody: (r) => readBody(r), readRaw: (r, l) => readRaw(r, l),
  sameOrigin: (r) => sameOrigin(r), dbNow, logAct, actWho, accessFor, pinOk, childrenOf: bot.childrenOf, phoneKey: bot.phoneKey,
  clientIp, blocked, failed, fails, isHttps, escHtml, schoolName, teacherClasses, mutateDb: (fn) => mutateDb(fn),
});
async function asgRoute(fn, res) {
  try { return await fn(); }
  catch (e) {
    if (e && e.status && e.status < 500) return sendJson(res, e.status, { error: e.message });
    throw e;
  }
}

/* ---------- pages ---------- */
const APP_HTML = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
if (!APP_HTML.includes("<!--EMS_SERVER_BOOT-->")) throw new Error("<!--EMS_SERVER_BOOT--> not found in index.html");
const jsonForScript = (text) => text.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
function appPage(role, tid, view, ul) {
  const boot = `<script>window.__EMS__={version:${state.version},role:${JSON.stringify(role)},tid:${JSON.stringify(tid || "")},unlock:${JSON.stringify(ul || {})},data:${jsonForScript(dataFor(view || role, tid))}};</script>`;
  return APP_HTML.replace("<!--EMS_SERVER_BOOT-->", () => boot);
}
/* v38: Staff (/login) aur Teachers (/teacher) ke alag login pages — dono /login par post karte hain */
function loginPage(msg, teacher) {
  const school = escHtml(schoolName(dbNow()));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>CGA EMS — ${teacher ? "Teacher Login" : "Login"}</title>
${APP_HEAD(teacher ? "teacher" : "staff")}
<link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{font-family:"League Spartan","Segoe UI",Arial,sans-serif;background:radial-gradient(120% 80% at 50% 0%,#1E6A84 0%,#174B60 45%,#0F3646 100%);color:#12313D;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom))}
.card{background:#fff;border-radius:22px;padding:28px 24px 22px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.logo{width:84px;height:84px;border-radius:22px;background:#fff;box-shadow:0 8px 24px rgba(23,75,96,.25);display:flex;align-items:center;justify-content:center;margin:-70px auto 12px;padding:8px}
.logo img{width:100%;height:100%;object-fit:contain}
h1{font-size:1.45rem;font-weight:800;text-align:center}
.sub{color:#6B7C85;font-size:.92rem;text-align:center;margin:4px 0 18px}
.seg{display:grid;grid-template-columns:1fr 1fr 1fr;background:#EEF3F5;border-radius:12px;padding:4px;margin-bottom:18px}
.seg a{text-align:center;padding:10px 6px;border-radius:9px;font-weight:700;font-size:.95rem;color:#6B7C85;text-decoration:none}
.seg a.on{background:#fff;color:#174B60;box-shadow:0 2px 8px rgba(0,0,0,.08)}
label{font-size:.85rem;font-weight:700;display:block;margin:0 0 6px}
.f{position:relative;margin-bottom:14px}
input{width:100%;font:inherit;font-size:17px;padding:14px 14px;border:1.5px solid #D5DEE2;border-radius:12px;background:#F8FAFB}
input:focus{outline:none;border-color:#159670;background:#fff;box-shadow:0 0 0 4px rgba(21,150,112,.15)}
.eye{position:absolute;right:6px;bottom:6px;width:44px;height:40px;border:none;background:transparent;font-size:1.15rem;cursor:pointer;border-radius:9px;margin:0;padding:0;color:#174B60}
.go{width:100%;margin-top:4px;padding:15px;border:none;border-radius:12px;background:#159670;color:#fff;font:inherit;font-size:1.08rem;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(21,150,112,.35)}
.go:active{transform:translateY(1px)}
.go[disabled]{opacity:.7}
.keep{display:flex;align-items:center;gap:8px;justify-content:center;color:#6B7C85;font-size:.82rem;margin-top:12px}
.err{background:#fdecea;color:#C0392B;border-radius:10px;padding:10px 12px;font-size:.9rem;margin-bottom:14px;font-weight:600}
.inst{display:none;width:100%;margin-top:12px;padding:12px;border:1.5px dashed #9CBCC9;border-radius:12px;background:#fff;color:#174B60;font:inherit;font-weight:700;cursor:pointer}
.foot{color:#CFE3EA;font-size:.8rem;margin-top:18px;text-align:center}
.foot a{color:#fff;font-weight:700}
</style></head><body>
<form class="card" method="post" action="/login" onsubmit="this.querySelector('.go').disabled=true;this.querySelector('.go').textContent='Signing in…'">
  <div class="logo"><img src="/icons/cga-192.png" alt="${school}"></div>
  <h1>${teacher ? "Teacher Portal" : "CGA EMS"}</h1>
  <p class="sub">${school}${teacher ? " · tests, marks and class attendance" : " · staff login"}</p>
  <div class="seg"><a href="/login" class="${teacher ? "" : "on"}">🏢 Staff</a><a href="/teacher" class="${teacher ? "on" : ""}">🧑‍🏫 Teacher</a><a href="/student">🎓 Student</a></div>
  ${msg ? `<div class="err">${msg}</div>` : ""}
  ${teacher ? `<div class="f"><label for="user">Login ID</label>
  <input id="user" name="user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus placeholder="e.g. ahmed"></div>` : ""}
  <div class="f"><label for="pw">Password${teacher ? "" : " <span style=\"font-weight:500;color:#6B7C85\">(Executive / Fee Admin / Admin)</span>"}</label>
  <input id="pw" type="password" name="password" autocomplete="current-password" required ${teacher ? "" : "autofocus"} placeholder="••••••••">
  <button type="button" class="eye" aria-label="Show password" onclick="const i=document.getElementById('pw');i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'">👁</button></div>
  <button class="go" type="submit">Sign in</button>
  <div class="keep">🔒 You stay signed in on this device for ${SESSION_DAYS} days</div>
  <button type="button" class="inst" id="inst">📲 Install the app on this phone</button>
</form>
<div class="foot">Parent? <a href="/parent">Open the Parents App →</a></div>
<script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
let ev=null;addEventListener("beforeinstallprompt",e=>{e.preventDefault();ev=e;document.getElementById("inst").style.display="block";});
document.getElementById("inst").onclick=()=>{if(ev){ev.prompt();ev=null;document.getElementById("inst").style.display="none";}};
if(/iPhone|iPad/.test(navigator.userAgent)&&!navigator.standalone){const b=document.getElementById("inst");b.style.display="block";b.textContent="📲 Install: tap Share ⬆ then “Add to Home Screen”";b.onclick=null;}</script></body></html>`;
}

/* ================= v41: APP (phone / desktop par install) =================
   Manifest + service worker + icons — login ke baghair milte hain (browser inhein cookie ke baghair mangta hai).
   Icons: Executive ke browser ne logo se jo PNG banaye (settings.appIcons), warna saada rangeen icon. */
/* v42: App icon = CGA logo (ems/icons — logo ka nishan + "CGA") */
const ICONS = Object.fromEntries([180, 192, 512].map((n) => [n, fs.readFileSync(path.join(__dirname, "icons", `icon-${n}.png`))]));
function manifest(kind) {
  const name = schoolName(dbNow());
  const k = { staff: { id: "/", start: "/", n: `${name} — EMS`, s: "CGA EMS" },
              teacher: { id: "/teacher", start: "/teacher", n: `${name} — Teachers`, s: "CGA Teacher" },
              parent: { id: "/parent", start: "/parent", n: `${name} — Parents`, s: "CGA Parents" } }[kind];
  return JSON.stringify({ id: k.id, name: k.n, short_name: k.s, start_url: k.start, scope: kind === "parent" ? "/parent" : "/",
    display: "standalone", background_color: "#174B60", theme_color: "#174B60", lang: "en",
    icons: [192, 512].map((n) => ({ src: `/icons/cga-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" })) });
}
/* Sirf page ka request — data kabhi cache nahi hota; internet na ho to saada paigham */
const SW_JS = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#174B60;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px"><div><h2>No internet connection</h2><p>Open the app again once you are back online.</p></div>', { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});`;
const APP_HEAD = (kind) => `<link rel="manifest" href="/${kind === "teacher" ? "teacher" : "app"}.webmanifest"><meta name="theme-color" content="#174B60"><link rel="apple-touch-icon" href="/icons/cga-180.png"><link rel="icon" type="image/png" href="/icons/cga-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${kind === "teacher" ? "CGA Teacher" : "CGA EMS"}">`;

/* ---------- http ---------- */
const SEC_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
};
function send(res, code, body, type, extra) {
  res.writeHead(code, { ...SEC_HEADERS, "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) });
  res.end(body);
}
const sendJson = (res, code, obj) => send(res, code, typeof obj === "string" ? obj : JSON.stringify(obj), "application/json; charset=utf-8");
const redirect = (res, to) => send(res, 303, "", "text/plain", { Location: to });

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
/* Doosri website se form/fetch bhej kar data na badla ja sake */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (p === "/healthz") return send(res, 200, "ok");
    if (p === "/app.webmanifest" || p === "/manifest.webmanifest") return send(res, 200, manifest("staff"), "application/manifest+json");
    if (p === "/teacher.webmanifest") return send(res, 200, manifest("teacher"), "application/manifest+json");
    if (p === "/parent/app.webmanifest") return send(res, 200, manifest("parent"), "application/manifest+json");
    if (p === "/sw.js") return send(res, 200, SW_JS, "text/javascript; charset=utf-8", { "Cache-Control": "no-cache" });
    const im = p.match(/^\/(?:icons\/cga-|app-icon-)(180|192|512)\.png$/);
    if (im) return send(res, 200, ICONS[im[1]], "image/png", { "Cache-Control": "public, max-age=86400" });

    /* ---------- parents (staff login se alag) ---------- */
    if (p === "/parent" && req.method === "GET")
      return send(res, 200, PARENT_HTML.replace(/\{\{SCHOOL\}\}/g, escHtml(schoolName(dbNow()))), "text/html; charset=utf-8");
    if (p === "/parent/login" && req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const ip = clientIp(req);
      const body = JSON.parse((await readBody(req)) || "{}");
      const key = bot.phoneKey(body.phone);
      if (blocked("p:" + ip) || (key && blocked("pp:" + key)))
        return sendJson(res, 429, { error: "Too many wrong attempts — try again in 15 minutes." });
      const acc = key && accessFor(dbNow(), key);
      if (!acc || !pinOk(acc, String(body.pin || "").trim())) {
        failed("p:" + ip); if (key) failed("pp:" + key);
        logAct(req, { role: "parent", name: "Parent 0" + (key || "?") }, "Failed login", "Parents app — wrong phone or PIN");
        return sendJson(res, 401, { error: "Wrong phone number or PIN." });
      }
      fails.delete("p:" + ip); fails.delete("pp:" + key);
      parentLogins[key] = new Date().toISOString();
      logAct(req, { role: "parent", name: "Parent 0" + key }, "Login", "Parents app");
      try { writeAtomic(LOGINS_FILE, JSON.stringify(parentLogins)); } catch {}
      setParentCookie(req, res, parentToken(acc), 60 * 86400);
      return sendJson(res, 200, { ok: true });
    }
    if (p === "/parent/logout") {
      setParentCookie(req, res, "", 0);
      return redirect(res, "/parent");
    }
    if (p.startsWith("/parent/api/")) {
      const who = parentOf(req);
      if (!who) return sendJson(res, 401, { error: "login" });
      const kids = bot.childrenOf(who.db, who.key);
      /* v43: is bache ke baqi challans + bheji hui receipts (receipt form ke liye) */
      if (p === "/parent/api/challans" && req.method === "GET") {
        const child = kids.find((k) => k.id === url.searchParams.get("studentId"));
        if (!child) return sendJson(res, 400, { error: "Choose a child first." });
        const fees = (who.db.fees || []).filter((f) => f.studentId === child.id && bot.feeOutstanding(f) > 0)
          .sort((a, b) => String(b.month).localeCompare(String(a.month)))
          .map((f) => ({ id: f.id, chNo: f.chNo || "", month: f.month, amount: +f.amount || 0, due: bot.feeOutstanding(f), dueDate: f.dueDate || "" }));
        const receipts = (who.db.feeReceipts || []).filter((r) => r.studentId === child.id && r.phone === who.key)
          .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 5)
          .map((r) => ({ d: r.d, chNo: r.chNo, amount: r.amount, status: r.status, note: r.note || "" }));
        return sendJson(res, 200, { fees, receipts });
      }
      if (p === "/parent/api/student-session" && req.method === "GET") {   // v72: My Report / Assignments pages
        asg.parentBridge(req, res, who.key, who.acc);
        return sendJson(res, 200, { ok: true });
      }
      if (p === "/parent/api/me" && req.method === "GET") {
        const replies = (who.db.parentMsgs || []).filter((m) => m.phone === who.key && m.reply).length;
        return sendJson(res, 200, { school: schoolName(who.db), children: kids.map(childView), menu: bot.MENU, replies });
      }
      if (req.method !== "POST") return send(res, 404, "Not found");
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const child = kids.find((k) => k.id === body.studentId) || (kids.length === 1 ? kids[0] : null);
      if (!child) return sendJson(res, 400, { error: "Choose a child first." });
      if (p === "/parent/api/chat") {
        if (tooMany("chat:" + who.key, 40, 60e3)) return sendJson(res, 429, { error: "Please wait a moment and ask again." });
        const r = bot.reply(who.db, child, String(body.text || "").slice(0, 300), who.key, pktToday());
        return sendJson(res, 200, { ...r, child: childView(child) });
      }
      if (p === "/parent/api/receipt") {
        const m = String(body.file || "").match(/^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) return sendJson(res, 400, { error: "Attach a receipt photo (JPG / PNG) or PDF." });
        const buf = Buffer.from(m[2], "base64"), ext = FILE_TYPES[m[1]];
        const magic = { jpg: [0xff, 0xd8], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46], pdf: [0x25, 0x50, 0x44, 0x46] }[ext];
        if (!buf.length || buf.length > 6 * 1024 * 1024 || !magic.every((b, i) => buf[i] === b))
          return sendJson(res, 400, { error: "This file is not valid — send a photo or PDF up to 6 MB." });
        const amount = Math.round(+body.amount || 0);
        if (!(amount > 0 && amount < 10000000)) return sendJson(res, 400, { error: "Enter the amount paid." });
        const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paidOn || "")) ? String(body.paidOn) : pktToday();
        const fee = body.feeId ? (who.db.fees || []).find((f) => f.id === body.feeId && f.studentId === child.id) : null;
        if (body.feeId && !fee) return sendJson(res, 400, { error: "This challan does not belong to this child." });
        if (tooMany("rcpt:" + who.key, 8, 864e5)) return sendJson(res, 429, { error: "Today's receipt limit reached — send it tomorrow or show it at the school." });
        const METHODS = ["Bank transfer", "JazzCash", "EasyPaisa", "Cash (school)", "Other"];
        const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
        writeAtomic(path.join(FEE_RCPT_DIR, name), buf);
        mutateDb((d) => {
          d.feeReceipts = d.feeReceipts || [];
          d.feeReceipts.push({ id: crypto.randomBytes(8).toString("hex"), studentId: child.id, studentName: child.name, phone: who.key,
            feeId: fee ? fee.id : "", chNo: fee ? fee.chNo || "" : "", month: fee ? fee.month : "", amount, paidOn,
            method: METHODS.includes(body.method) ? body.method : "Other", ref: String(body.ref || "").trim().slice(0, 60),
            file: `/fee-receipts/${name}`, fileType: ext, d: new Date().toISOString(), status: "Pending", note: "" });
        });
        logAct(req, { role: "parent", name: "Parent 0" + who.key }, "Fee receipt sent", `${child.name} · Rs ${amount}${fee ? " · " + (fee.chNo || "") : ""}`);
        return sendJson(res, 200, { ok: true });
      }
      if (p === "/parent/api/message") {
        const text = String(body.text || "").trim().slice(0, 1000);
        if (text.length < 3) return sendJson(res, 400, { error: "Write a message." });
        if (tooMany("msg:" + who.key, 10, 864e5)) return sendJson(res, 429, { error: "Today's message limit reached — send again tomorrow or call the school." });
        mutateDb((d) => {
          d.parentMsgs = d.parentMsgs || [];
          d.parentMsgs.push({ id: crypto.randomBytes(8).toString("hex"), studentId: child.id, studentName: child.name,
            phone: who.key, d: new Date().toISOString(), text, status: "Open", reply: "", repliedOn: "" });
        });
        logAct(req, { role: "parent", name: "Parent 0" + who.key }, "Message sent", `${child.name}: ${text.slice(0, 120)}`);
        return sendJson(res, 200, { ok: true });
      }
      return send(res, 404, "Not found");
    }

    if (p === "/student" || p.startsWith("/student/")) return await asgRoute(() => asg.student(req, res, url), res);

    if (p === "/teacher" && req.method === "GET") {
      if (authed(req)) return redirect(res, "/");
      return send(res, 200, loginPage("", true), "text/html; charset=utf-8");
    }
    if (p === "/login" && req.method === "GET") {
      if (authed(req)) return redirect(res, "/");
      return send(res, 200, loginPage(""), "text/html; charset=utf-8");
    }
    if (p === "/login" && req.method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, "Forbidden");
      const ip = clientIp(req);
      const form = new URLSearchParams(await readBody(req));
      const pw = form.get("password") || "", user = String(form.get("user") || "").trim();
      /* v78: teacher ki ghalti sirf usi Login ID ko rokti hai (sab teachers aik hi Wi-Fi / IP par hote hain);
         staff password ki ghaltiyan teachers ko nahi rokti */
      if (user) {
        const k = "tl:" + teacherKey(user);
        if (blocked(k, 6) || blocked("tip:" + ip, 40))
          return send(res, 429, loginPage("Too many wrong attempts for this Login ID — try again in 15 minutes, or ask the office to reset the password.", true), "text/html; charset=utf-8");
        const r = teacherLogin(user, pw), t = r.ok ? r.e : null;
        if (!t) {
          failed(k); failed("tip:" + ip);
          const msg = { noid: `No teacher login with the ID “${teacherKey(user).slice(0, 30)}” — check the Login ID the office gave you (small letters, no spaces).`,
                        off: "This login is switched off (the employee is not set as a Teacher) — please contact the office.",
                        pw: "Wrong password for this Login ID — check capital letters, or ask the office to set a new password." }[r.why];
          logAct(req, { role: "teacher", name: r.e ? "Teacher: " + r.e.name : "Login ID: " + user.slice(0, 30) }, "Failed login",
            { noid: "Unknown teacher Login ID", off: "Login exists but employee category is not Teacher", pw: "Wrong teacher password" }[r.why]);
          return send(res, 401, loginPage(msg, true), "text/html; charset=utf-8");
        }
        fails.delete(k);
        logAct(req, { role: "teacher", name: "Teacher: " + t.name }, "Login", "Teacher portal");
        setSession(req, res, teacherToken(t), SESSION_DAYS * 86400);
        return redirect(res, "/");
      }
      if (blocked(ip)) return send(res, 429, loginPage("Too many wrong attempts — try again in 15 minutes."), "text/html; charset=utf-8");
      const isExec = safeEq(crypto.createHash("sha256").update(pw).digest("hex"), crypto.createHash("sha256").update(PASSWORD).digest("hex"));
      const who = isExec ? "exec" : rolePwOk("feeadmin", pw) ? "feeadmin" : rolePwOk("admin", pw) ? "admin" : null;
      if (!who) {
        failed(ip);
        logAct(req, { role: "", name: "Unknown" }, "Failed login", "Wrong staff password");
        return send(res, 401, loginPage("Wrong password."), "text/html; charset=utf-8");
      }
      fails.delete(ip);
      logAct(req, actWho({ role: who }), "Login", "Staff portal");
      setSession(req, res, who === "exec" ? newToken("exec") : newToken(who, roleAuth(who).hash.slice(0, 12)), SESSION_DAYS * 86400);
      return redirect(res, "/");
    }
    if (p === "/logout") {
      const wasTeacher = (authed(req) || {}).role === "teacher";
      if (authed(req)) logAct(req, actWho(authed(req)), "Logout", "");
      res.setHeader("Set-Cookie", [`ems_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`,
                                   `ems_u=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`]);
      return redirect(res, wasTeacher ? "/teacher" : "/login");
    }

    const auth = authed(req);
    const role = auth && auth.role, tid = auth && auth.tid;
    /* v44: band (code ke baghair) Fee Admin ko Admin jaisa data; khula ho to fees + income/expense */
    const ul = role === "feeadmin" ? feeUnlocked(req) : null;
    const view = ul && !ul.on ? "admin" : role;
    if (!role) {
      if (p.startsWith("/api/")) return sendJson(res, 401, { error: "login" });
      return redirect(res, "/login");
    }

    if ((p === "/" || p === "/index.html") && req.method === "GET")
      return send(res, 200, appPage(role, tid, view, ul), "text/html; charset=utf-8");

    if (p.startsWith("/api/asg/")) return await asgRoute(() => asg.staff(req, res, url, auth), res);

    if (p === "/api/parent-logins" && req.method === "GET")
      return role === "teacher" ? sendJson(res, 403, { error: "Teacher" }) : sendJson(res, 200, parentLogins);

    if (p === "/api/unlock" && req.method === "POST") {
      if (role !== "feeadmin") return sendJson(res, 403, { error: "Fee Admin only" });
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const c = feeCode(); if (!c) return sendJson(res, 200, { ok: true, exp: 0 });
      const ip = clientIp(req), k = "fc:" + ip;
      const f = fails.get(k);
      if (f && f.until > Date.now() && f.n >= 5) return sendJson(res, 429, { error: "Wrong code 5 times — try again in 15 minutes." });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!codeOk(body.code)) { failed(k); logAct(req, actWho(auth), "Failed unlock", "Wrong 4-digit code"); return sendJson(res, 401, { error: "Wrong code." }); }
      fails.delete(k);
      logAct(req, actWho(auth), "Unlocked fees", "Fee / Billing and Income / Expense unlocked for 30 minutes");
      const exp = Date.now() + UNLOCK_MIN * 60e3, tag = c.hash.slice(0, 12);
      res.setHeader("Set-Cookie", `ems_u=${exp}.${tag}.${sign(`unlock|${exp}|${tag}|${sessSig(req)}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${UNLOCK_MIN * 60}${isHttps(req) ? "; Secure" : ""}`);
      return sendJson(res, 200, { ok: true, exp });
    }
    if (p === "/api/lock" && req.method === "POST") {
      res.setHeader("Set-Cookie", `ems_u=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`);
      return sendJson(res, 200, { ok: true });
    }
    /* v58: activity log — likhna (kaunsa page khola) sab kar sakte hain, parhna sirf Executive */
    if (p === "/api/act" && req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const page = String(body.page || "").replace(/[^\p{L}\p{N} /&()·-]/gu, "").slice(0, 60);
      if (page && !tooMany("act:" + (tid || role) + ":" + page + ":" + clientIp(req), 1, 10 * 60e3)) logAct(req, actWho(auth), "Viewed", page);
      return sendJson(res, 200, { ok: true });
    }
    if (p === "/api/activity" && req.method === "GET") {
      if (role !== "exec") return sendJson(res, 403, { error: "Executive only" });
      const q = Object.fromEntries(["role", "date", "q", "kind"].map((k) => [k, String(url.searchParams.get(k) || "").slice(0, 60)]));
      const rows = actRead(q), off = Math.max(0, +url.searchParams.get("offset") || 0), lim = Math.min(500, Math.max(1, +url.searchParams.get("limit") || 100));
      return sendJson(res, 200, { total: rows.length, rows: rows.slice(off, off + lim) });
    }
    if (p === "/api/version" && req.method === "GET")
      return sendJson(res, 200, { version: state.version, updatedAt: state.updatedAt, role });

    if (p === "/api/db" && req.method === "GET")
      return sendJson(res, 200, `{"version":${state.version},"unlock":${JSON.stringify(ul || {})},"data":${dataFor(view, tid)}}`);

    if (p === "/api/db" && req.method === "PUT") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const body = JSON.parse(await readBody(req));
      const data = body && body.data;
      if (!data || typeof data !== "object" || !Array.isArray(data.students))
        return sendJson(res, 400, { error: "This does not look like EMS data." });
      /* Kisi aur ne beech mein save kiya — client pehle merge kare, phir dobara bheje */
      if (role !== "exec" && body.force) return sendJson(res, 403, { error: "Only the Executive can import a backup." });
      if (!body.force && body.baseVersion !== state.version)
        return sendJson(res, 409, `{"version":${state.version},"unlock":${JSON.stringify(ul || {})},"data":${dataFor(view, tid)}}`);
      const out = role === "teacher" ? teacherMerge(data, tid) : role !== "exec" ? keepProtected(data, view) : data;
      let changes = [];
      try { changes = body.force ? [] : diffData(dbNow(), out); } catch (e) { changes = ["(could not compare: " + e.message + ")"]; }
      persist({ version: state.version + 1, updatedAt: new Date().toISOString(), dataText: JSON.stringify(out) },
              body.force ? "import" : "");
      if (body.force) logAct(req, actWho(auth), "Imported backup", `Whole database replaced — ${(out.students || []).length} students, ${(out.fees || []).length} challans, ${(out.employees || []).length} employees`);
      else if (changes.length) logAct(req, actWho(auth), "Saved changes", changes.join("\n"));
      return sendJson(res, 200, { version: state.version, updatedAt: state.updatedAt });
    }

    /* v27: receipt upload — sirf tasveer / PDF, random naam, login ke peeche */
    if (p === "/api/files" && req.method === "POST") {
      if (role !== "exec" && !(role === "feeadmin" && ul.on)) return sendJson(res, 403, { error: "Executive / Fee Admin only" });
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = FILE_TYPES[type];
      if (!ext) return sendJson(res, 415, { error: "JPG / PNG / WEBP / PDF only" });
      const buf = await readRaw(req, MAX_FILE);
      if (!buf.length) return sendJson(res, 400, { error: "Empty file" });
      const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
      writeAtomic(path.join(FILES_DIR, name), buf);
      logAct(req, actWho(auth), "Uploaded file", `Expense receipt (${ext}, ${Math.round(buf.length / 1024)} KB)`);
      return sendJson(res, 200, { url: `/files/${name}`, size: buf.length });
    }
    /* v43: parents ki fee receipts — sirf Executive aur Fee Admin */
    const frm = p.match(/^\/fee-receipts\/([a-f0-9]{24})\.(jpg|png|webp|pdf)$/);
    if (frm && req.method === "GET") {
      if (role !== "exec" && !(role === "feeadmin" && ul.on)) return send(res, 403, "Executive / Fee Admin only");
      const file = path.join(FEE_RCPT_DIR, `${frm[1]}.${frm[2]}`);
      if (!fs.existsSync(file)) return send(res, 404, "Not found");
      return send(res, 200, fs.readFileSync(file), EXT_TYPES[frm[2]],
        { "Cache-Control": "private, max-age=31536000, immutable", "Content-Disposition": "inline", "X-Frame-Options": "SAMEORIGIN" });
    }
    const fm = p.match(/^\/files\/([a-f0-9]{24})\.(jpg|png|webp|pdf)$/);
    if (fm && req.method === "GET") {
      if (role !== "exec" && !(role === "feeadmin" && ul.on)) return send(res, 403, "Executive / Fee Admin only");
      const file = path.join(FILES_DIR, `${fm[1]}.${fm[2]}`);
      if (!fs.existsSync(file)) return send(res, 404, "Not found");
      return send(res, 200, fs.readFileSync(file), EXT_TYPES[fm[2]],
        { "Cache-Control": "private, max-age=31536000, immutable", "Content-Disposition": "inline" });
    }

    return send(res, 404, "Not found");
  } catch (e) {
    if (e && e.code === 413) return sendJson(res, 413, { error: "Data is too large." });
    if (e instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" });
    console.error(e);
    return sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => console.log(`CGA EMS online — port ${PORT}, data: ${DATA_DIR} (version ${state.version})`));
