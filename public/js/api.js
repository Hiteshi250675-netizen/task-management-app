/**
 * TaskFlow API & Real-Time Sync Client (api.js)
 * Handles REST API requests, authentication state, and WebSocket real-time event synchronization.
 */

class TaskFlowAPI {
  constructor() {
    this.baseUrl = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';
    this.token = localStorage.getItem('taskflow_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('taskflow_user') || 'null');
    this.socket = null;
    this.socketListeners = new Map();
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  // ================= TOKEN & HEADERS ================= //

  setSession(user, token) {
    this.currentUser = user;
    this.token = token;
    localStorage.setItem('taskflow_token', token);
    localStorage.setItem('taskflow_user', JSON.stringify(user));
    this.initWebSocket();
  }

  clearSession() {
    this.currentUser = null;
    this.token = null;
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          this.clearSession();
          window.dispatchEvent(new CustomEvent('auth:required'));
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.warn(`[API] Error on ${endpoint}:`, err.message);
      throw err;
    }
  }

  // ================= AUTHENTICATION ================= //

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.success) {
      this.setSession(data.user, data.token);
    }
    return data;
  }

  async register(name, email, password, avatarColor = '#6366f1') {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, avatarColor })
    });
    if (data.success) {
      this.setSession(data.user, data.token);
    }
    return data;
  }

  async demoLogin() {
    const data = await this.request('/api/auth/demo', {
      method: 'POST'
    });
    if (data.success) {
      this.setSession(data.user, data.token);
    }
    return data;
  }

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    this.clearSession();
  }

  async getMe() {
    if (!this.token) return null;
    try {
      const data = await this.request('/api/auth/me');
      if (data.success) {
        this.currentUser = data.user;
        localStorage.setItem('taskflow_user', JSON.stringify(data.user));
        return data.user;
      }
    } catch (_) {
      this.clearSession();
    }
    return null;
  }

  // ================= TASKS CRUD ================= //

  async getTasks(filters = {}) {
    const query = new URLSearchParams();
    if (filters.status && filters.status !== 'all') query.set('status', filters.status);
    if (filters.category && filters.category !== 'all') query.set('category', filters.category);
    if (filters.priority && filters.priority !== 'all') query.set('priority', filters.priority);
    if (filters.search) query.set('search', filters.search);
    if (filters.sortBy) query.set('sortBy', filters.sortBy);

    const qs = query.toString();
    const endpoint = `/api/tasks${qs ? `?${qs}` : ''}`;
    const data = await this.request(endpoint);
    return data.tasks || [];
  }

  async getTask(id) {
    const data = await this.request(`/api/tasks/${id}`);
    return data.task;
  }

  async createTask(taskData) {
    const data = await this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
    return data.task;
  }

  async updateTask(id, taskData) {
    const data = await this.request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(taskData)
    });
    return data.task;
  }

  async updateTaskStatus(id, status, position = 0) {
    const data = await this.request(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, position })
    });
    return data.task;
  }

  async deleteTask(id) {
    const data = await this.request(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
    return data.task;
  }

  async clearCompletedTasks() {
    const data = await this.request('/api/tasks/completed', {
      method: 'DELETE'
    });
    return data.deletedCount;
  }

  // ================= SUBTASKS ================= //

  async addSubtask(taskId, title) {
    const data = await this.request(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title })
    });
    return data.task;
  }

  async toggleSubtask(subtaskId, completed) {
    const data = await this.request(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
    return data.task;
  }

  async deleteSubtask(subtaskId) {
    const data = await this.request(`/api/subtasks/${subtaskId}`, {
      method: 'DELETE'
    });
    return data.task;
  }

  // ================= STATS & ACTIVITY ================= //

  async getStats() {
    const data = await this.request('/api/stats');
    return data.stats;
  }

  async getActivity(limit = 15) {
    const data = await this.request(`/api/activity?limit=${limit}`);
    return data.activities || [];
  }

  // ================= REAL-TIME WEBSOCKET SYNC ================= //

  initWebSocket() {
    if (!this.token) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host || 'localhost:3000';
      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(this.token)}`;

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.notifyStatusChange('connected');
        // Send auth handshake frame
        this.socket.send(JSON.stringify({ type: 'auth', token: this.token }));
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleSocketEvent(payload);
        } catch (e) {
          console.warn('[WS] Failed to parse message:', event.data);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatusChange('disconnected');
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('[WS] Socket error:', err);
        this.isConnected = false;
        this.notifyStatusChange('error');
      };
    } catch (e) {
      console.warn('[WS] WebSocket setup error:', e);
      this.initSseFallback();
    }
  }

  initSseFallback() {
    if (!this.token || !window.EventSource) return;
    try {
      const sse = new EventSource(`/api/events?token=${encodeURIComponent(this.token)}`);
      sse.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          this.handleSocketEvent(payload);
        } catch (_) {}
      };
      sse.onerror = () => sse.close();
    } catch (_) {}
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!this.token) return;

    this.reconnectTimer = setTimeout(() => {
      this.notifyStatusChange('reconnecting');
      this.initWebSocket();
    }, 4000);
  }

  handleSocketEvent(payload) {
    const { type, data } = payload;
    if (type === 'ping') {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    // Call registered listeners
    if (this.socketListeners.has(type)) {
      for (const callback of this.socketListeners.get(type)) {
        callback(data, payload);
      }
    }

    // Global event listener
    if (this.socketListeners.has('*')) {
      for (const callback of this.socketListeners.get('*')) {
        callback(type, data, payload);
      }
    }
  }

  on(eventType, callback) {
    if (!this.socketListeners.has(eventType)) {
      this.socketListeners.set(eventType, new Set());
    }
    this.socketListeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    if (this.socketListeners.has(eventType)) {
      this.socketListeners.get(eventType).delete(callback);
    }
  }

  notifyStatusChange(status) {
    window.dispatchEvent(new CustomEvent('ws:status', { detail: { status, connected: this.isConnected } }));
  }
}

// Global API instance
window.api = new TaskFlowAPI();
