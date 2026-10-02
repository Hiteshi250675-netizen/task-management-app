# TaskFlow &bull; Full-Stack Real-Time Task Management Application

A modern, responsive, full-stack web application designed for creating, updating, organizing, and tracking tasks with real-time updates and persistent storage.

---

## 🚀 Key Highlights & Architectural Overview

This project elevates the concepts introduced in introductory task management tutorials (such as the **TaskBuddy** React tutorial) into an end-to-end, production-ready full-stack architecture.

```
+-------------------------------------------------------------------------+
|                              FRONTEND                                   |
|   HTML5 Semantic Shell  +  Modern CSS (Dark/Light)  +  Reactive State   |
|   - Kanban Drag & Drop      - SVG Circular Progress  - Modals & Forms   |
|   - Real-Time Live Badge    - Dynamic Subtasks       - Toast Notifications|
+--------------------+--------------------------------+-------------------+
                     | Fetch (HTTP REST)              | WebSocket (RFC 6455)
                     v                                v
+--------------------+--------------------------------+-------------------+
|                              BACKEND                                    |
|   Node.js Server (`server.js`)                                         |
|   - HTTP Request Router     - Session Token Guard   - WS Frame Codec    |
|   - Static Asset Streaming  - Activity Logger       - Multi-client Broadcast
+--------------------+----------------------------------------------------+
                     |
                     v
+--------------------+----------------------------------------------------+
|                             PERSISTENCE                                 |
|   SQLite Relational Engine (`db.js` using `node:sqlite`)               |
|   - Users (PBKDF2 Salted Hashes) - Tasks (CRUD & Positions)             |
|   - Subtask Checklists          - Activity History Logs                 |
+-------------------------------------------------------------------------+
```

---

## 🌟 Core Features

### 1. User Authentication & Authorization
- **Registration & Login**: Secure account creation with email, password, and custom avatar colors.
- **Cryptographic Security**: Passwords are never stored in plaintext. Hashing is performed using `crypto.pbkdf2Sync` (100,000 rounds of SHA-512 with unique cryptographic salts) and verified using constant-time comparison `crypto.timingSafeEqual` to thwart timing attacks.
- **Session Tokens**: Cryptographically strong random 32-byte hex tokens stored securely and validated on every protected API endpoint via `Authorization: Bearer <token>`.
- **1-Click Demo Account**: Instant test login (`demo@taskflow.com` / `password123`) with pre-seeded tasks and subtasks for rapid exploration.

### 2. Full Task CRUD & Organization
- **Create**: Rapid inline quick-add bar or detailed modal with title, rich notes/description, priority level (Urgent, High, Medium, Low), category tags, due date, and dynamic checklist/subtasks.
- **Read**:
  - **Kanban Board**: 4 interactive columns (`To Do`, `In Progress`, `Under Review`, `Completed`) with HTML5 Drag-and-Drop.
  - **List View**: Dense, structured table view with direct status checkboxes, tags, and action buttons.
  - **Search & Filters**: Instant live text search across title and description, filter by timeframe (All, Due Today, Overdue, Completed), category tags (Work, Personal, Projects, Study, Health), and priority.
- **Update**:
  - One-click completion toggle.
  - Kanban drag-and-drop to update status and priority order.
  - Full modal editor for editing any task field and managing subtask steps.
- **Delete & Undo**:
  - Task deletion with confirmation modal and an animated **"Undo"** toast notification.
  - Bulk action to clear all completed tasks.

### 3. Dynamic Progress Tracker & Analytics (TaskBuddy Tutorial Feature)
- **Visual Circular Progress**: Dynamic SVG donut chart displaying real-time completion percentage ($`\text{Rate} = \frac{\text{Completed}}{\text{Total}} \times 100`$).
- **Motivational Progress Messages**: Context-aware encouragement based on current completion rate.
- **Quick Metrics Grid**: Total tasks, In progress count, Completed count, and Overdue indicator.

### 4. Real-Time WebSockets Synchronization
- **Native RFC 6455 Engine**: Pure Node.js WebSocket server implementation (handshake SHA-1 hashing, frame encoding/decoding, masking) with **zero external npm packages required**.
- **Instant Multi-Tab Broadcast**: When a task is created, modified, or deleted in one tab or device, all connected clients for that user update instantly without page reloads.
- **Visual Connection Badge**: Dynamic status indicator in the top navbar (`Live Sync`, `Reconnecting`, `Offline`).
- **Live Activity Feed**: Sliding drawer displaying chronological audit logs of all actions performed on tasks.

