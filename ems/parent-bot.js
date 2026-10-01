/* CGA EMS — parents ka chatbot (menu + keywords).
   Har jawab sirf AIK bache ke data se banta hai; server pehle tasdeeq karta hai ke ye bacha isi parent ka hai.
   Koi AI nahi — jo data EMS mein hai wohi seedha batate hain, is liye jawab hamesha sahi hota hai. */

/* "0300-1234567", "+92 300 1234567", "923001234567" → "3001234567" */
function phoneKey(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("92") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 10 ? d.slice(-10) : "";
}

/* Is phone number wale parent ke bache (father / mother / student phone mein se kisi par bhi) */
function childrenOf(db, key) {
  if (!key) return [];
  return (db.students || []).filter((s) =>
    s.status !== "Left" && [s.fatherPhone, s.motherPhone, s.phone].some((p) => phoneKey(p) === key));
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtD = (s) => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const fmtM = (s) => { if (!s) return "—"; const [y, m] = String(s).split("-"); return `${MONTHS[+m - 1]} ${y}`; };
const money = (n) => "Rs " + Math.round(+n || 0).toLocaleString("en-US");
const hasVal = (v) => v !== undefined && v !== null && v !== "";

/* EMS (index.html) wala hi qaida: baqaya agle challan mein gaya ho to 0, warna balance / unpaid raqam */
const feeOutstanding = (f) => f.carriedTo ? 0
  : hasVal(f.balance) ? Math.max(0, +f.balance || 0)
  : (f.status === "Unpaid" ? (+f.amount || 0) : 0);

const ATT = { P: "Present", L: "Late", A: "Absent", E: "Leave" };

/* ---------- parent ne kya likha? ---------- */
const INTENTS = [
  ["attendance", /\b(att\w*|hazri|haziri|hazir|absent|ghair|present|chutti|leave)\b/i],
  ["tests", /\b(tests?|exams?|results?|marks?|numbers?|imtihan|paper)\b/i],
  ["homework", /\b(hw|home\s*work|homework|kaam|assignments?|diary)\b/i],
  ["fee", /\b(fees?|challan|dues?|baqaya|payment|paise)\b/i],
  ["remarks", /\b(remarks?|teacher|comments?|feedback|report|reply|jawab)\b/i],
  ["issue", /\b(masla|masail|issue|complain\w*|shikayat|problem|message)\b/i],
  ["menu", /\b(menu|help|madad|hi|hello|salam|assalam\w*|aoa|start)\b/i],
];
function intentOf(text) {
  const t = String(text || "").trim();
  if (!t) return "menu";
  const num = t.match(/^\s*([0-6])\s*$/);      // menu number: 1 = attendance ... 6 = masla, 0 = menu
  if (num) return ["menu", "attendance", "tests", "homework", "fee", "remarks", "issue"][+num[1]];
  for (const [k, re] of INTENTS) if (re.test(t)) return k;
  return "unknown";
}

const MENU = [
  { id: "attendance", label: "📅 Attendance" },
  { id: "tests", label: "📝 Test Results" },
  { id: "homework", label: "📚 Homework" },
  { id: "fee", label: "💳 Fee" },
  { id: "remarks", label: "💬 Teacher Remarks" },
  { id: "issue", label: "✉️ Masla / Message bhejein" },
];

/* Har jawab "blocks" ki list hai — chat page inhein text ke taur par dikhata hai (HTML nahi) */
const H = (text) => ({ t: "h", text });
const P = (text) => ({ t: "p", text });
const KV = (rows) => ({ t: "kv", rows });          // [[label, value], ...]
const LI = (items) => ({ t: "li", items });

function attendance(db, s, today) {
  const att = db.attendance || {};
  const month = today.slice(0, 7);
  const since = ymd(new Date(Date.now() - 30 * 864e5));
  const rows = Object.keys(att).filter((d) => att[d] && att[d][s.id]).sort();
  if (!rows.length) return [H(`📅 ${s.name} — Attendance`), P("Abhi tak attendance mark nahi hui.")];
  const count = (list) => list.reduce((c, d) => { const k = att[d][s.id].s; c[k] = (c[k] || 0) + 1; return c; }, {});
  const pct = (c) => { const tot = (c.P || 0) + (c.L || 0) + (c.A || 0) + (c.E || 0); return tot ? Math.round(((c.P || 0) + (c.L || 0)) * 100 / tot) : 0; };
  const m = count(rows.filter((d) => d.startsWith(month)));
  const l30 = rows.filter((d) => d >= since);
  const c30 = count(l30);
  const todayRec = att[today] && att[today][s.id];
  const out = [H(`📅 ${s.name} — Attendance`)];
  out.push(P(todayRec ? `Aaj (${fmtD(today)}): ${ATT[todayRec.s] || todayRec.s}${todayRec.t ? ` · ${todayRec.t}` : ""}` : `Aaj (${fmtD(today)}) ki attendance abhi mark nahi hui.`));
  out.push(KV([
    [`${fmtM(month)}`, `${(m.P || 0) + (m.L || 0)} hazir · ${m.A || 0} ghair-hazir · ${m.L || 0} late · ${m.E || 0} chutti (${pct(m)}%)`],
    ["Pichle 30 din", `${(c30.P || 0) + (c30.L || 0)} hazir · ${c30.A || 0} ghair-hazir (${pct(c30)}%)`],
  ]));
  const off = l30.filter((d) => ["A", "L", "E"].includes(att[d][s.id].s)).reverse().slice(0, 6);
  if (off.length) out.push(LI(off.map((d) => `${fmtD(d)} — ${ATT[att[d][s.id].s]}${att[d][s.id].t && att[d][s.id].s === "L" ? ` (${att[d][s.id].t})` : ""}`)));
  return out;
}

function tests(db, s) {
  const ex = (db.exams || []).filter((e) => e.studentId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!ex.length) return [H(`📝 ${s.name} — Test Results`), P("Abhi koi test result darj nahi hua.")];
  const pc = (e) => (+e.total ? Math.round(+e.obtained * 100 / +e.total) : 0);
  const last = ex.slice(0, 6);
  const avg = Math.round(last.reduce((a, e) => a + pc(e), 0) / last.length);
  return [
    H(`📝 ${s.name} — Aakhri ${last.length} tests`),
    LI(last.map((e) => `${fmtD(e.date)} · ${e.exam}${e.subject ? ` (${e.subject})` : ""}: ${+e.obtained}/${+e.total} = ${pc(e)}%${e.comment ? ` — "${e.comment}"` : ""}`)),
    P(`Ausat: ${avg}%`),
  ];
}

function homework(db, s, today) {
  const hw = (db.homework || []).filter((h) => h.course === s.course && h.shift === s.shift)
    .sort((a, b) => String(b.dateGiven).localeCompare(String(a.dateGiven))).slice(0, 5);
  if (!hw.length) return [H(`📚 ${s.course} — Homework`), P("Abhi koi homework nahi diya gaya.")];
  return [
    H(`📚 ${s.course} (${s.shift}) — Latest homework`),
    LI(hw.map((h) => {
      const done = h.done && h.done[s.id];
      const late = !done && h.dueDate && h.dueDate < today;
      return `${fmtD(h.dateGiven)} · ${h.title}${h.dueDate ? ` — due ${fmtD(h.dueDate)}` : ""}${h.detail ? `: ${h.detail}` : ""} [${done ? "✓ jama" : late ? "⚠ abhi jama nahi" : "baqi"}]`;
    })),
  ];
}

function fee(db, s) {
  const fs = (db.fees || []).filter((f) => f.studentId === s.id).sort((a, b) => String(b.month).localeCompare(String(a.month)));
  if (!fs.length) return [H(`💳 ${s.name} — Fee`), P("Abhi koi challan nahi bana.")];
  const due = fs.reduce((a, f) => a + feeOutstanding(f), 0);
  const out = [H(`💳 ${s.name} — Fee`)];
  out.push(P(due ? `Kul baqaya: ${money(due)}` : "Koi baqaya nahi ✓ — shukriya!"));
  out.push(LI(fs.slice(0, 4).map((f) => {
    const o = feeOutstanding(f);
    const st = f.carriedTo ? `agle challan (${f.carriedChNo || ""}) mein shamil` : o ? `baqi ${money(o)}${f.dueDate ? ` · due ${fmtD(f.dueDate)}` : ""}` : `paid${f.paidDate ? ` ${fmtD(f.paidDate)}` : ""} ✓`;
    return `${fmtM(f.month)} · ${f.chNo || ""} · ${money(f.amount)}${+f.arrears ? ` (incl. ${money(f.arrears)} arrears)` : ""} — ${st}`;
  })));
  return out;
}

function remarks(db, s, key) {
  const rm = (s.remarks || []).filter((r) => r.parentVisible !== false)
    .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 5);
  const comments = (db.exams || []).filter((e) => e.studentId === s.id && e.comment)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const msgs = (db.parentMsgs || []).filter((m) => m.studentId === s.id && m.phone === key)
    .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 3);
  const out = [H(`💬 ${s.name} — Teacher remarks`)];
  if (!rm.length && !comments.length) out.push(P("Abhi koi remark nahi."));
  if (rm.length) out.push(LI(rm.map((r) => `${fmtD(r.d)} · ${r.type || "Remark"}${r.by ? ` (${r.by})` : ""}: ${r.note}`)));
  if (comments.length) out.push(P("Test par comments:"), LI(comments.map((e) => `${fmtD(e.date)} · ${e.exam}${e.subject ? ` (${e.subject})` : ""}: "${e.comment}"`)));
  if (msgs.length) {
    out.push(P("Aap ke messages:"));
    out.push(LI(msgs.map((m) => `${fmtD(m.d)}: "${m.text}" — ${m.reply ? `School ka jawab (${fmtD(m.repliedOn)}): ${m.reply}` : m.status === "Resolved" ? "hal ho gaya ✓" : "jawab ka intezar"}`)));
  }
  return out;
}

function menuBlocks(s) {
  return [P(`${s.name} (${s.course}) ke baare mein kya dekhna hai? Neeche button dabayein ya likhein: attendance, test, homework, fee, remarks.`)];
}

/* Main: (db, child, text, parentKey) → {blocks, intent} */
function reply(db, s, text, key, todayStr) {
  const today = todayStr || ymd(new Date());
  const intent = intentOf(text);
  switch (intent) {
    case "attendance": return { intent, blocks: attendance(db, s, today) };
    case "tests": return { intent, blocks: tests(db, s) };
    case "homework": return { intent, blocks: homework(db, s, today) };
    case "fee": return { intent, blocks: fee(db, s) };
    case "remarks": return { intent, blocks: remarks(db, s, key) };
    case "issue": return { intent, blocks: [P(`${s.name} ke baare mein apna masla ya message likh kar bhejein — school admin parh kar jawab dega. Jawab "Teacher Remarks" mein nazar aayega.`)] };
    case "menu": return { intent, blocks: menuBlocks(s) };
    default: return { intent, blocks: [P("Maaf kijiye, ye samajh nahi aaya."), ...menuBlocks(s)] };
  }
}

module.exports = { phoneKey, childrenOf, intentOf, reply, MENU, feeOutstanding };
