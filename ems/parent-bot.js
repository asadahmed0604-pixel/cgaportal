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

/* v88: aik khane mein do number ("0300-1234567 / 0321-7654321", "…, …", "… or …") — har number alag key */
function phoneKeys(v) {
  const out = [];
  String(v || "").split(/[,\/;|&\n]+|\s+(?:or|and|aur)\s+/i).forEach((part) => {
    const d = part.replace(/\D/g, "");
    if (d.length > 13) (d.match(/(?:92|0)?3\d{9}/g) || []).forEach((m) => { const k = phoneKey(m); if (k && !out.includes(k)) out.push(k); });
    else { const k = phoneKey(part); if (k && !out.includes(k)) out.push(k); }
  });
  return out;
}

/* Is phone number wale parent ke bache (father / mother / student phone mein se kisi par bhi) */
function childrenOf(db, key) {
  if (!key) return [];
  return (db.students || []).filter((s) =>
    s.status !== "Left" && [s.fatherPhone, s.motherPhone, s.phone].some((p) => phoneKeys(p).includes(key)));
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

/* v36: Class bunk — main (gate) attendance mein Present / Late, magar teacher ki class attendance mein Absent.
   Class attendance Evening teachers apne login se lagate hain (db.classAtt). Naya se purana. */
function bunksOf(db, sid) {
  const att = db.attendance || {}, out = [];
  (db.classAtt || []).forEach((c) => {
    if (!c || !c.marks || c.marks[sid] !== "A") return;
    const m = att[c.date] && att[c.date][sid];
    if (m && (m.s === "P" || m.s === "L")) out.push({ date: c.date, subject: c.subject || "", course: c.course, teacherId: c.teacherId || "", online: !!c.online });
  });
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
const bunkLine = (b) => `${fmtD(b.date)} · ${b.subject || b.course} class — came to the academy (Present at the gate) but Absent in class`;

/* ---------- parent ne kya likha? ---------- */
const INTENTS = [
  ["attendance", /\b(att\w*|hazri|haziri|hazir|absent|ghair|present|chutti|leave)\b/i],
  ["tests", /\b(tests?|exams?|results?|marks?|numbers?|imtihan|paper)\b/i],
  ["homework", /\b(hw|home\s*work|homework|kaam|assignments?|diary)\b/i],
  ["receipt", /\b(receipts?|raseed|rasid|slip|proof|screenshot)\b/i],
  ["fee", /\b(fees?|challan|dues?|baqaya|payments?|paid|pay|balance|paise)\b/i],
  ["remarks", /\b(remarks?|teacher|comments?|feedback|report|reply|jawab)\b/i],
  ["issue", /\b(masla|masail|issue|concern|complain\w*|shikayat|problem|message)\b/i],
  ["menu", /\b(menu|help|madad|hi|hello|salam|assalam\w*|aoa|start)\b/i],
];
function intentOf(text) {
  const t = String(text || "").trim();
  if (!t) return "menu";
  const num = t.match(/^\s*([0-7])\s*$/);      // menu number: 1 = attendance ... 6 = masla, 7 = receipt, 0 = menu
  if (num) return ["menu", "attendance", "tests", "homework", "fee", "remarks", "issue", "receipt"][+num[1]];
  for (const [k, re] of INTENTS) if (re.test(t)) return k;
  return "unknown";
}

const MENU = [
  { id: "attendance", label: "📅 Attendance" },
  { id: "tests", label: "📝 Test Results" },
  { id: "homework", label: "📚 Homework" },
  { id: "fee", label: "💳 Fee" },
  { id: "receipt", label: "🧾 Send fee receipt" },
  { id: "remarks", label: "💬 Teacher Remarks" },
  { id: "issue", label: "✉️ Concern / Message" },
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
  if (!rows.length) return [H(`📅 ${s.name} — Attendance`), P("No attendance has been marked yet.")];
  const count = (list) => list.reduce((c, d) => { const k = att[d][s.id].s; c[k] = (c[k] || 0) + 1; return c; }, {});
  const pct = (c) => { const tot = (c.P || 0) + (c.L || 0) + (c.A || 0) + (c.E || 0); return tot ? Math.round(((c.P || 0) + (c.L || 0)) * 100 / tot) : 0; };
  const m = count(rows.filter((d) => d.startsWith(month)));
  const l30 = rows.filter((d) => d >= since);
  const c30 = count(l30);
  const todayRec = att[today] && att[today][s.id];
  const out = [H(`📅 ${s.name} — Attendance`)];
  out.push(P(todayRec ? `Today (${fmtD(today)}): ${ATT[todayRec.s] || todayRec.s}${todayRec.t ? ` · ${todayRec.t}` : ""}` : `Today's (${fmtD(today)}) attendance has not been marked yet.`));
  out.push(KV([
    [`${fmtM(month)}`, `${(m.P || 0) + (m.L || 0)} present · ${m.A || 0} absent · ${m.L || 0} late · ${m.E || 0} leave (${pct(m)}%)`],
    ["Last 30 days", `${(c30.P || 0) + (c30.L || 0)} present · ${c30.A || 0} absent (${pct(c30)}%)`],
  ]));
  const off = l30.filter((d) => ["A", "L", "E"].includes(att[d][s.id].s)).reverse().slice(0, 6);
  if (off.length) out.push(LI(off.map((d) => `${fmtD(d)} — ${ATT[att[d][s.id].s]}${att[d][s.id].t && att[d][s.id].s === "L" ? ` (${att[d][s.id].t})` : ""}`)));
  const bk = bunksOf(db, s.id).filter((b) => b.date >= since).slice(0, 5);
  if (bk.length) out.push(P(`⚠ Class bunks (last 30 days): ${bk.length}`), LI(bk.map(bunkLine)));
  return out;
}

function tests(db, s) {
  const ex = (db.exams || []).filter((e) => e.studentId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!ex.length) return [H(`📝 ${s.name} — Test Results`), P("No test results recorded yet.")];
  const pc = (e) => (+e.total ? Math.round(+e.obtained * 100 / +e.total) : 0);
  const last = ex.slice(0, 6);
  const avg = Math.round(last.reduce((a, e) => a + pc(e), 0) / last.length);
  return [
    H(`📝 ${s.name} — Last ${last.length} tests`),
    LI(last.map((e) => `${fmtD(e.date)} · ${e.exam}${e.subject ? ` (${e.subject})` : ""}: ${+e.obtained}/${+e.total} = ${pc(e)}%${e.comment ? ` — "${e.comment}"` : ""}`)),
    P(`Average: ${avg}%`),
  ];
}

function homework(db, s, today) {
  const subjOk = (h) => !h.subject || !(s.subjects || []).length || (s.subjects || []).some((x) => { const a = String(x.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""), b = String(h.subject).toLowerCase().replace(/[^a-z0-9]/g, ""); return a && b && (a === b || a.includes(b) || b.includes(a)); });
  const hw = (db.homework || []).filter((h) => (h.course === s.course || (s.shift === "Evening" && h.course === s.course2)) && h.shift === s.shift && subjOk(h))
    .sort((a, b) => String(b.dateGiven).localeCompare(String(a.dateGiven))).slice(0, 8);
  if (!hw.length) return [H(`📚 ${s.course} — Homework`), P("No homework has been given yet.")];
  return [
    H(`📚 ${s.course} (${s.shift}) — Latest homework`),
    LI(hw.map((h) => {
      const done = h.done && h.done[s.id];
      const late = !done && h.dueDate && h.dueDate < today;
      const lateIn = typeof done === "string" && h.dueDate && done > h.dueDate;      // v69: teacher ne receival ki date daali
      const tName = h.teacherId ? ((db.employees || []).find((e) => e.id === h.teacherId) || {}).name : "";
      return `${fmtD(h.dateGiven)} · ${h.subject ? h.subject + ": " : ""}${h.title}${tName ? ` (${tName})` : ""}${h.dueDate ? ` — due ${fmtD(h.dueDate)}` : ""}${h.detail ? `: ${h.detail}` : ""} [${done ? (lateIn ? `✓ submitted late (${fmtD(done)})` : "✓ submitted") : late ? "⚠ not submitted" : "pending"}]`;
    })),
  ];
}

/* v83: aik hi hisaab — parents chat aur parents app (My Report) dono yahi istemal karte hain, live DB se.
   Har challan: kul raqam, kitna mila, kitna baqi, status, aur har payment (tareekh, raqam, tareeqa). */
function feeSummary(db, s) {
  const fs = (db.fees || []).filter((f) => f.studentId === s.id).sort((a, b) => String(b.month).localeCompare(String(a.month)));
  const recv = (f) => (hasVal(f.paidAmount) ? +f.paidAmount || 0 : f.status === "Paid" ? +f.amount || 0 : 0);
  const pays = (f) => (f.payments && f.payments.length ? f.payments : recv(f) > 0 ? [{ amt: recv(f), date: f.paidDate || (f.month || "") + "-01" }] : [])
    .map((p) => ({ amt: +p.amt || 0, date: p.date || "", method: p.method || "", note: p.note && p.note !== "earlier" ? p.note : "" }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const list = fs.map((f) => {
    const due = feeOutstanding(f), got = recv(f);
    const status = f.carriedTo ? "carried" : due <= 0 ? "paid" : got > 0 ? "partial" : "unpaid";
    return { chNo: f.chNo || "", month: f.month || "", amount: +f.amount || 0, arrears: +f.arrears || 0, received: got, due, status,
      dueDate: f.dueDate || "", carriedChNo: f.carriedChNo || "", payments: pays(f) };
  });
  const allPays = list.flatMap((c) => c.payments.map((p) => ({ ...p, chNo: c.chNo, month: c.month }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { totalDue: list.reduce((a, c) => a + c.due, 0), lastPayment: allPays[0] || null, challans: list };
}
const payLine = (p) => `${money(p.amt)}${p.method ? ` · ${p.method}` : ""} on ${fmtD(p.date)}${p.note ? ` (${p.note})` : ""}`;

function fee(db, s) {
  const F = feeSummary(db, s);
  if (!F.challans.length) return [H(`💳 ${s.name} — Fee`), P("No challans issued yet.")];
  const out = [H(`💳 ${s.name} — Fee`)];
  out.push(P(F.totalDue ? `Total due now: ${money(F.totalDue)}` : "Nothing due ✓ — thank you!"));
  if (F.lastPayment) out.push(P(`Last payment received: ${payLine(F.lastPayment)} — ${F.lastPayment.chNo} (${fmtM(F.lastPayment.month)})`));
  out.push(LI(F.challans.slice(0, 6).map((c) => {
    const st = c.status === "carried" ? `balance moved to the next challan${c.carriedChNo ? ` (${c.carriedChNo})` : ""}`
      : c.status === "paid" ? "paid ✓" : c.status === "partial" ? `partly paid — ${money(c.received)} received, ${money(c.due)} due${c.dueDate ? ` by ${fmtD(c.dueDate)}` : ""}`
      : `unpaid — ${money(c.due)} due${c.dueDate ? ` by ${fmtD(c.dueDate)}` : ""}`;
    return `${fmtM(c.month)} · ${c.chNo} · ${money(c.amount)}${c.arrears ? ` (incl. ${money(c.arrears)} arrears)` : ""} — ${st}${c.payments.length ? ` · payments: ${c.payments.map(payLine).join(", ")}` : ""}`;
  })));
  const rc = (db.feeReceipts || []).filter((r) => r.studentId === s.id).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 3);
  if (rc.length) {
    out.push(P("Receipts you sent:"));
    out.push(LI(rc.map((r) => `${fmtD(r.d)} · ${money(r.amount)}${r.chNo ? ` (${r.chNo})` : ""} — ${r.status === "Approved" ? "✓ verified, fee recorded" : r.status === "Rejected" ? `✗ returned${r.note ? `: ${r.note}` : ""}` : "⏳ being checked by the office"}`)));
  }
  return out;
}

function remarks(db, s, key) {
  const rm = (s.remarks || []).filter((r) => r.parentVisible !== false)
    .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 5);
  const comments = (db.exams || []).filter((e) => e.studentId === s.id && e.comment)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const msgs = (db.parentMsgs || []).filter((m) => m.studentId === s.id && m.phone === key)
    .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 3);
  const bk = bunksOf(db, s.id).slice(0, 5);
  const out = [H(`💬 ${s.name} — Teacher remarks`)];
  if (!rm.length && !comments.length && !bk.length) out.push(P("No remarks yet."));
  if (bk.length) out.push(P("⚠ Class bunk:"), LI(bk.map(bunkLine)));
  if (rm.length) out.push(LI(rm.map((r) => `${fmtD(r.d)} · ${r.type || "Remark"}${r.by ? ` (${r.by})` : ""}: ${r.note}`)));
  if (comments.length) out.push(P("Test comments:"), LI(comments.map((e) => `${fmtD(e.date)} · ${e.exam}${e.subject ? ` (${e.subject})` : ""}: "${e.comment}"`)));
  if (msgs.length) {
    out.push(P("Your messages:"));
    out.push(LI(msgs.map((m) => `${fmtD(m.d)}: "${m.text}" — ${m.reply ? `School's reply (${fmtD(m.repliedOn)}): ${m.reply}` : m.status === "Resolved" ? "resolved ✓" : "awaiting reply"}`)));
  }
  return out;
}

function menuBlocks(s) {
  return [P(`What would you like to see about ${s.name} (${s.course})? Tap a button below or type: attendance, test, homework, fee, remarks.`)];
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
    case "receipt": return { intent, blocks: [P(`Paid the fee? Send a photo of the receipt / screenshot — tap the "🧾 Send fee receipt" button (or 📎). The office will check it and mark the challan Paid.`)] };
    case "remarks": return { intent, blocks: remarks(db, s, key) };
    case "issue": return { intent, blocks: [P(`Write and send your concern or message about ${s.name} — the school admin will read it and reply. The reply will appear under "Teacher Remarks".`)] };
    case "menu": return { intent, blocks: menuBlocks(s) };
    default: return { intent, blocks: [P("Sorry, I didn't understand that."), ...menuBlocks(s)] };
  }
}

module.exports = { phoneKey, phoneKeys, childrenOf, intentOf, reply, MENU, feeOutstanding, bunksOf, feeSummary };
