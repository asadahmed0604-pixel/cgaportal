/* CGA EMS — online server.
   Aik office password se login, aur sara data aik jagah (DATA_DIR/db.json) taake har browser
   par wahi data nazar aaye. Koi npm package nahi chahiye — sirf Node 18+.

   Environment:
     EMS_PASSWORD  (zaroori) office ka password, kam az kam 8 characters
     DATA_DIR      data ka folder (Render disk: /var/data). Default: ./data
     PORT          default 3000
*/
const http = require("http");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PASSWORD = process.env.EMS_PASSWORD || "";
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const FILES_DIR = path.join(DATA_DIR, "files");     // v27: expense receipts (tasveer / PDF)
const MAX_FILE = 8 * 1024 * 1024;
const FILE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const EXT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const KEEP_BACKUPS = 45;                      // din
const MAX_BODY = 60 * 1024 * 1024;            // photos ke saath bhi kaafi
const SESSION_DAYS = 30;

if (PASSWORD.length < 8) {
  console.error("EMS_PASSWORD set karein (kam az kam 8 characters). Render: service → Environment.");
  process.exit(1);
}
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

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
function teacherPwOk(user, pw) {
  const u = String(user || "").trim().toLowerCase();
  const e = u && ((dbNow() || {}).employees || []).find((x) => x.category === "Teacher" && x.login && x.login.hash && x.login.user === u);
  if (!e || String(pw).length < 8) return null;
  const a = e.login;
  const h = crypto.pbkdf2Sync(String(pw), Buffer.from(a.salt, "hex"), +a.iter || 100000, 32, "sha256").toString("hex");
  return safeEq(h, a.hash) ? e : null;
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
  d.txns = []; d.classCosts = {};
  if (d.settings) { delete d.settings.adminAuth; delete d.settings.feeAdminAuth; }
  (d.employees || []).forEach((e) => { delete e.salary; delete e.login; });
  if (role === "admin") {
    d.fees = [];
    (d.students || []).forEach((st) => { delete st.monthlyFee; delete st.charges; (st.subjects || []).forEach((x) => { delete x.fee; }); });
  }
  redactCache[ck] = { v: state.version, text: JSON.stringify(d) };
  return redactCache[ck].text;
}

/* ---------- v36: teacher ko sirf apni classes — tests, marks aur Evening class attendance ----------
   Teacher ki classes = Employees mein assign ki gayi (shift + class) + jin students ke subject par wo teacher laga hai. */
