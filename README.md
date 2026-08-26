# EduGrads by CGA

Cambridge Grads Academy ka online learning system — recorded lessons, auto-marked quizzes,
assignment submission aur marking, sab email login ke peeche.

Interface CGA ki apni branding par hai: logo green `#159670`, navy `#174B60`, yellow `#FFCC68`,
League Spartan font, rounded cards aur halki ambient animation.

---

## 1. Chalayein (local ya server)

```bash
npm install
npm run seed     # sirf pehli baar — admin account aur sample content banata hai
npm start        # http://localhost:3000
```

Seed ke baad do accounts milte hain:

| Role    | Email                | Password    |
|---------|----------------------|-------------|
| Admin   | admin@cga.com.pk     | cga2026     |
| Student | student@cga.com.pk   | student123  |

**Pehla kaam:** admin se login karke apna password badal lein (ya seed se pehle
`server/seed.js` mein email/password apni marzi ka likh dein).

---

## 2. Kaun kya kar sakta hai

**Student (`/dashboard`)**
- Sirf wahi subjects jo admin ne assign kiye hon
- Lessons dekhna (YouTube / Vimeo / Google Drive link embed hota hai) + "mukammal" ka nishan
- Quiz dena — MCQ aur short answer, marking foran, har sawal ka sahi jawab review mein
- Assignment ki file (PDF ya photo) upload karna, teacher ka feedback aur marks dekhna
- Results tab: quiz average, assignment marks, teacher ke tabsire

**Teacher / Admin (`/console`)**
- Subjects banana aur edit karna
- Lessons add karna (video link, notes ka link, chapter, duration, tarteeb)
- Quiz banana — MCQ ke 4 options aur sahi jawab, ya short answer ke zaroori alfaz
- Assignment banana, jama shuda kaam kholna, marks aur feedback dena
- Students ko subjects assign karna, account block/bahal karna
- Announcement bhejna — sab students ko ya kisi aik subject ko

---

## 3. Live karna (cga.com.pk ka sub-domain)

Tajweez: `learn.cga.com.pk` ya `edugrads.cga.com.pk`.

Kisi bhi Node hosting (VPS, Railway, Render, cPanel Node app) par:

```bash
npm install --omit=dev
NODE_ENV=production PORT=3000 npm start
```

Phir Nginx ya cPanel se sub-domain ko is port par proxy karein aur SSL laga dein.
HTTPS zaroori hai — `NODE_ENV=production` par login cookie sirf secure connection par chalti hai.

Data teen jagah rehta hai, backup inhi ka lena hai:

- `data/edugrads.db` — poora database (SQLite)
- `uploads/` — students ki jama karda files
- kuch aur nahi

Environment variables (optional): `PORT`, `DATA_DIR`, `UPLOAD_DIR`.

---

## 4. Videos kahan rakhein

Video files server par na rakhein — mehngi bhi hain aur slow bhi. Behtar tareeqa:

1. YouTube par **Unlisted** upload karein (link wale hi dekh sakte hain), ya
2. Google Drive par file rakh kar "anyone with link" kar dein.

Dono ke link seedha lesson form mein paste karein — app khud embed bana leti hai.

---

## 5. Aage kya add ho sakta hai

- Fees aur attendance ka record
- Islamiat AI marking system isi ke andar (aap ka mojooda project)
- Parent login — bacche ka progress dekhne ke liye
- Email se password reset (SMTP chahiye hoga)
- CGA books/shop section isi login ke peeche

---

Cambridge Grads Academy · cga.com.pk · 0302 9255003
