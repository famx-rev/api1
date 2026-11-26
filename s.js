import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery } from './db.js';

const router = express.Router();

const authenticateToken = (req, res, next) => {
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
    const cleanDomain = (website || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const detailsForm = JSON.stringify({ tagline: tagline || '', website: website || '' });

    await executeQuery(
      'INSERT INTO user_startup (id, uid, name, domain, details_form) VALUES (?, ?, ?, ?, ?)',
      [id, uid, name.trim(), cleanDomain, detailsForm]
    );

    const rows = await executeQuery('SELECT * FROM user_startup WHERE id = ?', [id]);
    const startup = rows[0];

    res.status(201).json({
      message: 'Startup created successfully',
      startup: {
        id: startup.id,
        uid: startup.uid,
        name: startup.name,
        tagline: startup.tagline || (JSON.parse(startup.details_form || '{}').tagline || ''),
        domain: startup.domain,
        details_form: startup.details_form,
        created_at: startup.created_at,
        updated_at: startup.updated_at,
      },
    });
  } catch (error) {
    console.error('Create startup error:', error);
    res.status(500).json({ message: 'Failed to create startup' });
  }
});

// List all startups for the authenticated user
router.get('/list', async (req, res) => {
  try {
    const uid = req.user.id;
    const rows = await executeQuery(
      'SELECT * FROM user_startup WHERE uid = ? ORDER BY created_at DESC',
      [uid]
    );

    const startups = rows.map((row) => {
      let details = {};
      try {
        details = JSON.parse(row.details_form || '{}');
      } catch {
        details = {};
      }
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
    res.status(500).json({ message: 'Failed to fetch startups' });
  }
});

// Get a single startup by id with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const rows = await executeQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    const row = rows[0];
    let details = {};
    try {
      details = JSON.parse(row.details_form || '{}');
    } catch {
      details = {};
    }

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
    res.status(500).json({ message: 'Failed to fetch startup' });
  }
});

// Update a startup
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const { name, tagline, website } = req.body;

    const rows = await executeQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    const existing = rows[0];
    let existingDetails = {};
    try {
      existingDetails = JSON.parse(existing.details_form || '{}');
    } catch {
      existingDetails = {};
    }

    const newName = name !== undefined ? name.trim() : existing.name;
    const cleanDomain =
      website !== undefined
        ? website.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        : existing.domain;
    const newTagline = tagline !== undefined ? tagline : (existingDetails.tagline || '');
    const newWebsite = website !== undefined ? website : (existingDetails.website || '');
    const detailsForm = JSON.stringify({ tagline: newTagline, website: newWebsite });

    await executeQuery(
      'UPDATE user_startup SET name = ?, domain = ?, details_form = ? WHERE id = ? AND uid = ?',
      [newName, cleanDomain, detailsForm, id, uid]
    );

    const updated = await executeQuery('SELECT * FROM user_startup WHERE id = ?', [id]);
    const row = updated[0];
    let details = {};
    try {
      details = JSON.parse(row.details_form || '{}');
    } catch {
      details = {};
    }

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
    res.status(500).json({ message: 'Failed to update startup' });
  }
});

// Delete a startup
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const rows = await executeQuery(
      'SELECT * FROM user_startup WHERE id = ? AND uid = ?',
      [id, uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Startup not found' });
    }

    await executeQuery('DELETE FROM user_startup WHERE id = ? AND uid = ?', [id, uid]);

    res.json({ message: 'Startup deleted successfully' });
  } catch (error) {
    console.error('Delete startup error:', error);
    res.status(500).json({ message: 'Failed to delete startup' });
  }
});

export default router;
