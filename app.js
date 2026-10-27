/**
 * Dance Class Manager
 * - Always saves to localStorage so refresh never loses data
 * - Also saves to /api/data (Vercel + GitHub) so all devices share the same list
 */

const STORAGE_KEY = 'dance-class-manager-v2';
const BATCHES = {
  mwf: { id: 'mwf', title: 'Monday · Wednesday · Friday', classDays: [1, 3, 5] },
  tts: { id: 'tts', title: 'Tuesday · Thursday · Saturday', classDays: [2, 4, 6] },
  zumba: { id: 'zumba', title: 'Zumba (Ladies) — Tue · Wed · Thu · Fri', classDays: [2, 3, 4, 5] },
};

let data = { mwf: [], tts: [], zumba: [] };
let dataSha = null;
let currentBatch = null;
let editIndex = null;
let openMenuIndex = null;
let dirty = false;
let serverOk = false;

function $(id) {
  return document.getElementById(id);
}

function toast(msg, isError) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function setStatus(text, kind) {
  const el = $('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (kind ? ' ' + kind : '');
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayISO() {
  return toISO(new Date());
}
function formatDisplay(iso) {
  if (!iso) return '—';
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function nextClassDay(iso, classDays) {
  const d = parseISO(iso);
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if (classDays.includes(d.getDay())) return toISO(d);
  }
  d.setDate(d.getDate() + 1);
  return toISO(d);
}
function advanceAllOneClassDay(batchId) {
  const days = BATCHES[batchId].classDays;
  data[batchId] = data[batchId].map((s) => ({
    ...s,
    feesDate: nextClassDay(s.feesDate, days),
  }));
  dirty = true;
}
function isFeesDueToday(feesISO) {
  if (!feesISO) return false;
  return parseISO(feesISO).getDate() === new Date().getDate();
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function countStudents(obj) {
  return ['mwf', 'tts', 'zumba'].reduce((n, k) => n + (obj[k]?.length || 0), 0);
}

// ----- localStorage (never lose on refresh) -----
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn(e);
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      mwf: Array.isArray(parsed.mwf) ? parsed.mwf : [],
      tts: Array.isArray(parsed.tts) ? parsed.tts : [],
      zumba: Array.isArray(parsed.zumba) ? parsed.zumba : [],
    };
  } catch {
    return null;
  }
}

// ----- server -----
async function loadFromServer() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Load failed (${res.status})`);
    }
    serverOk = true;
    dataSha = json.sha || null;
    return json.data || { mwf: [], tts: [], zumba: [] };
  } catch (e) {
    serverOk = false;
    console.warn('Server load failed', e);
    return null;
  }
}

async function saveToServer() {
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, sha: dataSha }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Save failed (${res.status})`);
    }
    serverOk = true;
    dataSha = json.sha || dataSha;
    if (json.data) data = json.data;
    return true;
  } catch (e) {
    serverOk = false;
    console.warn('Server save failed', e);
    throw e;
  }
}

/** Persist: always local; also try server */
async function persist(showToast) {
  saveLocal(); // always
  try {
    await saveToServer();
    dirty = false;
    setStatus('Saved on this device + shared for everyone', 'ok');
    if (showToast !== false) toast('Saved ✓ (kept after refresh)');
    return true;
  } catch (e) {
    dirty = false; // local is safe
    setStatus('Saved on this device only (shared cloud failed — check GITHUB_TOKEN on Vercel)', 'err');
    if (showToast !== false) {
      toast('Saved on this phone/computer. Cloud sync failed: ' + (e.message || ''), true);
    }
    return false;
  }
}

async function bootstrap() {
  setStatus('Loading…', '');
  const local = loadLocal();
  const remote = await loadFromServer();

  if (remote && countStudents(remote) > 0) {
    data = remote;
    // keep local mirror
    saveLocal();
    setStatus('Loaded shared list (same for everyone)', 'ok');
  } else if (local && countStudents(local) > 0) {
    data = local;
    setStatus(
      serverOk
        ? 'Loaded from this device — tap Save to share with everyone'
        : 'Loaded from this device (cloud not connected)',
      serverOk ? '' : 'err'
    );
    // try push local to server if server empty
    if (serverOk && countStudents(remote || {}) === 0) {
      try {
        await saveToServer();
        setStatus('Uploaded device list to shared storage', 'ok');
      } catch (_) {}
    }
  } else if (remote) {
    data = remote;
    setStatus(serverOk ? 'Ready (empty list)' : 'Ready', serverOk ? 'ok' : '');
  } else {
    data = { mwf: [], tts: [], zumba: [] };
    setStatus('Ready — add students and tap Save', '');
  }
}

