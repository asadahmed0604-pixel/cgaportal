# CGA EMS

Education Management System for Cambridge Grads Academy.

- `index.html` — the whole app (a single file).
- `parent.html`, `parent-bot.js` — the parents' chat (see below).
- `server.js` — online server: login with the office password, and all data in one place so
  **every computer and phone sees the same data**. One npm package: `@anthropic-ai/sdk` (for AI assignments, installed by Render on deploy).

## How it works

- Data is saved on the server in `DATA_DIR/db.json`. Any change reaches the server in ~1 second
  and shows up on other computers automatically in ~8 seconds (no page reload needed).
- If two people work at the same time, their changes are merged record by record —
  one person's work never wipes out another's.
- The server keeps a daily backup: `DATA_DIR/backups/db-YYYY-MM-DD.json` (last 45 days),
  plus the state before every "Import Backup" in `before-import-*.json`.
- The sidebar footer shows the sync state: **☁ Online**, **⏳ Saving…**, or **⚠ No connection to server**.
- Opening `index.html` directly on a computer runs it the old way (data only in that browser).

## Logins — Executive & Admin

- **Executive**: everything. Password = `EMS_PASSWORD` on Render.
- **Admin**: students, attendance, homework, exams, inquiries, parents, class audit, staff, inventory,
  issuance, settings — but **not the Dashboard, Income / Expense, Monthly Report, Business Reports (P&L) or salaries**,
  and no backup import / download / student delete.
- **Fee Admin** (one person only): everything an Admin has **plus Fee / Billing**. Regular Admins never receive any
  fee data from the server (challans, monthly fee, charges, subject fees) — only the Fee Admin and Executive see it.
  The Fee Admin password is also set in Settings → 🔐 Logins (with a name).
  v44: the Fee Admin also gets **Income / Expense** (without salary entries). In Settings → 🔐 Logins the Executive can
  set a **4-digit code** for the Fee Admin — opening Fee / Billing or Income / Expense then asks for the code.
  The code is checked on the server (5 wrong attempts = 15-minute lockout); a correct code unlocks for 30 minutes, and
  until then the server does not send fees, receipts or income/expense to the Fee Admin at all.
- The Executive sets / changes / disables the Admin password in EMS under **⚙ Settings → 🔐 Logins**
  (PBKDF2 hash in the DB). Changing the password signs out existing admin logins.
- This is not just hidden on screen: the server never sends income/expense entries, salaries or teacher pay to an
  admin, and keeps its own copy of those parts when an admin saves. Receipts (`/files`) are Executive only too.
- **Teacher** (v36): each teacher has their own **Login ID + password** (Settings → 🔐 Logins → Teacher logins).
  Separate link for teachers: `<your Render link>/teacher` (Login ID + password). Teachers get only **Tests & Marks** and
  **Class Attendance** — only students of their own classes (Employees → Edit → Assign): name, reg no, class, subjects.
  No fees, phone numbers, main attendance or accounts. From a teacher's save the server only accepts their
  tests / marks / class attendance.
  - Morning tests are created by the admin only; the teacher enters marks + a **required remark** (or fills them from a CSV sheet).
  - An Evening teacher can create a basic test for their own class and mark class attendance.
  - **My students (v60):** Morning — every student of the teacher's Morning class appears automatically (by class).
    Evening — only students of that class who take the teacher's subject (if a student's subject is set to another
    teacher, that student is theirs). A student who is in both Morning and Evening (same Reg No, or same name in the
    other shift) is shown on one row and counted once.
  - Present / Late in main attendance but Absent in class = **class bunk** → shown automatically in the parents'
    chat under "Attendance" and "Teacher Remarks".

## Assignments — AI generator & checker (v61)

- Teacher login → **✍ Assignments** (Executive / Admin also see it, for every class):
  - **✨ Generate with AI** — choose class, subject, level and the **Cambridge syllabus code** (filled in automatically for
    O Level / AS / A Level / IGCSE subjects, editable), topic, number of questions, total marks, difficulty and question types.
    Claude writes the questions **and a Cambridge-style mark scheme** (command words, M/A/B marks, ECF, level descriptors for essays).
  - **⬆ Upload paper** — upload a PDF or photos of a question paper (and its mark scheme if you have one). Claude reads it into
    questions + mark scheme; students also see the original paper.
  - **✍ Write my own** — type the questions and mark scheme yourself.
  - Every draft can be edited. Then **Give to students**: tick the students (Morning: whole class; Evening: only that class's
    students who take the subject), **⏱ Timed** (minutes) or not, opening date and optional due date → **Publish**.
