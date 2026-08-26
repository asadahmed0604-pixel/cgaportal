const bcrypt = require('bcryptjs');
const db = require('./db');

const hash = (p) => bcrypt.hashSync(p, 10);

function user(name, email, password, role, level) {
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (found) return found.id;
  return db.prepare('INSERT INTO users (name, email, password_hash, role, level) VALUES (?,?,?,?,?)')
    .run(name, email, hash(password), role, level).lastInsertRowid;
}

function subject(name, code, level, teacher, summary) {
  const found = db.prepare('SELECT id FROM subjects WHERE name = ? AND level = ?').get(name, level);
  if (found) return found.id;
  return db.prepare('INSERT INTO subjects (name, code, level, teacher, summary) VALUES (?,?,?,?,?)')
    .run(name, code, level, teacher, summary).lastInsertRowid;
}

const adminId = user('Syed Asad Ahmed', 'admin@cga.com.pk', 'cga2026', 'admin', null);
const demoId = user('Demo Student', 'student@cga.com.pk', 'student123', 'student', 'O Level');

const maths = subject('Mathematics', '0580', 'O Level', 'Sir Asad Ahmed', 'Core aur Extended dono ka full syllabus, past paper walkthroughs ke saath.');
const physics = subject('Physics', '5054', 'O Level', 'CGA Science Faculty', 'Concept lectures, numericals aur practical paper ki tayari.');
const islamiat = subject('Islamiyat', '2058', 'O Level', 'CGA Humanities Faculty', 'Quran, Hadith aur Seerah — examiner marking scheme ke mutabiq.');
const chem = subject('Chemistry', '5070', 'O Level', 'CGA Science Faculty', 'Physical, inorganic aur organic chemistry lesson-by-lesson.');

[maths, physics, islamiat].forEach(sid =>
  db.prepare('INSERT OR IGNORE INTO enrollments (user_id, subject_id) VALUES (?,?)').run(demoId, sid));

const lesson = db.prepare(`INSERT INTO lessons (subject_id, chapter, title, description, video_url, notes_url, duration, position)
                           VALUES (?,?,?,?,?,?,?,?)`);
if (db.prepare('SELECT COUNT(*) n FROM lessons').get().n === 0) {
  [
    [maths, 'Number', 'Standard form aur significant figures', 'Standard form likhna, calculator ke bagair hisaab, aur rounding rules.', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '', 34, 1],
    [maths, 'Algebra', 'Quadratic equations — factorising aur formula', 'Teen tareeqe: factorising, completing the square, quadratic formula.', '', '', 47, 2],
    [maths, 'Algebra', 'Simultaneous equations', 'Substitution aur elimination, past paper questions ke saath.', '', '', 29, 3],
    [maths, 'Geometry', 'Circle theorems ka poora set', 'Saat theorems, unke proofs aur exam mein pehchan ka tareeqa.', '', '', 52, 4],
    [physics, 'Forces & Motion', 'Speed, velocity aur acceleration', 'Graphs parhna aur numericals hal karna.', '', '', 38, 1],
    [physics, 'Thermal Physics', 'Heat capacity aur latent heat', 'Formulas ka istemal aur experiment ki tafseel.', '', '', 41, 2],
    [islamiat, 'Quran', 'Passages 1–5 ka tafseeli jaiza', 'Har passage ka context, teaching aur importance.', '', '', 45, 1],
    [islamiat, 'Seerah', 'Life in Makkah — key events', '4-mark aur 10-mark answers ka structure.', '', '', 36, 2]
  ].forEach(r => lesson.run(...r));
}

if (db.prepare('SELECT COUNT(*) n FROM quizzes').get().n === 0) {
  const qz = db.prepare('INSERT INTO quizzes (subject_id, title, instructions, time_limit) VALUES (?,?,?,?)')
    .run(maths, 'Algebra — Quick Check (10 marks)', 'Har sawal ka aik hi sahi jawab hai. Calculator allowed nahi.', 15).lastInsertRowid;
  const q = db.prepare('INSERT INTO questions (quiz_id, type, text, options, answer, marks, position) VALUES (?,?,?,?,?,?,?)');
  q.run(qz, 'mcq', 'x² − 5x + 6 = 0 ke roots kya hain?', JSON.stringify(['x = 1, 6', 'x = 2, 3', 'x = −2, −3', 'x = 5, 6']), '1', 2, 0);
  q.run(qz, 'mcq', '3(2x − 4) ko expand karein.', JSON.stringify(['6x − 4', '6x − 12', '5x − 12', '6x + 12']), '1', 2, 1);
  q.run(qz, 'mcq', 'Agar 2x + 3 = 11 hai to x = ?', JSON.stringify(['3', '4', '5', '7']), '1', 2, 2);
  q.run(qz, 'short', 'Standard form mein 45,000 likhein.', null, '4.5|10', 2, 3);
  q.run(qz, 'mcq', '(x + 3)(x − 3) barabar hai:', JSON.stringify(['x² − 9', 'x² + 9', 'x² − 6x + 9', 'x² − 3']), '0', 2, 4);
}

if (db.prepare('SELECT COUNT(*) n FROM assignments').get().n === 0) {
  db.prepare('INSERT INTO assignments (subject_id, title, brief, due_date, max_marks) VALUES (?,?,?,?,?)')
    .run(maths, 'Past Paper — May/June 2024 Paper 2', 'Poora paper hal karke scan ya photo upload karein. Working zaroor dikhayein.',
      new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10), 70);
  db.prepare('INSERT INTO assignments (subject_id, title, brief, due_date, max_marks) VALUES (?,?,?,?,?)')
    .run(islamiat, 'Quran Passage 3 — 10 mark question', 'Passage ki importance par mukammal jawab likhein, quotation ke saath.',
      new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), 10);
}

if (db.prepare('SELECT COUNT(*) n FROM announcements').get().n === 0) {
  db.prepare('INSERT INTO announcements (subject_id, title, body) VALUES (?,?,?)')
    .run(null, 'EduGrads live ho gaya', 'Ab tamam recorded lessons, quizzes aur assignments yahin milenge. Kisi bhi masle ke liye office: 0302 9255003.');
}

console.log('Seed mukammal.');
console.log('Admin  : admin@cga.com.pk / cga2026');
console.log('Student: student@cga.com.pk / student123');
