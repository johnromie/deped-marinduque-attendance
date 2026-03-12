const statusEl = document.getElementById('status');
const infoEl = document.getElementById('info');
const recordsBody = document.getElementById('recordsBody');
const adminUserInfo = document.getElementById('adminUserInfo');
const adminTotalEmployeesEl = document.getElementById('adminTotalEmployees');
const adminPresentEl = document.getElementById('adminPresent');
const adminLateEl = document.getElementById('adminLate');
const adminAbsentEl = document.getElementById('adminAbsent');
const adminCurrentTimeEl = document.getElementById('adminCurrentTime');
const adminCurrentDateEl = document.getElementById('adminCurrentDate');
const dateFilterInput = document.getElementById('dateFilter');
const officeFilterInput = document.getElementById('officeFilter');
const employeeSearchInput = document.getElementById('employeeSearch');
const employeesBody = document.getElementById('employeesBody');
const employeeFormCard = document.getElementById('employeeFormCard');
const addFullNameInput = document.getElementById('addFullName');
const addPositionInput = document.getElementById('addPosition');
const addOfficeInput = document.getElementById('addOffice');
const addEmployeeIdInput = document.getElementById('addEmployeeId');
const addEmailInput = document.getElementById('addEmail');
const addPasswordInput = document.getElementById('addPassword');
const addEmployeeBtn = document.getElementById('addEmployeeBtn');
const cancelEmployeeBtn = document.getElementById('cancelEmployeeBtn');
const reportOfficeSelect = document.getElementById('reportOffice');
const generateReportBtn = document.getElementById('generateReportBtn');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const reportStatusEl = document.getElementById('reportStatus');
const monthFilterInput = document.getElementById('monthFilter');
const employeeIdFilterInput = document.getElementById('employeeIdFilter');
const goAddEmployeeBtn = document.getElementById('goAddEmployeeBtn');

let authToken = localStorage.getItem('attendance_token') || '';
let lastLoadedRecords = [];
let groupedLoadedRows = [];
let adminUsers = [];
let adminClockTimer = null;
let lastReportMonth = '';

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

function setInfo(text) {
  infoEl.textContent = text;
}

function toAdminDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return map;
}

function updateAdminClock() {
  if (!adminCurrentTimeEl || !adminCurrentDateEl) return;
  const p = toAdminDateParts(new Date());
  adminCurrentTimeEl.textContent = `${p.hour}:${p.minute} ${p.dayPeriod}`;
  adminCurrentDateEl.textContent = `${p.month} ${p.day}, ${p.year}`;
}

function startAdminClock() {
  if (adminClockTimer) clearInterval(adminClockTimer);
  updateAdminClock();
  adminClockTimer = setInterval(updateAdminClock, 1000);
}

function stopAdminClock() {
  if (adminClockTimer) {
    clearInterval(adminClockTimer);
    adminClockTimer = null;
  }
}

function saveToken(token) {
  authToken = token || '';
  if (authToken) localStorage.setItem('attendance_token', authToken);
  else localStorage.removeItem('attendance_token');
}

function setReportStatus(text) {
  if (reportStatusEl) reportStatusEl.textContent = `Report status: ${text}`;
}

function toggleSection(sectionId) {
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });
  document.querySelectorAll('.admin-nav a[data-section]').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });
}

function renderEmployeesList() {
  if (!employeesBody) return;
  const query = String(employeeSearchInput?.value || '').trim().toLowerCase();
  const rows = adminUsers.filter((u) => {
    if (!query) return true;
    const hay = `${u.employeeId} ${u.fullName} ${u.username} ${u.position || ''} ${u.office || ''}`.toLowerCase();
    return hay.includes(query);
  });

  employeesBody.innerHTML = rows
    .map((u) => {
      const pos = u.position || '-';
      const office = u.office || '-';
      const email = u.email || '-';
      return `
        <tr>
          <td>${u.employeeId || '-'}</td>
          <td>${u.fullName || u.username}</td>
          <td>${pos}</td>
          <td>${office}</td>
          <td>${email}</td>
          <td><span class="tag ON_SITE">Active</span></td>
        </tr>
      `;
    })
    .join('');

  if (!rows.length) {
    employeesBody.innerHTML = '<tr><td colspan="6">No employees found.</td></tr>';
  }
}

