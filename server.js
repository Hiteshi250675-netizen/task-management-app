/**
 * TaskFlow Full-Stack Server (server.js)
 * Implements:
 * 1. HTTP Server & REST API endpoints
 * 2. Static file serving for modern responsive frontend
 * 3. Native RFC 6455 WebSocket Server for real-time task sync
 * 4. User authentication & authorization with session tokens
 * 5. SQLite persistent storage via db.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const db = require('./db.js');
const auth = require('./auth.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Connected WebSocket clients: Set of { socket, userId, id }
const wsClients = new Set();
// Connected SSE clients: Set of { res, userId }
const sseClients = new Set();

/**
 * WebSocket Frame Encoder (RFC 6455)
 */
function encodeWsFrame(data) {
  const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = length;
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * WebSocket Frame Decoder (RFC 6455)
 */
function decodeWsFrames(buffer, onMessage) {
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;

    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    const isMasked = (byte1 & 0x80) === 0x80;
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    if (isMasked) {
      headerLen += 4;
    }

    if (buffer.length - offset < headerLen + payloadLen) {
      break;
    }

    let payload = buffer.subarray(offset + headerLen, offset + headerLen + payloadLen);
    if (isMasked) {
      const maskKey = buffer.subarray(offset + headerLen - 4, offset + headerLen);
      const unmasked = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i] ^ maskKey[i % 4];
      }
      payload = unmasked;
    }

    if (opcode === 1) { // text frame
      onMessage(payload.toString('utf8'));
    } else if (opcode === 8) { // close frame
      return { closed: true };
    }

    offset += headerLen + payloadLen;
  }
  return { remaining: buffer.subarray(offset) };
}

/**
 * Broadcast event to all active real-time connections for a given user
 */
function broadcastToUser(userId, eventType, data = {}) {
  const payload = {
    type: eventType,
    data,
    timestamp: new Date().toISOString()
  };

  // Broadcast to WebSocket clients
  const frame = encodeWsFrame(payload);
  for (const client of wsClients) {
    if (client.userId === userId && !client.socket.destroyed) {
      try {
        client.socket.write(frame);
      } catch (err) {
        console.error('Error writing to WebSocket client:', err);
      }
    }
  }

  // Broadcast to SSE clients
  const sseData = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    if (client.userId === userId && !client.res.destroyed) {
      try {
        client.res.write(sseData);
      } catch (err) {
        console.error('Error writing to SSE client:', err);
      }
    }
  }
}

/**
 * Helper to parse JSON request body
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB limit
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response helper
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

/**
 * Send Error response helper
 */
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message, success: false });
}

