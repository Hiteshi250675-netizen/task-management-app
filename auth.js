/**
 * Authentication Module (auth.js)
 * Manages user registration, login verification, session token authorization,
 * and security middleware.
 */

const db = require('./db.js');

/**
 * Validate email syntax
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Register a new user
 */
function register({ email, password, name, avatarColor }) {
  if (!email || !isValidEmail(email)) {
    throw new Error('A valid email address is required.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (!name || name.trim().length === 0) {
    throw new Error('User display name is required.');
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const user = db.createUser({ email, password, name, avatarColor });
  const session = db.createSession(user.id);

  db.logActivity(user.id, null, 'auth', `User registered account "${user.email}"`);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatar_color
    },
    token: session.token,
    expiresAt: session.expiresAt
  };
}

/**
 * Login user with email & password
 */
function login({ email, password }) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const valid = db.verifyPassword(password, user.password_hash, user.salt);
  if (!valid) {
    throw new Error('Invalid email or password.');
  }

  const session = db.createSession(user.id);
  db.logActivity(user.id, null, 'auth', `User logged in`);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatar_color
    },
    token: session.token,
    expiresAt: session.expiresAt
  };
}

/**
 * Quick 1-click Demo login
 */
function demoLogin() {
  const demoEmail = 'demo@taskflow.com';
  let user = db.getUserByEmail(demoEmail);

  if (!user) {
    user = db.createUser({
      email: demoEmail,
      password: 'password123',
      name: 'Alex Taylor',
      avatarColor: '#4f46e5'
    });
  }

  const session = db.createSession(user.id);
  db.logActivity(user.id, null, 'auth', 'Demo user session started');

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatar_color
    },
    token: session.token,
    expiresAt: session.expiresAt
  };
}

/**
 * Parse bearer token from Authorization header or cookie
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Check cookie fallback
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const parts = c.trim().split('=');
        return [parts[0], decodeURIComponent(parts.slice(1).join('='))];
      })
    );
    if (cookies.taskflow_token) {
      return cookies.taskflow_token;
    }
  }

  // Check URL query param (useful for WebSocket handshake or simple test links)
  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const paramToken = url.searchParams.get('token');
      if (paramToken) return paramToken;
    } catch (_) {}
  }

  return null;
}

/**
 * Verify token and return user or null
 */
function authenticate(req) {
  const token = extractToken(req);
  if (!token) return null;
  const user = db.getSessionUser(token);
  return user ? { ...user, token } : null;
}

module.exports = {
  isValidEmail,
  register,
  login,
  demoLogin,
  extractToken,
  authenticate
};