function resetEmployeeForm() {
  if (addFullNameInput) addFullNameInput.value = '';
  if (addPositionInput) addPositionInput.value = '';
  if (addOfficeInput) addOfficeInput.value = '';
  if (addEmployeeIdInput) addEmployeeIdInput.value = '';
  if (addEmailInput) addEmailInput.value = '';
  if (addPasswordInput) addPasswordInput.value = '';
}

async function addEmployee() {
  const body = {
    fullName: addFullNameInput?.value.trim(),
    position: addPositionInput?.value.trim(),
    office: addOfficeInput?.value.trim(),
    employeeId: addEmployeeIdInput?.value.trim(),
    email: addEmailInput?.value.trim(),
    password: addPasswordInput?.value
  };

  if (!body.fullName || !body.employeeId || !body.password) {
    alert('Full Name, Employee ID, and Password are required.');
    return;
  }

  try {
    await api('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setStatus('employee added');
    await ensureAdmin();
    renderEmployeesList();
    resetEmployeeForm();
    if (employeeFormCard) employeeFormCard.classList.add('hidden');
  } catch (err) {
    alert(err.message || 'Failed to add employee.');
  }
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const res = await fetch(path, { ...options, headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || 'Request failed.');
  return payload;
}

function statusTag(status) {
  return `<span class="tag ${status}">${status}</span>`;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveUserByInput(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) return null;
  const key = normalizeKey(input);
  if (!key) return null;

  const exact = adminUsers.find((u) => normalizeKey(u.employeeId) === key || normalizeKey(u.username) === key);
  if (exact) return exact;

  const byName = adminUsers.find((u) => normalizeKey(u.fullName) === key);
  if (byName) return byName;

  const partialMatches = adminUsers.filter((u) => {
    const employeeKey = normalizeKey(u.employeeId);
    const usernameKey = normalizeKey(u.username);
    const nameKey = normalizeKey(u.fullName);
    return employeeKey.startsWith(key) || usernameKey.startsWith(key) || nameKey.includes(key);
  });

  if (partialMatches.length === 1) return partialMatches[0];
  return null;
}

async function ensureAdmin() {
  if (!authToken) {
    location.href = '/';
    return false;
  }

  try {
    const me = await api('/api/auth/me');
    if (!me.user || me.user.role !== 'admin') {
      alert('Admin access only.');
      location.href = '/';
      return false;
    }
    adminUserInfo.textContent = `Logged in as ${me.user.fullName} (${me.user.username})`;
    startAdminClock();
  } catch (err) {
    const msg = String(err && err.message ? err.message : '');
    const authFailed = /unauthorized|login again|admin access only|forbidden/i.test(msg);
    if (authFailed) {
      saveToken('');
      location.href = '/';
      return false;
    }
    setStatus('auth check warning');
    setInfo(msg || 'Failed to verify admin session.');
    return false;
  }

  try {
    const usersPayload = await api('/api/admin/users');
    adminUsers = Array.isArray(usersPayload.users) ? usersPayload.users : [];
    if (adminTotalEmployeesEl) adminTotalEmployeesEl.textContent = String(adminUsers.length);
    const list = adminUsers
      .map((u) => `${u.employeeId} - ${u.fullName} (${u.username})`)
      .sort((a, b) => a.localeCompare(b));
    employeeIdFilterInput.setAttribute('list', 'employeeIdList');
    let datalist = document.getElementById('employeeIdList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'employeeIdList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = list.map((item) => `<option value="${item}"></option>`).join('');
    renderEmployeesList();
  } catch (err) {
    adminUsers = [];
    setStatus('user list warning');
    setInfo(err.message || 'Unable to load user list right now.');
  }

  await loadSummary();

  return true;
}

async function fetchAdminRecords(params) {
  const qs = params.toString();
  return api(`/api/admin/attendance${qs ? `?${qs}` : ''}`);
}

function findUserByRecord(record) {
  const byId = adminUsers.find((u) => normalizeKey(u.id) === normalizeKey(record.userId));
  if (byId) return byId;
  const byEmployee = adminUsers.find((u) => normalizeKey(u.employeeId) === normalizeKey(record.employeeId));
  if (byEmployee) return byEmployee;
  const byUsername = adminUsers.find((u) => normalizeKey(u.username) === normalizeKey(record.username));
  if (byUsername) return byUsername;
  return {
    id: record.userId,
    employeeId: record.employeeId,
    username: record.username,
    fullName: record.fullName || '(No Name)'
  };
}

function inferTypeFromRecord(record) {
  if (record.attendanceType) return record.attendanceType;
  const p = toManilaDateParts(record.timestampIso);
  const [hh, mm] = p.hhmm.split(':').map(Number);
  const totalMinutes = hh * 60 + mm;
  if (totalMinutes >= 300 && totalMinutes <= 660) return 'MORNING_IN';
  if (totalMinutes >= 661 && totalMinutes <= 740) return 'NOON_OUT';
  if (totalMinutes >= 741 && totalMinutes <= 900) return 'AFTERNOON_IN';
  if (totalMinutes >= 901 && totalMinutes <= 1200) return 'AFTERNOON_OUT';
  return '';
}

function formatDisplayDate(localDate, fallbackIso) {
  if (localDate) {
    const [y, m, d] = String(localDate).split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }
  return new Date(fallbackIso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function groupRecordsForDisplay(records) {
  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));
  const map = new Map();

  for (const r of sorted) {
    const p = toManilaDateParts(r.timestampIso);
    const localDate = r.localDate || `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    const identity = normalizeKey(r.userId || '') || normalizeKey(r.employeeId || '') || normalizeKey(r.username || '');
    const key = `${identity}|${localDate}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        localDate,
        dateLabel: formatDisplayDate(localDate, r.timestampIso),
        userId: r.userId || '',
        employeeId: r.employeeId || '',
        username: r.username || '',
        fullName: r.fullName || '',
        amIn: '',
        noonOut: '',
        pmIn: '',
        pmOut: '',
        status: r.attendanceStatus || '',
        bestPhotoUrl: r.photoUrl || '',
        bestLat: Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : null,
        bestLng: Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : null,
        bestGpsAcc: Number.isFinite(Number(r.gpsAccuracyMeters)) ? Number(r.gpsAccuracyMeters) : Number.POSITIVE_INFINITY,
        latestTimestampIso: r.timestampIso
      });
    }

    const row = map.get(key);
    const hhmm = toManilaDateParts(r.timestampIso).hhmm;
    const type = inferTypeFromRecord(r);

    if (type === 'MORNING_IN') row.amIn = hhmm;
    if (type === 'NOON_OUT') row.noonOut = hhmm;
    if (type === 'AFTERNOON_IN') row.pmIn = hhmm;
    if (type === 'AFTERNOON_OUT') row.pmOut = hhmm;

    if (new Date(r.timestampIso) > new Date(row.latestTimestampIso)) {
      row.latestTimestampIso = r.timestampIso;
      row.status = r.attendanceStatus || row.status;
    }

    const acc = Number(r.gpsAccuracyMeters);
    if (r.photoUrl && Number.isFinite(acc) && acc <= row.bestGpsAcc) {
      row.bestPhotoUrl = r.photoUrl;
      row.bestGpsAcc = acc;
      row.bestLat = Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : row.bestLat;
      row.bestLng = Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : row.bestLng;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate < b.localDate ? 1 : -1;
    return (a.fullName || '').localeCompare(b.fullName || '');
  });
}