- **Students** open **`<your link>/student`** (also the 📝 button in the parents' app):
  - **Evening students** have their own login (v62): **Reg No + 6-digit PIN**. Create them on **👪 Parents → 🎓 Student logins — Evening**
    (one by one with a WhatsApp message, or "Create PINs for all" for a class → printable slips). Like parent PINs, only a hash is
    stored and a PIN is shown once. A Reg No must be unique among Evening students.
  - **Morning students** (and any parent) log in with the **parent's phone number + PIN** from the 👪 Parents page. Timed: the timer starts when they press Start, runs on the server (closing the page does not stop it), and when it
  runs out whatever they wrote is submitted automatically. They can type answers and/or upload photos of written work.
- The moment work is submitted, Claude marks it against the mark scheme (Cambridge marking principles) and the student sees the
  **marked script**: marks in the margin per question, ticks for credited points, examiner comments, total and indicative grade.
  MCQs are marked exactly by the server. The server never lets marks exceed a question's maximum.
- Teacher → assignment → **Results**: status of every student, average, "⚠ check" where the AI was unsure. **View script** to change any
  mark or comment (the student sees it straight away), **Re-check with AI**, or **Let student redo**.
- **Approve → Tests & Marks (v62):** "✅ Approve & send to Tests & Marks" (all marked scripts, or one script at a time) creates the test
  **"Assignment: <title>"** for that class / subject in Tests & Marks and saves each student's total with the examiner's comment as the
  remark — so class results, report cards and the parents' chat pick it up. Optionally mark students who never started as absent.
  Changing marks after approval updates Tests & Marks automatically; "Let student redo" removes that student's mark. Deleting the
  assignment keeps the marks already sent.
- **Teacher access & monthly limit (v66):** Assignments is locked for teachers until the admin approves them. Executive / Admin →
  ✍ Assignments → **🔐 Teacher access** → "Approve & give code" shows a 6-digit code once (copy / WhatsApp); the teacher enters it once
  on their Assignments page. "New code" or "Remove" locks them again (5 wrong codes = 15-minute wait). Each approved teacher can make
  **2 tests + 3 assignments per month** (chosen as "Type" when creating; tests are timed by default) — a tracker on their page shows
  what is left. The count goes up when one is created and does not go down on delete; the admin can "Reset month". Executive / Admin
  have no limit. Approved tests go to Tests & Marks as "Test: …", assignments as "Assignment: …".
- **Students — paper option (v66):** after Start, "⬇ Download PDF" saves the paper as a PDF (or downloads the teacher's own PDF paper);
  "📤 Upload solved PDF & submit" uploads the solved PDF / photos and submits it for checking straight away (PDF up to 15 MB).
- Needs **`ANTHROPIC_API_KEY`** on Render (Environment). Without it, "Write my own" still works and work is marked by hand.
- Data: `DATA_DIR/asg/` (assignments, every student's answers, uploaded papers and photos) — separate from `db.json`; back up that
  folder too.

## Activity log (v58)

- Executive Dashboard → **🕵 Activity log**: who logged in (and failed logins), which sections they opened, and what
  they added / changed / deleted (e.g. `Students: ~1 changed: Ali [phone: 0300… → 0301…]`), with device and IP.
- Written by the server to `DATA_DIR/activity.jsonl` (kept 180 days) — cannot be edited from a browser; only the
  Executive can read it (`/api/activity`). Admins show as "Admin as <name>" using the "👤 Who are you?" name.

## Parents chat (`/parent`)

- Parents' link: `https://<your-render-link>/parent` — completely separate from the staff login.
- A parent logs in with their **phone number** (as saved in the student profile as Father / Mother / Student phone) and a
  **6-digit PIN**. PINs are created on the EMS **👪 Parents** page and sent from there on WhatsApp.
- Chat menu / keywords: attendance, test results, homework, fee, teacher remarks — and messages to the school.
  Replies are built on the server only from that parent's children's data (`parent-bot.js`); the full database never reaches the parent's browser.
- Only a PBKDF2 hash of the PIN is stored. Creating a new PIN or pressing "Block" ends the old login immediately.
- Parents' messages arrive on the EMS Parents page; the admin's reply appears for the parent under "Teacher Remarks".
- Student profile → **Remarks** tab: teacher / admin remarks (if "Show to parent" is off, only staff see it).

## Going live on Render (one time)

1. https://dashboard.render.com → **New → Blueprint** → select `asadahmed0604-pixel/cgaportal`.
2. Render reads `render.yaml` and shows the **cga-ems-online** web service (Starter plan + 1 GB disk).
3. It asks for **EMS_PASSWORD** — enter the office password (at least 8 characters) → **Apply**.
4. After deploying you get a link such as `https://cga-ems-online.onrender.com`.
5. Log in → **⚙ Settings → ⬆ Import Backup** and load your latest backup. That's it — open this link on
   every computer and log in with the same password.

To change the password: Render → service → **Environment** → change `EMS_PASSWORD` → Save.
All existing logins are signed out automatically.

Custom domain (e.g. `ems.cga.com.pk`): Render → service → **Settings → Custom Domains**.

## Running locally

```bash
cd ems
npm install                                      # Claude SDK (only needed for AI assignments)
EMS_PASSWORD=some-password-123 ANTHROPIC_API_KEY=sk-ant-... node server.js   # http://localhost:3000
node check.js                                    # safety check: every button calls a real function, all scripts parse
```

The same check runs on GitHub for every pull request that touches `ems/` (`.github/workflows/ems-check.yml`).

## Phone layout (v59)

On phones the EMS works like an app: top bar with the CGA logo and page name, ☰ slide-in menu with every section,
a bottom tab bar (role-wise shortcuts + More), and the 👤 account button (Install app, Who are you?, Log out with
confirmation). The login page has the logo, a Staff | Teacher switch and a show-password button; sessions last 30 days.

## Class times → work days (v61)

Employees → Edit → Assign: a class can have **a different time on each day** (tick "⏱ Different time on each day",
e.g. FT1 Maths Mon 9–10, Tue 11–12, Thu 8:30–9:30). With "⟳ Fill check-in / check-out automatically" on, the
teacher's Work days & times grid is filled from the class times (earliest class start → latest class end, per day and
shift), so attendance, late minutes and the teacher's timetable all follow the class schedule.

## Student report & best students (v68)

- Student portal (`/student`) opens on **📊 My Report**: today's attendance and classes, month / 30-day attendance
  with the last school days, class attendance by teacher and class bunks, all classes with **teacher names and
  day-wise times** (weekly timetable), every mark a teacher has entered (with comments and grade), and teacher remarks.
  It is built on the server from the live database on every request and refreshes itself every 30 seconds
  (and whenever the app is reopened). Only that student's own data is sent.
- Executive Dashboard → **🏆 Best students & ⚠ needs attention**: score = 60% test average (dashboard month + 2 months
  before) + 40% attendance (dashboard month) − 3 per class bunk. Filter by shift / class, click a name for the profile,
  ⬇ CSV for the full ranking.

## Homework from teachers (v69)

- Teachers now have **📚 Homework** in their portal: give homework to their own classes (class + subject + due date). It goes
  straight into the EMS Homework section, the student profile, the parents' app ("homework") and the student app (My Report).
- **✓ Receival**: tick who handed it in (the date is saved; after the due date = late). Not ticked after the due date =
  not submitted. Teachers can mark receival on admin homework of their classes too, but can only edit / delete their own;
  the server enforces this.
- **📊 Monthly submission report** (Homework page): per student — given, submitted, late, not submitted, % and the missing
  homework titles, by month (due date) and class, with CSV.

## Demo classes, late alerts, teacher scope (v70)

- Inquiries → stage **Demo Scheduled**: choose the teacher, subject, date and time (in the inquiry form or the Log).
  The teacher sees it under **🎓 Demo classes** on their portal dashboard (name, class, subject, time — no phone number).
- Late: the teacher's dashboard shows a red banner when they were late today or went over the 45-minute monthly limit
  (with the salary deduction); the Executive Dashboard has **⏰ Late teachers & staff** (late today / over the limit highlighted).
- Teacher login receives only **this month's active students** of their own classes, only their own subjects (subjects
  taught by another teacher are never sent), and only their own employee record.

## Classes taken (v71)

- **✅ Classes Taken** page (Admin / Executive): pick a date and **Morning** or **Evening**, then mark each scheduled class
  ✓ Taken / ✗ Not taken / Cancelled (cancelled is not counted), with a note (reason, substitute). **Subject-wise** view lists
  every class + subject + teacher by time; **Class-wise** groups by class with "Whole class taken / not taken" buttons.
  The list comes from Employees → Assign (days & times). Hints show if the teacher marked student attendance or was absent.
- v74: **current month only** — only each teacher's classes from Employees → Assign, and only classes that have active students this month.
- **📊 Monthly summary**: per teacher — scheduled, taken, not taken, cancelled, not marked, taken %, missed classes; CSV.
- Teacher portal dashboard → **✅ Classes taken**: their own taken / not taken record for the month (the server sends only
  their own entries; teachers cannot change it).

## Parents app pages (v72)

The parents' app (`/parent`) now has three pages at the top: **💬 Chat**, **📊 My Report** and **📝 Assignments** — the
student portal opens inside the parents' app with the same phone + PIN (no second login). With more than one child, the
child chips switch the report / assignments too. Evening students still have their own Reg No login at `/student`.

## Assignments access (v73)

Every teacher can now upload a paper, write their own assignments / tests, publish them and mark submissions without a code.
Only **✨ Generate with AI** is locked: the admin approves the teacher (Assignments → 🔐 Teacher AI access) and gives the
6-digit code; the server refuses AI generation until the teacher enters it. The monthly limit (2 tests + 3 assignments) still applies.

## Timetable & clashes (v75)

- **🗓 Timetable** page (Admin / Executive), Evening (Academy) by default, Morning too: the weekly timetable from Employees →
  Assign (classes with active students this month). Clashes are highlighted in red: a teacher booked twice, the same class
  with two lessons at the same time that some students share (or with unknown subjects), or an Evening student whose two
  classes overlap. Same class + same time + different subjects with no shared students is shown as a harmless parallel
  lesson (amber). Assignments without a time are listed below.
- v76 rules: **Morning** — a clash is the same subject at the same time (or a teacher booked twice); a class can have
  lessons together. **Evening** — a clash is two lessons at the same time that one student takes (AS Computer Science +
  AS Maths for a student who takes both = clash; AS Maths with A2 Maths for an AS student = no clash), or a teacher booked
  twice. Evening runs the same Mon–Fri, so clashes show the time only and the grid shows one "Every day" column.
- Parents app / student report: only classes and subjects assigned in Employees → Assign are shown (no guessed subjects),
  duplicates are merged and invalid times are ignored, so the timetable is always clean.

## Evening O1/O2 (v77)

In the Evening (Academy) O1 and O2 are one class, **O1/O2** (Morning keeps O1 and O2). On the first load after the update
(Executive / Admin / Fee Admin) every Evening O1 or O2 student, teacher assignment, test, homework, class-attendance,
classes-taken entry and Evening challan is moved to O1/O2 once (old class kept in `prevClass`). Imports that say O1 or O2
for an Evening student go to O1/O2.

## Teacher login fixes (v78)

- Wrong attempts now lock only **that Login ID** (6 tries → 15 minutes), not the whole academy Wi-Fi. Staff password
  mistakes no longer block teachers (40 teacher failures from one IP is the safety limit).
- Clear messages: unknown Login ID / wrong password / login switched off (employee not in the Teacher category).
  Login ID is case- and space-insensitive; a trailing space after the password is accepted.
- Settings → 🔐 Logins → Teacher logins shows each teacher's **last login** and failed attempts since (Executive), and
  warns about logins that cannot work because the employee is not set as a Teacher.

## Teacher shift & online teaching (v79)

- A teacher gets only classes of **their own shift**: an Evening teacher never sees Morning classes (even if a Morning
  student's subject or an old assignment names them), and a Morning teacher never sees Evening ones. **Both** and
  **Online** see both. Enforced on the server (teacherClasses / teacherSubjects) and in the app.
- Employees → Shift has **Online**, and a new **Teaching** field: Onsite / Online / **Onsite + Online**
  (replaces the old "Takes online classes" tick; the Employees filter "Online" lists everyone who teaches online).

## Submitting assignments as PDF / photos (v80)

Student portal and parents app → Assignments: **📤 Solved on paper? Upload a PDF or photos** on every assignment. The upload
card has 📷 Take a photo (camera), 🖼 Choose photos (several at once), 📄 Choose PDF and ⬇ Paper as PDF; pages can be
added one by one (up to 20 files), numbered and removed, then **✔ Submit uploaded work**. Drag & drop works on a computer.
Photos are shrunk on the phone before upload; PDFs up to 15 MB. The AI checker and the teacher see every page.

## Editing the fee ledger (v81)

Student fee ledger (📒 Ledger on any challan; Executive / Fee Admin): every payment row has **✎ Edit** (amount, date, mode,
note) and **✕ Remove**, challan rows have **✎ Challan**, and **+ Add payment** records a payment on any challan with a balance.
v82: ✎ on a payment can also **move it to another challan** ("This payment is for challan") — e.g. arrears entered on October's challan that belong to September's; the ledger warns when one challan is over-paid while another still shows a balance. After every change the challan's received / balance / Paid status is recalculated, so the dashboard, income, reports and the
parents app all show the corrected figures. Edited payments keep the old values (marked ✎).

## Parents' fees & teacher exams (v83)

- Parents app: **💳 Fees** at the top of My Report (parents only — not on a student's own login) and the chat "fee" reply
  now come from one shared, live calculation (`feeSummary` in parent-bot.js): total due, last payment, and every challan with
  its total, status (Paid / Partly paid / Unpaid / moved to next challan), amount due and every payment (date, amount, mode).
  Any change in the EMS (Mark Paid, ledger edit / move / remove, challan edit) shows on the parents' side at the next refresh.
- Teachers' Tests & Marks shows **all exams** (exam papers, any month) and only **this month's** ordinary tests.

## Subject-wise marks entry (v84)

Entering marks for a paper (Morning and Evening, teacher and admin) lists only the students who take that paper's subject
(from the student's subjects). "Mathematics" no longer pulls in "Additional Mathematics"; English ↔ English Language,
Mathematics ↔ Mathematics (D) and Pakistan Studies ↔ P1/P2 still match. A student with no subjects recorded is still listed
(set subjects in the student profile to hide them). Students who already have marks always stay on the list.

## Add a fee receipt (v85)

Fee / Billing → **🧾 Add receipt** (Executive / Fee Admin):
- **Bank / JazzCash / EasyPaisa**: upload the screenshot / deposit slip / PDF. The server reads it with Claude (amount, date,
  mode, transaction ID, payer / student name, challan no) and the form fills itself: the student is matched by Reg No,
  challan no or name (also the father's name as payer) and the challan by challan no or exact amount. Check, then **Save
  payment** — the proof is attached to the payment (📎 in the ledger). Without an API key the form is filled by hand.
- **Cash**: pick the student (name or Reg No), challan and amount → **Save & make cash receipt** creates a receipt image (PNG)
  with logo, receipt no (R-YYYY-####), student, challan, amount in figures and words, mode and balance — download or share.
  Any payment's receipt image can be made again from the ledger (🧾).

## Receipts register (v86)

Fee / Billing → **📂 Receipts** (Executive / Fee Admin) — every receipt that was entered, in one place:
- Tabs: **Entered** (office receipts with a receipt no / proof + parents' app receipts), **Office**, **Parents' app**, **All payments**.
- Filters: month, mode (Cash / Bank / JazzCash / EasyPaisa …) and search (name, Reg No, challan no, receipt no, transaction ID).
- Totals by mode (rejected parent receipts not counted), proof thumbnail / PDF, 🧾 receipt image, Ledger, and Review for
  parents' app receipts. **CSV** downloads the filtered list.

## Teacher papers follow Employees → Assign (v87)

A teacher always sees (and can enter marks for) the papers and homework of every class + subject given to them in
Employees → Assign, even when the paper or the students' subject still names another (old) teacher — e.g. Arabic for FT1 and
FT2. Create Exam now pre-fills each paper's teacher from Employees → Assign first.

## Parent logins — two numbers in one field (v88)

A phone field may hold two numbers ("0300-1234567 / 0321-7654321", "… , …", "… or …"): each number is now its own family on
the Parents page and either one can log in to the parents' app. Searching a student by name on the Parents page tells why they
are missing (status Left, no phone, or a number that is too short / mistyped). The "no valid phone" list now covers every
student who has not left (Freeze too) and shows the saved number on hover.

## Homework in the student / parents' app — send photos, teacher confirms (v90)

Every homework given to a child (Morning or Evening, by a teacher or the admin) now shows in **Assignments** in the student
portal and the parents' app, above the AI assignments: To do / Sent — awaiting teacher / ✓ Checked / Not submitted.
- Open a homework → **Take a photo**, **Choose photos** or **Choose PDF** (up to 20 files). Each page goes to the teacher
  straight away; pages can be added or removed until the teacher checks it.
- Teacher / admin: Homework shows **📥 n sent — confirm**. **✓ Receival** has a **Sent work** column (thumbnails, PDF, by
  student or parent) and **✓ Confirm all who sent work**; ticking uses the day the work was sent (late is counted right).
  After **Save receival** the app shows **✓ Checked by teacher** and the work is locked.
- Files are stored on the server in `DATA_DIR/asg/files`, the list in `DATA_DIR/asg/hwsubs.json` (outside db.json). Teachers
  only see the work of homework in their own classes.

## Parent-Teacher Meetings — PTM (v92, Morning)

- **Admin / Executive → 🤝 PTM → + Schedule PTM**: title, date, time, Morning classes and a note for parents. The table shows
  parents met, remarks written and parents' feedback for each PTM; **Open** shows every student with each teacher's entry
  and the parent's feedback; **⬇ CSV** exports it all. The office can mark attendance / remarks too.
- **Teacher → 🤝 PTM** (only PTMs of their own Morning classes): **✍ Attendance & remarks** — for every student of the class:
  parent came / did not come, who came (father, mother, both, guardian) and a remark. Teachers only see and change their
  own entries (the server ignores anything else) and never see parents' feedback.
- **Parents' app**: a welcome line and a **🤝 PTM** button (Morning children whose class has a PTM in the last 30 days or
  coming up) — date, time, note, and **feedback** (1–5 stars + text) that only the administration reads. Feedback can be
  sent or changed until 7 days after the PTM.

## Marks entry deadline + KPI (v93)

- **Admin → Tests & Marks → 📋 Exams → ⏰ Deadline** (or the date in Create Exam / Edit test): marks and remarks for every
  student must be in by **11:59 PM** (Pakistan time) on that date.
- Teachers see it on every paper (⏰ date / crossed / on time ✓ / late) and a warning on My Dashboard and Tests & Marks when
  a deadline is within 2 days or has been crossed with marks pending.
- The time a mark was **first** entered is kept (`firstAt`, set by the server for teachers — re-saving or editing later does
  not make it late, and a teacher cannot change it). Teacher live KPI has a new row **⏰ Marks by deadline**.
- When a deadline passes, the teacher's monthly **KPI checklist** item “Gradebook updated / marks on time” (as_grade) is filled
  automatically on the standard 0–5 scale from the share of students whose marks were in on time: ≥95% → 5, ≥85% → 4,
  ≥70% → 3, ≥50% → 2, >0 → 1, none → 0 (note: “Auto — marks deadline …”). A number the coordinator enters by hand is kept.

## Morning O Levels — teachers see only their subject's students (v94)

In Morning **O1 and O2** a teacher now sees only the students who take their subject (as in the Evening): My Dashboard
student list and counts, homework receival, PTM attendance / remarks, assignment students and marks entry. A student whose
subjects are not entered yet still shows (so nobody is hidden by mistake). FT1, FT2, AS and A2 stay whole-class. The
teacher's subject comes from Employees → Assign (or the subject's teacher on the student profile).

## Absent is not Fail (v95)

A student marked **Absent** in a test gets no %, grade or Pass/Fail — just **Absent** — on report cards (screen, print, PDF,
WhatsApp), class result, Exams list, result CSV, student profile, parents' app chat and the student portal. Absent papers are
left out of the totals, percentage, average and class position ("absent in 1"); a student absent in every test shows
**Absent** instead of a grade.

## Grading scale (v96)

All grades (report cards, class result, exam CSV, student profile, student portal, AI assignment check) use the Cambridge
scale: **A\*** 90%+ · **A** 80–89 · **B** 66–79 · **C** 56–65 · **D** 50–55 · **E** 40–49 · **U** below 40 (percent rounded; v108: A 80–89, B 66–79).
A\*–E is **Pass**, U is **Fail** (pass mark 40%). The scale is printed at the bottom of every report card.

## Morning — subjects a student doesn't take are hidden (v97)

For Morning students whose subjects are entered on their profile, a paper / mark in a subject they don't take is left out
everywhere: the marks entry list (even if a mark was entered by mistake earlier), marks counts and averages, the report card
(screen, print, PDF, WhatsApp, bulk), class result, student profile, and the parents' app / student portal. The mark itself is
not deleted (it still shows in the Exams list, where the admin can delete it). Students with no subjects entered still appear.

## Classes Taken — only class + subject rows (v98)

Classes Taken (admin) and the teacher's own "classes taken" list show only assignments that have a class **and** a subject.
Assignments without a subject (the old "(whole class)" rows) are no longer listed, and teachers who only have such
assignments are not in the teacher filter. Give the subject in Employees → Edit → Assign to bring a class back.

## Class position for parents (v99)

Parents' app → **My Report** has a **Class position** card (e.g. 2 / 18 · Oct, with the child's % and the class average),
and the chat's test results end with "🏅 Class position". Same method as the report card: the child's latest month with
marks, total % of the tests they sat (absent papers and Morning subjects they don't take are left out), compared with
every student of the same class and shift; equal % share a position.

## Class position criteria (v100)

Class position (parents' app, chat, report cards — screen, PDF, WhatsApp, bulk) is now a combined score for the month:

| Part | Weight | How |
|---|---|---|
| Test & exam marks | 60% | total % of the tests sat (absent / not-taken subjects left out) |
| Timely homework | 15% | on time 100 · late 50 · not submitted (due date passed) 0 |
| Behaviour & discipline | 10% | starts at 100 · "Behaviour" remark −15 · "Issue" −10 · class bunk −10 · "Appreciation" +5 |
| Attendance & punctuality | 15% | Present 100 · Late 50 · Absent 0 (leave not counted) |

A part with no data that month is skipped and its weight shared among the rest. Only students with marks that month are
ranked; equal scores share a position. Weights: `POS_W` in `ems/index.html` and `ems/student-report.js` (keep both the same).

## Homework receival — pick the real submission day (v101)

Homework → ✓ Receival has a **Submitted on** date for every student. If a student handed the homework in on paper on time
but the teacher ticks it later, pick the real day — the student counts as on time (not late) in reports, the parents' app
and the class position. Picking a date also ticks the student; clearing it unticks. On phones each student is a card.

## Staff logins with names, staff dashboards, KPIs and to-do (v102)

- **Settings → Logins → 🪪 Staff logins** (Executive): pick an employee or type a new name, choose **Admin** or **Fee Admin**
  access, set a Login ID + password. They sign in at `/login` → Staff tab with their Login ID. The shared Admin / Fee Admin
  passwords still work. Every save / login is logged with the person's name. Only the Executive can change access or logins.
- **🏠 My Dashboard** (staff with their own login): today's work for their role — attendance marked, inquiry follow-ups due,
  parent messages; Fee Admin also sees this month's collection, outstanding, today's collection and parents' app receipts
  to verify (after the 4-digit fee code). Plus **My KPIs** (score, targets, Executive's review) and **My to-do list**
  (tick done, add a note for the Executive, add their own to-dos).
- **🎯 Staff KPIs & To-do** (Executive only): per person per month — KPIs (title, target, weight, score 0–5; starts from a
  role template or last month's KPIs) and tasks (due date, priority). Score = weighted average of scored KPIs.
- The server sends each staff member only their own KPIs and tasks; KPIs can only be changed by the Executive, and a staff
  member can only tick / note their own tasks and add or remove their own to-dos.

## Hide Morning results until the PTM (v103)

PTM form → **🔒 Hide these classes' exam results from parents until this PTM is over** (ticked by default). Until the PTM's
end time, parents of those Morning classes see a banner — "Results will be announced at the PTM — Saturday 17 Oct,
9:00 AM–12:00 PM" — instead of marks, averages and class position (My Report and chat). Results come back automatically
when the PTM time is over. The PTM list shows "🔒 results hidden till PTM". Staff screens and report cards are not affected.

## Import a staff member's KPIs (v104)

🎯 Staff KPIs & To-do → each person has **⬆ Import KPIs** and **⬇ Template** (also inside the KPI form). Fill the template
in Excel and save it as **CSV**: columns **KPI, Target, Weight, Score (0–5), Note**; an optional "Month, October 2026" row on top
picks the month. Scores can be 0–5, a % (80 → 4), done / yes (5), not done (0) or n/a (blank). The KPI form opens filled in —
check it and press **Save KPIs**. A different name in the file shows a warning.

## Shift coordinators — Morning / Evening only (v105)

Settings → Logins → Staff logins → **Shift (coordinator)**: Both / Morning only / Evening only. A Morning-only staff login
(e.g. the Morning coordinator) never receives the Evening students' attendance, Evening class attendance or Evening
"classes taken" — and the other way round. Their Attendance page, attendance summary, attendance report export, Classes
Taken and dashboard show only their shift; Morning-only staff don't get the (Evening) Class Attendance page. When they
save, the other shift's records are kept exactly as they are on the server.

## Behaviour & Discipline — teacher remarks with approval, warning letters (v106)

- **Teachers → 🧭 Behaviour & Discipline → + Remark / issue about a student** (only students of their own classes): type
  (Behaviour, Issue, Remark, Appreciation, Academic concern) and the remark. It goes to the Executive; the teacher sees
  "Waiting for approval / Approved / Not approved" and can edit or remove it while it is waiting.
- **Executive → 🧭 Behaviour & Discipline** (menu shows how many are waiting): **Approve…** (edit the text, choose whether
  parents see it) adds it to the student's remarks; **Reject** with a reason. Only the Executive can decide (server-checked).
- **Warning letters** (Admin / Executive): **+ Issue warning letter** — student, 1st / 2nd / Final, reason, details, date →
  letter number WL-YYYY-####, printed letter on the school letterhead (with previous warnings and signature lines), and it
  shows in the parents' app. Warning letters lower the behaviour part of the class position (1st −20, 2nd −30, Final −40).
- **Parents' app → My Report → 🧭 Behaviour & discipline** shows warning letters and approved remarks; the chat's
  "Teacher Remarks" includes warning letters too.

## Report card — CGA logo watermark & new layout (v107)

- Every report card (single print, bulk print, PDF and the WhatsApp PDF) now carries the **CGA logo as a faint watermark**
  in the middle of the page, behind the marks (taken from Settings → logo).
- Cleaner layout: a teal band under the header, a highlighted Percentage · Grade box (with PASS / FAIL), an
  "Academic performance" section heading, rounded marks table, **coloured grade chips** (A*/A green, B/C teal, D/E amber,
  U red, Absent grey), the grading key shown as chips, the class-position note in its own box, signature lines for
  Class Teacher, Principal / Admin and Parent / Guardian, and a footer with the issue date.

## Report card logo — always shown (v109)

- If no logo is uploaded in Settings, report cards, challans and the watermark now use the built-in CGA logo (the app
  icon) instead of showing nothing. Upload your own logo in Settings to replace it.
- Print waits until the logo and photos have loaded, so the printed / "Save as PDF" copy never misses the logo.

## Detailed test remarks for parents (v110)

- The short remarks teachers pick when entering marks ("Very good", "Good effort", "Needs revision", "Careless mistakes",
  "Absent in test" …, and common typed ones like "excellent", "average", "weak") are shown to parents as a fuller,
  personal sentence with the student's first name and the subject — e.g. "Very good" in Physics becomes
  "Musab has performed very well in Physics and shows a good grasp of the topics. With a little more attention to
  detail and regular revision, Musab can move up to the top grade."
- Applies to report cards (screen, print, PDF / WhatsApp PDF), the parents' app (My Report), the parents' chat and the
  downloaded student profile. Older marks are covered too, since the text is expanded when shown; the teacher's own
  remark stays unchanged in the system, and remarks a teacher writes in their own words are shown as written.
- The texts live in `ems/remarks.js` (with an identical copy in `index.html`; `check.js` makes sure they match).
- Report card PDF: remarks wrap across the full width, and a long list continues on a second page.

## Two-page report cards with Coordinator's remarks (v111)

- Every report card is now **two pages, made for front / back (double-sided) printing**:
  - **Page 1 (front):** header, student details, summary, the marks table with grades and subject comments, grading key.
  - **Page 2 (back):** class position & attendance, teacher remarks, parent / guardian comments (blank lines), and at the
    end the **Coordinator's remarks**, followed by signature lines for Class Teacher, Coordinator, Principal / Admin and
    Parent / Guardian.
- **Writing coordinator remarks:** Exams → 🗂 Bulk report cards → choose month / shift / class → **✍ Coordinator remarks**.
  Type a remark per student, or use **✨ Draft** / **✨ Draft all empty ones** to get a starting remark written from the
  student's overall result, strongest and weakest subject, class position and attendance, then edit and **Save**.
  Remarks are kept per student per month and also appear on the single report card for that month, the WhatsApp
  message and the class result CSV. Left blank, the box prints with empty lines for a handwritten remark.
- Printing is set up so each card stays exactly two pages (up to about 14 tests a month): with many tests the front page
  is printed more compactly, and above 10 tests the front shows the teacher's short subject comments.

## Handwritten coordinator remarks (v112)

- Bulk report cards and the single Report Card screen have **"Coordinator's remarks on print"**:
  - **Print typed remarks** (default) — typed remarks are printed (with two extra lines for a handwritten addition);
    students without a typed remark get empty lines.
  - **Leave blank — handwrite after printing** — every card prints the Coordinator's box with empty lines, coordinator
    name / signature / date left blank, so the coordinator writes by hand after printing. Typed remarks stay saved and
    can be printed later by switching back.
- The choice is remembered in that browser. WhatsApp PDFs always use the typed remark.

## Report card front always on one page (v113)

- However many subjects / tests a student has, the **front page (marks) always fits on one A4 page** and the back page
  (remarks, Coordinator's remarks) is always the second page — so double-sided printing lines up for every card.
- Print / bulk print: just before printing, each card's front is measured at A4 width; if it is too long, the page is
  scaled down (smaller font) to fit. Many tests also switch to a compact table (smaller rows, exam name hidden), and
  above 12 tests the teacher's short subject comments are shown instead of the detailed sentences.
- PDF / WhatsApp PDF: the marks table rows and font shrink as needed so page 1 is one page; page 2 follows.
- Tested with 3 to 30 tests per card: always exactly 2 pages per card.

## New admission — first month fee by joining date (v114)

- The challan for the month a student joined (their **Date of Joining**) is charged by the joining date:
  - joined **1st–9th** → full monthly fee
  - joined **10th–15th** → fee for the days left in the month (monthly fee × days left ÷ days in month, joining day
    included) — e.g. joined 15 Nov (30 days): 16 days → Rs 10,000 × 16/30 = Rs 5,333
  - joined **16th–25th** → half fee
  - joined **after the 25th** → set in **Settings → New admission — first month fee** (half fee by default, or no fee
    that month, or full fee). The rule can also be switched off there.
- Applies to ⚡ Generate All Challans, a single new challan (the amount fills in automatically and a green line explains
  it; changing the fee month recalculates), and "reset to monthly fee only". Evening per-subject fees are reduced in
  the same proportion. Later months are always the full fee.
- The challan (print and PDF) shows a line such as "Joining month — joined 15 Nov 2026: 16 of 30 days (monthly fee
  Rs 10,000)".

## Skill Development Progress on the report card (v115)

- The back page of the report card now has **Skill Development Progress** instead of teacher remarks and parent
  comments: a table of skills with a tick under Excellent / Very Good / Good / Developing / Needs Support, the skill
  teacher's comment and the skill development teacher's name and signature. The Coordinator's remarks stay at the end.
  If nothing is entered, the boxes print empty so they can be ticked by hand.
- **Who fills it:** the skill development teacher, from their own teacher login → **🌱 Skill Development**. A teacher is
  the skill development teacher of a class when assigned a subject named **"Skill Development"** for that class
  (Employees → Assign). They see all active students of those classes, pick the month, choose a level for each skill,
  add an optional comment, and **Save**. The server only accepts entries for students of their skill classes.
  The menu item is hidden for other teachers. The Executive / admins can also open the page and fill or correct it.
- **Skills list:** Settings → 🌱 Skill development — one skill per line (default: communication, confidence & public
  speaking, critical thinking, creativity, teamwork, leadership, time management, responsibility & discipline).
- Saved per student per month (`DB.skillDev`); the report card for that month (print and PDF) uses it.

## Skill Development groups (v116 — replaces the class-based setup of v115)

- Skill development runs in **groups, Morning only**, with students mixed from any class (O1, O2, O3, FT1, FT2 …).
  Four groups are created automatically the first time the page is opened: **A Communication Skills, B Arts and Crafts,
  C AI Automation, D Practical and STEM Projects**, each with its own list of skills (editable).
- **Executive / Admin → 🌱 Skill Development → 👥 Groups & students:** for each group choose the teacher who leads it
  ("Led by"), add students from the dropdown (all active Morning students, grouped by class; it shows if a student is
  already in another group) or add a whole class at once, remove with ✕, rename, edit the skills, add or delete groups.
- **Teacher login → 🌱 Skill Development:** the teacher sees only the group(s) they lead, with the group's students
  (even students of classes they do not teach), picks the month and rates each skill (Excellent … Needs Support) with an
  optional comment, then Save. The server accepts entries only for students of that teacher's own groups. The menu item
  is hidden for teachers who lead no group. Admins can also fill progress (📈 Progress tab).
- **Report card back page:** "Skill development · Group C: AI Automation" with the group's skills ticked, the teacher's
  comment and "Led by" with the teacher's name. Morning students in no group show "Not enrolled in a skill development
  group"; Evening report cards have no skill section.
- Data: `DB.skillGroups` = [{id, code, name, tid, skills, studentIds}], `DB.skillDev` entries keyed
  "<studentId>|<YYYY-MM>|<groupId>".

## Skill development on report cards — blank box for now, system progress after the PTM (v117)

- **🌱 Skill Development page (Executive / Admin) → "On report cards & parents' app":**
  - **Blank box — fill by hand (for now)** (default): the back of every Morning report card shows an empty
    **Skill Development Progress** box (lines, Teacher / Signature / Date, and the student's group and teacher if known),
    just above the Coordinator's remarks. The parents' app shows no skill ratings.
  - **Progress from the system:** report cards print each group's ratings grid (as in v116) and the parents' app
    (My Report → 🌱 Skill development) shows the last three months of ratings with the teacher's comment.
- Groups, teachers and the teachers' monthly ratings keep working the same way in both modes — switch to "from the
  system" after the PTM when the classes have progress to show.

## Skill development in the parents' app now (v118)

- The parents' app (My Report → 🌱 Skill development) now always shows the skill teachers' ratings for Morning
  students (last three months, with the teacher's comment) — it no longer waits for the report card switch.
- The "blank box / from the system" choice on the Skill Development page now only decides what the **report card**
  prints (blank handwritten box for now).

## Skill development projects (v119)

- **🌱 Skill Development → 🚀 Projects** (Executive / Admin for every group; the group's teacher for their own group):
  **+ New project** — title, details, start date, due / presentation date, status (Upcoming / In progress / Completed).
  **✓ Mark completed** records the completion date and a result / outcome; projects can be edited or deleted.
- **Parents' app → My Report → 🌱 Skill development** shows the student's group projects: upcoming and ongoing first
  (with start / due dates), then completed ones with the completion date and result.
- The server lets a teacher change only the projects of the groups they lead — never the group's name, students or
  teacher, and never another group.

## Staff dashboards — fee collection KPI, coordinator checklist, Evening tests, delegation (v120)

- **💰 Fee collection (counts only, no amounts)** on every staff dashboard, for the staff member's shift (Morning
  coordinator → Morning, Evening coordinator → Evening, Fee Admin with no shift → both): challans issued for the working
  month, how many are fully paid and the percentage. Two targets:
  **65% of challans received by the 15th** and **98% by the 27th** — before the date it shows "on track" or "behind — N
  more challans needed", after the date "KPI achieved / not achieved". Admins get only these counts from the server.
- **Staff KPIs:** two automatic items, "Fee collection by the 15th" and "Fee collection by the 27th" (added to the
  templates and to KPIs of the current month). The Executive's app scores them by itself after each date: 5/5 when
  achieved, 0/5 when not, with a note such as "Auto — 50% of challans received by 15 Oct (target 65%)".
- **📋 Coordinator checklist (Admin logins, per shift)** — today's students' attendance, staff attendance, classes taken
  marked, homework given in every class in the last 7 days, past-due homework not checked by teachers (with names),
  class audits this month (classes not yet audited) and inquiry follow-ups; each with an Open button.
- **🧪 Evening tests** (Evening coordinator): every Evening teacher × class with the number of tests this month against
  the target of 2, and how many more are needed.
- **🔔 Reminders** at the top: unfinished checklist items, fee targets missed or close, overdue / due-today tasks, and
  overdue tasks given to others.
- **📤 Assign a task (delegation):** any staff login can give a task to another staff login (e.g. the Morning
  coordinator to a helper, the Evening coordinator to the Fee Admin) — quick-pick duties, due date, priority, note and
  **🔁 daily duty** (must be ticked every day). The other person sees it in their to-do list ("from …") and ticks it;
  the giver sees "📤 Tasks I assigned" with done / not done today / overdue, and can edit or remove it. The server only
  lets the giver change or remove a task they gave, and the assignee only its status and note.

## Remove placeholder employees from an attendance-machine import (v121)

- If an attendance-machine sheet was imported as Employees, people named like **User 1, User 2 …** were created.
  **Employees → 🧹 Remove N placeholder employees** lists them and deletes them with their staff-attendance entries in
  one click. Anyone with a login or class assignments is never removed.
- The Employees import now skips such names ("looks like an attendance-machine user number") instead of creating them.

## Staff attendance import — attendance machine or Excel (v122)

- **Employees → 👥 Staff Attendance → ⬆ Import (machine / CSV)** — a CSV from the attendance machine or from Excel
  (File → Save as → CSV). Both layouts work:
  - one row per punch: user ID / name + date & time (e.g. `AC-No., Name, Date Time`) — the first punch of the day is
    the arrival time;
  - one row per day: name, date, time in, status (Present / Absent / Late / Leave / Uninformed).
- **⬇ Templates (v123)** in the import window: **daily sheet** — every employee with their machine ID and today's date;
  fill Time In (e.g. 08:55) or Status (Absent / Leave / Uninformed) and import it back (rows left blank are skipped,
  not marked absent); **machine punches** — a sample of the one-row-per-punch layout.
- People are matched by **Attendance machine ID** (new field on the employee form — "5" and "User 5" both work) or by
  name. Unmatched IDs are listed with an employee drop-down; once chosen, the ID is saved as that employee's machine ID
  so the next import matches by itself.
- Shift: the employee's shift (for "Both", before 1 PM = Morning), or force Morning / Evening. Late is worked out from
  each person's work time, like manual marking. Days already marked are skipped unless "Overwrite" is ticked.
  Salaries are recalculated after the import.

## Promote a student / undo a wrong class change (v124)

- **Student profile → ⬆ Promote to new class:** choose the new shift / class (and second class for Evening) and the
  date the student starts in it. The old class is saved in the student's class history (until the day before), so
  **tests, marks entry, report cards and class position before that date stay in the old class**; from that date the
  student is in the new class. **↩ Undo last promotion** puts the student back. The profile shows the class history.
- **↩ Undo class change:** if someone changes a student's class directly in Edit (no promotion), the profile shows
  "Undo class change (back to FT1 · Morning)" with who changed it and when — one click puts everything back, because
  marks and report cards follow the student's class.
- Use Promote for real promotions (keeps history); use Edit only to correct a mistake.
- **Hidden marks (v125):** in the Morning, marks only show for subjects in the student's subject list. Changing the
  class in Edit removes subjects the new class doesn't offer, so after changing it back some marks were hidden. The
  profile now warns "N marks hidden — subjects not in this student's list: …" with **➕ Add these subjects back**.
  "Undo class change" and "Undo last promotion" also restore the subjects, and a promotion keeps the old subject list
  in the class history so marks from before the promotion always show.

## Exam papers count in the exam's month (v126)

- A paper that belongs to an exam (created under Exams, e.g. "October Exams") now counts in **the exam's month** on
  report cards — the month in which most of that exam's papers were taken — even if that paper's own date is in
  another month. Example: October Exams with one paper on 30 Sep and the rest in October → all papers are on the
  October report card (single, bulk, PDF / WhatsApp) and in the October class position, also in the parents' app.
- Stand-alone tests still count in the month of their own date. The Exams page month filter uses the same rule.

## Review late times & fines (v127)

- **Employees → 👥 Staff Attendance → ⏰ Review late times & fines:** pick the month (and shift) to see every late
  entry — date, employee, start time, arrival time and late minutes — with a per-employee total and fine.
  - **Wrong arrival time:** change the time; the late minutes and fine update on screen; **💾 Save changes**.
  - **Excuse:** tick to make that day not late (stays excused even if the day is saved again).
  - **🔄 Recalculate month:** if an employee's start time was set wrong, correct it in Employees → Edit → Work days &
    times, then recalculate — every arrival in the month is re-measured against the current start times (late minutes
    are otherwise fixed when the attendance is saved).
- Salaries / fines are recalculated after every change.

## Install as an app (v41)

Staff (`/`), Teachers (`/teacher`) and Parents (`/parent`) — all three links can be installed as an app on a phone / computer
(manifest + service worker; data is never cached). Android Chrome: ⋮ → "Install app" · iPhone Safari:
Share → "Add to Home Screen" · Computer Chrome/Edge: the install icon in the address bar. The EMS sidebar also has an
"📲 Install app" button. The app icon is the CGA logo (`ems/icons`).

## Late times review — Executive only (v128)

- **⏰ Review late times & fines** (Employees page) is shown only on the Executive login.
  Admin, Fee Admin and teacher logins don't see the button and can't open, save or recalculate.
- The server also enforces it: if a non-Executive login saves staff attendance without changing the time,
  the server keeps the old late minutes and won't accept a new "excused" mark.
  Changing the real arrival time on the attendance screen still works as before (late minutes are recalculated).

## New students skip older tests & homework (v129)

- A student counts only for tests, exam papers and homework dated **on or after their Date of Join**.
  Anything given before they joined isn't added to their record, so teachers don't see "marks missing" for them,
  and it doesn't show as missed homework in the student profile or the parents' app.
- If marks were already entered for that student, or the homework was marked as submitted, it still shows as usual.
- Make sure the **Date of Join** is correct when enrolling, because this is what decides it.

## Bank account on fee challans (v130)

- Every fee challan (print, single PDF, bulk ZIP / one-PDF) has a **🏦 Pay by bank** strip on both the Student and Academy copy:
  Bank Al Habib · Account Title: Cambridge Grads Academy · IBAN PK48 BAHL 5637 0081 0006 6901.
- To change it: **Settings → Bank account (printed on fee challans)** → Save. Clear the IBAN field to hide the strip.

## Skill Development as a subject + class updates (v131)

- Each skill group is now a **Morning period** with its own day and time. All groups start on **Wednesday 1:15–2:30 pm**.
  Change a group's time in **Skill Development → Groups & students** (Class day / From / To).
- The period shows as **"Skill Group A/B/C/D — Skill Development — <group name>"** in three places:
  - the **Timetable** (Morning, with clash checks);
  - the group teacher's **dashboard** (today's classes and the class-times table);
  - **Classes Taken**, so the office can mark it Taken / Not taken.
- New **📝 Class updates** tab (the first tab for teachers): there is one card for every class of the month.
  - The teacher writes what was covered (required), the activity / project work, and the plan for the next class.
  - A class can also be marked "Not held / cancelled".
- Missing updates show as a reminder on the teacher's dashboard.
  - The office sees an "updates written x / y" summary for every group.
  - Classes Taken shows whether the update has been written.
- Parents see the latest 4 class updates in the app under **🌱 Skill development**.
- Server rule: a teacher can only change the updates and projects of their own group. Name, students and timing are set by the admin.

## Homework receival — Absent option (v132)

- The **✓ Receival** screen has a new **Absent** column next to Submitted. Tick it for a student who was absent.
  - Absent and Submitted can't both be ticked: ticking one unticks the other.
- An absent student doesn't count as "not submitted" anywhere:
  - the homework list and the submission report (the % leaves absent ones out);
  - the parents' app and student portal, where it shows "Absent";
  - the parent bot.
- The student profile's homework tab also has **Absent** in the status dropdown.

## Classes Taken — double classes & substitute teacher (v133)

- **Double class:** if a teacher has the same class and subject in two slots on one day, it shows as one row with **2 periods (double)**.
  - The time runs from the first slot's start to the last slot's end.
  - The office can also pick 1 / 2 / 3 periods under the time. The app remembers it for that weekday.
- A double class has these buttons: **✓ Both taken · ½ 1 of 2 taken · ✗ None taken · Cancelled**.
- **Substitute:** when a class (or 1 of 2) was not taken, a **🔁 Substitute** dropdown appears. Pick the teacher who covered it.
  - The monthly summary has a "Substitute classes taken" column, and the missed classes say who covered them.
  - The CSV has Periods, Periods not taken and Substitute columns.
  - The substitute teacher sees "🔁 Substitute classes you took" on their dashboard.
- Counts (cards, monthly summary, taken %) now count periods: a double class counts as 2.

## Parent concerns — assign to a teacher / coordinator (v134)

- **Parents page → 📌 Parent concerns.** The Executive can:
  - **+ Log a concern** from a meeting, phone call, PTM or WhatsApp;
  - press **📌 Assign** on a parent app message.
- Each concern has: the student, how it was raised, the concern, **assign to** (coordinators / staff logins, or teachers, with ★ = teaches this student), due date, priority and instructions.
- The person it is assigned to sees **📌 Parent concerns assigned to you** on their dashboard (teacher portal or staff dashboard).
  - They can **💬 Add update** (Open / In progress) and **✓ Mark resolved** with what was done.
  - Overdue concerns are highlighted.
- The Executive sees updates on each concern, then **✓ Closes** it, or reopens, edits / reassigns or deletes it.
  - The Dashboard's parent-messages card shows how many concerns are assigned and how many are overdue.
- Server rule: only the Executive can create, assign or close a concern. The assigned person can only add updates or mark their own concern resolved.

## Generate with AI — sample / reference assignment (v135)

- **Assignments → ✨ Generate with AI** has a new optional field: **📎 Sample / reference assignment** (photos or PDF, up to 10 files).
- Once a sample is uploaded, choose how the AI should use it:
  - **Same style & format** — new questions on your topic, copying the sample's layout, command words, length and difficulty.
  - **Very similar questions** — same pattern and skills, with changed values, data and context.
  - **Use it as the content** — new questions on what the sample covers (the Topic can be left empty).
- The AI still follows the number of questions, total marks and question types, and writes a full Cambridge mark scheme. The draft opens in the editor to check before publishing.

## Diagrams in AI assignments (v136)

- **Generate with AI** now draws a diagram with every question that needs one, the way a Cambridge paper prints it.
  Examples: transformations, coordinates, graphs, geometry, circuits, ray / force diagrams, charts.
- **Coordinate grids** (always used for transformations) are drawn by the server from exact numbers. The AI only gives the grid size, the shapes' corners, points and lines (e.g. a dashed mirror line y = x).
  - The grid has numbered axes, every gridline, and coloured, labelled shapes, so vertices sit exactly on the grid points the question mentions.
- **Other figures** come from the AI as SVG. The server removes anything unsafe (scripts, links, images), and diagrams are always shown as pictures.
- Each question can also have an **answer diagram** (e.g. the reflected shape drawn in). It shows only for the teacher and on the printed mark scheme, and helps AI marking.
- **Editor:** "📐 + Grid diagram / ✏ Edit grid" lets the teacher write or fix a grid in plain text, with a live preview:
  `x: -6 to 6`, `y: -6 to 6`, `A: (1, 1) (4, 1) (1, 3)`, `P: (2, 4)`, `y = x: (-6, -6) (6, 6) line dashed`. "✕ Remove" deletes a diagram.
- Diagrams show in the student / parent app, the printed paper and mark scheme, the student's PDF download and the marking screen.
- New server file: `diagram.js` (grid drawing + SVG cleaning).

## Fix: AI assignment generation error 400 (v137)

- The v136 diagram format sent the Claude API a deeply nested schema, and generation failed with **Claude API error (400)**. The diagram fields are now four plain text fields:
  - `diagram_grid` — the same plain grid text the editor uses (`x: -6 to 6`, `A: (1, 1) (4, 1) (1, 3)`, `y = x: (-6, -6) (6, 6) line dashed`);
  - `diagram_svg`;
  - `answer_grid`;
  - `answer_svg`.
  The server still draws the exact grids.
- **Safety net:** if the API ever rejects the diagram format again, generation retries automatically without diagrams, so a draft is always made. The server log shows the reason.
- A 400 error now shows the API's own reason in the message instead of only "error 400".
- Upload a question paper (read with AI) uses the plain format again, without diagram fields.

## Staff attendance — Half leave · substitutes from all staff (v138)

- **Half leave (H)** is a new status in Employees → Staff attendance, next to Present / Late / Absent / Informed / Uninformed leave.
  - It counts as **½ leave day** toward the 2-leave-days-a-month limit. For example, Informed leave + Half leave = 1½, and one more Half leave reaches 2. After the limit only Absent can be marked.
  - It counts as **½ present** in the attendance %.
  - No late minutes are added for a half-leave day.
- Half leave shows in the profile stats, the monthly register PDF (column H), the CSV ("Half leave" column) and the teacher's Classes Taken hint.
  - Staff attendance import understands "Half leave" / "HL".
- **Classes Taken → 🔁 Substitute** now lists all staff: teachers first, then coordinators / admin staff (e.g. coordinators who can cover a class).

## Assignments — send a PDF, AI marks the answer scripts (v139)

- New **📄 Send PDF** button on the Assignments page:
  - attach the question paper (PDF or photos);
  - optionally attach a **mark scheme** file, which only the AI sees;
  - type the questions & marks as numbered on the paper: `5, 5, 10` or `1(a):3, 1(b):2, 2:6`.
  No AI reading of the paper is needed first.
- Students see the paper as it is, solve it on paper, and **upload photos / a PDF of their answer script** (or type answers). The AI then marks each question:
  - with the teacher's mark scheme file when attached (it overrides typed points);
  - otherwise with the points typed in the editor;
  - otherwise by writing a Cambridge mark scheme itself from the paper.
- In **any** assignment's editor (AI-generated, uploaded or hand-written) the teacher can attach / remove the question paper and the mark-scheme file.
- Students can never open the mark-scheme file (the student file link only serves the paper and their own uploads).

## Assignments — PDF made easy (v140)

- **📄 Send PDF:** "Questions & marks" is now **optional**. Leave it empty and the AI reads your paper itself, filling in the question numbers, marks and mark scheme (from your mark-scheme file if attached).
  - Check the draft, choose students and publish. Typing marks (`5, 5, 10`) still skips the AI step.
- **Students see the paper straight away, inside the app:**
  - a PDF opens in the page itself (with "Open full screen" as well);
  - photos show full width;
  - the paper is at the top of the answer screen.
- For assignments that are **not timed**, the paper shows before pressing Start. Timed tests still show it only after Start, so the timer is fair.

## Students — download / print the paper (v141)

- Once a student starts an assignment or test, a **🖨 Want it on paper?** bar sits at the top of the screen with **⬇ Download PDF** and **🖨 Print paper**. It is also on the result screen.
- **Download:**
  - the teacher's own PDF paper downloads as it is;
  - a paper made of photos becomes one PDF (one page per photo);
  - typed questions become a clean PDF with diagrams, answer lines and a Name / Date line.
- **Print:**
  - opens the teacher's PDF in the browser to print;
  - otherwise opens a clean print page with the photos, questions and diagrams.
- The result screen's own print button is now "🖨 Print my result".

## Morning timetable clashes fixed (v142)

- The same subject at the same time in **different Morning classes** (e.g. FT1 English and FT2 English) with **different teachers** is no longer a clash.
- A Morning clash is now only:
  - **the same teacher** booked in two places at once;
  - **the same class** having two lessons at once that some students take both of. Lessons in the same class that no student takes together show as "parallel".
- Evening rules are unchanged.

## Syllabus Tracker — yearly planner, monthly targets, coverage (v143)

- New page **📚 Syllabus Tracker** for Morning teachers (also visible to the office).
  - The teacher presses **+ New tracker** and picks one of their Morning class · subject assignments and the academic year.
- **📅 Yearly planner:**
  - attach the planner file (PDF / photos);
  - add topics, one per line. A line can start with a month (`Oct: Forces and motion` or `2026-10 Forces`) to plan it; other lines go to the selected month;
  - every topic's month can be changed later.
- **🎯 Monthly target:** a target text for each month, plus an optional file.
- **✅ Coverage:** for each topic of the month (or the whole year), mark **✓ Covered / ◐ Partly / ✗ Not covered** (the date is saved) and write a comment.
  - The tracker shows **% syllabus covered** and **% of topics planned till this month** ("on track").
- **Office overview:** all trackers with class, subject, teacher, covered %, on-track % and whether this month's target is set.
- **Parents / students app (My Report → 📚 Syllabus coverage):** each subject's covered %, this month's target, the planner / target files, this month's topics with status and comments, and recent topics.
- Server rule: a teacher can only create or change trackers for their own classes. Parents can open only the files of their child's class and subject.

## Missing a student in a test / exam list? (v144)

- The marks window of every test or exam paper now has **👀 Missing a student?** It lists the students of that class who are not in the list, with the reason. Possible reasons:
  - the class history says another class on that date;
  - their Date of Join is after the paper;
  - they are not on that month's class list;
  - the subject is not in their subjects.
- **+ Add to this paper** or **+ Add to all papers of this exam** puts the student in the list.
  - Their marks then count everywhere: averages and report cards.
  - "added ✕" next to the name removes them again.
