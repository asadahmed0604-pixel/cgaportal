const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-60);
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

/* ---------------------------------- auth --------------------------------- */

function issueSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.cookie('eg_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production'
  });
}

function currentUser(req) {
  const token = req.cookies.eg_session;
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.level, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`).get(token) || null;
}

function auth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Session khatam ho gaya. Dobara login karein.' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Aapka account rok diya gaya hai. Office se rabta karein.' });
  req.user = user;
  next();
}

function staffOnly(req, res, next) {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Sirf teacher aur admin ke liye.' });
  }
  next();
}

const norm = (e) => String(e || '').trim().toLowerCase();

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, level } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Naam, email aur password chahiye.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password kam az kam 6 characters ka rakhein.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(norm(email))) {
    return res.status(409).json({ error: 'Ye email pehle se registered hai. Login karein.' });
  }
  const info = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, level, status)
    VALUES (?, ?, ?, ?, 'student', ?, 'active')`)
    .run(String(name).trim(), norm(email), phone || null, bcrypt.hashSync(String(password), 10), level || 'O Level');
  issueSession(res, info.lastInsertRowid);
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(norm(email));
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email ya password ghalat hai.' });
  }
  if (user.status === 'blocked') return res.status(403).json({ error: 'Aapka account rok diya gaya hai. Office se rabta karein.' });
  issueSession(res, user.id);
  res.json({ ok: true, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.cookies.eg_session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.eg_session);
  res.clearCookie('eg_session');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

/* -------------------------------- student -------------------------------- */

const enrolledIds = (uid) =>
  db.prepare('SELECT subject_id FROM enrollments WHERE user_id = ?').all(uid).map(r => r.subject_id);

app.get('/api/my/subjects', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id AND l.published = 1) AS lesson_count,
      (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
        WHERE l.subject_id = s.id AND p.user_id = @uid) AS done_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.subject_id = s.id AND q.published = 1) AS quiz_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.subject_id = s.id AND a.published = 1) AS assignment_count
    FROM subjects s
    JOIN enrollments e ON e.subject_id = s.id AND e.user_id = @uid
    ORDER BY s.name`).all({ uid: req.user.id });
  res.json(rows);
});

app.get('/api/my/subjects/:id', auth, (req, res) => {
  const sid = Number(req.params.id);
  if (!enrolledIds(req.user.id).includes(sid)) return res.status(403).json({ error: 'Aap is subject mein enrolled nahi hain.' });

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(sid);
  const lessons = db.prepare(`
    SELECT l.*, (p.lesson_id IS NOT NULL) AS completed
    FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.subject_id = ? AND l.published = 1
    ORDER BY l.position, l.id`).all(req.user.id, sid);
  const quizzes = db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM questions qq WHERE qq.quiz_id = q.id) AS question_count,
      (SELECT score FROM attempts a WHERE a.quiz_id = q.id AND a.user_id = ? ORDER BY a.id DESC LIMIT 1) AS last_score,
      (SELECT max_score FROM attempts a WHERE a.quiz_id = q.id AND a.user_id = ? ORDER BY a.id DESC LIMIT 1) AS last_max
    FROM quizzes q WHERE q.subject_id = ? AND q.published = 1 ORDER BY q.id DESC`)
    .all(req.user.id, req.user.id, sid);
  const assignments = db.prepare(`
    SELECT a.*, s.id AS submission_id, s.submitted_at, s.marks, s.feedback, s.file_name
    FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = ?
    WHERE a.subject_id = ? AND a.published = 1 ORDER BY a.due_date IS NULL, a.due_date`)
    .all(req.user.id, sid);
  const announcements = db.prepare(
    'SELECT * FROM announcements WHERE subject_id = ? OR subject_id IS NULL ORDER BY id DESC LIMIT 10').all(sid);

  res.json({ subject, lessons, quizzes, assignments, announcements });
});

