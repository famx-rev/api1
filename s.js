import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from './db.js';

const router = express.Router();

const CREATE_USER_STARTUP_SQL = `
  CREATE TABLE IF NOT EXISTS user_startup (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    tagline VARCHAR(255) NULL,
    domain VARCHAR(255) NULL,
    details_form LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_startup_uid_created (uid, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

let tableReady = false;
let creatingTablePromise = null;

const ensureTableExists = async () => {
  if (tableReady) return;

  if (!creatingTablePromise) {
    creatingTablePromise = (async () => {
      await query(CREATE_USER_STARTUP_SQL);
      tableReady = true;
    })().catch((err) => {
      creatingTablePromise = null;
      throw err;
    });
  }

  await creatingTablePromise;
};

const runQuery = async (sql, params = []) => {
  await ensureTableExists();
  try {
    return await query(sql, params);
  } catch (err) {
    // If table was dropped or not yet visible, reset flag and retry once
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) {
      tableReady = false;
      await ensureTableExists();
      return await query(sql, params);
    }
    throw err;
  }
};

const parseDetails = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const authenticateToken = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

router.use(authenticateToken);

// Create a new startup
router.post('/new', async (req, res) => {
  try {
    const { name, tagline, website } = req.body;
    const uid = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Startup name is required' });
    }

    const id = uuidv4();
    const cleanDomain = (website || '')
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    const detailsForm = JSON.stringify({
      tagline: tagline || '',
      website: website || '',
    });

    await runQuery(
      'INSERT INTO user_startup (id, uid, name, domain, details_form) VALUES (?, ?, ?, ?, ?)',
      [id, uid, name.trim(), cleanDomain, detailsForm]
    );

    const rows = await runQuery('SELECT * FROM user_startup WHERE id = ?', [id]);
    const startup = rows[0];
    const details = parseDetails(startup?.details_form);

    res.status(201).json({
      message: 'Startup created successfully',
      startup: {
        id: startup.id,
        uid: startup.uid,
        name: startup.name,
        tagline: details.tagline || startup.tagline || '',
        domain: startup.domain,
        details_form: startup.details_form,
        created_at: startup.created_at,
        updated_at: startup.updated_at,
      },
    });
  } catch (error) {
    console.error('Create startup error:', error);
    res.status(500).json({
      message: 'Failed to create startup',
      error: error.message,
      code: error.code,
    });
  }
});

// List all startups for the authenticated user
router.get('/list', async (req, res) => {
  try {
    const uid = req.user.id;
    const rows = await runQuery(
      'SELECT * FROM user_startup WHERE uid = ? ORDER BY created_at DESC',
      [uid]
    );

    const startups = rows.map((row) => {
      const details = parseDetails(row.details_form);
      return {
        id: row.id,
        uid: row.uid,
        name: row.name,
        tagline: details.tagline || row.tagline || '',
        domain: row.domain || '',
        website: details.website || '',
        details_form: row.details_form,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    res.json({ startups });
  } catch (error) {
    console.error('List startups error:', error);
    res.status(500).json({
      message: 'Failed to fetch startups',
      error: error.message,
      code: error.code,
    });
  }
});

// Get a single startup by id with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const rows = await runQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    const row = rows[0];
    const details = parseDetails(row.details_form);

    res.json({
      startup: {
        id: row.id,
        uid: row.uid,
        name: row.name,
        tagline: details.tagline || row.tagline || '',
        domain: row.domain || '',
        website: details.website || '',
        details_form: row.details_form,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Get startup error:', error);
    res.status(500).json({
      message: 'Failed to fetch startup',
      error: error.message,
      code: error.code,
    });
  }
});

// Update a startup
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const { name, tagline, website } = req.body;

    const rows = await runQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    const existing = rows[0];
    const existingDetails = parseDetails(existing.details_form);

    const newName = name !== undefined ? name.trim() : existing.name;
    const cleanDomain =
      website !== undefined
        ? website.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        : existing.domain;
    const newTagline =
      tagline !== undefined ? tagline : existingDetails.tagline || '';
    const newWebsite =
      website !== undefined ? website : existingDetails.website || '';
    const detailsForm = JSON.stringify({
      tagline: newTagline,
      website: newWebsite,
    });

    await runQuery(
      'UPDATE user_startup SET name = ?, domain = ?, details_form = ? WHERE id = ? AND uid = ?',
      [newName, cleanDomain, detailsForm, id, uid]
    );

    const updated = await runQuery('SELECT * FROM user_startup WHERE id = ?', [id]);
    const row = updated[0];
    const details = parseDetails(row.details_form);

    res.json({
      message: 'Startup updated successfully',
      startup: {
        id: row.id,
        uid: row.uid,
        name: row.name,
        tagline: details.tagline || '',
        domain: row.domain,
        website: details.website || '',
        details_form: row.details_form,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Update startup error:', error);
    res.status(500).json({
      message: 'Failed to update startup',
      error: error.message,
      code: error.code,
    });
  }
});

// Delete a startup
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const rows = await runQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    await runQuery('DELETE FROM user_startup WHERE id = ? AND uid = ?', [id, uid]);

    res.json({ message: 'Startup deleted successfully' });
  } catch (error) {
    console.error('Delete startup error:', error);
    res.status(500).json({
      message: 'Failed to delete startup',
      error: error.message,
      code: error.code,
    });
  }
});

export default router;
