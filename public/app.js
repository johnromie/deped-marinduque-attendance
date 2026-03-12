const authCard = document.getElementById('authCard');
const appCard = document.getElementById('appCard');
const attendanceCard = document.getElementById('attendanceCard');
const myAttendanceCard = document.getElementById('myAttendanceCard');
const employeeSidebar = document.getElementById('employeeSidebar');
const employeeMain = document.getElementById('employeeMain');
const userNav = document.getElementById('userNav');
const authStatusEl = document.getElementById('authStatus');
const userBadge = document.getElementById('userBadge');
const adminLink = document.getElementById('adminLink');
const sidebarNameEl = document.getElementById('sidebarName');
const sidebarRoleEl = document.getElementById('sidebarRole');
const sidebarIdEl = document.getElementById('sidebarId');
const welcomeNameEl = document.getElementById('welcomeName');
const attendanceNameEl = document.getElementById('attendanceName');

const noteInput = document.getElementById('note');
const dateFilterInput = document.getElementById('dateFilter');
const recordsBody = document.getElementById('recordsBody');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const infoEl = document.getElementById('info');
const photoFileInput = document.getElementById('photoFileInput');
const browserHint = document.getElementById('browserHint');
const setOfficeBtn = document.getElementById('setOfficeBtn');
const openExternalBtn = document.getElementById('openExternalBtn');
const buildInfo = document.getElementById('buildInfo');
const greetingTextEl = document.getElementById('greetingText');
const displayNameEl = document.getElementById('displayName');
const liveTimeEl = document.getElementById('liveTime');
const liveDateEl = document.getElementById('liveDate');
const hoursTodayEl = document.getElementById('hoursToday');
const daysThisMonthEl = document.getElementById('daysThisMonth');
const totalLogsTodayEl = document.getElementById('totalLogsToday');
const onTimeRateEl = document.getElementById('onTimeRate');
const lateCountEl = document.getElementById('lateCount');
const absentCountEl = document.getElementById('absentCount');
const todayTimelineEl = document.getElementById('todayTimeline');
const officeNameDisplayEl = document.getElementById('officeNameDisplay');
const installCardEl = document.getElementById('installCard');
const installBtnEl = document.getElementById('installBtn');
const installNoteEl = document.getElementById('installNote');
const markInBtn = document.getElementById('markInBtn');
const markOutBtn = document.getElementById('markOutBtn');
const topbarEl = document.querySelector('.app-topbar');
const userMenuBtn = document.getElementById('userMenuBtn');
const userMenu = document.getElementById('userMenu');
const logoutBtnTop = document.getElementById('logoutBtnTop');
const forgotToggle = document.getElementById('forgotToggle');
const forgotPanel = document.getElementById('forgotPanel');
const registerToggle = document.getElementById('registerToggle');
const registerPanel = document.getElementById('registerPanel');
const attendanceMapPlaceholder = document.getElementById('attendanceMapPlaceholder');
const attendanceMapWrap = document.getElementById('attendanceMapWrap');
const attendanceMap = document.getElementById('attendanceMap');
const attendancePhotoWrap = document.getElementById('attendancePhotoWrap');
const attendancePhoto = document.getElementById('attendancePhoto');

let authToken = localStorage.getItem('attendance_token') || '';
let currentUser = null;
let photoBlob = null;
let latestLocation = null;
let officeConfig = null;
let cameraStream = null;
let clockTimer = null;
let deferredInstallPrompt = null;
const inAppBrowser = /FBAN|FBAV|Instagram|Line|Messenger/i.test(navigator.userAgent);
const STRICT_CLIENT_GPS_METERS = 20;
const APP_CACHE_NAME = 'app-shell-v20260312-03';

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

function setInfo(text) {
  infoEl.textContent = text;
}

function setAuthStatus(text) {
  authStatusEl.textContent = `Auth Status: ${text}`;
}