async function loadRecords() {
  const date = dateFilterInput.value.trim();
  const employeeInput = employeeIdFilterInput.value.trim();
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (employeeInput) {
    const selectedUser = resolveUserByInput(employeeInput);
    if (selectedUser) {
      const canonicalId = String(selectedUser.employeeId || '').trim();
      employeeIdFilterInput.value = canonicalId;
      params.set('employeeId', canonicalId);
    } else {
      params.set('employeeId', employeeInput);
    }
  }

  try {
    setStatus('loading records...');
    const payload = await fetchAdminRecords(params);
    lastLoadedRecords = payload.records || [];
    groupedLoadedRows = groupRecordsForDisplay(lastLoadedRecords);
    const officeFilter = String(officeFilterInput?.value || '').trim().toLowerCase();
    if (officeFilter) {
      groupedLoadedRows = groupedLoadedRows.filter((row) => {
        const user = findUserByRecord(row);
        return String(user.office || '').trim().toLowerCase() === officeFilter;
      });
    }

    recordsBody.innerHTML = groupedLoadedRows
      .map((row) => {
        const user = findUserByRecord(row);
        const timeIn = row.amIn || row.pmIn || '-';
        const timeOut = row.pmOut || row.noonOut || '-';
        return `
          <tr>
            <td>${user.employeeId || '-'}</td>
            <td>${row.fullName || user.fullName || '-'}</td>
            <td>${user.office || '-'}</td>
            <td>${timeIn}</td>
            <td>${timeOut}</td>
            <td>${statusTag(row.status || '-')}</td>
          </tr>
        `;
      })
      .join('');

    if (!groupedLoadedRows.length) recordsBody.innerHTML = '<tr><td colspan="6">No records found.</td></tr>';

    setStatus('records loaded');
    setInfo(`Total logs: ${payload.count} | Grouped daily records: ${groupedLoadedRows.length}`);
  } catch (err) {
    setStatus('load error');
    setInfo(err.message || 'Failed to load records.');
  }
}

