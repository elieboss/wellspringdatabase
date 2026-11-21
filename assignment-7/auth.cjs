// ============================================================
// WELLSPRING — SIGN-IN AND PERMISSIONS
// ============================================================
// Authentication: who are you?
//   Passwords are checked against a scrypt hash in the account
//   table. After sign-in the server sets a signed, HttpOnly cookie
//   holding only the person_id and an expiry time.
//
// Authorization: what may you do?
//   On EVERY protected request the server reads the person again
//   from the database and checks their person_type. The browser
//   hiding a button is never the protection.
// ============================================================

const crypto = require('node:crypto');

const COOKIE_NAME = 'ws_session';
const SESSION_HOURS = 8;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16 || value.startsWith('replace-with')) {
    throw new Error('Set SESSION_SECRET in .env to a long random value (see .env.example)');
  }
  return value;
}


// ------------------------------------------------------------
// Passwords
// ------------------------------------------------------------

// Stored format: scrypt$<salt hex>$<hash hex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [kind, saltHex, hashHex] = String(stored).split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used when the email is unknown, so a wrong email takes as long as a
// wrong password and does not reveal which emails have accounts.
const DUMMY_HASH = hashPassword('not-a-real-password');


// ------------------------------------------------------------
// Signed session cookie
// ------------------------------------------------------------

function sign(text) {
  return crypto.createHmac('sha256', secret()).update(text).digest('base64url');
}

function createSessionToken(personId) {
  const payload = Buffer.from(JSON.stringify({
    pid: personId,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Returns the person_id, or null if the token is missing, forged or expired.
function readSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(data.pid) || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data.pid;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function cookieOptions(maxAgeSeconds) {
  // Secure cookies need HTTPS; set COOKIE_SECURE=true when deployed.
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function setSessionCookie(res, personId) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createSessionToken(personId)}; ${cookieOptions(SESSION_HOURS * 3600)}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieOptions(0)}`);
}


// ------------------------------------------------------------
// Middleware (the pattern from class: requireLogin, requireRole)
// ------------------------------------------------------------

// requireLogin(db) checks the cookie and loads the person from the
// database, so a deactivated account stops working at once.
function requireLogin(getDb) {
  return async function (req, res, next) {
    const personId = readSessionToken(readCookie(req, COOKIE_NAME));
    if (!personId) {
      return res.status(401).json({ error: 'Please sign in first.' });
    }

    const [person] = await getDb().query(
      `select p.person_id, p.full_name, p.person_type, p.email
       from person p
       join account a on a.person_id = p.person_id
       where p.person_id = $1 and a.is_active`,
      [personId]
    );
    if (!person) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    }

    req.user = person;
    next();
  };
}

// requireStaff must run after requireLogin.
function requireStaff(req, res, next) {
  if (req.user.person_type !== 'Staff') {
    return res.status(403).json({
      error: 'Only Wellspring staff can do this. Volunteers and board members can report problems and view their own reports.'
    });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH,
  setSessionCookie, clearSessionCookie, requireLogin, requireStaff, secret
};