function saveToken(token) {
  authToken = token || '';
  if (authToken) localStorage.setItem('attendance_token', authToken);
  else localStorage.removeItem('attendance_token');
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const method = String(options.method || 'GET').toUpperCase();
  const retryableStatus = new Set([404, 502, 503, 504]);
  const canRetry = method === 'GET' || (method === 'POST' && path === '/api/auth/login');
  const maxRetries = canRetry ? 2 : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetch(path, { ...options, headers });
    const raw = await res.text();
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    if (res.ok) return payload;

    if (res.status === 401) {
      const shouldLogout = path === '/api/auth/me' || path.startsWith('/api/admin');
      if (shouldLogout) {
        saveToken('');
        currentUser = null;
        renderAuthState();
      }
    }

    if (canRetry && retryableStatus.has(res.status) && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }

    const fallback = raw && !raw.trim().startsWith('<') ? raw.trim() : '';
    if (res.status === 404 && /\/api\/auth\/(login|register)\/request-code/.test(path)) {
      throw new Error('OTP endpoint not found on running server. Restart backend and refresh page.');
    }
    throw new Error(payload.message || fallback || `Request failed (${res.status}) on ${method} ${path}.`);
  }
}

async function hardClearLegacyCache() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== APP_CACHE_NAME).map((k) => caches.delete(k)));
    }
  } catch {
    // ignore cache clear errors
  }
}

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) panel.classList.remove('hidden');
}

function setUserSection(sectionId) {
  const target = sectionId || 'dashboard';
  document.querySelectorAll('.user-section').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.section !== target);
  });
  document.querySelectorAll('.mobile-nav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === target);
  });
  document.querySelectorAll('.sidebar-nav a').forEach((link) => {
    const linkTarget = (link.getAttribute('href') || '').replace('#', '');
    link.classList.toggle('active', linkTarget === target);
  });
  if (target) {
    history.replaceState(null, '', `#${target}`);
  }
}

function clearAttendanceState() {
  photoBlob = null;
  latestLocation = null;
  canvas.classList.add('hidden-canvas');
  setStatus('waiting');
  setInfo('');
}

function getManilaDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    monthName: map.month || '',
    monthNumber: String(date.toLocaleString('en-US', { month: '2-digit', timeZone: 'Asia/Manila' })),
    day: Number(map.day),
    weekday: map.weekday || '',
    hour: map.hour || '',
    minute: map.minute || '',
    second: map.second || '',
    dayPeriod: map.dayPeriod || ''
  };
}

function manilaDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function formatManilaTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function formatManilaDateShort(dateKey) {
  if (!dateKey) return '';
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateLiveClock() {
  const p = getManilaDateParts(new Date());
  if (liveTimeEl) liveTimeEl.textContent = `${p.hour}:${p.minute}:${p.second} ${p.dayPeriod}`;
  if (liveDateEl) liveDateEl.textContent = `${p.weekday}, ${p.monthName} ${p.day}, ${p.year}`;
  if (greetingTextEl) {
    const hour24 = Number(
      new Date().toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila'
      })
    );
    const greeting = hour24 < 12 ? 'Good Morning' : hour24 < 18 ? 'Good Afternoon' : 'Good Evening';
    greetingTextEl.textContent = greeting;
  }
}

function startLiveClock() {
  if (clockTimer) clearInterval(clockTimer);
  updateLiveClock();
  clockTimer = setInterval(updateLiveClock, 1000);
}

function stopLiveClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function resetDashboardSummary() {
  if (hoursTodayEl) hoursTodayEl.textContent = '0.0 hrs';
  if (daysThisMonthEl) daysThisMonthEl.textContent = '0';
  if (totalLogsTodayEl) totalLogsTodayEl.textContent = '0';
  if (onTimeRateEl) onTimeRateEl.textContent = '0%';
  if (lateCountEl) lateCountEl.textContent = '0';
  if (absentCountEl) absentCountEl.textContent = '0';
  if (todayTimelineEl) todayTimelineEl.innerHTML = '<div class="timeline-item pending">No logs yet today.</div>';
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function showInstallCard() {
  if (!installCardEl) return;
  installCardEl.classList.remove('hidden');
  if (installBtnEl) installBtnEl.disabled = !deferredInstallPrompt;
  if (installNoteEl) {
    if (isIos()) {
      installNoteEl.textContent = 'On iPhone, tap Share then \"Add to Home Screen\" to install.';
    } else {
      installNoteEl.textContent = 'If you do not see the install prompt, use your browser menu and select \"Install app\".';
    }
  }
}

function hideInstallCard() {
  if (!installCardEl) return;
  installCardEl.classList.add('hidden');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    // ignore registration errors
  }
}

