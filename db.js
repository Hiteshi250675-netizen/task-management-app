/**
 * Database Module (db.js)
 * Implements persistent SQLite storage using Node.js built-in `node:sqlite`.
 * Handles user accounts, session tokens, task management CRUD, subtasks, and activity history.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

// Resolve database file in project root
const DB_FILE = path.join(__dirname, 'taskflow.db');
const db = new DatabaseSync(DB_FILE);

// Enable WAL mode and foreign keys for high performance and integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#6366f1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'todo',
    due_date TEXT,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Generate a random UUID
 */
function uid() {
  return crypto.randomUUID();
}

/**
 * Hash password with PBKDF2
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verify password
 */
function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

// ================= USER OPERATIONS ================= //

function createUser({ email, password, name, avatarColor = '#6366f1' }) {
  const id = uid();
  const { hash, salt } = hashPassword(password);
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, name, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, email.toLowerCase().trim(), hash, salt, name.trim(), avatarColor);
  return getUserById(id);
}

function getUserByEmail(email) {
  const stmt = db.prepare('SELECT id, email, password_hash, salt, name, avatar_color, created_at FROM users WHERE email = ?');
  return stmt.get(email.toLowerCase().trim());
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, email, name, avatar_color, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

// ================= SESSION TOKEN OPERATIONS ================= //

function createSession(userId, expiresInDays = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
  const stmt = db.prepare('INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)');
  stmt.run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getSessionUser(token) {
  if (!token) return null;
  const stmt = db.prepare(`
    SELECT users.id, users.email, users.name, users.avatar_color, tokens.expires_at
    FROM tokens
    JOIN users ON users.id = tokens.user_id
    WHERE tokens.token = ?
  `);
  const record = stmt.get(token);
  if (!record) return null;

  if (record.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    avatarColor: record.avatar_color
  };
}

function deleteSession(token) {
  const stmt = db.prepare('DELETE FROM tokens WHERE token = ?');
  stmt.run(token);
}

// ================= TASK OPERATIONS ================= //

function getTasks(userId, { status, category, priority, search, sortBy = 'due_date' } = {}) {
  let query = 'SELECT * FROM tasks WHERE user_id = ?';
  const params = [userId];

  if (status && status !== 'all') {
    if (status === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      query += ` AND status != 'completed' AND due_date < ? AND due_date != ''`;
      params.push(today);
    } else if (status === 'today') {
      const today = new Date().toISOString().split('T')[0];
      query += ` AND due_date = ?`;
      params.push(today);
    } else {
      query += ' AND status = ?';
      params.push(status);
    }
  }

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (priority && priority !== 'all') {
    query += ' AND priority = ?';
    params.push(priority);
  }

  if (search && search.trim()) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  // Sorting
  switch (sortBy) {
    case 'priority':
      // Urgent > High > Medium > Low
      query += ` ORDER BY CASE priority
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        WHEN 'Low' THEN 4
        ELSE 5 END ASC, due_date ASC`;
      break;
    case 'title':
      query += ' ORDER BY title COLLATE NOCASE ASC';
      break;
    case 'created_at':
      query += ' ORDER BY created_at DESC';
      break;
    case 'position':
      query += ' ORDER BY position ASC, created_at DESC';
      break;
    case 'due_date':
    default:
      query += ' ORDER BY CASE WHEN due_date IS NULL OR LENGTH(due_date) = 0 THEN 1 ELSE 0 END, due_date ASC, created_at DESC';
      break;
  }

  const tasksStmt = db.prepare(query);
  const tasks = tasksStmt.all(...params);

  // Fetch subtasks for each task
  const subtasksStmt = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, id ASC');
  return tasks.map(task => {
    const subtasks = subtasksStmt.all(task.id);
    return {
      ...task,
      subtasks
    };
  });
}

function getTaskById(id, userId) {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?');
  const task = stmt.get(id, userId);
  if (!task) return null;

  const subtasksStmt = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, id ASC');
  task.subtasks = subtasksStmt.all(task.id);
  return task;
}

function createTask({ userId, title, description = '', category = 'General', priority = 'Medium', status = 'todo', due_date = null, subtasks = [] }) {
  const id = uid();
  const stmt = db.prepare(`
    INSERT INTO tasks (id, user_id, title, description, category, priority, status, due_date, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE user_id = ? AND status = ?), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  stmt.run(id, userId, title.trim(), description.trim(), category, priority, status, due_date || null, userId, status);

  // Add initial subtasks if any
  if (Array.isArray(subtasks) && subtasks.length > 0) {
    const insertSub = db.prepare('INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)');
    subtasks.forEach((st, idx) => {
      const subTitle = typeof st === 'string' ? st : st.title;
      const completed = typeof st === 'object' && st.completed ? 1 : 0;
      if (subTitle && subTitle.trim()) {
        insertSub.run(uid(), id, subTitle.trim(), completed, idx);
      }
    });
  }

  logActivity(userId, id, 'create', `Created task "${title.trim()}"`);
  return getTaskById(id, userId);
}

function updateTask(id, userId, { title, description, category, priority, status, due_date, position, subtasks }) {
  const existing = getTaskById(id, userId);
  if (!existing) return null;

  const newTitle = title !== undefined ? title.trim() : existing.title;
  const newDesc = description !== undefined ? description.trim() : existing.description;
  const newCat = category !== undefined ? category : existing.category;
  const newPrio = priority !== undefined ? priority : existing.priority;
  const newStatus = status !== undefined ? status : existing.status;
  const newDue = due_date !== undefined ? due_date : existing.due_date;
  const newPos = position !== undefined ? position : existing.position;

  const stmt = db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, category = ?, priority = ?, status = ?, due_date = ?, position = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  stmt.run(newTitle, newDesc, newCat, newPrio, newStatus, newDue, newPos, id, userId);

  // If subtasks provided, sync them
  if (Array.isArray(subtasks)) {
    // Delete existing subtasks and insert fresh
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);
    const insertSub = db.prepare('INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)');
    subtasks.forEach((st, idx) => {
      const subTitle = typeof st === 'string' ? st : st.title;
      const completed = typeof st === 'object' && st.completed ? 1 : 0;
      if (subTitle && subTitle.trim()) {
        insertSub.run(uid(), id, subTitle.trim(), completed, idx);
      }
    });
  }

  if (existing.status !== newStatus) {
    logActivity(userId, id, 'status_change', `Moved "${newTitle}" to ${newStatus.replace('_', ' ').toUpperCase()}`);
  } else {
    logActivity(userId, id, 'update', `Updated task "${newTitle}"`);
  }

  return getTaskById(id, userId);
}

function updateTaskStatus(id, userId, newStatus, newPosition = 0) {
  const existing = getTaskById(id, userId);
  if (!existing) return null;

  const stmt = db.prepare(`
    UPDATE tasks
    SET status = ?, position = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  stmt.run(newStatus, newPosition, id, userId);

  logActivity(userId, id, 'status_change', `Moved "${existing.title}" to ${newStatus.replace('_', ' ').toUpperCase()}`);
  return getTaskById(id, userId);
}

function deleteTask(id, userId) {
  const existing = getTaskById(id, userId);
  if (!existing) return null;

  db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId);

  logActivity(userId, null, 'delete', `Deleted task "${existing.title}"`);
  return existing;
}

function clearCompletedTasks(userId) {
  const completedTasks = db.prepare(`SELECT id, title FROM tasks WHERE user_id = ? AND status = 'completed'`).all(userId);
  if (completedTasks.length === 0) return 0;

  for (const t of completedTasks) {
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(t.id);
  }
  const res = db.prepare(`DELETE FROM tasks WHERE user_id = ? AND status = 'completed'`).run(userId);
  logActivity(userId, null, 'bulk_delete', `Cleared ${completedTasks.length} completed tasks`);
  return res.changes;
}

// ================= SUBTASK OPERATIONS ================= //

function toggleSubtask(subtaskId, userId, completed) {
  // Ensure the task belongs to the user
  const sub = db.prepare(`
    SELECT subtasks.*, tasks.user_id, tasks.title as task_title
    FROM subtasks
    JOIN tasks ON tasks.id = subtasks.task_id
    WHERE subtasks.id = ? AND tasks.user_id = ?
  `).get(subtaskId, userId);

  if (!sub) return null;

  const isCompleted = completed ? 1 : 0;
  db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(isCompleted, subtaskId);

  logActivity(userId, sub.task_id, 'subtask_toggle', `${isCompleted ? 'Checked' : 'Unchecked'} subtask "${sub.title}" on "${sub.task_title}"`);
  return getTaskById(sub.task_id, userId);
}

function addSubtask(taskId, userId, title) {
  const task = getTaskById(taskId, userId);
  if (!task) return null;

  const id = uid();
  const nextPos = task.subtasks ? task.subtasks.length : 0;
  db.prepare('INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, 0, ?)').run(id, taskId, title.trim(), nextPos);

  logActivity(userId, taskId, 'subtask_add', `Added subtask "${title.trim()}" to "${task.title}"`);
  return getTaskById(taskId, userId);
}

function deleteSubtask(subtaskId, userId) {
  const sub = db.prepare(`
    SELECT subtasks.*, tasks.user_id, tasks.id as task_id
    FROM subtasks
    JOIN tasks ON tasks.id = subtasks.task_id
    WHERE subtasks.id = ? AND tasks.user_id = ?
  `).get(subtaskId, userId);

  if (!sub) return null;

  db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
  return getTaskById(sub.task_id, userId);
}

// ================= ACTIVITY & STATS ================= //

function logActivity(userId, taskId, action, details) {
  try {
    const id = uid();
    db.prepare('INSERT INTO activity_logs (id, user_id, task_id, action, details) VALUES (?, ?, ?, ?, ?)').run(
      id, userId, taskId || null, action, details
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

function getRecentActivities(userId, limit = 15) {
  const stmt = db.prepare(`
    SELECT id, task_id, action, details, created_at
    FROM activity_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

function getStats(userId) {
  const today = new Date().toISOString().split('T')[0];

  const total = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').get(userId).count;
  const todo = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'todo'`).get(userId).count;
  const inProgress = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'in_progress'`).get(userId).count;
  const review = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'review'`).get(userId).count;
  const completed = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'completed'`).get(userId).count;

  const overdue = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE user_id = ? AND status != 'completed' AND due_date < ? AND due_date != '' AND due_date IS NOT NULL
  `).get(userId, today).count;

  const dueToday = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE user_id = ? AND status != 'completed' AND due_date = ?
  `).get(userId, today).count;

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Breakdown by category
  const categories = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM tasks
    WHERE user_id = ?
    GROUP BY category
    ORDER BY count DESC
  `).all(userId);

  // Breakdown by priority
  const priorities = db.prepare(`
    SELECT priority, COUNT(*) as count
    FROM tasks
    WHERE user_id = ?
    GROUP BY priority
  `).all(userId);

  return {
    total,
    todo,
    inProgress,
    review,
    completed,
    overdue,
    dueToday,
    completionRate,
    categories,
    priorities
  };
}

// ================= SEED INITIAL DEMO DATA ================= //

function seedDemoUser() {
  const demoEmail = 'demo@taskflow.com';
  let demoUser = getUserByEmail(demoEmail);

  if (!demoUser) {
    console.log('Seeding demo user and sample tasks...');
    demoUser = createUser({
      email: demoEmail,
      password: 'password123',
      name: 'Alex Taylor',
      avatarColor: '#4f46e5'
    });

    const now = new Date();
    const formatDate = (daysOffset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysOffset);
      return d.toISOString().split('T')[0];
    };

    const sampleTasks = [
      {
        title: 'Design Dark Mode UI & Design System',
        description: 'Create harmonious slate colors, contrast ratios, and glassmorphic card elements for modern desktop & mobile views.',
        category: 'Projects',
        priority: 'High',
        status: 'completed',
        due_date: formatDate(-1),
        subtasks: [
          { title: 'Define CSS custom property variables', completed: 1 },
          { title: 'Test contrast ratios for WCAG compliance', completed: 1 },
          { title: 'Add smooth theme toggle transitions', completed: 1 }
        ]
      },
      {
        title: 'Implement Native WebSockets Real-Time Sync',
        description: 'Connect client WebSocket to Node server for live board and task sync across multiple browser tabs.',
        category: 'Work',
        priority: 'Urgent',
        status: 'in_progress',
        due_date: formatDate(0),
        subtasks: [
          { title: 'RFC 6455 handshake implementation', completed: 1 },
          { title: 'Frame encoding & decoding', completed: 1 },
          { title: 'Client auto-reconnect logic', completed: 0 }
        ]
      },
      {
        title: 'Build Interactive Kanban Drag & Drop Board',
        description: 'Allow moving tasks seamlessly between To Do, In Progress, Review, and Completed columns.',
        category: 'Work',
        priority: 'High',
        status: 'in_progress',
        due_date: formatDate(1),
        subtasks: [
          { title: 'Set up draggable HTML5 attributes', completed: 1 },
          { title: 'Handle dragover and drop events', completed: 1 },
          { title: 'Optimistic UI status update on drop', completed: 0 }
        ]
      },
      {
        title: 'Full-Stack Architecture Documentation',
        description: 'Write comprehensive guide detailing REST endpoints, SQLite data storage, and authentication token flow.',
        category: 'Study',
        priority: 'Medium',
        status: 'review',
        due_date: formatDate(2),
        subtasks: [
          { title: 'Document REST API schema', completed: 1 },
          { title: 'Add Mermaid diagrams for architecture', completed: 1 },
          { title: 'Include beginner setup instructions', completed: 0 }
        ]
      },
      {
        title: 'Sprint Planning & Team Backlog Grooming',
        description: 'Review Q4 deliverables, estimate story points, and prioritize customer feature requests.',
        category: 'Work',
        priority: 'Medium',
        status: 'todo',
        due_date: formatDate(3),
        subtasks: [
          { title: 'Export Jira report', completed: 0 },
          { title: 'Prepare slide deck for kickoff', completed: 0 }
        ]
      },
      {
        title: 'Morning 5km Cardio Run & Mobility Routine',
        description: 'Keep up personal fitness streak! Morning warmup, 5km outdoor run, and full-body stretch.',
        category: 'Health',
        priority: 'Low',
        status: 'completed',
        due_date: formatDate(0),
        subtasks: [
          { title: '5-minute dynamic warmup', completed: 1 },
          { title: '5km steady pace run', completed: 1 },
          { title: '10-minute stretch & hydrate', completed: 1 }
        ]
      },
      {
        title: 'Prepare Groceries & Healthy Meal Prep',
        description: 'Buy fresh vegetables, oats, lean proteins, and prepare lunches for the upcoming work week.',
        category: 'Personal',
        priority: 'Low',
        status: 'todo',
        due_date: formatDate(4),
        subtasks: [
          { title: 'Create grocery checklist', completed: 1 },
          { title: 'Supermarket visit', completed: 0 },
          { title: 'Batch cook grain bowls', completed: 0 }
        ]
      }
    ];

    for (const t of sampleTasks) {
      createTask({
        userId: demoUser.id,
        ...t
      });
    }

    logActivity(demoUser.id, null, 'system', 'Demo account created and initialized with sample tasks.');
  }
}

// Auto-seed on initialization
seedDemoUser();

module.exports = {
  db,
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  createSession,
  getSessionUser,
  deleteSession,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  clearCompletedTasks,
  toggleSubtask,
  addSubtask,
  deleteSubtask,
  logActivity,
  getRecentActivities,
  getStats
};