app.post('/api/my/lessons/:id/complete', auth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(Number(req.params.id));
  if (!lesson || !enrolledIds(req.user.id).includes(lesson.subject_id)) return res.status(403).json({ error: 'Ijazat nahi.' });
  if (req.body && req.body.undo) {
    db.prepare('DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').run(req.user.id, lesson.id);
  } else {
    db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)').run(req.user.id, lesson.id);
  }
  res.json({ ok: true });
});

app.get('/api/my/quizzes/:id', auth, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND published = 1').get(Number(req.params.id));
  if (!quiz || !enrolledIds(req.user.id).includes(quiz.subject_id)) return res.status(403).json({ error: 'Ijazat nahi.' });
  const questions = db.prepare('SELECT id, type, text, options, marks FROM questions WHERE quiz_id = ? ORDER BY position, id')
    .all(quiz.id)
    .map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : [] }));
  res.json({ quiz, questions });
});

app.post('/api/my/quizzes/:id/submit', auth, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND published = 1').get(Number(req.params.id));
  if (!quiz || !enrolledIds(req.user.id).includes(quiz.subject_id)) return res.status(403).json({ error: 'Ijazat nahi.' });

  const answers = (req.body && req.body.answers) || {};
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position, id').all(quiz.id);
  let score = 0, max = 0;
  const review = questions.map(q => {
    max += q.marks;
    const given = answers[q.id];
    let correct = false;
    if (q.type === 'mcq') {
      correct = String(given) === String(q.answer);
    } else {
      const keywords = String(q.answer || '').split('|').map(k => k.trim().toLowerCase()).filter(Boolean);
      const text = String(given || '').toLowerCase();
      correct = keywords.length > 0 && keywords.every(k => text.includes(k));
    }
    if (correct) score += q.marks;
    return {
      id: q.id, text: q.text, type: q.type, marks: q.marks, correct,
      given: given ?? '', answer: q.answer,
      options: q.options ? JSON.parse(q.options) : []
    };
  });

  db.prepare('INSERT INTO attempts (quiz_id, user_id, answers, score, max_score) VALUES (?, ?, ?, ?, ?)')
    .run(quiz.id, req.user.id, JSON.stringify(answers), score, max);
  res.json({ score, max, review });
});

app.post('/api/my/assignments/:id/submit', auth, upload.single('file'), (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ? AND published = 1').get(Number(req.params.id));
  if (!a || !enrolledIds(req.user.id).includes(a.subject_id)) return res.status(403).json({ error: 'Ijazat nahi.' });
  const f = req.file;
  db.prepare(`
    INSERT INTO submissions (assignment_id, user_id, file_path, file_name, note)
    VALUES (@aid, @uid, @path, @name, @note)
    ON CONFLICT(assignment_id, user_id) DO UPDATE SET
      file_path = excluded.file_path, file_name = excluded.file_name, note = excluded.note,
      submitted_at = datetime('now'), marks = NULL, feedback = NULL, marked_at = NULL`)
    .run({
      aid: a.id, uid: req.user.id,
      path: f ? f.filename : null, name: f ? f.originalname : null,
      note: (req.body && req.body.note) || null
    });
  res.json({ ok: true });
});

app.get('/api/my/results', auth, (req, res) => {
  const quizzes = db.prepare(`
    SELECT a.id, a.score, a.max_score, a.submitted_at, q.title, s.name AS subject
    FROM attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN subjects s ON s.id = q.subject_id
    WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 50`).all(req.user.id);
  const assignments = db.prepare(`
    SELECT sub.id, sub.marks, sub.feedback, sub.submitted_at, sub.marked_at,
           a.title, a.max_marks, s.name AS subject
    FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id JOIN subjects s ON s.id = a.subject_id
    WHERE sub.user_id = ? ORDER BY sub.id DESC LIMIT 50`).all(req.user.id);
  res.json({ quizzes, assignments });
});

app.get('/uploads/:file', auth, (req, res) => {
  const name = path.basename(req.params.file);
  const full = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(full)) return res.status(404).send('File nahi mili.');
  if (!['teacher', 'admin'].includes(req.user.role)) {
    const owns = db.prepare('SELECT 1 FROM submissions WHERE user_id = ? AND file_path = ?').get(req.user.id, name);
    if (!owns) return res.status(403).send('Ijazat nahi.');
  }
  res.sendFile(full);
});

