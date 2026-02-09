const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');
const uiRoutes = require('./routes/ui');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.set('trust proxy', 1);

// HTML escape helper – available as esc() in all EJS templates
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
app.locals.esc = escapeHtml;

// Middleware
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

// Session middleware
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Routes
app.use('/', uiRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

module.exports = { app };
