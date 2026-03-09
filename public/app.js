const authCard = document.getElementById('authCard');
const appCard = document.getElementById('appCard');
const myAttendanceCard = document.getElementById('myAttendanceCard');
const authStatusEl = document.getElementById('authStatus');
const userBadge = document.getElementById('userBadge');
const adminLink = document.getElementById('adminLink');

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

let authToken = localStorage.getItem('attendance_token') || '';
let currentUser = null;
let photoBlob = null;
let latestLocation = null;
let officeConfig = null;
let cameraStream = null;
const inAppBrowser = /FBAN|FBAV|Instagram|Line|Messenger/i.test(navigator.userAgent);
const STRICT_CLIENT_GPS_METERS = 25;

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

  const res = await fetch(path, { ...options, headers });
  const raw = await res.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  if (!res.ok) {
    if (res.status === 401) {
      saveToken('');
      currentUser = null;
      renderAuthState();
    }
    const fallback = raw && !raw.trim().startsWith('<') ? raw.trim() : '';
    if (res.status === 404 && /\/api\/auth\/(login|register)\/request-code/.test(path)) {
      throw new Error('OTP endpoint not found on running server. Restart backend and refresh page.');
    }
    throw new Error(payload.message || fallback || `Request failed (${res.status}).`);
  }
  return payload;
}

async function hardClearLegacyCache() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
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

function clearAttendanceState() {
  photoBlob = null;
  latestLocation = null;
  canvas.classList.add('hidden-canvas');
  setStatus('waiting');
  setInfo('');
}

function renderAuthState() {
  const loggedIn = Boolean(currentUser && authToken);
  authCard.classList.toggle('hidden', loggedIn);
  appCard.classList.toggle('hidden', !loggedIn);
  myAttendanceCard.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    setAuthStatus(`logged in as ${currentUser.username}`);
    userBadge.textContent = `${currentUser.fullName} (${currentUser.employeeId}) | Role: ${currentUser.role}`;
    const isAdmin = currentUser.role === 'admin';
    adminLink.classList.toggle('hidden', !isAdmin);
    setOfficeBtn.classList.toggle('hidden', !isAdmin);
  } else {
    setAuthStatus('not logged in');
    userBadge.textContent = '';
    adminLink.classList.add('hidden');
    setOfficeBtn.classList.add('hidden');
    clearAttendanceState();
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
    const payload = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    saveToken(payload.token);
    currentUser = payload.user;
    renderAuthState();
    await fetchConfig();
    await loadRecords();
  } catch (err) {
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

function collectAccurateLocation(targetAccuracyMeters = 25, minSamples = 4, maxWaitMs = 35000) {
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
    const strictTarget = cfg ? Math.min(Math.max(cfg.maxGpsAccuracyMeters, 15), 35) : 25;
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

async function submitAttendance() {
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

function statusTag(status) {
  return `<span class="tag ${status}">${status}</span>`;
}

async function loadRecords() {
  const date = dateFilterInput.value;
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';

  try {
    const payload = await api(`/api/attendance${qs}`);
    recordsBody.innerHTML = payload.records
      .map((r) => {
        const mapLink = `https://maps.google.com/?q=${r.latitude},${r.longitude}`;
        return `
          <tr>
            <td>${new Date(r.timestampIso).toLocaleString()}</td>
            <td>${r.attendanceTypeLabel || r.attendanceType || '-'}</td>
            <td>${statusTag(r.attendanceStatus)}</td>
            <td>${Math.round(r.distanceMeters)}</td>
            <td>${Math.round(r.gpsAccuracyMeters)}</td>
            <td><a href="${mapLink}" target="_blank" rel="noreferrer">View Map</a></td>
          </tr>
        `;
      })
      .join('');

    if (!payload.records.length) recordsBody.innerHTML = '<tr><td colspan="6">No records found.</td></tr>';
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
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('registerBtn').addEventListener('click', handleRegister);
document.getElementById('forgotBtn').addEventListener('click', handleForgotPassword);
document.getElementById('changeBtn').addEventListener('click', handleChangePassword);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('startCameraBtn').addEventListener('click', startCamera);
document.getElementById('captureBtn').addEventListener('click', capturePhoto);
document.getElementById('locationBtn').addEventListener('click', getAccurateLocation);
document.getElementById('submitBtn').addEventListener('click', submitAttendance);
document.getElementById('setOfficeBtn').addEventListener('click', setOfficeReferenceFromCurrentGps);
document.getElementById('loadRecordsBtn').addEventListener('click', loadRecords);

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
dateFilterInput.value = new Date().toISOString().slice(0, 10);
activateTab('login');
renderAuthState();

hardClearLegacyCache()
  .then(() => fetchBuildInfo())
  .then(() => fetchMe())
  .then(() => fetchConfig())
  .then(() => loadRecords())
  .catch(() => {
    saveToken('');
    currentUser = null;
    renderAuthState();
  });