/* --------------------------------- admin --------------------------------- */

app.get('/api/admin/overview', auth, staffOnly, (req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    students: one("SELECT COUNT(*) n FROM users WHERE role = 'student'"),
    subjects: one('SELECT COUNT(*) n FROM subjects'),
    lessons: one('SELECT COUNT(*) n FROM lessons'),
    quizzes: one('SELECT COUNT(*) n FROM quizzes'),
    pending: one('SELECT COUNT(*) n FROM submissions WHERE marks IS NULL'),
    attempts: one('SELECT COUNT(*) n FROM attempts')
  });
});

app.get('/api/admin/students', auth, staffOnly, (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.level, u.status, u.created_at,
      (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS subjects
    FROM users u WHERE u.role = 'student' ORDER BY u.id DESC`).all());
});

app.post('/api/admin/students/:id', auth, staffOnly, (req, res) => {
  const { status, level } = req.body || {};
  db.prepare('UPDATE users SET status = COALESCE(?, status), level = COALESCE(?, level) WHERE id = ?')
    .run(status || null, level || null, Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/students/:id/enrollments', auth, staffOnly, (req, res) => {
  res.json(enrolledIds(Number(req.params.id)));
});

app.post('/api/admin/enroll', auth, staffOnly, (req, res) => {
  const { user_id, subject_id, remove } = req.body || {};
  if (remove) db.prepare('DELETE FROM enrollments WHERE user_id = ? AND subject_id = ?').run(user_id, subject_id);
  else db.prepare('INSERT OR IGNORE INTO enrollments (user_id, subject_id) VALUES (?, ?)').run(user_id, subject_id);
  res.json({ ok: true });
});

app.get('/api/admin/subjects', auth, staffOnly, (req, res) => {
  res.json(db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id) AS lesson_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.subject_id = s.id) AS quiz_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.subject_id = s.id) AS assignment_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = s.id) AS students
    FROM subjects s ORDER BY s.level, s.name`).all());
});