// ----- UI -----
function showView(name) {
  $('view-home').classList.toggle('hidden', name !== 'home');
  $('view-batch').classList.toggle('hidden', name !== 'batch');
}
function updateHomeCounts() {
  for (const id of ['mwf', 'tts', 'zumba']) {
    const n = data[id].length;
    const el = $('count-' + id);
    if (id === 'zumba') el.textContent = `${n} student${n === 1 ? '' : 's'} · Tue–Fri`;
    else el.textContent = `${n} student${n === 1 ? '' : 's'}`;
  }
}
function renderDueBanner() {
  const due = [];
  for (const [batchId, students] of Object.entries(data)) {
    students.forEach((s) => {
      if (isFeesDueToday(s.feesDate)) {
        due.push({ name: s.name, batch: BATCHES[batchId].title, feesDate: s.feesDate });
      }
    });
  }
  const banner = $('due-banner');
  const list = $('due-list');
  if (!due.length) {
    banner.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  banner.classList.remove('hidden');
  list.innerHTML = due
    .map((d) => `<li><strong>${escapeHtml(d.name)}</strong> — ${escapeHtml(d.batch)} (${formatDisplay(d.feesDate)})</li>`)
    .join('');
}
function renderTable() {
  const tbody = $('student-tbody');
  const students = data[currentBatch] || [];
  $('empty-msg').classList.toggle('hidden', students.length > 0);
  tbody.innerHTML = students
    .map((s, i) => {
      const due = isFeesDueToday(s.feesDate);
      return `<tr class="clickable ${due ? 'fees-due' : ''}" data-index="${i}">
        <td>${i + 1}</td>
        <td class="name-cell">${escapeHtml(s.name)}</td>
        <td class="fees-cell">${formatDisplay(s.feesDate)}</td>
        <td class="actions">
          <div class="menu-wrap">
            <button type="button" class="btn ghost sm btn-menu" data-menu="${i}" aria-label="More">⋯</button>
            <div class="menu ${openMenuIndex === i ? '' : 'hidden'}">
              <button type="button" data-edit="${i}">Edit</button>
              <button type="button" class="danger-text" data-remove="${i}">Remove</button>
            </div>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function openModal(mode, index) {
  editIndex = mode === 'edit' ? index : null;
  $('modal-title').textContent = mode === 'edit' ? 'Edit Student' : 'Add Student';
  if (mode === 'edit') {
    const s = data[currentBatch][index];
    $('input-name').value = s.name;
    $('input-fees').value = s.feesDate;
  } else {
    $('input-name').value = '';
    $('input-fees').value = todayISO();
  }
  $('modal').classList.remove('hidden');
  setTimeout(() => $('input-name').focus(), 50);
}
function closeModal() {
  $('modal').classList.add('hidden');
  editIndex = null;
}
function submitModal() {
  const name = $('input-name').value.trim();
  const feesDate = $('input-fees').value;
  if (!name) return toast('Please enter a student name', true);
  if (!feesDate) return toast('Please choose a fees date', true);
  if (editIndex === null) data[currentBatch].push({ name, feesDate });
  else data[currentBatch][editIndex] = { name, feesDate };
  dirty = true;
  saveLocal(); // immediate
  closeModal();
  openMenuIndex = null;
  renderTable();
  updateHomeCounts();
  toast('Updated — tap Save');
}

function openBatch(id) {
  currentBatch = id;
  openMenuIndex = null;
  $('batch-title').textContent = BATCHES[id].title;
  showView('batch');
  renderTable();
}
function goHome() {
  currentBatch = null;
  openMenuIndex = null;
  showView('home');
  updateHomeCounts();
  renderDueBanner();
}

function bind() {
  document.querySelectorAll('.batch-card').forEach((btn) => {
    btn.addEventListener('click', () => openBatch(btn.dataset.batch));
  });
  $('btn-back').addEventListener('click', goHome);
  $('btn-save').addEventListener('click', () => persist(true));
  $('btn-refresh').addEventListener('click', async () => {
    await bootstrap();
    updateHomeCounts();
    renderDueBanner();
    if (currentBatch) renderTable();
    toast('Refreshed');
  });
  $('btn-add').addEventListener('click', () => openModal('add'));
  $('btn-advance').addEventListener('click', () => {
    if (!currentBatch || !data[currentBatch].length) return toast('No students', true);
    if (!confirm('Advance every fees date by ONE class day? Then tap Save.')) return;
    advanceAllOneClassDay(currentBatch);
    saveLocal();
    openMenuIndex = null;
    renderTable();
    toast('Advanced — tap Save');
  });
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-ok').addEventListener('click', submitModal);
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  $('student-tbody').addEventListener('click', (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const i = Number(menuBtn.dataset.menu);
      openMenuIndex = openMenuIndex === i ? null : i;
      renderTable();
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      e.stopPropagation();
      openMenuIndex = null;
      openModal('edit', Number(editBtn.dataset.edit));
      renderTable();
      return;
    }
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      e.stopPropagation();
      const i = Number(removeBtn.dataset.remove);
      const name = data[currentBatch][i]?.name || 'student';
      if (!confirm(`Remove ${name}?`)) return;
      data[currentBatch].splice(i, 1);
      dirty = true;
      saveLocal();
      openMenuIndex = null;
      renderTable();
      updateHomeCounts();
      toast('Removed — tap Save');
      return;
    }
    const row = e.target.closest('tr[data-index]');
    if (row) {
      openMenuIndex = null;
      openModal('edit', Number(row.dataset.index));
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap') && openMenuIndex !== null) {
      openMenuIndex = null;
      if (currentBatch) renderTable();
    }
  });
}

(async function init() {
  bind();
  showView('home');
  await bootstrap();
  updateHomeCounts();
  renderDueBanner();
})();