async function loadSummary() {
  try {
    setStatus('loading summary...');
    const s = await api('/api/summary/today');
    setStatus('summary loaded');
    if (adminTotalEmployeesEl) adminTotalEmployeesEl.textContent = String(s.totalEmployees ?? adminTotalEmployeesEl.textContent || '--');
    if (adminPresentEl) adminPresentEl.textContent = String(s.present ?? s.onSite ?? '--');
    if (adminLateEl) adminLateEl.textContent = String(s.late ?? s.needsReview ?? '--');
    if (adminAbsentEl) adminAbsentEl.textContent = String(s.absent ?? s.offSite ?? '--');
    setInfo(`Date: ${s.date} | Total: ${s.totalEmployees ?? s.total} | Present: ${s.present ?? s.onSite} | Late: ${s.late ?? s.needsReview} | Absent: ${s.absent ?? s.offSite}`);
  } catch (err) {
    setStatus('summary error');
    setInfo(err.message || 'Failed to load summary.');
  }
}

async function generateReport() {
  const month = monthFilterInput?.value?.trim();
  if (!month) {
    alert('Select a month first.');
    return;
  }
  try {
    setReportStatus('generating...');
    await api('/api/admin/archive-month', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ month })
    });
    lastReportMonth = month;
    setReportStatus(`generated for ${month}`);
  } catch (err) {
    setReportStatus('error');
    alert(err.message || 'Failed to generate report.');
  }
}

async function downloadReport() {
  if (!monthFilterInput?.value?.trim()) {
    alert('Select a month first.');
    return;
  }
  // Reuse existing DTR print flow (prints to PDF in browser).
  await printDtrForm();
}

function toManilaDateParts(iso) {
  const dt = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(dt);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hhmm: `${map.hour}:${map.minute}`
  };
}

function weekdayLabel(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay();
  if (weekday === 0) return 'Sun';
  if (weekday === 6) return 'Sat';
  return '';
}

