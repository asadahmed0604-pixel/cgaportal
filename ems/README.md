# CGA EMS

Cambridge Grads Academy ka Education Management System.

- `index.html` — poori app (aik file).
- `parent.html`, `parent-bot.js` — parents ka chat (neeche dekhein).
- `server.js` — online server: office password se login, aur sara data aik jagah taake
  **har computer aur phone par wahi data** nazar aaye. Koi npm package nahi chahiye.

## Kaise chalta hai

- Data server par `DATA_DIR/db.json` mein save hota hai. Koi bhi tabdeeli ~1 second mein server par
  chali jati hai, aur baqi computers par ~8 second mein khud nazar aa jati hai (page reload ki zaroorat nahi).
- Do log aik waqt mein kaam karein to dono ki tabdeeliyan record-by-record mil jati hain —
  aik ka kaam doosre ka kaam nahi mitata.
- Server har din ka backup khud rakhta hai: `DATA_DIR/backups/db-YYYY-MM-DD.json` (pichle 45 din),
  aur har "Import Backup" se pehle ka haal `before-import-*.json` mein.
- Sidebar ke neeche haal likha hota hai: **☁ Online**, **⏳ Save ho raha hai…**, ya **⚠ Server se rabta nahi**.
- `index.html` ko seedha computer par kholein to purane tareeqe (sirf is browser mein) se chalti hai.

## Logins — Executive & Admin

- **Executive**: sab kuch. Password = Render par `EMS_PASSWORD`.
- **Admin**: students, fees, attendance, homework, exams, inquiries, parents, class audit, staff, inventory,
  issuance, settings — lekin **Dashboard, Income / Expense, Monthly Report, Business Reports (P&L) aur salaries nahi**,
  aur backup import / download / students delete bhi nahi.
- **Fee Admin** (sirf aik banda): Admin wali sab cheezein **plus Fee / Billing**. Aam Admin ko fees ka koi data
  (challans, monthly fee, charges, subject fees) server se jata hi nahi — sirf Fee Admin aur Executive dekhte hain.
  Fee Admin ka password bhi Settings → 🔐 Logins se (naam ke saath).
- Admin ka password Executive EMS mein **⚙ Settings → 🔐 Logins** se rakhta / badalta / band karta hai
  (PBKDF2 hash DB mein). Password badalte hi purane admin logins khatam.
- Ye sirf screen par chhupana nahi: server admin ko income/expense entries, salaries aur teacher pay bhejta hi nahi,
  aur admin ke save mein ye hisse server wale hi rehte hain. Receipts (`/files`) bhi sirf Executive.
- **Teacher** (v36): har teacher ka apna **Login ID + password** (Settings → 🔐 Logins → Teacher logins).
  Teachers ka alag link: `<aap ka Render link>/teacher` (Login ID + password). Teacher ko sirf **Tests & Marks** aur **Class Attendance** —
  sirf apni classes (Employees → Edit → Assign) ke students (naam, reg no, class, subjects). Fees, phone numbers,
  main attendance, hisaab kuch nahi jata. Teacher ke save se server sirf us ke tests / marks / class attendance leta hai.
  - Morning ke tests sirf admin banata hai; teacher marks + **zaroori remark** likhta hai (ya CSV sheet se bharta hai).
  - Evening teacher apni class ka basic test khud bana sakta hai aur class attendance lagata hai.
  - Main attendance mein Present / Late magar class mein Absent = **class bunk** → parents chat ke
    "Attendance" aur "Teacher Remarks" mein khud dikhta hai.

## Parents chat (`/parent`)

- Parents ka link: `https://<aap-ka-render-link>/parent` — staff login se bilkul alag.
- Parent apna **phone number** (jo student profile mein Father / Mother / Student phone likha ho) aur
  **6 digit PIN** se login karta hai. PIN EMS ke **👪 Parents** page se banta hai aur wahin se WhatsApp par bheja jata hai.
- Chat mein menu / keywords: attendance, test results, homework, fee, teacher remarks — aur school ko message.
  Jawab server par sirf us parent ke bachon ke data se banta hai (`parent-bot.js`); poora database kabhi parent ke browser tak nahi jata.
- PIN ka sirf PBKDF2 hash save hota hai. Naya PIN banane ya "Band karein" se purana login foran khatam.
- Parent ke messages EMS ke Parents page par aate hain; admin ka jawab parent ko "Teacher Remarks" mein dikhta hai.
- Student profile → **Remarks** tab: teacher / admin ke remarks ("Parent ko dikhayein" off ho to sirf staff dekhta hai).

## Render par live karna (aik dafa)

1. https://dashboard.render.com → **New → Blueprint** → `asadahmed0604-pixel/cgaportal` select karein.
2. Render `render.yaml` parh kar **cga-ems-online** web service dikhayega (Starter plan + 1 GB disk).
3. **EMS_PASSWORD** maange ga — office ka password likhein (kam az kam 8 characters) → **Apply**.
4. Deploy hone ke baad link milega, jaise `https://cga-ems-online.onrender.com`.
5. Login karein → **⚙ Settings → ⬆ Import Backup** se apna latest backup daalein. Bas — ab har
   computer par yehi link kholein aur same password se login karein.

Password badalna ho: Render → service → **Environment** → `EMS_PASSWORD` badlein → Save.
Sab purane login khud khatam ho jate hain.

Apna domain (jaise `ems.cga.com.pk`): Render → service → **Settings → Custom Domains**.

## Local chalana

```bash
cd ems
EMS_PASSWORD=koi-password-123 node server.js   # http://localhost:3000
```