/**
 * Main HTTP Server
 */
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle SSE Endpoint for real-time updates fallback
  if (pathname === '/api/events' && req.method === 'GET') {
    const user = auth.authenticate(req);
    if (!user) {
      return sendError(res, 401, 'Unauthorized for SSE connection');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE sync established' })}\n\n`);

    const client = { res, userId: user.id };
    sseClients.add(client);
    req.on('close', () => {
      sseClients.delete(client);
    });
    return;
  }

  // ================= API ROUTES ================= //
  if (pathname.startsWith('/api/')) {
    try {
      // 1. AUTH ROUTES (Public)
      if (pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = auth.register(body);
        return sendJson(res, 201, { success: true, ...result });
      }

      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = auth.login(body);
        return sendJson(res, 200, { success: true, ...result });
      }

      if (pathname === '/api/auth/demo' && req.method === 'POST') {
        const result = auth.demoLogin();
        return sendJson(res, 200, { success: true, ...result });
      }

      // Authenticate all remaining API endpoints
      const user = auth.authenticate(req);
      if (!user) {
        return sendError(res, 401, 'Authentication required. Please log in.');
      }

      if (pathname === '/api/auth/me' && req.method === 'GET') {
        return sendJson(res, 200, { success: true, user });
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        if (user.token) {
          db.deleteSession(user.token);
        }
        return sendJson(res, 200, { success: true, message: 'Logged out successfully' });
      }

      // 2. STATS & ACTIVITY ROUTES
      if (pathname === '/api/stats' && req.method === 'GET') {
        const stats = db.getStats(user.id);
        return sendJson(res, 200, { success: true, stats });
      }

      if (pathname === '/api/activity' && req.method === 'GET') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
        const activities = db.getRecentActivities(user.id, limit);
        return sendJson(res, 200, { success: true, activities });
      }

      // 3. TASK CRUD ROUTES
      // GET /api/tasks - List all tasks with optional filters
      if (pathname === '/api/tasks' && req.method === 'GET') {
        const status = parsedUrl.searchParams.get('status') || 'all';
        const category = parsedUrl.searchParams.get('category') || 'all';
        const priority = parsedUrl.searchParams.get('priority') || 'all';
        const search = parsedUrl.searchParams.get('search') || '';
        const sortBy = parsedUrl.searchParams.get('sortBy') || 'due_date';

        const tasks = db.getTasks(user.id, { status, category, priority, search, sortBy });
        return sendJson(res, 200, { success: true, count: tasks.length, tasks });
      }

      // POST /api/tasks - Create task
      if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.title || !body.title.trim()) {
          return sendError(res, 400, 'Task title is required');
        }

        const task = db.createTask({
          userId: user.id,
          title: body.title,
          description: body.description || '',
          category: body.category || 'General',
          priority: body.priority || 'Medium',
          status: body.status || 'todo',
          due_date: body.due_date || null,
          subtasks: body.subtasks || []
        });

        broadcastToUser(user.id, 'task:created', { task });
        return sendJson(res, 201, { success: true, task });
      }

      // DELETE /api/tasks/completed - Clear completed tasks
      if (pathname === '/api/tasks/completed' && req.method === 'DELETE') {
        const deletedCount = db.clearCompletedTasks(user.id);
        broadcastToUser(user.id, 'tasks:cleared', { deletedCount });
        return sendJson(res, 200, { success: true, deletedCount });
      }

      // Individual Task operations: /api/tasks/:id
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch) {
        const taskId = taskMatch[1];

        if (req.method === 'GET') {
          const task = db.getTaskById(taskId, user.id);
          if (!task) return sendError(res, 404, 'Task not found');
          return sendJson(res, 200, { success: true, task });
        }

        if (req.method === 'PUT') {
          const body = await parseJsonBody(req);
          const task = db.updateTask(taskId, user.id, body);
          if (!task) return sendError(res, 404, 'Task not found');
          broadcastToUser(user.id, 'task:updated', { task });
          return sendJson(res, 200, { success: true, task });
        }

        if (req.method === 'DELETE') {
          const deleted = db.deleteTask(taskId, user.id);
          if (!deleted) return sendError(res, 404, 'Task not found');
          broadcastToUser(user.id, 'task:deleted', { taskId, task: deleted });
          return sendJson(res, 200, { success: true, task: deleted });
        }
      }

      // PATCH /api/tasks/:id/status - Quick status toggle or Kanban move
      const statusMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
      if (statusMatch && req.method === 'PATCH') {
        const taskId = statusMatch[1];
        const body = await parseJsonBody(req);
        if (!body.status) return sendError(res, 400, 'Status field is required');

        const task = db.updateTaskStatus(taskId, user.id, body.status, body.position || 0);
        if (!task) return sendError(res, 404, 'Task not found');
        broadcastToUser(user.id, 'task:updated', { task });
        return sendJson(res, 200, { success: true, task });
      }

      // Subtasks: POST /api/tasks/:id/subtasks
      const subtaskAddMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/subtasks$/);
      if (subtaskAddMatch && req.method === 'POST') {
        const taskId = subtaskAddMatch[1];
        const body = await parseJsonBody(req);
        if (!body.title || !body.title.trim()) return sendError(res, 400, 'Subtask title is required');

        const task = db.addSubtask(taskId, user.id, body.title);
        if (!task) return sendError(res, 404, 'Task not found');
        broadcastToUser(user.id, 'task:updated', { task });
        return sendJson(res, 201, { success: true, task });
      }

      // Subtasks: PATCH /api/subtasks/:id (toggle completion)
      const subtaskToggleMatch = pathname.match(/^\/api\/subtasks\/([^/]+)$/);
      if (subtaskToggleMatch && req.method === 'PATCH') {
        const subtaskId = subtaskToggleMatch[1];
        const body = await parseJsonBody(req);
        const completed = body.completed !== undefined ? !!body.completed : false;

        const task = db.toggleSubtask(subtaskId, user.id, completed);
        if (!task) return sendError(res, 404, 'Subtask not found');
        broadcastToUser(user.id, 'task:updated', { task });
        return sendJson(res, 200, { success: true, task });
      }

      // Subtasks: DELETE /api/subtasks/:id
      if (subtaskToggleMatch && req.method === 'DELETE') {
        const subtaskId = subtaskToggleMatch[1];
        const task = db.deleteSubtask(subtaskId, user.id);
        if (!task) return sendError(res, 404, 'Subtask not found');
        broadcastToUser(user.id, 'task:updated', { task });
        return sendJson(res, 200, { success: true, task });
      }

      // Unmatched API route
      return sendError(res, 404, `Endpoint ${req.method} ${pathname} not found`);
    } catch (err) {
      console.error('API Error:', err);
      return sendError(res, 500, err.message || 'Internal server error');
    }
  }

  // ================= STATIC FILE SERVING ================= //
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA-style routing if not an asset
      const ext = path.extname(safePath);
      if (!ext || ext === '.html') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Caching headers: 1 hour for assets, no-cache for index.html
    const headers = { 'Content-Type': contentType };
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