function makeMonthlyMap(records, year, month) {
  const days = new Map();
  const sorted = [...records].sort((a, b) => new Date(a.timestampIso) - new Date(b.timestampIso));

  sorted.forEach((r) => {
    const localDate = String(r.localDate || '');
    const [y, m, d] = localDate.split('-').map(Number);
    const timestampParts = toManilaDateParts(r.timestampIso);
    const p = Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? { year: y, month: m, day: d, hhmm: timestampParts.hhmm } : timestampParts;
    if (p.year !== year || p.month !== month) return;

    if (!days.has(p.day)) {
      days.set(p.day, {
        amArrival: '',
        amDeparture: '',
        pmArrival: '',
        pmDeparture: '',
        status: '',
        employeeId: r.employeeId,
        fullName: r.fullName
      });
    }

    const row = days.get(p.day);
    let type = r.attendanceType;
    if (!type) {
      const [hh, mm] = p.hhmm.split(':').map(Number);
      const totalMinutes = hh * 60 + mm;
      if (totalMinutes >= 300 && totalMinutes <= 660) type = 'MORNING_IN';
      else if (totalMinutes >= 661 && totalMinutes <= 740) type = 'NOON_OUT';
      else if (totalMinutes >= 741 && totalMinutes <= 900) type = 'AFTERNOON_IN';
      else if (totalMinutes >= 901 && totalMinutes <= 1200) type = 'AFTERNOON_OUT';
    }

    if (type === 'MORNING_IN') row.amArrival = p.hhmm;
    if (type === 'NOON_OUT') row.amDeparture = p.hhmm;
    if (type === 'AFTERNOON_IN') row.pmArrival = p.hhmm;
    if (type === 'AFTERNOON_OUT') row.pmDeparture = p.hhmm;
    row.status = r.attendanceStatus || row.status;
  });
  return days;
}

function normalizeDtrRow(row, weekday) {
  const out = {
    amArrival: row.amArrival || '',
    amDeparture: row.amDeparture || '',
    pmArrival: row.pmArrival || '',
    pmDeparture: row.pmDeparture || ''
  };

  if (weekday === 'Sat' || weekday === 'Sun') {
    return out;
  }

  const values = [out.amArrival, out.amDeparture, out.pmArrival, out.pmDeparture];
  const hasAnyLog = values.some(Boolean);

  if (!hasAnyLog) {
    out.amArrival = 'ABSENT';
    out.amDeparture = 'ABSENT';
    out.pmArrival = 'ABSENT';
    out.pmDeparture = 'ABSENT';
    return out;
  }

  if (!out.amArrival) out.amArrival = 'ABSENT';
  if (!out.amDeparture) out.amDeparture = 'ABSENT';
  if (!out.pmArrival) out.pmArrival = 'ABSENT';
  if (!out.pmDeparture) out.pmDeparture = 'ABSENT';

  return out;
}

function hasAbsent(row) {
  return row.amArrival === 'ABSENT' || row.amDeparture === 'ABSENT' || row.pmArrival === 'ABSENT' || row.pmDeparture === 'ABSENT';
}

function renderCell(value) {
  if (value === 'ABSENT') return '<span class="absent">ABSENT</span>';
  return value || '';
}

function calcUndertime(amArrival, pmDeparture) {
  let undertimeMinutes = 0;
  if (amArrival) {
    const [h, m] = amArrival.split(':').map(Number);
    const arrived = h * 60 + m;
    const official = 8 * 60;
    if (arrived > official) undertimeMinutes += (arrived - official);
  }
  if (pmDeparture) {
    const [h, m] = pmDeparture.split(':').map(Number);
    const out = h * 60 + m;
    const official = 17 * 60;
    if (out < official) undertimeMinutes += (official - out);
  }
  return {
    h: Math.floor(undertimeMinutes / 60),
    m: undertimeMinutes % 60
  };
}

