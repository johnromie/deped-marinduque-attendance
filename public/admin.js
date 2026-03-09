const statusEl = document.getElementById('status');
const infoEl = document.getElementById('info');
const recordsBody = document.getElementById('recordsBody');
const adminUserInfo = document.getElementById('adminUserInfo');
const dateFilterInput = document.getElementById('dateFilter');
const monthFilterInput = document.getElementById('monthFilter');
const employeeIdFilterInput = document.getElementById('employeeIdFilter');

let authToken = localStorage.getItem('attendance_token') || '';
let lastLoadedRecords = [];
let groupedLoadedRows = [];
let adminUsers = [];

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

function setInfo(text) {
  infoEl.textContent = text;
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
  } catch (err) {
    adminUsers = [];
    setStatus('user list warning');
    setInfo(err.message || 'Unable to load user list right now.');
  }

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

    recordsBody.innerHTML = groupedLoadedRows
      .map((row, idx) => {
        const hasMap = Number.isFinite(row.bestLat) && Number.isFinite(row.bestLng);
        const mapLink = hasMap ? `https://maps.google.com/?q=${row.bestLat},${row.bestLng}` : '';
        const photo = row.bestPhotoUrl ? `<a href="${row.bestPhotoUrl}" target="_blank" rel="noreferrer"><img class="thumb" src="${row.bestPhotoUrl}" alt="photo"/></a>` : '-';
        const userLabel = (row.fullName || row.username || row.employeeId || 'User').replace(/"/g, '&quot;');
        return `
          <tr>
            <td>${row.dateLabel}</td>
            <td>${row.fullName || '-'}<br/><small>${row.employeeId || '-'}</small></td>
            <td>${row.amIn || '-'}</td>
            <td>${row.noonOut || '-'}</td>
            <td>${row.pmIn || '-'}</td>
            <td>${row.pmOut || '-'}</td>
            <td>${statusTag(row.status || '-')}</td>
            <td>${photo}</td>
            <td>${hasMap ? `<a href="${mapLink}" target="_blank" rel="noreferrer">View Map</a>` : '-'}</td>
            <td><button type="button" class="secondary row-print-dtr-btn" data-group-index="${idx}" title="Print DTR for ${userLabel}">Print ${userLabel}</button></td>
          </tr>
        `;
      })
      .join('');

    if (!groupedLoadedRows.length) recordsBody.innerHTML = '<tr><td colspan="10">No records found.</td></tr>';

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
    setInfo(`Date: ${s.date} | Total: ${s.total} | ON_SITE: ${s.onSite} | OFF_SITE: ${s.offSite} | NEEDS_REVIEW: ${s.needsReview}`);
  } catch (err) {
    setStatus('summary error');
    setInfo(err.message || 'Failed to load summary.');
  }
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
  location.href = '/';
}

document.getElementById('loadBtn').addEventListener('click', loadRecords);
document.getElementById('summaryBtn').addEventListener('click', loadSummary);
document.getElementById('logoutBtn').addEventListener('click', logout);
recordsBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('.row-print-dtr-btn');
  if (!btn) return;

  const groupIndex = Number(btn.getAttribute('data-group-index'));
  const row = groupedLoadedRows[groupIndex];
  if (!row) return;

  const month = monthFilterInput.value.trim();
  if (!month) {
    alert('Select month first for DTR print.');
    return;
  }

  try {
    const user = findUserByRecord(row);
    await printDtrForUser(user, month);
  } catch (err) {
    alert(err.message || 'Failed to generate print form.');
  }
});

dateFilterInput.value = new Date().toISOString().slice(0, 10);
monthFilterInput.value = new Date().toISOString().slice(0, 7);

ensureAdmin().then((ok) => {
  if (ok) loadRecords();
});
