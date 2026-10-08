# CGA EMS

Education Management System for Cambridge Grads Academy.

- `index.html` — the whole app (a single file).
- `parent.html`, `parent-bot.js` — the parents' chat (see below).
- `server.js` — online server: login with the office password, and all data in one place so
  **every computer and phone sees the same data**. No npm packages needed.

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
  - Present / Late in main attendance but Absent in class = **class bunk** → shown automatically in the parents'
    chat under "Attendance" and "Teacher Remarks".

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
EMS_PASSWORD=some-password-123 node server.js   # http://localhost:3000
node check.js                                    # safety check: every button calls a real function, all scripts parse
```

The same check runs on GitHub for every pull request that touches `ems/` (`.github/workflows/ems-check.yml`).

## Phone layout (v59)

On phones the EMS works like an app: top bar with the CGA logo and page name, ☰ slide-in menu with every section,
a bottom tab bar (role-wise shortcuts + More), and the 👤 account button (Install app, Who are you?, Log out with
confirmation). The login page has the logo, a Staff | Teacher switch and a show-password button; sessions last 30 days.

## Install as an app (v41)

Staff (`/`), Teachers (`/teacher`) and Parents (`/parent`) — all three links can be installed as an app on a phone / computer
(manifest + service worker; data is never cached). Android Chrome: ⋮ → "Install app" · iPhone Safari:
Share → "Add to Home Screen" · Computer Chrome/Edge: the install icon in the address bar. The EMS sidebar also has an
"📲 Install app" button. The app icon is the CGA logo (`ems/icons`).
