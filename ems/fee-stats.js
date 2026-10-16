/* v120: fee collection — sirf challans ki GINTI (raqam nahi): kitne challan bane, kitne poore wasool hue (aaj tak / 15 tak / 27 tak).
   Server admins ko ye bhejta hai (un ke paas fee data nahi jata); app mein (Executive / Fee Admin) bhi yehi hisaab.
   NOTE: index.html mein feeCountStats bilkul yehi copy hai — dono saath badlein (check.js milata hai). */
function feeCountStats(fees, shiftOf, m, today) {
  const has = (v) => v !== undefined && v !== null && v !== "";
  const out = {};
  const day = (n) => m + "-" + String(n).padStart(2, "0");
  (fees || []).forEach((f) => {
    if (!f || f.month !== m || !((+f.amount || 0) - (+f.arrears || 0) > 0)) return;
    const sh = f.shift || shiftOf(f.studentId) || "Morning";
    const o = out[sh] || (out[sh] = { issued: 0, now: 0, by15: 0, by27: 0 });
    o.issued++;
    const got = has(f.paidAmount) ? +f.paidAmount || 0 : f.status === "Paid" ? +f.amount || 0 : 0;
    const left = f.carriedTo ? 1 : has(f.balance) ? Math.max(0, +f.balance || 0) : f.status === "Unpaid" ? +f.amount || 0 : 0;
    if (left > 0 || !(got > 0 || f.status === "Paid")) return;
    const pays = f.payments && f.payments.length ? f.payments : [{ date: f.paidDate || m + "-01" }];
    const on = pays.map((p) => String(p.date || "")).sort().pop() || m + "-01";
    if (on <= today) o.now++;
    if (on <= day(15)) o.by15++;
    if (on <= day(27)) o.by27++;
  });
  return out;
}
if (typeof module !== "undefined") module.exports = { feeCountStats };