function computeHours(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  let totalMinutes = 0;
  for (let i = 0; i < sorted.length - 1; i += 2) {
    const start = new Date(sorted[i].timestampIso).getTime();
    const end = new Date(sorted[i + 1].timestampIso).getTime();
    const diffMin = Math.max(0, (end - start) / 60000);
    if (diffMin > 0 && diffMin <= 8 * 60) totalMinutes += diffMin;
  }
  return totalMinutes / 60;
}

function renderTimeline(records) {
  if (!todayTimelineEl) return;
  if (!records.length) {
    todayTimelineEl.innerHTML = '<div class="timeline-item pending">No logs yet today.</div>';
    return;
  }

  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  todayTimelineEl.innerHTML = sorted
    .map((r) => {
      const type = escapeHtml(r.attendanceTypeLabel || r.attendanceType || 'Attendance');
      const status = escapeHtml(r.attendanceStatus || 'DONE');
      const time = escapeHtml(formatManilaTime(r.timestampIso));
      return `<div class="timeline-item done">${time} - ${type} <small>(${status})</small></div>`;
    })
    .join('');
}

function buildGoogleMapsEmbedUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}&output=embed`;
}

function updateAttendanceMapAndPhoto(todayRecords) {
  if (!attendanceMapWrap || !attendanceMap || !attendanceMapPlaceholder) return;

  const sorted = [...(todayRecords || [])].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  const withLocation = sorted.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));
  const withPhoto = sorted.filter((r) => r.photoUrl);

  const latestLoc = withLocation.at(-1);
  if (latestLoc) {
    const lat = Number(latestLoc.latitude);
    const lng = Number(latestLoc.longitude);
    attendanceMap.src = buildGoogleMapsEmbedUrl(lat, lng);
    attendanceMapWrap.classList.remove('hidden');
    attendanceMapPlaceholder.classList.add('hidden');
  } else {
    attendanceMapWrap.classList.add('hidden');
    attendanceMapPlaceholder.classList.remove('hidden');
  }

  if (attendancePhotoWrap && attendancePhoto) {
    const latestPhoto = withPhoto.at(-1);
    if (latestPhoto) {
      attendancePhoto.src = latestPhoto.photoUrl;
      attendancePhotoWrap.classList.remove('hidden');
    } else {
      attendancePhotoWrap.classList.add('hidden');
    }
  }
}

function updateDashboardSummary(todayRecords, allRecords) {
  const monthNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
  const monthlyRecords = Array.isArray(allRecords)
    ? allRecords.filter((r) => String(manilaDateKey(r.timestampIso)).slice(0, 7) === monthNow)
    : [];
  const totalDays = new Set(monthlyRecords.map((r) => manilaDateKey(r.timestampIso))).size;
  const onTimeDays = new Set(
    monthlyRecords.filter((r) => r.attendanceStatus === 'ON_SITE').map((r) => manilaDateKey(r.timestampIso))
  ).size;
  const presentDays = new Set(
    monthlyRecords.filter((r) => r.attendanceStatus === 'ON_SITE').map((r) => manilaDateKey(r.timestampIso))
  ).size;
  const lateDays = new Set(
    monthlyRecords.filter((r) => r.attendanceStatus === 'NEEDS_REVIEW').map((r) => manilaDateKey(r.timestampIso))
  ).size;
  const absentDays = new Set(
    monthlyRecords.filter((r) => r.attendanceStatus === 'OFF_SITE').map((r) => manilaDateKey(r.timestampIso))
  ).size;
  const rate = totalDays ? Math.round((onTimeDays / totalDays) * 100) : 0;
  const hoursToday = computeHours(todayRecords);

  if (hoursTodayEl) hoursTodayEl.textContent = `${hoursToday.toFixed(1)} hrs`;
  if (daysThisMonthEl) daysThisMonthEl.textContent = String(presentDays);
  if (totalLogsTodayEl) totalLogsTodayEl.textContent = String(todayRecords.length);
  if (onTimeRateEl) onTimeRateEl.textContent = `${rate}%`;
  if (lateCountEl) lateCountEl.textContent = String(lateDays);
  if (absentCountEl) absentCountEl.textContent = String(absentDays);
  renderTimeline(todayRecords);
  updateAttendanceMapAndPhoto(todayRecords);
}

async function refreshDashboardFromRecords(currentRecords = []) {
  if (!currentUser) return;
  const todayKey = manilaDateKey(new Date());
  let allRecords = Array.isArray(currentRecords) ? [...currentRecords] : [];

  try {
    const allPayload = await api('/api/attendance');
    if (Array.isArray(allPayload.records)) allRecords = allPayload.records;
  } catch {
    // Keep current list if full history endpoint is unavailable.
  }

  const todayRecords = allRecords.filter((r) => manilaDateKey(r.timestampIso) === todayKey);
  updateDashboardSummary(todayRecords, allRecords);
}

function renderAuthState() {
  const loggedIn = Boolean(currentUser && authToken);
  document.body.classList.toggle('is-logged-in', loggedIn);
  document.body.classList.toggle('is-logged-out', !loggedIn);
  authCard.classList.toggle('hidden', loggedIn);
  if (topbarEl) topbarEl.classList.toggle('hidden', !loggedIn);
  appCard.classList.toggle('hidden', !loggedIn);
  if (attendanceCard) attendanceCard.classList.toggle('hidden', !loggedIn);
  myAttendanceCard.classList.toggle('hidden', !loggedIn);
  if (employeeSidebar) employeeSidebar.classList.toggle('hidden', !loggedIn);
  if (employeeMain) employeeMain.classList.toggle('hidden', !loggedIn);
  if (userNav) userNav.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    setAuthStatus(`logged in as ${currentUser.username}`);
    userBadge.textContent = `${currentUser.fullName} (${currentUser.employeeId}) | Role: ${currentUser.role}`;
    const fullName = currentUser.fullName || currentUser.username || 'Attendance Dashboard';
    if (displayNameEl) displayNameEl.textContent = fullName;
    if (welcomeNameEl) {
      const firstName = String(fullName).trim().split(/\s+/)[0] || fullName;
      welcomeNameEl.textContent = firstName;
    }
    if (attendanceNameEl) attendanceNameEl.textContent = fullName;
    if (sidebarNameEl) sidebarNameEl.textContent = fullName;
    if (sidebarRoleEl) sidebarRoleEl.textContent = currentUser.role === 'admin' ? 'System Administrator' : 'Employee';
    if (sidebarIdEl) sidebarIdEl.textContent = currentUser.employeeId || '';
    const isAdmin = currentUser.role === 'admin';
    if (adminLink) adminLink.classList.toggle('hidden', !isAdmin);
    if (setOfficeBtn) setOfficeBtn.classList.toggle('hidden', !isAdmin);
    if (isAdmin && !location.pathname.endsWith('/admin.html')) {
      location.href = '/admin.html';
      return;
    }
    startLiveClock();
    setUserSection('dashboard');
  } else {
    setAuthStatus('not logged in');
    userBadge.textContent = '';
    if (displayNameEl) displayNameEl.textContent = 'Attendance Dashboard';
    if (welcomeNameEl) welcomeNameEl.textContent = 'Employee';
    if (sidebarNameEl) sidebarNameEl.textContent = 'Employee';
    if (sidebarRoleEl) sidebarRoleEl.textContent = 'ICT Unit';
    if (sidebarIdEl) sidebarIdEl.textContent = 'SDO-001';
    if (adminLink) adminLink.classList.add('hidden');
    if (setOfficeBtn) setOfficeBtn.classList.add('hidden');
    clearAttendanceState();
    stopLiveClock();
    resetDashboardSummary();
    if (userNav) userNav.classList.add('hidden');
  }
}

async function fetchMe() {
  if (!authToken) return;
  const payload = await api('/api/auth/me');
  currentUser = payload.user;
  renderAuthState();
}

async function fetchConfig() {
  try {
    const payload = await api('/api/config');
    officeConfig = payload;
    if (officeNameDisplayEl && payload?.officeName) {
      officeNameDisplayEl.textContent = payload.officeName;
    }
    return payload;
  } catch {
    return null;
  }
}

async function fetchBuildInfo() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    const payload = await res.json();
    if (buildInfo) buildInfo.textContent = `Build: ${payload.buildId}`;
  } catch {
    if (buildInfo) buildInfo.textContent = 'Build: unavailable';
  }
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return alert('Enter username and password.');

  try {
    let payload;
    try {
      payload = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
    } catch (err) {
      const msg = String(err?.message || '');
      if (/404/.test(msg)) {
        payload = await api('/api/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
      } else {
        throw err;
      }
    }
    saveToken(payload.token);
    currentUser = payload.user;
    if (forgotPanel) forgotPanel.classList.add('hidden');
    if (registerPanel) registerPanel.classList.add('hidden');
    renderAuthState();
    try {
      await fetchConfig();
      await loadRecords();
    } catch (err) {
      setStatus('logged in (data loading failed)');
      setInfo(err?.message || 'Logged in, but failed to load data. Try again.');
    }
  } catch (err) {
    setAuthStatus(err.message || 'Login failed.');
    alert(err.message);
  }
}

async function handleRegister() {
  const body = {
    employeeId: document.getElementById('regEmployeeId').value.trim(),
    fullName: document.getElementById('regFullName').value.trim(),
    username: document.getElementById('regUsername').value.trim(),
    password: document.getElementById('regPassword').value,
    securityQuestion: document.getElementById('regQuestion').value.trim(),
    securityAnswer: document.getElementById('regAnswer').value.trim()
  };

  if (!body.employeeId || !body.fullName || !body.username || !body.password || !body.securityQuestion || !body.securityAnswer) {
    return alert('Complete all register fields.');
  }

  try {
    const payload = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    saveToken(payload.token);
    currentUser = payload.user;
    if (forgotPanel) forgotPanel.classList.add('hidden');
    if (registerPanel) registerPanel.classList.add('hidden');
    renderAuthState();
    await fetchConfig();
    await loadRecords();
  } catch (err) {
    alert(err.message);
  }
}

async function handleForgotPassword() {
  const body = {
    username: document.getElementById('forgotUsername').value.trim(),
    securityAnswer: document.getElementById('forgotAnswer').value.trim(),
    newPassword: document.getElementById('forgotNewPassword').value
  };

  if (!body.username || !body.securityAnswer || !body.newPassword) return alert('Complete all forgot password fields.');

  try {
    await api('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    alert('Password reset successful. You can login now.');
    activateTab('login');
  } catch (err) {
    alert(err.message);
  }
}

async function handleChangePassword() {
  const oldPassword = document.getElementById('changeOldPassword').value;
  const newPassword = document.getElementById('changeNewPassword').value;
  if (!oldPassword || !newPassword) return alert('Enter old and new password.');

  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    alert('Password changed successfully.');
    document.getElementById('changeOldPassword').value = '';
    document.getElementById('changeNewPassword').value = '';
  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  saveToken('');
  currentUser = null;
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  renderAuthState();
}

async function startCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera API not supported.');
    if (inAppBrowser) throw new Error('In-app browser blocks camera. Open in Safari or Chrome.');

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }

    const constraintsList = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false }
    ];

    let stream = null;
    let lastError = null;
    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) throw lastError || new Error('Unable to access camera.');

    cameraStream = stream;
    video.muted = true;
    video.srcObject = stream;
    canvas.classList.add('hidden-canvas');
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Camera stream is black/blocked. Open in Safari/Chrome or use fallback upload.');
    }

    setStatus('camera ready');
    setInfo('Camera access granted. You can now capture photo.');
  } catch (err) {
    setStatus('camera error');
    setInfo(`Camera blocked/unavailable: ${err.message}. Use fallback photo upload.`);
  }
}

function capturePhoto() {
  if (!video.srcObject || !cameraStream) {
    if (photoBlob) {
      setStatus('photo ready from upload');
      setInfo(`Uploaded ${Math.round((photoBlob.size || 0) / 1024)} KB. Ready.`);
      return;
    }
    setStatus('camera not ready');
    setInfo('Start camera first or upload a fallback photo.');
    return;
  }

  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    photoBlob = blob;
    canvas.classList.remove('hidden-canvas');
    setStatus('photo captured');
    setInfo(`Captured ${Math.round((blob?.size || 0) / 1024)} KB`);
  }, 'image/jpeg', 0.92);
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function previewUploadedPhoto(file) {
  const src = await readFileAsDataUrl(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Invalid image.'));
    img.src = src;
  });
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  canvas.classList.remove('hidden-canvas');
}

function pickBestLocation(samples) {
  const valid = samples.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && Number.isFinite(s.accuracy));
  if (!valid.length) throw new Error('Unable to get GPS location.');

  valid.sort((a, b) => a.accuracy - b.accuracy);
  const top = valid.slice(0, Math.min(5, valid.length));

  let sumWeight = 0;
  let sumLat = 0;
  let sumLng = 0;
  for (const item of top) {
    const weight = 1 / Math.max(item.accuracy, 1);
    sumWeight += weight;
    sumLat += item.latitude * weight;
    sumLng += item.longitude * weight;
  }

  return { latitude: sumLat / sumWeight, longitude: sumLng / sumWeight, gpsAccuracyMeters: top[0].accuracy };
}

function collectAccurateLocation(targetAccuracyMeters = 20, minSamples = 5, maxWaitMs = 45000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by this browser.'));
    if (inAppBrowser) return reject(new Error('Open in Safari/Chrome for accurate GPS.'));

    const samples = [];
    const maxSamples = 10;
    let settled = false;
    let watchId = null;

    const finish = (forced = false) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (!samples.length) return reject(new Error('Unable to get GPS. Enable location and try again outdoors.'));
      const best = pickBestLocation(samples);
      if (forced || samples.length >= minSamples || best.gpsAccuracyMeters <= targetAccuracyMeters) return resolve(best);
      resolve(best);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          latitude: Number(pos.coords.latitude),
          longitude: Number(pos.coords.longitude),
          accuracy: Number(pos.coords.accuracy)
        };
        samples.push(point);
        setInfo(`Collecting GPS... ${samples.length}/${maxSamples}, now +/- ${Math.round(point.accuracy)}m`);

        const best = pickBestLocation(samples);
        if ((samples.length >= minSamples && best.gpsAccuracyMeters <= targetAccuracyMeters) || samples.length >= maxSamples) finish(false);
      },
      (err) => {
        if (settled) return;
        settled = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        reject(new Error(`Location error: ${err.message}`));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    setTimeout(() => finish(true), maxWaitMs);
  });
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

async function getAccurateLocation() {
  try {
    setStatus('collecting GPS samples...');
    const cfg = officeConfig || (await fetchConfig());
    const strictTarget = cfg ? Math.min(Math.max(cfg.maxGpsAccuracyMeters, 10), 25) : 20;
    const coords = await collectAccurateLocation(strictTarget, 4, 35000);

    latestLocation = { latitude: coords.latitude, longitude: coords.longitude, gpsAccuracyMeters: coords.gpsAccuracyMeters };

    let details = `Lat ${coords.latitude.toFixed(6)}, Lng ${coords.longitude.toFixed(6)}, GPS +/- ${Math.round(coords.gpsAccuracyMeters)}m`;
    if (cfg) {
      const dist = haversineMeters(coords.latitude, coords.longitude, cfg.officeLat, cfg.officeLng);
      details += `, Distance to ${cfg.officeName}: ${Math.round(dist)}m`;
    }

    setStatus('location locked');
    setInfo(details);
  } catch (err) {
    setStatus('location error');
    setInfo(err.message || 'Failed to get location.');
  }
}

async function setOfficeReferenceFromCurrentGps() {
  if (!currentUser || currentUser.role !== 'admin') return alert('Admin only.');
  if (!latestLocation) return alert('Get Accurate Location first.');

  const officeName = prompt('Office name:', officeConfig?.officeName || 'DepEd Marinduque Division Office');
  if (!officeName) return;

  const maxRadiusInput = prompt('Allowed office radius (meters):', String(officeConfig?.maxRadiusMeters || 200));
  const maxGpsInput = prompt('Max GPS accuracy (meters):', String(officeConfig?.maxGpsAccuracyMeters || 50));
  const maxRadiusMeters = Number(maxRadiusInput);
  const maxGpsAccuracyMeters = Number(maxGpsInput);
  if (!Number.isFinite(maxRadiusMeters) || !Number.isFinite(maxGpsAccuracyMeters)) return alert('Invalid values.');

  try {
    const payload = await api('/api/config/office-location', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        officeName: officeName.trim(),
        officeLat: latestLocation.latitude,
        officeLng: latestLocation.longitude,
        maxRadiusMeters,
        maxGpsAccuracyMeters
      })
    });
    officeConfig = payload.officeConfig;
    setStatus('office reference updated');
    setInfo('Office reference updated successfully.');
  } catch (err) {
    setStatus('office reference error');
    setInfo(err.message || 'Failed to update office reference.');
  }
}

async function submitAttendance(intent) {
  const note = noteInput.value.trim();
  if (!photoBlob) return alert('Capture a photo first.');
  if (!latestLocation) return alert('Get location first.');
  const allowedGps = Math.min(
    Number.isFinite(Number(officeConfig?.maxGpsAccuracyMeters)) ? Number(officeConfig.maxGpsAccuracyMeters) : STRICT_CLIENT_GPS_METERS,
    STRICT_CLIENT_GPS_METERS
  );
  if (latestLocation.gpsAccuracyMeters > allowedGps) {
    return alert(
      `GPS is not accurate enough yet (+/- ${Math.round(latestLocation.gpsAccuracyMeters)}m). Required <= ${allowedGps}m. Tap "Get Accurate Location" again and wait.`
    );
  }

  const form = new FormData();
  form.append('note', note);
  form.append('latitude', String(latestLocation.latitude));
  form.append('longitude', String(latestLocation.longitude));
  form.append('gpsAccuracyMeters', String(latestLocation.gpsAccuracyMeters));
  if (intent) form.append('attendanceIntent', String(intent));
  form.append('photo', photoBlob, `attendance-${Date.now()}.jpg`);

  setStatus('submitting...');

  try {
    const payload = await api('/api/attendance', { method: 'POST', body: form });
    setStatus('attendance submitted');
    setInfo(
      `${payload.record.attendanceTypeLabel} | ${payload.record.attendanceStatus} | Distance ${payload.record.distanceMeters}m | GPS +/- ${payload.record.gpsAccuracyMeters}m`
    );
    await loadRecords();
  } catch (err) {
    setStatus('submit error');
    setInfo(err.message || 'Failed to submit attendance');
  }
}

function statusLabel(status) {
  if (status === 'ON_SITE') return 'Present';
  if (status === 'NEEDS_REVIEW') return 'Late';
  if (status === 'OFF_SITE') return 'Absent';
  return status || '-';
}

function statusTag(status, label) {
  const cls = status || 'NEEDS_REVIEW';
  const display = label || statusLabel(status);
  return `<span class="tag ${cls}">${display}</span>`;
}

function groupRecordsForUser(records) {
  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  const map = new Map();

  for (const record of sorted) {
    const dateKey = record.localDate || manilaDateKey(record.timestampIso);
    if (!map.has(dateKey)) {
      map.set(dateKey, {
        dateKey,
        inTimes: [],
        outTimes: [],
        status: record.attendanceStatus || ''
      });
    }
    const row = map.get(dateKey);
    const type = record.attendanceType || '';
    const stamp = new Date(record.timestampIso);

    if (type.includes('IN')) row.inTimes.push(stamp);
    if (type.includes('OUT')) row.outTimes.push(stamp);
    if (record.attendanceStatus) row.status = record.attendanceStatus;
  }

  return Array.from(map.values())
    .map((row) => {
      const timeIn = row.inTimes.length
        ? formatManilaTime(new Date(Math.min(...row.inTimes.map((t) => t.getTime()))))
        : '';
      const timeOut = row.outTimes.length
        ? formatManilaTime(new Date(Math.max(...row.outTimes.map((t) => t.getTime()))))
        : '';
      return {
        dateKey: row.dateKey,
        dateLabel: formatManilaDateShort(row.dateKey) || row.dateKey,
        timeIn,
        timeOut,
        status: row.status || ''
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

async function loadRecords() {
  const date = dateFilterInput.value;
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';

  try {
    const payload = await api(`/api/attendance${qs}`);
    const records = Array.isArray(payload.records) ? payload.records : [];
    const grouped = groupRecordsForUser(records);
    recordsBody.innerHTML = grouped
      .map((r) => {
        const status = r.status || '';
        return `
          <tr>
            <td>${r.dateLabel || r.dateKey}</td>
            <td>${r.timeIn || '-'}</td>
            <td>${r.timeOut || '-'}</td>
            <td>${statusTag(status, statusLabel(status))}</td>
          </tr>
        `;
      })
      .join('');

    if (!grouped.length) recordsBody.innerHTML = '<tr><td colspan="4">No records found.</td></tr>';
    await refreshDashboardFromRecords(records);
  } catch (err) {
    setStatus('load error');
    setInfo(err.message || 'Failed to load records');
  }
}

photoFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('photo error');
    setInfo('Invalid file type. Please upload an image.');
    return;
  }
  photoBlob = file;
  try {
    await previewUploadedPhoto(file);
  } catch {}
  setStatus('photo selected');
  setInfo(`Uploaded ${Math.round((file.size || 0) / 1024)} KB. You can submit attendance.`);
});

document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const forgotBtn = document.getElementById('forgotBtn');
const changeBtn = document.getElementById('changeBtn');
const logoutBtn = document.getElementById('logoutBtn');

if (loginBtn) loginBtn.addEventListener('click', handleLogin);
if (registerBtn) registerBtn.addEventListener('click', handleRegister);
if (forgotBtn) forgotBtn.addEventListener('click', handleForgotPassword);
if (changeBtn) changeBtn.addEventListener('click', handleChangePassword);
if (logoutBtn) logoutBtn.addEventListener('click', logout);
if (logoutBtnTop) logoutBtnTop.addEventListener('click', logout);
document.getElementById('startCameraBtn').addEventListener('click', startCamera);
document.getElementById('captureBtn').addEventListener('click', capturePhoto);
document.getElementById('locationBtn').addEventListener('click', getAccurateLocation);
if (markInBtn) markInBtn.addEventListener('click', () => submitAttendance('in'));
if (markOutBtn) markOutBtn.addEventListener('click', () => submitAttendance('out'));
const submitBtn = document.getElementById('submitBtn');
if (submitBtn) submitBtn.addEventListener('click', () => submitAttendance());
document.getElementById('setOfficeBtn').addEventListener('click', setOfficeReferenceFromCurrentGps);
document.getElementById('loadRecordsBtn').addEventListener('click', loadRecords);

if (userNav) {
  userNav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.section || 'dashboard';
      setUserSection(target);
    });
  });
}
document.querySelectorAll('.sidebar-nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = (link.getAttribute('href') || '').replace('#', '');
    if (!target) return;
    event.preventDefault();
    setUserSection(target);
  });
});

if (userMenuBtn && userMenu) {
  userMenuBtn.addEventListener('click', () => {
    userMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', (event) => {
    if (!userMenu.contains(event.target) && !userMenuBtn.contains(event.target)) {
      userMenu.classList.add('hidden');
    }
  });
}

if (forgotToggle && forgotPanel) {
  forgotToggle.addEventListener('click', () => {
    forgotPanel.classList.toggle('hidden');
    if (registerPanel) registerPanel.classList.add('hidden');
  });
}

if (registerToggle && registerPanel) {
  registerToggle.addEventListener('click', () => {
    registerPanel.classList.toggle('hidden');
    if (forgotPanel) forgotPanel.classList.add('hidden');
  });
}

if (inAppBrowser) {
  browserHint.textContent = 'In-app browser detected. Camera/GPS are often blocked here. Open this link in Safari/Chrome.';
  setInfo('In-app browser detected. Open this page in Safari/Chrome for real camera and accurate GPS.');
  document.getElementById('startCameraBtn').disabled = true;
  document.getElementById('locationBtn').disabled = true;
  if (openExternalBtn) openExternalBtn.classList.remove('hidden');
}

if (openExternalBtn) {
  openExternalBtn.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Link copied. Paste it in Safari/Chrome address bar.');
        return;
      }
    } catch {
      // ignore clipboard error
    }
    prompt('Copy this link and open in Safari/Chrome:', url);
  });
}

canvas.classList.add('hidden-canvas');
dateFilterInput.value = manilaDateKey(new Date());
activateTab('login');
renderAuthState();

if (installBtnEl) {
  installBtnEl.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      hideInstallCard();
      deferredInstallPrompt = null;
    }
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallCard();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallCard();
});

if (isIos()) {
  showInstallCard();
}

async function bootstrapApp() {
  await hardClearLegacyCache();
  await registerServiceWorker();
  await fetchBuildInfo();
  try {
    await fetchMe();
  } catch {
    // fetchMe already clears invalid tokens; avoid wiping state on transient errors.
  }
  try {
    await fetchConfig();
  } catch {
    // ignore config errors on first paint
  }
  try {
    await loadRecords();
  } catch {
    // keep UI usable even if attendance fails to load
  }
}

bootstrapApp().catch(() => {
  renderAuthState();
});





