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

## Install as an app (v41)

Staff (`/`), Teachers (`/teacher`) and Parents (`/parent`) — all three links can be installed as an app on a phone / computer
(manifest + service worker; data is never cached). Android Chrome: ⋮ → "Install app" · iPhone Safari:
Share → "Add to Home Screen" · Computer Chrome/Edge: the install icon in the address bar. The EMS sidebar also has an
"📲 Install app" button. The app icon is the CGA logo (`ems/icons`).