function teacherClasses(d, tid) {
  const me = (d.employees || []).find((e) => e.id === tid) || {};
  const cls = new Set((me.assignments || []).map((a) => a.shift + "|" + a.course));
  (d.students || []).forEach((st) => (st.subjects || []).forEach((x) => { if (x.teacherId === tid) cls.add(st.shift + "|" + st.course); }));
  return cls;
}
const testSeen = (t, tid, cls) => !!t && cls.has(t.shift + "|" + t.course) && (!t.teacherId || t.teacherId === tid);
const testOwn = (t, tid, cls) => !!t && t.by === "teacher" && t.teacherId === tid && t.shift === "Evening" && cls.has("Evening|" + t.course);
const catOwn = (c, tid, cls) => !!c && c.teacherId === tid && c.shift === "Evening" && cls.has("Evening|" + c.course);
function teacherView(d, tid) {
  const cls = teacherClasses(d, tid);
  const tests = (d.tests || []).filter((t) => testSeen(t, tid, cls));
  const ids = new Set(tests.map((t) => t.id));
  const s = d.settings || {};
  return {
    students: (d.students || []).filter((st) => cls.has(st.shift + "|" + st.course)).map((st) => ({
      id: st.id, name: st.name, regNo: st.regNo, course: st.course, shift: st.shift, status: st.status,
      statusSince: st.statusSince, doj: st.doj, joinMonth: st.joinMonth, roster: st.roster, group: st.group,
      subjects: (st.subjects || []).map((x) => ({ name: x.name, teacherId: x.teacherId || "" })) })),
    employees: (d.employees || []).map((e) => e.id === tid
      ? { id: e.id, name: e.name, category: e.category, shift: e.shift, assignments: e.assignments || [], online: !!e.online }
      : { id: e.id, name: e.name, category: e.category, shift: e.shift, online: !!e.online }),
    tests, exams: (d.exams || []).filter((e) => ids.has(e.testId)),
    classAtt: (d.classAtt || []).filter((c) => catOwn(c, tid, cls)),
    subjects: d.subjects || [],
    inquiries: [], fees: [], txns: [], homework: [], inventory: [], issues: [], attendance: {},
    /* v41: sirf apni staff attendance — dekhne ke liye; teacherMerge ise kabhi nahi leta */
    empAttendance: Object.fromEntries(Object.entries(d.empAttendance || {}).filter(([, day]) => day && day[tid]).map(([dt, day]) => [dt, { [tid]: day[tid] }])),
    classCosts: {}, parentAccess: [], parentMsgs: [], audits: [], counters: d.counters || {},
    settings: { name: s.name, addr: s.addr, phone: s.phone, logo: s.logo },
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
  const fits = (e) => { const t = testOf.get(e.testId), st = stu.get(e.studentId); return !!st && st.shift === t.shift && st.course === t.course; };
  const curEx = arr(cur.exams), curExById = new Map(curEx.map((e) => [e.id, e]));
  const exams = curEx.filter((e) => !gone.has(e.testId) && !vis(e))
    .concat(arr(data.exams).filter((e) => vis(e) && fits(e) && (!curExById.has(e.id) || vis(curExById.get(e.id)))));
  const curCa = arr(cur.classAtt), curCaById = new Map(curCa.map((c) => [c.id, c]));
  const classAtt = curCa.filter((c) => !catOwn(c, tid, cls))
    .concat(arr(data.classAtt).filter((c) => catOwn(c, tid, cls) && (!curCaById.has(c.id) || catOwn(curCaById.get(c.id), tid, cls))));
  return Object.assign(cur, { tests, exams, classAtt });
}
/* Admin ke save mein chhupaye hue hisse server wale hi rehte hain */
function keepProtected(data, role) {
  const cur = JSON.parse(state.dataText) || {};
  data.txns = cur.txns || [];
  data.classCosts = cur.classCosts || {};
  data.settings = Object.assign({}, data.settings || {});
  const cs = cur.settings || {};
  ["adminAuth", "feeAdminAuth", "salaryAuto"].forEach((k) => { if (cs[k] !== undefined) data.settings[k] = cs[k]; else delete data.settings[k]; });
  const sal = new Map((cur.employees || []).map((e) => [e.id, e.salary]));
  const login = new Map((cur.employees || []).map((e) => [e.id, e.login]));
  (data.employees || []).forEach((e) => {
    if (sal.has(e.id)) e.salary = sal.get(e.id);
    if (login.get(e.id)) e.login = login.get(e.id); else delete e.login;          // teacher passwords sirf Executive
  });
  if (role === "admin") {
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
function blocked(ip) {
  const f = fails.get(ip);
  return f && f.until > Date.now() && f.n >= 10;
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

/* ---------- pages ---------- */
const APP_HTML = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
if (!APP_HTML.includes("<!--EMS_SERVER_BOOT-->")) throw new Error("index.html mein <!--EMS_SERVER_BOOT--> nahi mila");
const jsonForScript = (text) => text.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
function appPage(role, tid) {
  const boot = `<script>window.__EMS__={version:${state.version},role:${JSON.stringify(role)},tid:${JSON.stringify(tid || "")},data:${jsonForScript(dataFor(role, tid))}};</script>`;
  return APP_HTML.replace("<!--EMS_SERVER_BOOT-->", () => boot);
}
/* v38: Staff (/login) aur Teachers (/teacher) ke alag login pages — dono /login par post karte hain */
function loginPage(msg, teacher) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>CGA EMS — ${teacher ? "Teacher Login" : "Login"}</title>
${APP_HEAD(teacher ? "teacher" : "staff")}
<link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{font-family:"League Spartan","Segoe UI",Arial,sans-serif;background:#174B60;color:#12313D;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
form{background:#fff;border-radius:14px;padding:30px 26px;width:100%;max-width:360px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.mark{width:46px;height:46px;border-radius:11px;background:#159670;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:14px}
h1{font-size:1.4rem;font-weight:800}
p{color:#6d6d6d;font-size:.9rem;margin:4px 0 18px}
label{font-size:.8rem;font-weight:600;display:block;margin-bottom:6px}
input{width:100%;font:inherit;padding:11px 12px;border:1px solid #cfcfcf;border-radius:8px}
input:focus{outline:2px solid #159670;border-color:#159670}
button{width:100%;margin-top:14px;padding:12px;border:none;border-radius:8px;background:#159670;color:#fff;font:inherit;font-weight:700;cursor:pointer}
button:hover{background:#0F7657}
.alt{display:block;text-align:center;margin-top:14px;font-size:.85rem;color:#159670;text-decoration:none;font-weight:600}
.err{background:#fdecea;color:#C0392B;border-radius:8px;padding:9px 11px;font-size:.88rem;margin-bottom:12px}
</style></head><body>
<form method="post" action="/login">
  <div class="mark">CGA</div>
  ${teacher ? `<h1>Teacher Login</h1><p>Cambridge Grads Academy · Tests, marks aur class attendance</p>` : `<h1>CGA EMS</h1><p>Cambridge Grads Academy · Staff login</p>`}
  ${msg ? `<div class="err">${msg}</div>` : ""}
  ${teacher ? `<label for="user">Login ID</label>
  <input id="user" name="user" autocomplete="username" autocapitalize="none" required autofocus style="margin-bottom:12px">` : ""}
  <label for="pw">Password${teacher ? "" : " (Executive / Fee Admin / Admin)"}</label>
  <input id="pw" type="password" name="password" autocomplete="current-password" required ${teacher ? "" : "autofocus"}>
  <button type="submit">Login</button>
  ${teacher ? `<a class="alt" href="/login">Staff login →</a>` : `<a class="alt" href="/teacher">Teacher hain? Teacher login →</a>`}
</form>
<script>if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});</script></body></html>`;
}

/* ================= v41: APP (phone / desktop par install) =================
   Manifest + service worker + icons — login ke baghair milte hain (browser inhein cookie ke baghair mangta hai).
   Icons: Executive ke browser ne logo se jo PNG banaye (settings.appIcons), warna saada rangeen icon. */
function pngSolid(n) {
  const crcT = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[k] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((n * 3 + 1) * n), r0 = n * 0.2, r1 = n * 0.26;
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y), ring = d >= r0 && d < r1, inner = d >= r1;
      const [R, G, B] = ring ? [255, 255, 255] : inner ? [21, 150, 112] : [23, 75, 96];
      const o = y * (n * 3 + 1) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = B;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const FALLBACK_ICON = { 192: pngSolid(192), 512: pngSolid(512) };
function appIcon(size) {
  const ic = ((dbNow() || {}).settings || {}).appIcons || {};
  const m = String(ic["i" + size] || "").match(/^data:image\/png;base64,(.+)$/);
  return m ? Buffer.from(m[1], "base64") : FALLBACK_ICON[size];
}
function manifest(kind) {
  const name = schoolName(dbNow());
  const k = { staff: { id: "/", start: "/", n: `${name} — EMS`, s: "CGA EMS" },
              teacher: { id: "/teacher", start: "/teacher", n: `${name} — Teachers`, s: "CGA Teacher" },
              parent: { id: "/parent", start: "/parent", n: `${name} — Parents`, s: "CGA Parents" } }[kind];
  return JSON.stringify({ id: k.id, name: k.n, short_name: k.s, start_url: k.start, scope: kind === "parent" ? "/parent" : "/",
    display: "standalone", background_color: "#174B60", theme_color: "#174B60", lang: "en",
    icons: [192, 512].map((n) => ({ src: `/app-icon-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" })) });
}
/* Sirf page ka request — data kabhi cache nahi hota; internet na ho to saada paigham */
const SW_JS = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#174B60;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px"><div><h2>Internet nahi hai</h2><p>Connection wapas aate hi dobara kholein.</p></div>', { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});`;
const APP_HEAD = (kind) => `<link rel="manifest" href="/${kind === "teacher" ? "teacher" : "app"}.webmanifest"><meta name="theme-color" content="#174B60"><link rel="apple-touch-icon" href="/app-icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${kind === "teacher" ? "CGA Teacher" : "CGA EMS"}">`;

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
    const im = p.match(/^\/app-icon-(192|512)\.png$/);
    if (im) return send(res, 200, appIcon(+im[1]), "image/png", { "Cache-Control": "public, max-age=3600" });

    /* ---------- parents (staff login se alag) ---------- */
    if (p === "/parent" && req.method === "GET")
      return send(res, 200, PARENT_HTML.replace(/\{\{SCHOOL\}\}/g, escHtml(schoolName(dbNow()))), "text/html; charset=utf-8");
    if (p === "/parent/login" && req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const ip = clientIp(req);
      const body = JSON.parse((await readBody(req)) || "{}");
      const key = bot.phoneKey(body.phone);
      if (blocked("p:" + ip) || (key && blocked("pp:" + key)))
        return sendJson(res, 429, { error: "Bohat ghalat koshishen — 15 minute baad dobara try karein." });
      const acc = key && accessFor(dbNow(), key);
      if (!acc || !pinOk(acc, String(body.pin || "").trim())) {
        failed("p:" + ip); if (key) failed("pp:" + key);
        return sendJson(res, 401, { error: "Phone number ya PIN ghalat hai." });
      }
      fails.delete("p:" + ip); fails.delete("pp:" + key);
      parentLogins[key] = new Date().toISOString();
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
      if (p === "/parent/api/me" && req.method === "GET") {
        const replies = (who.db.parentMsgs || []).filter((m) => m.phone === who.key && m.reply).length;
        return sendJson(res, 200, { school: schoolName(who.db), children: kids.map(childView), menu: bot.MENU, replies });
      }
      if (req.method !== "POST") return send(res, 404, "Not found");
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const child = kids.find((k) => k.id === body.studentId) || (kids.length === 1 ? kids[0] : null);
      if (!child) return sendJson(res, 400, { error: "Pehle bacha chunein." });
      if (p === "/parent/api/chat") {
        if (tooMany("chat:" + who.key, 40, 60e3)) return sendJson(res, 429, { error: "Thora ruk kar dobara poochein." });
        const r = bot.reply(who.db, child, String(body.text || "").slice(0, 300), who.key, pktToday());
        return sendJson(res, 200, { ...r, child: childView(child) });
      }
      if (p === "/parent/api/message") {
        const text = String(body.text || "").trim().slice(0, 1000);
        if (text.length < 3) return sendJson(res, 400, { error: "Message likhein." });
        if (tooMany("msg:" + who.key, 10, 864e5)) return sendJson(res, 429, { error: "Aaj ke messages ki had poori — kal dobara bhejein ya school call karein." });
        mutateDb((d) => {
          d.parentMsgs = d.parentMsgs || [];
          d.parentMsgs.push({ id: crypto.randomBytes(8).toString("hex"), studentId: child.id, studentName: child.name,
            phone: who.key, d: new Date().toISOString(), text, status: "Open", reply: "", repliedOn: "" });
        });
        return sendJson(res, 200, { ok: true });
      }
      return send(res, 404, "Not found");
    }

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
      if (blocked(ip)) return send(res, 429, loginPage("Bohat ghalat koshishen — 15 minute baad dobara try karein.", !!user), "text/html; charset=utf-8");
      if (user) {
        const t = teacherPwOk(user, pw);
        if (!t) { failed(ip); return send(res, 401, loginPage("Login ID ya password ghalat hai.", true), "text/html; charset=utf-8"); }
        fails.delete(ip);
        setSession(req, res, teacherToken(t), SESSION_DAYS * 86400);
        return redirect(res, "/");
      }
      const isExec = safeEq(crypto.createHash("sha256").update(pw).digest("hex"), crypto.createHash("sha256").update(PASSWORD).digest("hex"));
      const who = isExec ? "exec" : rolePwOk("feeadmin", pw) ? "feeadmin" : rolePwOk("admin", pw) ? "admin" : null;
      if (!who) {
        failed(ip);
        return send(res, 401, loginPage("Password ghalat hai."), "text/html; charset=utf-8");
      }
      fails.delete(ip);
      setSession(req, res, who === "exec" ? newToken("exec") : newToken(who, roleAuth(who).hash.slice(0, 12)), SESSION_DAYS * 86400);
      return redirect(res, "/");
    }
    if (p === "/logout") {
      const wasTeacher = (authed(req) || {}).role === "teacher";
      setSession(req, res, "", 0);
      return redirect(res, wasTeacher ? "/teacher" : "/login");
    }

    const auth = authed(req);
    const role = auth && auth.role, tid = auth && auth.tid;
    if (!role) {
      if (p.startsWith("/api/")) return sendJson(res, 401, { error: "login" });
      return redirect(res, "/login");
    }

    if ((p === "/" || p === "/index.html") && req.method === "GET")
      return send(res, 200, appPage(role, tid), "text/html; charset=utf-8");

    if (p === "/api/parent-logins" && req.method === "GET")
      return role === "teacher" ? sendJson(res, 403, { error: "Teacher" }) : sendJson(res, 200, parentLogins);

    if (p === "/api/version" && req.method === "GET")
      return sendJson(res, 200, { version: state.version, updatedAt: state.updatedAt, role });

    if (p === "/api/db" && req.method === "GET")
      return sendJson(res, 200, `{"version":${state.version},"data":${dataFor(role, tid)}}`);

    if (p === "/api/db" && req.method === "PUT") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const body = JSON.parse(await readBody(req));
      const data = body && body.data;
      if (!data || typeof data !== "object" || !Array.isArray(data.students))
        return sendJson(res, 400, { error: "Ye EMS ka data nahi lagta." });
      /* Kisi aur ne beech mein save kiya — client pehle merge kare, phir dobara bheje */
      if (role !== "exec" && body.force) return sendJson(res, 403, { error: "Backup import sirf Executive kar sakta hai." });
      if (!body.force && body.baseVersion !== state.version)
        return sendJson(res, 409, `{"version":${state.version},"data":${dataFor(role, tid)}}`);
      const out = role === "teacher" ? teacherMerge(data, tid) : role !== "exec" ? keepProtected(data, role) : data;
      persist({ version: state.version + 1, updatedAt: new Date().toISOString(), dataText: JSON.stringify(out) },
              body.force ? "import" : "");
      return sendJson(res, 200, { version: state.version, updatedAt: state.updatedAt });
    }

    /* v27: receipt upload — sirf tasveer / PDF, random naam, login ke peeche */
    if (p === "/api/files" && req.method === "POST") {
      if (role !== "exec") return sendJson(res, 403, { error: "Sirf Executive" });
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = FILE_TYPES[type];
      if (!ext) return sendJson(res, 415, { error: "Sirf JPG / PNG / WEBP / PDF" });
      const buf = await readRaw(req, MAX_FILE);
      if (!buf.length) return sendJson(res, 400, { error: "Khali file" });
      const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
      writeAtomic(path.join(FILES_DIR, name), buf);
      return sendJson(res, 200, { url: `/files/${name}`, size: buf.length });
    }
    const fm = p.match(/^\/files\/([a-f0-9]{24})\.(jpg|png|webp|pdf)$/);
    if (fm && req.method === "GET") {
      if (role !== "exec") return send(res, 403, "Sirf Executive");
      const file = path.join(FILES_DIR, `${fm[1]}.${fm[2]}`);
      if (!fs.existsSync(file)) return send(res, 404, "Not found");
      return send(res, 200, fs.readFileSync(file), EXT_TYPES[fm[2]],
        { "Cache-Control": "private, max-age=31536000, immutable", "Content-Disposition": "inline" });
    }

    return send(res, 404, "Not found");
  } catch (e) {
    if (e && e.code === 413) return sendJson(res, 413, { error: "Data bohat bara hai." });
    if (e instanceof SyntaxError) return sendJson(res, 400, { error: "Ghalat JSON" });
    console.error(e);
    return sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => console.log(`CGA EMS online — port ${PORT}, data: ${DATA_DIR} (version ${state.version})`));