// ================= WEBSOCKET PROTOCOL UPGRADE ================= //
server.on('upgrade', (req, socket, head) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (reqUrl.pathname !== '/ws' && reqUrl.pathname !== '/') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  // RFC 6455 Handshake
  const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
  );

  const client = {
    socket,
    userId: null,
    id: crypto.randomUUID()
  };
  wsClients.add(client);

  // Authenticate from query token if present
  const queryToken = reqUrl.searchParams.get('token');
  if (queryToken) {
    const user = db.getSessionUser(queryToken);
    if (user) {
      client.userId = user.id;
    }
  }

  // Send welcome confirmation
  socket.write(encodeWsFrame({
    type: 'connected',
    message: 'TaskFlow WebSocket connected',
    authenticated: !!client.userId
  }));

  let buffer = Buffer.alloc(0);

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    const res = decodeWsFrames(buffer, rawMsg => {
      try {
        const msg = JSON.parse(rawMsg);
        if (msg.type === 'auth' && msg.token) {
          const user = db.getSessionUser(msg.token);
          if (user) {
            client.userId = user.id;
            socket.write(encodeWsFrame({ type: 'authenticated', user: { id: user.id, name: user.name } }));
          } else {
            socket.write(encodeWsFrame({ type: 'auth_error', message: 'Invalid session token' }));
          }
        } else if (msg.type === 'ping') {
          socket.write(encodeWsFrame({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (e) {
        console.error('Error handling WS client message:', e);
      }
    });

    if (res && res.closed) {
      socket.end();
    } else if (res && res.remaining) {
      buffer = res.remaining;
    }
  });

  socket.on('close', () => {
    wsClients.delete(client);
  });

  socket.on('error', () => {
    wsClients.delete(client);
  });
});

// Periodic ping to keep WebSockets alive
setInterval(() => {
  const pingFrame = encodeWsFrame({ type: 'ping', timestamp: Date.now() });
  for (const client of wsClients) {
    if (!client.socket.destroyed) {
      try {
        client.socket.write(pingFrame);
      } catch (_) {
        wsClients.delete(client);
      }
    }
  }
}, 30000);

// Start server
server.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`TaskFlow Server running successfully!`);
  console.log(`URL: http://127.0.0.1:${PORT}`);
  console.log(`WebSocket: ws://127.0.0.1:${PORT}/ws`);
  console.log(`Default Demo Account: demo@taskflow.com / password123`);
  console.log(`====================================================`);
});
