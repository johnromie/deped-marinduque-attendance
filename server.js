const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const buildId = `build-${new Date().toISOString()}`;
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const archivesRootDir = path.join(dataDir, 'monthly-archives');
const attendanceFile = path.join(dataDir, 'attendance.json');
const usersFile = path.join(dataDir, 'users.json');
const officeConfigFile = path.join(dataDir, 'office-config.json');
const otpChallengesFile = path.join(dataDir, 'otp-challenges.json');

const config = {
  officeName: process.env.OFFICE_NAME || 'DepEd Marinduque Division Office',
  officeLat: Number(process.env.OFFICE_LAT || 13.4767),
  officeLng: Number(process.env.OFFICE_LNG || 121.9032),
  maxRadiusMeters: Number(process.env.MAX_RADIUS_METERS || 200),
  maxGpsAccuracyMeters: Number(process.env.MAX_GPS_ACCURACY_METERS || 50),
  authSecret: process.env.AUTH_SECRET || 'CHANGE_THIS_AUTH_SECRET',
  tokenTtlHours: Number(process.env.TOKEN_TTL_HOURS || 12),
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin12345!',
  adminFullName: process.env.ADMIN_FULL_NAME || 'System Admin',
  adminEmployeeId: process.env.ADMIN_EMPLOYEE_ID || 'ADMIN-001',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPhone: process.env.ADMIN_PHONE || '',
  adminOtpChannel: (process.env.ADMIN_OTP_CHANNEL || '').toLowerCase(),
  adminSecurityQuestion: process.env.ADMIN_SECURITY_QUESTION || 'Default admin question?',
  adminSecurityAnswer: process.env.ADMIN_SECURITY_ANSWER || 'admin',
  otpCodeTtlMinutes: Number(process.env.OTP_CODE_TTL_MINUTES || 5),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  otpCodeLength: Number(process.env.OTP_CODE_LENGTH || 6),
  otpEmailProvider: (process.env.OTP_EMAIL_PROVIDER || '').toLowerCase(),
  otpSmsProvider: (process.env.OTP_SMS_PROVIDER || '').toLowerCase(),
  otpSenderEmail: process.env.OTP_SENDER_EMAIL || '',
  otpSenderName: process.env.OTP_SENDER_NAME || 'DepEd Marinduque Attendance',
  resendApiKey: process.env.RESEND_API_KEY || '',
  semaphoreApiKey: process.env.SEMAPHORE_API_KEY || '',
  semaphoreSender: process.env.SEMAPHORE_SENDER || '',
  otpWebhookUrl: process.env.OTP_WEBHOOK_URL || '',
  otpWebhookToken: process.env.OTP_WEBHOOK_TOKEN || '',
  otpDebugReturnCode: String(process.env.OTP_DEBUG_RETURN_CODE || 'false').toLowerCase() === 'true'
};

if ((process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
  app.set('trust proxy', true);
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(archivesRootDir)) fs.mkdirSync(archivesRootDir, { recursive: true });
if (!fs.existsSync(attendanceFile)) fs.writeFileSync(attendanceFile, '[]', 'utf8');
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]', 'utf8');
if (!fs.existsSync(otpChallengesFile)) fs.writeFileSync(otpChallengesFile, '[]', 'utf8');

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/version', (req, res) => {
  res.json({ buildId, serverTimeIso: new Date().toISOString() });
});

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, records) {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
}