app.post('/api/admin/subjects', auth, staffOnly, (req, res) => {
  const { id, name, code, level, teacher, summary } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Subject ka naam chahiye.' });
  if (id) {
    db.prepare('UPDATE subjects SET name=?, code=?, level=?, teacher=?, summary=? WHERE id=?')
      .run(name, code || null, level || 'O Level', teacher || null, summary || null, id);
    return res.json({ ok: true, id });
  }
  const info = db.prepare('INSERT INTO subjects (name, code, level, teacher, summary) VALUES (?,?,?,?,?)')
    .run(name, code || null, level || 'O Level', teacher || null, summary || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/admin/subjects/:id', auth, staffOnly, (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/subjects/:id', auth, staffOnly, (req, res) => {
  const sid = Number(req.params.id);
  res.json({
    subject: db.prepare('SELECT * FROM subjects WHERE id = ?').get(sid),
    lessons: db.prepare('SELECT * FROM lessons WHERE subject_id = ? ORDER BY position, id').all(sid),
    quizzes: db.prepare(`SELECT q.*, (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS question_count
                         FROM quizzes q WHERE q.subject_id = ? ORDER BY q.id DESC`).all(sid),
    assignments: db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submissions
                             FROM assignments a WHERE a.subject_id = ? ORDER BY a.id DESC`).all(sid)
  });
});

app.post('/api/admin/lessons', auth, staffOnly, (req, res) => {
  const { id, subject_id, chapter, title, description, video_url, notes_url, duration, position, published } = req.body || {};
  if (!subject_id || !title) return res.status(400).json({ error: 'Subject aur lesson title chahiye.' });
  if (id) {
    db.prepare(`UPDATE lessons SET chapter=?, title=?, description=?, video_url=?, notes_url=?, duration=?, position=?, published=? WHERE id=?`)
      .run(chapter || null, title, description || null, video_url || null, notes_url || null, duration || 0, position || 0, published ? 1 : 0, id);
    return res.json({ ok: true });
  }
  db.prepare(`INSERT INTO lessons (subject_id, chapter, title, description, video_url, notes_url, duration, position, published)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(subject_id, chapter || null, title, description || null, video_url || null, notes_url || null, duration || 0, position || 0, published === 0 ? 0 : 1);
  res.json({ ok: true });
});

app.delete('/api/admin/lessons/:id', auth, staffOnly, (req, res) => {
  db.prepare('DELETE FROM lessons WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/quizzes', auth, staffOnly, (req, res) => {
  const { subject_id, title, instructions, time_limit, questions } = req.body || {};
  if (!subject_id || !title) return res.status(400).json({ error: 'Subject aur quiz title chahiye.' });
  const info = db.prepare('INSERT INTO quizzes (subject_id, title, instructions, time_limit) VALUES (?,?,?,?)')
    .run(subject_id, title, instructions || null, time_limit || 0);
  const qid = info.lastInsertRowid;
  const stmt = db.prepare('INSERT INTO questions (quiz_id, type, text, options, answer, marks, position) VALUES (?,?,?,?,?,?,?)');
  (questions || []).forEach((q, i) => {
    stmt.run(qid, q.type || 'mcq', q.text, q.options ? JSON.stringify(q.options) : null, String(q.answer ?? ''), q.marks || 1, i);
  });
  res.json({ ok: true, id: qid });
});

app.delete('/api/admin/quizzes/:id', auth, staffOnly, (req, res) => {
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/quizzes/:id/results', auth, staffOnly, (req, res) => {
  res.json(db.prepare(`
    SELECT a.id, a.score, a.max_score, a.submitted_at, u.name, u.email
    FROM attempts a JOIN users u ON u.id = a.user_id WHERE a.quiz_id = ? ORDER BY a.score DESC`)
    .all(Number(req.params.id)));
});

app.post('/api/admin/assignments', auth, staffOnly, (req, res) => {
  const { subject_id, title, brief, due_date, max_marks, paper_url } = req.body || {};
  if (!subject_id || !title) return res.status(400).json({ error: 'Subject aur assignment title chahiye.' });
  db.prepare('INSERT INTO assignments (subject_id, title, brief, due_date, max_marks, paper_url) VALUES (?,?,?,?,?,?)')
    .run(subject_id, title, brief || null, due_date || null, max_marks || 20, paper_url || null);
  res.json({ ok: true });
});

app.delete('/api/admin/assignments/:id', auth, staffOnly, (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/submissions', auth, staffOnly, (req, res) => {
  const pendingOnly = req.query.pending === '1';
  res.json(db.prepare(`
    SELECT s.*, u.name AS student, u.email, a.title AS assignment, a.max_marks, sub.name AS subject
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN subjects sub ON sub.id = a.subject_id
    ${pendingOnly ? 'WHERE s.marks IS NULL' : ''}
    ORDER BY s.marks IS NOT NULL, s.submitted_at DESC LIMIT 200`).all());
});

app.post('/api/admin/submissions/:id/mark', auth, staffOnly, (req, res) => {
  const { marks, feedback } = req.body || {};
  db.prepare("UPDATE submissions SET marks = ?, feedback = ?, marked_at = datetime('now') WHERE id = ?")
    .run(marks, feedback || null, Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/announcements', auth, staffOnly, (req, res) => {
  const { subject_id, title, body } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Announcement ka title chahiye.' });
  db.prepare('INSERT INTO announcements (subject_id, title, body) VALUES (?,?,?)')
    .run(subject_id || null, title, body || null);
  res.json({ ok: true });
});

app.get('/api/admin/announcements', auth, staffOnly, (req, res) => {
  res.json(db.prepare(`SELECT a.*, s.name AS subject FROM announcements a
                       LEFT JOIN subjects s ON s.id = a.subject_id ORDER BY a.id DESC LIMIT 50`).all());
});

/* --------------------------------- pages --------------------------------- */

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));
app.get('/console', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'console.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server par masla aa gaya. Dobara koshish karein.' });
});

app.listen(PORT, () => console.log(`EduGrads by CGA — http://localhost:${PORT}`));
