/* v110: teacher ke chhote / system wale remarks ("Very good", "Needs revision"…) → parents ke liye tafseeli jumla,
   bache ke naam aur subject ke saath. Sirf dikhate waqt badalta hai — DB mein teacher ka asal remark hi rehta hai.
   Jo remark teacher ne khud tafseel se likha ho (list mein na ho) woh waisa hi dikhta hai.
   NOTE: index.html mein REMARK_FULL / remarkText bilkul yehi copy hai — dono saath badlein. */
const REMARK_FULL = {
  excellent: (n, s) => `${n} has done excellent work ${s.in}. The concepts are clear and the answers were well presented and accurate. Keep up this standard, and keep practising past-paper questions to stay at the top.`,
  verygood: (n, s) => `${n} has performed very well ${s.in} and shows a good grasp of the topics. With a little more attention to detail and regular revision, ${n} can move up to the top grade.`,
  good: (n, s) => `${n} has done well ${s.in}. The basics are in place; more practice with exam-style questions will help turn this into even higher marks.`,
  effort: (n, s) => `${n} has put in a good effort ${s.in}. The hard work is showing — regular revision and practice with exam-style questions will help turn this effort into higher marks.`,
  satisfactory: (n, s) => `${n}'s performance ${s.in} is satisfactory. The main ideas are understood, but answers need more depth and accuracy. Regular revision at home and practice of past-paper questions are recommended.`,
  improve: (n, s) => `${n} needs to improve ${s.in}. Some key topics are not yet clear. We recommend daily revision of class work, completing all homework on time, and asking the teacher for help with difficult topics — we will keep supporting ${n} in class.`,
  revision: (n, s) => `${n} should revise the ${s.topics} covered in this test. Going over the class notes and re-attempting the questions that were missed will help strengthen these areas before the next assessment.`,
  careless: (n, s) => `${n} understands most of the ${s.work} but lost marks to careless mistakes. Reading each question carefully, showing all working and checking answers before handing in the paper will make a clear difference.`,
  concepts: (n, s) => `${n}'s basic concepts ${s.in} need strengthening. Extra practice on the fundamentals, along with help in class, is recommended so that ${n} can build confidence for the coming tests.`,
  absent: (n, s) => `${n} was absent for this ${s.test}. Please make sure the missed topics are covered at home, and speak to the teacher about the work that was missed.`,
  attempt: (n, s) => `${n} did not attempt the ${s.test} properly. Please encourage ${n} to attempt every question — marks are given for correct working even when the final answer is not complete.`,
};
const REMARK_KEYS = {
  "excellent": "excellent", "excellent keep it up": "excellent", "excellent work": "excellent", "excellent performance": "excellent",
  "outstanding": "excellent", "keep it up": "excellent", "brilliant": "excellent", "superb": "excellent",
  "very good": "verygood", "v good": "verygood", "very good performance": "verygood", "very good work": "verygood", "well done": "verygood",
  "good": "good", "good work": "good", "good performance": "good", "nice": "good", "nice work": "good",
  "good effort": "effort", "good attempt": "effort", "hardworking": "effort", "hard working": "effort",
  "satisfactory": "satisfactory", "average": "satisfactory", "fair": "satisfactory", "ok": "satisfactory",
  "needs improvement": "improve", "need improvement": "improve", "needs to improve": "improve", "improvement needed": "improve",
  "poor": "improve", "weak": "improve", "below average": "improve",
  "needs revision": "revision", "need revision": "revision", "revise": "revision", "revision needed": "revision",
  "careless mistakes attempt papers carefully": "careless", "careless mistakes": "careless", "careless": "careless",
  "concepts weak extra practice": "concepts", "concepts weak": "concepts", "weak concepts": "concepts", "concepts not clear": "concepts",
  "absent in test": "absent", "absent": "absent",
  "did not attempt properly": "attempt", "not attempted properly": "attempt", "did not attempt": "attempt",
};
function remarkText(comment, studentName, subject) {
  const c = String(comment || "").trim();
  const k = REMARK_KEYS[c.toLowerCase().replace(/[^a-z]+/g, " ").trim()];
  if (!k) return c;
  const n = String(studentName || "").trim().split(/\s+/)[0] || "Your child";
  const sj = String(subject || "").trim();
  return REMARK_FULL[k](n, sj ? { in: `in ${sj}`, topics: `${sj} topics`, work: `${sj} work`, test: `${sj} test` }
    : { in: "in this test", topics: "topics", work: "work", test: "test" });
}
module.exports = { remarkText };