function readOfficeConfig() {
  try {
    if (!fs.existsSync(officeConfigFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(officeConfigFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOfficeConfig(value) {
  fs.writeFileSync(officeConfigFile, JSON.stringify(value, null, 2), 'utf8');
}

function getOfficeConfig() {
  const override = readOfficeConfig();
  if (!override) {
    return {
      officeName: config.officeName,
      officeLat: config.officeLat,
      officeLng: config.officeLng,
      maxRadiusMeters: config.maxRadiusMeters,
      maxGpsAccuracyMeters: config.maxGpsAccuracyMeters
    };
  }

  return {
    officeName: override.officeName || config.officeName,
    officeLat: Number.isFinite(Number(override.officeLat)) ? Number(override.officeLat) : config.officeLat,
    officeLng: Number.isFinite(Number(override.officeLng)) ? Number(override.officeLng) : config.officeLng,
    maxRadiusMeters: Number.isFinite(Number(override.maxRadiusMeters)) ? Number(override.maxRadiusMeters) : config.maxRadiusMeters,
    maxGpsAccuracyMeters: Number.isFinite(Number(override.maxGpsAccuracyMeters))
      ? Number(override.maxGpsAccuracyMeters)
      : config.maxGpsAccuracyMeters
  };
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return {
    salt: salt.toString('hex'),
    hash: derived.toString('hex')
  };
}

function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashSecurityAnswer(answer) {
  return crypto.createHash('sha256').update(String(answer || '').trim().toLowerCase()).digest('hex');
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

function readOtpChallenges() {
  return readJsonArray(otpChallengesFile);
}

function writeOtpChallenges(rows) {
  writeJsonArray(otpChallengesFile, rows);
}

function maskEmail(email) {
  const text = String(email || '').trim();
  const [name, domain] = text.split('@');
  if (!name || !domain) return '';
  const safeName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
  return `${safeName}@${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `*** *** ${digits.slice(-4)}`;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

function normalizeUsernameBase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function generateUniqueUsername(base, users) {
  const clean = normalizeUsernameBase(base) || 'user';
  let candidate = clean;
  let counter = 1;
  while (users.some((u) => u.username === candidate)) {
    candidate = `${clean}${counter}`;
    counter += 1;
  }
  return candidate;
}

function findUserByLoginIdentifier(users, identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return null;
  let user = users.find((u) => u.username === normalized);
  if (user) return user;
  user = users.find((u) => String(u.employeeId || '').trim().toLowerCase() === normalized);
  return user || null;
}

function randomOtpCode(length = 6) {
  const size = Math.max(4, Math.min(8, Number(length) || 6));
  let out = '';
  for (let i = 0; i < size; i += 1) out += String(Math.floor(Math.random() * 10));
  return out;
}

async function deliverOtp({ channel, destination, code, user }) {
  const masked = channel === 'email' ? maskEmail(destination) : maskPhone(destination);
  const otpMessage = `Your DepEd Marinduque OTP code is ${code}. It expires in ${config.otpCodeTtlMinutes} minutes.`;

  if (channel === 'email') {
    if (config.otpEmailProvider === 'resend') {
      if (!config.resendApiKey || !config.otpSenderEmail) {
        throw new Error('OTP email provider is set to resend but RESEND_API_KEY or OTP_SENDER_EMAIL is missing.');
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: `${config.otpSenderName} <${config.otpSenderEmail}>`,
          to: [destination],
          subject: 'DepEd Attendance OTP Code',
          text: otpMessage,
          html: `<p>${escHtml(otpMessage)}</p>`
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Resend email OTP failed (${res.status}). ${text || ''}`.trim());
      }
      return { deliveredBy: 'resend', maskedDestination: masked };
    }

    if (config.otpEmailProvider === 'webhook' || (!config.otpEmailProvider && config.otpWebhookUrl)) {
      if (!config.otpWebhookUrl) {
        throw new Error('OTP webhook URL is not configured.');
      }
      const headers = { 'content-type': 'application/json' };
      if (config.otpWebhookToken) headers.authorization = `Bearer ${config.otpWebhookToken}`;
      const res = await fetch(config.otpWebhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel,
          destination,
          code,
          message: otpMessage,
          user: {
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            employeeId: user.employeeId
          }
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Webhook email OTP failed (${res.status}). ${text || ''}`.trim());
      }
      return { deliveredBy: 'webhook', maskedDestination: masked };
    }
  }

  if (channel === 'phone') {
    if (config.otpSmsProvider === 'semaphore') {
      if (!config.semaphoreApiKey) {
        throw new Error('OTP SMS provider is set to semaphore but SEMAPHORE_API_KEY is missing.');
      }

      const params = new URLSearchParams();
      params.set('apikey', config.semaphoreApiKey);
      params.set('number', destination);
      params.set('message', otpMessage);
      if (config.semaphoreSender) params.set('sendername', config.semaphoreSender);

      const res = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Semaphore SMS OTP failed (${res.status}). ${text || ''}`.trim());
      }
      return { deliveredBy: 'semaphore', maskedDestination: masked };
    }

    if (config.otpSmsProvider === 'webhook' || (!config.otpSmsProvider && config.otpWebhookUrl)) {
      if (!config.otpWebhookUrl) {
        throw new Error('OTP webhook URL is not configured.');
      }
      const headers = { 'content-type': 'application/json' };
      if (config.otpWebhookToken) headers.authorization = `Bearer ${config.otpWebhookToken}`;
      const res = await fetch(config.otpWebhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel,
          destination,
          code,
          message: otpMessage,
          user: {
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            employeeId: user.employeeId
          }
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Webhook SMS OTP failed (${res.status}). ${text || ''}`.trim());
      }
      return { deliveredBy: 'webhook', maskedDestination: masked };
    }
  }

  if (config.otpDebugReturnCode) {
    console.log(`[OTP DEBUG] user=${user.username} channel=${channel} destination=${destination} code=${code}`);
    return { deliveredBy: 'debug', maskedDestination: masked };
  }

  throw new Error(
    `No OTP provider configured for ${channel}. Configure OTP_EMAIL_PROVIDER/OTP_SMS_PROVIDER and credentials in .env.`
  );
}

function pickOtpChannel(user, requestedChannel) {
  const email = String(user.email || '').trim();
  const phone = normalizePhone(user.phone || '');
  const request = String(requestedChannel || '').trim().toLowerCase();
  const preferred = String(user.otpChannel || '').trim().toLowerCase();

  const canEmail = Boolean(email);
  const canPhone = Boolean(phone);
  const candidates = [];
  if (canEmail) candidates.push('email');
  if (canPhone) candidates.push('phone');
  if (!candidates.length) return null;

  const tryOrder = [request, preferred, 'email', 'phone'].filter(Boolean);
  const channel = tryOrder.find((ch) => candidates.includes(ch));
  if (!channel) return null;

  return {
    channel,
    destination: channel === 'email' ? email : phone,
    maskedDestination: channel === 'email' ? maskEmail(email) : maskPhone(phone)
  };
}

function b64urlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signToken(payload) {
  const encodedPayload = b64urlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', config.authSecret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadPart, sigPart] = token.split('.', 2);
  const expected = crypto
    .createHmac('sha256', config.authSecret)
    .update(payloadPart)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const a = Buffer.from(expected);
  const b = Buffer.from(sigPart || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(b64urlDecode(payloadPart));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSessionToken(user) {
  const exp = Date.now() + config.tokenTtlHours * 60 * 60 * 1000;
  return signToken({
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeId: user.employeeId,
    role: user.role || 'user',
    exp
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeId: user.employeeId,
    role: user.role || 'user',
    position: user.position || '',
    office: user.office || '',
    otpChannel: user.otpChannel || '',
    emailMasked: maskEmail(user.email || ''),
    phoneMasked: maskPhone(user.phone || ''),
    createdAt: user.createdAt
  };
}

function ensureUsersRolesAndAdmin() {
  const users = readJsonArray(usersFile);
  let changed = false;

  for (const user of users) {
    if (!user.role) {
      user.role = 'user';
      changed = true;
    }
    if (typeof user.email === 'undefined') {
      user.email = '';
      changed = true;
    }
    if (typeof user.phone === 'undefined') {
      user.phone = '';
      changed = true;
    }
    if (typeof user.otpChannel === 'undefined') {
      user.otpChannel = '';
      changed = true;
    }
    if (typeof user.position === 'undefined') {
      user.position = '';
      changed = true;
    }
    if (typeof user.office === 'undefined') {
      user.office = '';
      changed = true;
    }

    if (user.username === config.adminUsername) {
      if (!user.email && config.adminEmail) {
        user.email = config.adminEmail;
        changed = true;
      }
      if (!user.phone && config.adminPhone) {
        user.phone = normalizePhone(config.adminPhone);
        changed = true;
      }
      if (!user.otpChannel && ['email', 'phone'].includes(config.adminOtpChannel)) {
        user.otpChannel = config.adminOtpChannel;
        changed = true;
      }
    }
  }

  const adminExists = users.some((u) => u.username === config.adminUsername && u.role === 'admin');
  if (!adminExists) {
    const { salt, hash } = hashPassword(String(config.adminPassword));
    users.push({
      id: uuidv4(),
      username: config.adminUsername,
      fullName: config.adminFullName,
      employeeId: config.adminEmployeeId,
      role: 'admin',
      email: String(config.adminEmail || '').trim().toLowerCase(),
      phone: normalizePhone(config.adminPhone || ''),
      otpChannel: ['email', 'phone'].includes(config.adminOtpChannel)
        ? config.adminOtpChannel
        : String(config.adminEmail || '').trim()
          ? 'email'
          : 'phone',
      passwordSalt: salt,
      passwordHash: hash,
      securityQuestion: config.adminSecurityQuestion,
      securityAnswerHash: hashSecurityAnswer(config.adminSecurityAnswer),
      createdAt: new Date().toISOString()
    });
    changed = true;
    console.log(`Default admin created. username=${config.adminUsername}`);
  }

  if (changed) {
    writeJsonArray(usersFile, users);
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized. Please login again.' });
  }

  const users = readJsonArray(usersFile);
  const user = users.find((u) => u.id === payload.userId && u.username === payload.username);
  if (!user) {
    return res.status(401).json({ message: 'User not found. Please login again.' });
  }

  req.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeId: user.employeeId,
    role: user.role || 'user'
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access only.' });
  }
  next();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getManilaDateParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    localDate: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function attendanceTypeByTime(hour, minute) {
  const minutes = hour * 60 + minute;
  if (minutes >= 300 && minutes <= 660) {
    return { code: 'MORNING_IN', label: 'Morning Time In' };
  }
  if (minutes >= 661 && minutes <= 740) {
    return { code: 'NOON_OUT', label: 'Noon Time Out' };
  }
  if (minutes >= 741 && minutes <= 900) {
    return { code: 'AFTERNOON_IN', label: 'Afternoon Time In' };
  }
  if (minutes >= 901 && minutes <= 1200) {
    return { code: 'AFTERNOON_OUT', label: 'Afternoon Time Out' };
  }
  return null;
}

function parseMonthParam(monthText) {
  const input = String(monthText || '').trim();
  if (!/^\d{4}-\d{2}$/.test(input)) return null;
  const [y, m] = input.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { key: input, year: y, month: m };
}

function getRecordMonthKey(record) {
  const localDate = String(record.localDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return localDate.slice(0, 7);
  const parts = getManilaDateParts(new Date(record.timestampIso || Date.now()));
  return parts.localDate.slice(0, 7);
}

function getRecordDay(record) {
  const localDate = String(record.localDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return Number(localDate.slice(8, 10));
  const parts = getManilaDateParts(new Date(record.timestampIso || Date.now()));
  return Number(parts.localDate.slice(8, 10));
}

function getRecordHhmm(record) {
  const parts = getManilaDateParts(new Date(record.timestampIso || Date.now()));
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function weekdayLabel(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay();
  if (weekday === 0) return 'Sun';
  if (weekday === 6) return 'Sat';
  return '';
}

function inferAttendanceType(record) {
  if (record.attendanceType) return record.attendanceType;
  const hhmm = getRecordHhmm(record);
  const [h, m] = hhmm.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes >= 300 && minutes <= 660) return 'MORNING_IN';
  if (minutes >= 661 && minutes <= 740) return 'NOON_OUT';
  if (minutes >= 741 && minutes <= 900) return 'AFTERNOON_IN';
  if (minutes >= 901 && minutes <= 1200) return 'AFTERNOON_OUT';
  return '';
}

function calcUndertime(amArrival, pmDeparture) {
  let undertimeMinutes = 0;
  if (amArrival && amArrival !== 'ABSENT') {
    const [h, m] = amArrival.split(':').map(Number);
    const arrived = h * 60 + m;
    const official = 8 * 60;
    if (arrived > official) undertimeMinutes += arrived - official;
  }
  if (pmDeparture && pmDeparture !== 'ABSENT') {
    const [h, m] = pmDeparture.split(':').map(Number);
    const out = h * 60 + m;
    const official = 17 * 60;
    if (out < official) undertimeMinutes += official - out;
  }
  return {
    h: Math.floor(undertimeMinutes / 60),
    m: undertimeMinutes % 60
  };
}

function buildUserMonthRows(records, year, month) {
  const dayCount = new Date(year, month, 0).getDate();
  const rowsByDay = new Map();

  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  for (const record of sorted) {
    const day = getRecordDay(record);
    if (!Number.isFinite(day) || day < 1 || day > dayCount) continue;
    if (!rowsByDay.has(day)) {
      rowsByDay.set(day, {
        amArrival: '',
        amDeparture: '',
        pmArrival: '',
        pmDeparture: '',
        status: ''
      });
    }
    const row = rowsByDay.get(day);
    const hhmm = getRecordHhmm(record);
    const type = inferAttendanceType(record);

    if (type === 'MORNING_IN') row.amArrival = hhmm;
    if (type === 'NOON_OUT') row.amDeparture = hhmm;
    if (type === 'AFTERNOON_IN') row.pmArrival = hhmm;
    if (type === 'AFTERNOON_OUT') row.pmDeparture = hhmm;

    row.status = record.attendanceStatus || row.status;
  }

  return Array.from({ length: dayCount }, (_, idx) => {
    const day = idx + 1;
    const wk = weekdayLabel(year, month, day);
    const row = rowsByDay.get(day) || {
      amArrival: '',
      amDeparture: '',
      pmArrival: '',
      pmDeparture: '',
      status: ''
    };

    let amArrival = row.amArrival || '';
    let amDeparture = row.amDeparture || '';
    let pmArrival = row.pmArrival || '';
    let pmDeparture = row.pmDeparture || '';

    if (!wk) {
      const hasAny = !!(amArrival || amDeparture || pmArrival || pmDeparture);
      if (!hasAny) {
        amArrival = 'ABSENT';
        amDeparture = 'ABSENT';
        pmArrival = 'ABSENT';
        pmDeparture = 'ABSENT';
      } else {
        if (!amArrival) amArrival = 'ABSENT';
        if (!amDeparture) amDeparture = 'ABSENT';
        if (!pmArrival) pmArrival = 'ABSENT';
        if (!pmDeparture) pmDeparture = 'ABSENT';
      }
    }

    const hasAbsent = [amArrival, amDeparture, pmArrival, pmDeparture].includes('ABSENT');
    const ut = hasAbsent || wk ? { h: '', m: '' } : calcUndertime(amArrival, pmDeparture);

    return {
      day,
      weekday: wk,
      amArrival,
      amDeparture,
      pmArrival,
      pmDeparture,
      undertimeHours: ut.h,
      undertimeMinutes: ut.m,
      status: row.status || ''
    };
  });
}

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCell(value) {
  if (value === 'ABSENT') return '<span class="absent">ABSENT</span>';
  return escHtml(value || '');
}

function monthName(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long' });
}

function makeDtrHtml({ employeeId, fullName, year, month, rows }) {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td class="c">${r.day}</td>
        <td>${renderCell(r.amArrival)}</td>
        <td>${renderCell(r.amDeparture)}</td>
        <td>${renderCell(r.pmArrival)}</td>
        <td>${renderCell(r.pmDeparture)}</td>
        <td class="c">${r.weekday ? '' : (r.undertimeHours || '')}</td>
        <td class="c">${r.weekday ? r.weekday : (r.undertimeMinutes || '')}</td>
      </tr>
    `
    )
    .join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>DTR Print</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; }
    .top { display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px; }
    .title { font-weight:700; font-size:20px; margin-bottom:6px; }
    .meta { font-size:13px; margin-bottom:8px; }
    .meta div { margin:2px 0; }
    table { width:100%; border-collapse: collapse; font-size:12px; }
    th, td { border:1px solid #333; padding:4px; }
    th { text-align:center; background:#f3f3f3; }
    .c { text-align:center; }
    .absent { font-weight:700; color:#8b0000; }
    .foot { margin-top:18px; font-size:12px; }
    .sign { margin-top:28px; display:flex; justify-content:space-between; gap:20px; }
    .line { border-top:1px solid #222; padding-top:4px; font-size:12px; width:46%; }
  </style>
</head>
<body>
  <div class="top">
    <div class="title">DAILY TIME RECORD</div>
    <div><strong>CIVIL SERVICE FORM No. 48</strong></div>
  </div>

  <div class="meta">
    <div><strong>Name:</strong> ${escHtml(employeeId)} - ${escHtml(fullName)}</div>
    <div><strong>For the month of:</strong> ${monthName(year, month)} ${year}</div>
    <div><strong>Official hours for arrival and departure</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2">DAY</th>
        <th colspan="2">A.M.</th>
        <th colspan="2">P.M.</th>
        <th colspan="2">UNDERTIME</th>
      </tr>
      <tr>
        <th>Arrival</th>
        <th>Departure</th>
        <th>Arrival</th>
        <th>Departure</th>
        <th>Hours</th>
        <th>Minutes</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="foot">
    <p><strong>I CERTIFY</strong> on my honor that the above is a true and correct report of the hours of work performed.</p>
    <div class="sign">
      <div class="line">Verified as to prescribed office hours</div>
      <div class="line">Employee Signature</div>
    </div>
  </div>
</body>
</html>
`;
}

function safeFilePart(text) {
  return String(text || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function validateAttendanceSequence(records, userId, localDate, attendanceTypeCode) {
  const sameDay = records.filter((r) => r.userId === userId && r.localDate === localDate);
  const has = (typeCode) => sameDay.some((r) => r.attendanceType === typeCode);

  if (attendanceTypeCode === 'MORNING_IN') {
    if (has('NOON_OUT') || has('AFTERNOON_IN') || has('AFTERNOON_OUT')) {
      return 'Cannot submit Morning Time In after later attendance types were already submitted.';
    }
  }

  if (attendanceTypeCode === 'NOON_OUT') {
    if (has('AFTERNOON_IN') || has('AFTERNOON_OUT')) {
      return 'Cannot submit Noon Time Out after afternoon attendance types were already submitted.';
    }
  }

  if (attendanceTypeCode === 'AFTERNOON_IN') {
    if (has('AFTERNOON_OUT')) {
      return 'Cannot submit Afternoon Time In after Afternoon Time Out.';
    }
  }

  // Allow Afternoon Time Out even when Afternoon Time In is missing.
  // Missing slots will be marked ABSENT in DTR generation.

  return '';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date();
    const folder = path.join(
      uploadsDir,
      String(today.getFullYear()),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    );
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPG, PNG, WEBP are allowed.'));
    }
    cb(null, true);
  }
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, fullName, employeeId, securityQuestion, securityAnswer, email, phone, otpChannel } = req.body || {};

  if (!username || !password || !fullName || !employeeId || !securityQuestion || !securityAnswer) {
    return res.status(400).json({ message: 'username, password, fullName, employeeId, securityQuestion, securityAnswer are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = normalizePhone(phone || '');
  const cleanOtpChannel = String(otpChannel || '').trim().toLowerCase();
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }
  if (cleanPhone && !/^\+?\d{8,15}$/.test(cleanPhone)) {
    return res.status(400).json({ message: 'Invalid phone format. Use digits with optional + sign.' });
  }
  if (cleanOtpChannel && !['email', 'phone'].includes(cleanOtpChannel)) {
    return res.status(400).json({ message: 'otpChannel must be email or phone.' });
  }

  const users = readJsonArray(usersFile);
  const normalizedUsername = String(username).trim().toLowerCase();
  if (users.some((u) => u.username === normalizedUsername)) {
    return res.status(409).json({ message: 'Username already exists.' });
  }
  if (users.some((u) => String(u.employeeId).trim() === String(employeeId).trim())) {
    return res.status(409).json({ message: 'Employee ID already exists.' });
  }

  const { salt, hash } = hashPassword(String(password));
  const user = {
    id: uuidv4(),
    username: normalizedUsername,
    fullName: String(fullName).trim(),
    employeeId: String(employeeId).trim(),
    role: 'user',
    email: cleanEmail,
    phone: cleanPhone,
    otpChannel: cleanOtpChannel || (cleanEmail ? 'email' : cleanPhone ? 'phone' : ''),
    passwordSalt: salt,
    passwordHash: hash,
    securityQuestion: String(securityQuestion).trim(),
    securityAnswerHash: hashSecurityAnswer(securityAnswer),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeJsonArray(usersFile, users);

  const token = createSessionToken(user);
  res.status(201).json({ message: 'Account created successfully.', token, user: sanitizeUser(user) });
});

function handlePasswordLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required.' });
  }

  const users = readJsonArray(usersFile);
  const user = findUserByLoginIdentifier(users, username);
  const passwordOk = Boolean(user && verifyPassword(String(password), user.passwordSalt, user.passwordHash));
  if (!user || !passwordOk) {
    // Auto-heal admin password drift: if env admin password is provided and typed correctly,
    // sync stored hash so login recovers without manual DB editing.
    if (
      user &&
      user.role === 'admin' &&
      user.username === config.adminUsername &&
      String(password) === String(config.adminPassword)
    ) {
      const { salt, hash } = hashPassword(String(config.adminPassword));
      user.passwordSalt = salt;
      user.passwordHash = hash;
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        users[idx] = user;
        writeJsonArray(usersFile, users);
      }
      const token = createSessionToken(user);
      return res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
    }
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const token = createSessionToken(user);
  res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
}

app.post('/api/auth/login', handlePasswordLogin);
app.post('/api/login', handlePasswordLogin);
app.post('/auth/login', handlePasswordLogin);

app.post('/api/auth/login/request-code', async (req, res) => {
  try {
    const { username, password, channel } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required.' });
    }

    const users = readJsonArray(usersFile);
    const user = findUserByLoginIdentifier(users, username);
    if (!user || !verifyPassword(String(password), user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const selected = pickOtpChannel(user, channel);
    if (!selected) {
      return res.status(400).json({ message: 'No email/phone found in this account. Contact admin to update profile.' });
    }

    const code = randomOtpCode(config.otpCodeLength);
    const challengeId = uuidv4();
    const now = Date.now();
    const expiresAt = new Date(now + config.otpCodeTtlMinutes * 60 * 1000).toISOString();

    let challenges = readOtpChallenges();
    challenges = challenges.filter(
      (c) => c.userId !== user.id && new Date(c.expiresAt).getTime() > now && !c.consumedAt
    );
    challenges.push({
      id: challengeId,
      purpose: 'login',
      userId: user.id,
      username: user.username,
      channel: selected.channel,
      destination: selected.destination,
      codeHash: hashOtpCode(code),
      attempts: 0,
      maxAttempts: config.otpMaxAttempts,
      expiresAt,
      createdAt: new Date().toISOString(),
      consumedAt: ''
    });
    writeOtpChallenges(challenges);

    const delivery = await deliverOtp({
      channel: selected.channel,
      destination: selected.destination,
      code,
      user
    });

    const payload = {
      message: `OTP code sent to your ${selected.channel}.`,
      challengeId,
      channel: selected.channel,
      maskedDestination: selected.maskedDestination,
      expiresInSeconds: config.otpCodeTtlMinutes * 60,
      delivery: delivery.deliveredBy
    };
    if (config.otpDebugReturnCode || delivery.deliveredBy === 'debug') {
      payload.debugCode = code;
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send OTP code.' });
  }
});

app.post('/api/auth/login/verify-code', (req, res) => {
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code) {
    return res.status(400).json({ message: 'challengeId and code are required.' });
  }

  const now = Date.now();
  const challenges = readOtpChallenges();
  const idx = challenges.findIndex((c) => c.id === challengeId);
  if (idx < 0) {
    return res.status(404).json({ message: 'OTP challenge not found. Request a new code.' });
  }

  const challenge = challenges[idx];
  if (challenge.purpose !== 'login') {
    return res.status(400).json({ message: 'Invalid OTP challenge purpose.' });
  }
  if (challenge.consumedAt) {
    return res.status(400).json({ message: 'This OTP challenge is already used.' });
  }
  if (new Date(challenge.expiresAt).getTime() < now) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(400).json({ message: 'OTP code expired. Request a new code.' });
  }
  if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || config.otpMaxAttempts)) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(429).json({ message: 'Maximum OTP attempts reached. Request a new code.' });
  }

  const valid = hashOtpCode(code) === challenge.codeHash;
  if (!valid) {
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    challenges[idx] = challenge;
    writeOtpChallenges(challenges);
    return res.status(401).json({ message: 'Invalid OTP code.' });
  }

  const users = readJsonArray(usersFile);
  const user = users.find((u) => u.id === challenge.userId);
  if (!user) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(404).json({ message: 'User not found.' });
  }

  challenges.splice(idx, 1);
  writeOtpChallenges(challenges);

  const token = createSessionToken(user);
  res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
});

app.post('/api/auth/register/request-code', async (req, res) => {
  try {
    const { username, password, fullName, employeeId, securityQuestion, securityAnswer, email, phone, otpChannel } = req.body || {};

    if (!username || !password || !fullName || !employeeId || !securityQuestion || !securityAnswer) {
      return res
        .status(400)
        .json({ message: 'username, password, fullName, employeeId, securityQuestion, securityAnswer are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const cleanFullName = String(fullName).trim();
    const cleanEmployeeId = String(employeeId).trim();
    const cleanQuestion = String(securityQuestion).trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phone || '');
    const cleanOtpChannel = String(otpChannel || '').trim().toLowerCase();

    if (!cleanEmail && !cleanPhone) {
      return res.status(400).json({ message: 'Email or phone is required for OTP.' });
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    if (cleanPhone && !/^\+?\d{8,15}$/.test(cleanPhone)) {
      return res.status(400).json({ message: 'Invalid phone format. Use digits with optional + sign.' });
    }
    if (cleanOtpChannel && !['email', 'phone'].includes(cleanOtpChannel)) {
      return res.status(400).json({ message: 'otpChannel must be email or phone.' });
    }
    if (cleanOtpChannel === 'email' && !cleanEmail) {
      return res.status(400).json({ message: 'Preferred channel is email but email is missing.' });
    }
    if (cleanOtpChannel === 'phone' && !cleanPhone) {
      return res.status(400).json({ message: 'Preferred channel is phone but phone is missing.' });
    }

    const users = readJsonArray(usersFile);
    if (users.some((u) => u.username === normalizedUsername)) {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    if (users.some((u) => String(u.employeeId).trim() === cleanEmployeeId)) {
      return res.status(409).json({ message: 'Employee ID already exists.' });
    }

    const pseudoUser = {
      id: 'new-user',
      username: normalizedUsername,
      fullName: cleanFullName,
      employeeId: cleanEmployeeId,
      email: cleanEmail,
      phone: cleanPhone,
      otpChannel: cleanOtpChannel || (cleanEmail ? 'email' : 'phone')
    };
    const selected = pickOtpChannel(pseudoUser, cleanOtpChannel);
    if (!selected) {
      return res.status(400).json({ message: 'No valid OTP destination found.' });
    }

    const code = randomOtpCode(config.otpCodeLength);
    const challengeId = uuidv4();
    const now = Date.now();
    const expiresAt = new Date(now + config.otpCodeTtlMinutes * 60 * 1000).toISOString();
    const { salt, hash } = hashPassword(String(password));

    let challenges = readOtpChallenges();
    challenges = challenges.filter(
      (c) =>
        !(c.purpose === 'register' && c.registerData && c.registerData.username === normalizedUsername) &&
        new Date(c.expiresAt).getTime() > now &&
        !c.consumedAt
    );

    challenges.push({
      id: challengeId,
      purpose: 'register',
      userId: '',
      username: normalizedUsername,
      channel: selected.channel,
      destination: selected.destination,
      codeHash: hashOtpCode(code),
      attempts: 0,
      maxAttempts: config.otpMaxAttempts,
      expiresAt,
      createdAt: new Date().toISOString(),
      consumedAt: '',
      registerData: {
        username: normalizedUsername,
        fullName: cleanFullName,
        employeeId: cleanEmployeeId,
        role: 'user',
        email: cleanEmail,
        phone: cleanPhone,
        otpChannel: cleanOtpChannel || (cleanEmail ? 'email' : 'phone'),
        passwordSalt: salt,
        passwordHash: hash,
        securityQuestion: cleanQuestion,
        securityAnswerHash: hashSecurityAnswer(securityAnswer)
      }
    });
    writeOtpChallenges(challenges);

    const delivery = await deliverOtp({
      channel: selected.channel,
      destination: selected.destination,
      code,
      user: pseudoUser
    });

    const payload = {
      message: `OTP code sent to your ${selected.channel}.`,
      challengeId,
      channel: selected.channel,
      maskedDestination: selected.maskedDestination,
      expiresInSeconds: config.otpCodeTtlMinutes * 60,
      delivery: delivery.deliveredBy
    };
    if (config.otpDebugReturnCode || delivery.deliveredBy === 'debug') {
      payload.debugCode = code;
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send registration OTP code.' });
  }
});

app.post('/api/auth/register/verify-code', (req, res) => {
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code) {
    return res.status(400).json({ message: 'challengeId and code are required.' });
  }

  const now = Date.now();
  const challenges = readOtpChallenges();
  const idx = challenges.findIndex((c) => c.id === challengeId);
  if (idx < 0) {
    return res.status(404).json({ message: 'OTP challenge not found. Request a new code.' });
  }

  const challenge = challenges[idx];
  if (challenge.purpose !== 'register') {
    return res.status(400).json({ message: 'Invalid OTP challenge purpose.' });
  }
  if (challenge.consumedAt) {
    return res.status(400).json({ message: 'This OTP challenge is already used.' });
  }
  if (new Date(challenge.expiresAt).getTime() < now) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(400).json({ message: 'OTP code expired. Request a new code.' });
  }
  if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || config.otpMaxAttempts)) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(429).json({ message: 'Maximum OTP attempts reached. Request a new code.' });
  }

  const valid = hashOtpCode(code) === challenge.codeHash;
  if (!valid) {
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    challenges[idx] = challenge;
    writeOtpChallenges(challenges);
    return res.status(401).json({ message: 'Invalid OTP code.' });
  }

  const users = readJsonArray(usersFile);
  const d = challenge.registerData || {};
  if (users.some((u) => u.username === d.username)) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(409).json({ message: 'Username already exists.' });
  }
  if (users.some((u) => String(u.employeeId).trim() === String(d.employeeId).trim())) {
    challenges.splice(idx, 1);
    writeOtpChallenges(challenges);
    return res.status(409).json({ message: 'Employee ID already exists.' });
  }

  const user = {
    id: uuidv4(),
    username: d.username,
    fullName: d.fullName,
    employeeId: d.employeeId,
    role: d.role || 'user',
    email: d.email || '',
    phone: d.phone || '',
    otpChannel: d.otpChannel || '',
    passwordSalt: d.passwordSalt,
    passwordHash: d.passwordHash,
    securityQuestion: d.securityQuestion,
    securityAnswerHash: d.securityAnswerHash,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeJsonArray(usersFile, users);

  challenges.splice(idx, 1);
  writeOtpChallenges(challenges);

  const token = createSessionToken(user);
  res.status(201).json({ message: 'Account created successfully.', token, user: sanitizeUser(user) });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { username, securityAnswer, newPassword } = req.body || {};
  if (!username || !securityAnswer || !newPassword) {
    return res.status(400).json({ message: 'username, securityAnswer, and newPassword are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  const users = readJsonArray(usersFile);
  const user = findUserByLoginIdentifier(users, username);
  const index = user ? users.findIndex((u) => u.id === user.id) : -1;
  if (index < 0) {
    return res.status(404).json({ message: 'Username or Employee ID not found.' });
  }

  const user = users[index];
  const providedAnswerHash = hashSecurityAnswer(securityAnswer);
  const matchesStoredAnswer = providedAnswerHash === user.securityAnswerHash;
  const matchesAdminEnvAnswer =
    user.role === 'admin' &&
    user.username === config.adminUsername &&
    String(securityAnswer || '').trim().toLowerCase() === String(config.adminSecurityAnswer || '').trim().toLowerCase();

  if (!matchesStoredAnswer && !matchesAdminEnvAnswer) {
    return res.status(401).json({ message: 'Incorrect security answer.' });
  }

  const { salt, hash } = hashPassword(String(newPassword));
  user.passwordSalt = salt;
  user.passwordHash = hash;
  if (matchesAdminEnvAnswer && !matchesStoredAnswer) {
    // Keep admin recovery aligned with current environment config.
    user.securityAnswerHash = hashSecurityAnswer(config.adminSecurityAnswer);
  }
  users[index] = user;
  writeJsonArray(usersFile, users);

  res.json({ message: 'Password reset successful. You can now login.' });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'oldPassword and newPassword are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  const users = readJsonArray(usersFile);
  const index = users.findIndex((u) => u.id === req.user.id);
  if (index < 0) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const user = users[index];
  if (!verifyPassword(String(oldPassword), user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ message: 'Old password is incorrect.' });
  }

  const { salt, hash } = hashPassword(String(newPassword));
  user.passwordSalt = salt;
  user.passwordHash = hash;
  users[index] = user;
  writeJsonArray(usersFile, users);

  res.json({ message: 'Password changed successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const users = readJsonArray(usersFile);
  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/config', requireAuth, (req, res) => {
  const office = getOfficeConfig();
  res.json({
    officeName: office.officeName,
    officeLat: office.officeLat,
    officeLng: office.officeLng,
    maxRadiusMeters: office.maxRadiusMeters,
    maxGpsAccuracyMeters: office.maxGpsAccuracyMeters,
    currentUser: req.user
  });
});

app.post('/api/config/office-location', requireAuth, requireAdmin, (req, res) => {
  const { officeLat, officeLng, officeName, maxRadiusMeters, maxGpsAccuracyMeters } = req.body || {};
  const lat = Number(officeLat);
  const lng = Number(officeLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: 'officeLat and officeLng are required and must be valid numbers.' });
  }

  const current = getOfficeConfig();
  const updated = {
    officeName: officeName ? String(officeName).trim() : current.officeName,
    officeLat: lat,
    officeLng: lng,
    maxRadiusMeters: Number.isFinite(Number(maxRadiusMeters)) ? Number(maxRadiusMeters) : current.maxRadiusMeters,
    maxGpsAccuracyMeters: Number.isFinite(Number(maxGpsAccuracyMeters))
      ? Number(maxGpsAccuracyMeters)
      : current.maxGpsAccuracyMeters,
    updatedBy: {
      userId: req.user.id,
      username: req.user.username
    },
    updatedAt: new Date().toISOString()
  };

  writeOfficeConfig(updated);
  res.json({ message: 'Office reference location updated.', officeConfig: updated });
});

app.post('/api/attendance', requireAuth, upload.single('photo'), (req, res) => {
  try {
    const { latitude, longitude, gpsAccuracyMeters, note } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Photo is required.' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const acc = Number(gpsAccuracyMeters);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(acc)) {
      return res.status(400).json({ message: 'Invalid latitude, longitude, or GPS accuracy.' });
    }

    const office = getOfficeConfig();
    const distanceMeters = haversineMeters(lat, lng, office.officeLat, office.officeLng);
    const withinOfficeRadius = distanceMeters <= office.maxRadiusMeters;
    const reliableGps = acc <= office.maxGpsAccuracyMeters;
    const softTolerance = Math.min(Math.max(acc, 0), office.maxGpsAccuracyMeters * 1.5) + 15;
    const withinSoftRadius = distanceMeters <= office.maxRadiusMeters + softTolerance;

    const manila = getManilaDateParts(new Date());
    const attendanceIntent = String(req.body.attendanceIntent || '').trim().toLowerCase();
    const attendanceType = attendanceTypeByTime(manila.hour, manila.minute);
    if (!attendanceType) {
      return res.status(400).json({
        message: 'Attendance is allowed only during Morning Time In, Noon Time Out, Afternoon Time In, and Afternoon Time Out windows.'
      });
    }
    if (attendanceIntent === 'in' && !['MORNING_IN', 'AFTERNOON_IN'].includes(attendanceType.code)) {
      return res.status(400).json({
        message: 'Time In is only allowed during Morning Time In or Afternoon Time In windows.'
      });
    }
    if (attendanceIntent === 'out' && !['NOON_OUT', 'AFTERNOON_OUT'].includes(attendanceType.code)) {
      return res.status(400).json({
        message: 'Time Out is only allowed during Noon Time Out or Afternoon Time Out windows.'
      });
    }

    const records = readJsonArray(attendanceFile);
    const duplicate = records.find(
      (r) => r.userId === req.user.id && r.localDate === manila.localDate && r.attendanceType === attendanceType.code
    );

    if (duplicate) {
      return res.status(409).json({
        message: `${attendanceType.label} already submitted for ${manila.localDate}.`
      });
    }

    const sequenceError = validateAttendanceSequence(records, req.user.id, manila.localDate, attendanceType.code);
    if (sequenceError) {
      return res.status(409).json({ message: sequenceError });
    }

    let attendanceStatus = 'OFF_SITE';
    if (withinOfficeRadius && reliableGps) attendanceStatus = 'ON_SITE';
    if ((withinOfficeRadius && !reliableGps) || (!withinOfficeRadius && withinSoftRadius)) attendanceStatus = 'NEEDS_REVIEW';

    const now = new Date();
    const record = {
      id: uuidv4(),
      userId: req.user.id,
      username: req.user.username,
      employeeId: req.user.employeeId,
      fullName: req.user.fullName,
      note: note ? String(note).trim() : '',
      attendanceType: attendanceType.code,
      attendanceTypeLabel: attendanceType.label,
      localDate: manila.localDate,
      latitude: lat,
      longitude: lng,
      gpsAccuracyMeters: acc,
      officeLatitude: office.officeLat,
      officeLongitude: office.officeLng,
      distanceMeters: Math.round(distanceMeters * 100) / 100,
      withinOfficeRadius,
      withinSoftRadius,
      reliableGps,
      softToleranceMeters: Math.round(softTolerance * 100) / 100,
      attendanceStatus,
      timestampIso: now.toISOString(),
      timestampLocal: now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
      clientIp: req.ip,
      userAgent: req.get('user-agent') || '',
      photoPath: req.file.path,
      photoUrl: `/uploads/${path.relative(uploadsDir, req.file.path).split(path.sep).join('/')}`
    };

    records.push(record);
    writeJsonArray(attendanceFile, records);

    res.status(201).json({ message: 'Attendance recorded successfully.', record });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to save attendance.' });
  }
});

app.get('/api/attendance', requireAuth, (req, res) => {
  const date = req.query.date;
  let records = readJsonArray(attendanceFile).filter((r) => r.userId === req.user.id);

  if (date) records = records.filter((r) => (r.localDate || '').startsWith(date));

  records.sort((a, b) => new Date(b.timestampIso) - new Date(a.timestampIso));
  res.json({ count: records.length, records });
});

app.get('/api/admin/attendance', requireAuth, requireAdmin, (req, res) => {
  const date = req.query.date;
  const employeeId = req.query.employeeId;

  let records = readJsonArray(attendanceFile);
  if (date) records = records.filter((r) => (r.localDate || '').startsWith(date));
  if (employeeId) records = records.filter((r) => r.employeeId === employeeId);

  records.sort((a, b) => new Date(b.timestampIso) - new Date(a.timestampIso));
  res.json({ count: records.length, records });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = readJsonArray(usersFile).map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    employeeId: u.employeeId,
    role: u.role || 'user',
    position: u.position || '',
    office: u.office || '',
    email: u.email || ''
  }));
  res.json({ count: users.length, users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { fullName, position, office, employeeId, email, password, username } = req.body || {};

  if (!fullName || !employeeId || !password) {
    return res.status(400).json({ message: 'fullName, employeeId, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  const cleanEmployeeId = String(employeeId).trim();
  const cleanFullName = String(fullName).trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  const users = readJsonArray(usersFile);
  if (users.some((u) => String(u.employeeId).trim() === cleanEmployeeId)) {
    return res.status(409).json({ message: 'Employee ID already exists.' });
  }

  const baseUsername = username || cleanEmployeeId || cleanFullName;
  const generatedUsername = generateUniqueUsername(baseUsername, users);
  const { salt, hash } = hashPassword(String(password));

  const user = {
    id: uuidv4(),
    username: generatedUsername,
    fullName: cleanFullName,
    employeeId: cleanEmployeeId,
    role: 'user',
    email: cleanEmail,
    phone: '',
    otpChannel: cleanEmail ? 'email' : '',
    passwordSalt: salt,
    passwordHash: hash,
    securityQuestion: 'Employee ID',
    securityAnswerHash: hashSecurityAnswer(cleanEmployeeId),
    position: String(position || '').trim(),
    office: String(office || '').trim(),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeJsonArray(usersFile, users);

  res.status(201).json({ message: 'Employee created successfully.', user: sanitizeUser(user) });
});

app.post('/api/admin/archive-month', requireAuth, requireAdmin, (req, res) => {
  const monthParsed = parseMonthParam(req.body && req.body.month);
  if (!monthParsed) {
    return res.status(400).json({ message: 'Invalid month. Use YYYY-MM format (example: 2026-03).' });
  }

  const { key: monthKey, year, month } = monthParsed;
  const monthDir = path.join(archivesRootDir, monthKey);
  fs.mkdirSync(monthDir, { recursive: true });

  const users = readJsonArray(usersFile);
  const allRecords = readJsonArray(attendanceFile);
  const monthRecords = allRecords.filter((r) => getRecordMonthKey(r) === monthKey);

  const userSummaries = [];
  for (const user of users) {
    const userRecords = monthRecords.filter((r) => r.userId === user.id || String(r.employeeId) === String(user.employeeId));
    const rows = buildUserMonthRows(userRecords, year, month);
    const userFolderName = `${safeFilePart(user.employeeId)}-${safeFilePart(user.fullName || user.username)}`;
    const userDir = path.join(monthDir, userFolderName);
    fs.mkdirSync(userDir, { recursive: true });
    const jsonName = 'attendance.json';
    const htmlName = 'dtr.html';
    const jsonPath = path.join(userDir, jsonName);
    const htmlPath = path.join(userDir, htmlName);

    const archiveJson = {
      month: monthKey,
      generatedAt: new Date().toISOString(),
      employee: {
        id: user.id,
        employeeId: user.employeeId,
        username: user.username,
        fullName: user.fullName,
        role: user.role || 'user'
      },
      logsCount: userRecords.length,
      rows
    };

    fs.writeFileSync(jsonPath, JSON.stringify(archiveJson, null, 2), 'utf8');
    fs.writeFileSync(
      htmlPath,
      makeDtrHtml({
        employeeId: user.employeeId,
        fullName: user.fullName || user.username,
        year,
        month,
        rows
      }),
      'utf8'
    );

    userSummaries.push({
      userId: user.id,
      employeeId: user.employeeId,
      username: user.username,
      fullName: user.fullName,
      role: user.role || 'user',
      logsCount: userRecords.length,
      folder: userFolderName,
      jsonFile: `${userFolderName}/${jsonName}`,
      htmlFile: `${userFolderName}/${htmlName}`
    });
  }

  const manifest = {
    month: monthKey,
    generatedAt: new Date().toISOString(),
    generatedBy: {
      userId: req.user.id,
      username: req.user.username
    },
    totalUsers: userSummaries.length,
    users: userSummaries
  };
  fs.writeFileSync(path.join(monthDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  res.json({
    message: `Archive folder generated for ${monthKey}.`,
    month: monthKey,
    folderPath: monthDir,
    totalUsers: userSummaries.length,
    usersWithLogs: userSummaries.filter((u) => u.logsCount > 0).length,
    usersWithoutLogs: userSummaries.filter((u) => u.logsCount === 0).length
  });
});

app.get('/api/admin/archive-months', requireAuth, requireAdmin, (req, res) => {
  const months = fs
    .readdirSync(archivesRootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();
  res.json({ count: months.length, months });
});

app.get('/api/admin/archive-month/:month', requireAuth, requireAdmin, (req, res) => {
  const monthParsed = parseMonthParam(req.params.month);
  if (!monthParsed) {
    return res.status(400).json({ message: 'Invalid month.' });
  }
  const monthKey = monthParsed.key;
  const manifestPath = path.join(archivesRootDir, monthKey, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ message: `Archive for ${monthKey} was not found.` });
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  res.json({ manifest });
});

app.get('/api/summary/today', requireAuth, requireAdmin, (req, res) => {
  const today = getManilaDateParts(new Date()).localDate;
  const records = readJsonArray(attendanceFile).filter((r) => r.localDate === today);
  const users = readJsonArray(usersFile).filter((u) => (u.role || 'user') !== 'admin');

  const statusByUser = new Map();
  records.forEach((r) => {
    const key = r.userId || r.employeeId || r.username;
    if (!key) return;
    const current = statusByUser.get(key) || [];
    current.push(r.attendanceStatus);
    statusByUser.set(key, current);
  });

  let present = 0;
  let late = 0;
  let absent = 0;

  statusByUser.forEach((statuses) => {
    if (statuses.includes('ON_SITE')) {
      present += 1;
      return;
    }
    if (statuses.includes('NEEDS_REVIEW')) {
      late += 1;
      return;
    }
    if (statuses.includes('OFF_SITE')) {
      absent += 1;
    }
  });

  const totalEmployees = users.length;
  const computedAbsent = Math.max(0, totalEmployees - present - late);

  res.json({
    date: today,
    totalEmployees,
    present,
    late,
    absent: Math.max(absent, computedAbsent),
    total: records.length,
    onSite: records.filter((r) => r.attendanceStatus === 'ON_SITE').length,
    offSite: records.filter((r) => r.attendanceStatus === 'OFF_SITE').length,
    needsReview: records.filter((r) => r.attendanceStatus === 'NEEDS_REVIEW').length
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Request failed.' });
  }
  next();
});

function getLanUrls(portNumber) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(interfaces)) {
    for (const details of interfaces[name] || []) {
      if (details.family === 'IPv4' && !details.internal) {
        urls.push(`http://${details.address}:${portNumber}`);
      }
    }
  }
  return urls;
}

ensureUsersRolesAndAdmin();

app.listen(port, host, () => {
  console.log(`Attendance server running at http://localhost:${port}`);
  const lanUrls = getLanUrls(port);
  if (lanUrls.length) {
    console.log('Open from phone (same Wi-Fi):');
    lanUrls.forEach((url) => console.log(`- ${url}`));
  } else {
    console.log('No LAN IPv4 address found.');
  }
});