### 5. Responsive Design & Accessibility
- **CSS Custom Properties (Variables)**: Seamless switching between Dark Mode (slate/indigo) and Light Mode with persistent preference in `localStorage`.
- **Mobile-First Layout**: Mobile hamburger drawer, responsive grid columns that stack gracefully on smaller screens, and touch-friendly buttons.
- **Accessible HTML5**: Native `<dialog>` elements with backdrop blur, ARIA attributes, and keyboard shortcuts (`/` or `Ctrl+K` to search, `Escape` to close dialogs).

---

## 📂 Project Structure

```
Task Managment App/
├── server.js          # HTTP server, REST routing, WebSocket upgrade & broadcast
├── db.js              # SQLite database schema, prepared statements, CRUD queries
├── auth.js            # Password hashing, validation, session token middleware
├── package.json       # Project scripts and metadata
├── start.bat          # 1-Click launcher script for Windows
├── README.md          # Comprehensive full-stack guide & architecture
└── public/
    ├── index.html     # Semantic UI layout, forms, Kanban board, modals
    ├── css/
    │   └── style.css  # Modern CSS design system, dark/light themes, animations
    └── js/
        ├── api.js     # REST client & WebSocket real-time event listener
        └── app.js     # State management, Kanban drag & drop, UI rendering
```

---

## ⚡ Quick Start Instructions

### Method 1: 1-Click Launch on Windows
Double-click `start.bat` in the project folder. It will automatically detect Node.js, launch the server on port 3000, and open `http://localhost:3000` in your default browser.

### Method 2: Command Line
Open a terminal in this directory and run:

```bash
# Using standard Node.js:
node server.js

# Or using Antigravity's built-in Node runner:
agy-node.cmd server.js
```

Then open your browser at:
`http://localhost:3000`

> **Demo Login Credentials:**
> - Email: `demo@taskflow.com`
> - Password: `password123`
> *(Or click the **"Explore Demo Account (1-Click)"** button on the sign-in screen)*

---

## 📡 REST API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Log in with email & password | No |
| `POST` | `/api/auth/demo` | Instant 1-click demo login | No |
| `POST` | `/api/auth/logout` | Invalidate current session token | Yes |
| `GET` | `/api/auth/me` | Retrieve profile of authenticated user | Yes |
| `GET` | `/api/tasks` | Get all tasks (supports `?status=...&category=...&search=...&sortBy=...`) | Yes |
| `POST` | `/api/tasks` | Create a new task (broadcasts `task:created`) | Yes |
| `GET` | `/api/tasks/:id` | Get details of a single task including subtasks | Yes |
| `PUT` | `/api/tasks/:id` | Update full task details & subtasks (broadcasts `task:updated`) | Yes |
| `PATCH`| `/api/tasks/:id/status`| Update status & board position (broadcasts `task:updated`) | Yes |
| `DELETE`| `/api/tasks/:id` | Delete task (broadcasts `task:deleted`) | Yes |
| `DELETE`| `/api/tasks/completed`| Clear all completed tasks (broadcasts `tasks:cleared`) | Yes |
| `POST` | `/api/tasks/:id/subtasks` | Append a subtask step | Yes |
| `PATCH`| `/api/subtasks/:id` | Check / uncheck a subtask | Yes |
| `DELETE`| `/api/subtasks/:id` | Delete a subtask | Yes |
| `GET` | `/api/stats` | Retrieve completion rates & breakdown metrics | Yes |
| `GET` | `/api/activity` | Retrieve recent activity feed logs | Yes |

---

## 🗄️ Database Relational Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT DEFAULT '#6366f1',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'todo',
  due_date TEXT,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subtasks table
CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

-- Activity Logs table
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🧠 Educational Takeaways

1. **Client-Server Contract**: Notice how `api.js` decouples UI code (`app.js`) from network mechanics. The UI only deals with high-level promises (`api.createTask(...)`), making the frontend modular and maintainable.
2. **Optimistic UI Updates**: When moving cards across the Kanban board or checking a task, the UI updates instantly before awaiting the server response, rolling back gracefully if an error occurs.
3. **Real-Time Pub/Sub**: WebSocket messages act as asynchronous events. Any browser tab listening on `api.on('task:updated', ...)` updates automatically, keeping users in perfect sync.
4. **Relational Integrity**: Foreign keys with `ON DELETE CASCADE` ensure that deleting a user or task automatically cleans up associated subtasks, tokens, and logs without orphaned records.