function openPrintWindow(html) {
  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) {
    alert('Popup blocked. Please allow popups for printing.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

async function printDtrForm() {
  const employeeInput = employeeIdFilterInput.value.trim();
  const month = monthFilterInput.value.trim();

  if (!employeeInput) {
    alert('Enter Employee ID, username, or full name first for DTR print.');
    return;
  }
  if (!month) {
    alert('Select month first for DTR print.');
    return;
  }

  try {
    const selectedUser = resolveUserByInput(employeeInput);
    if (!selectedUser) {
      alert('User not found or not unique. Please enter exact Employee ID from suggestions.');
      return;
    }

    await printDtrForUser(selectedUser, month);
  } catch (err) {
    alert(err.message || 'Failed to generate print form.');
  }
}

async function printDtrForUser(selectedUser, month) {
  const employeeId = String(selectedUser.employeeId || '').trim();
  employeeIdFilterInput.value = employeeId;

  const params = new URLSearchParams();
  params.set('date', month);
  const payload = await fetchAdminRecords(params);
  const records = (payload.records || []).filter((r) => {
    return normalizeKey(r.employeeId) === normalizeKey(employeeId) || normalizeKey(r.userId) === normalizeKey(selectedUser.id);
  });

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const dayCount = new Date(year, monthNum, 0).getDate();

  const monthlyMap = makeMonthlyMap(records, year, monthNum);
  const first = records[0] || {};
  const fullName = first.fullName || selectedUser.fullName || '(No Name)';

  const rowsHtml = Array.from({ length: dayCount }, (_, idx) => {
    const day = idx + 1;
    const baseRow = monthlyMap.get(day) || { amArrival: '', amDeparture: '', pmArrival: '', pmDeparture: '' };
    const wk = weekdayLabel(year, monthNum, day);
    const row = normalizeDtrRow(baseRow, wk);
    const ut = hasAbsent(row) ? { h: '', m: '' } : calcUndertime(row.amArrival, row.pmDeparture);
    return `
        <tr>
          <td class="c">${day}</td>
          <td>${renderCell(row.amArrival)}</td>
          <td>${renderCell(row.amDeparture)}</td>
          <td>${renderCell(row.pmArrival)}</td>
          <td>${renderCell(row.pmDeparture)}</td>
          <td class="c">${wk ? '' : (ut.h || '')}</td>
          <td class="c">${wk ? wk : (ut.m || '')}</td>
        </tr>
      `;
  }).join('');

  const monthName = new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleString('en-US', { month: 'long' });

  const html = `
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
    <div><strong>Name:</strong> ${employeeId} - ${fullName}</div>
    <div><strong>For the month of:</strong> ${monthName} ${year}</div>
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

  openPrintWindow(html);
}

function logout() {
  saveToken('');
  stopAdminClock();
  location.href = '/';
}

document.getElementById('loadBtn').addEventListener('click', loadRecords);
document.getElementById('summaryBtn').addEventListener('click', loadSummary);
document.getElementById('logoutBtn').addEventListener('click', logout);
if (cancelEmployeeBtn) {
  cancelEmployeeBtn.addEventListener('click', () => {
    resetEmployeeForm();
  });
}
if (addEmployeeBtn) {
  addEmployeeBtn.addEventListener('click', addEmployee);
}
if (employeeSearchInput) {
  employeeSearchInput.addEventListener('input', renderEmployeesList);
}
if (generateReportBtn) {
  generateReportBtn.addEventListener('click', generateReport);
}
if (downloadReportBtn) {
  downloadReportBtn.addEventListener('click', downloadReport);
}
document.querySelectorAll('.admin-nav a[data-section]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const sectionId = link.dataset.section || 'dashboard';
    toggleSection(sectionId);
    history.replaceState(null, '', `#${sectionId}`);
  });
});
// Print buttons removed from dashboard table to match admin UI design.
if (goAddEmployeeBtn) {
  goAddEmployeeBtn.addEventListener('click', () => {
    toggleSection('attendance');
    history.replaceState(null, '', '#attendance');
  });
}

function manilaDateKey() {
  const p = toAdminDateParts(new Date());
  const day = String(p.day).padStart(2, '0');
  const monthIndex = new Date(`${p.month} 1, ${p.year}`).getMonth() + 1;
  const month = String(monthIndex).padStart(2, '0');
  return `${p.year}-${month}-${day}`;
}

function manilaMonthKey() {
  const p = toAdminDateParts(new Date());
  const monthIndex = new Date(`${p.month} 1, ${p.year}`).getMonth() + 1;
  const month = String(monthIndex).padStart(2, '0');
  return `${p.year}-${month}`;
}

dateFilterInput.value = manilaDateKey();
monthFilterInput.value = manilaMonthKey();

startAdminClock();

ensureAdmin().then((ok) => {
  if (ok) loadRecords();
});

const initialSection = window.location.hash.replace('#', '') || 'dashboard';
toggleSection(initialSection);






