const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

function getRegistrationError(err) {
  if (err.code === '23505') {
    if (err.constraint === 'users_username_key') {
      return { status: 400, error: 'Benutzername existiert bereits' };
    }

    if (err.constraint === 'users_email_key') {
      return { status: 400, error: 'Für diesen Benutzer konnte kein eindeutiges Konto erstellt werden' };
    }
  }

  if (err.code === '22P02') {
    return { status: 400, error: 'Ungültige Eingabedaten' };
  }

  return { status: 500, error: 'Registrierung fehlgeschlagen' };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
    }

    const usernameNormalized = username.trim();

    if (!usernameNormalized) {
      return res.status(400).json({ error: 'Benutzername darf nicht leer sein' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
    }

    const generatedEmail = `${usernameNormalized.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'}-${Date.now()}-${Math.floor(Math.random() * 100000)}@local.user`;

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [usernameNormalized]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Benutzername existiert bereits' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [usernameNormalized, generatedEmail, hashedPassword, 'user']
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (err) {
    console.error(err);

    const registrationError = getRegistrationError(err);
    res.status(registrationError.status).json({ error: registrationError.error });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Missing username/email or password' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1',
      [identifier.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, email: user.email, role: user.role } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
