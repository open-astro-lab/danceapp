/**
 * Dance Class Manager — shared data for everyone (via /api/data on Vercel).
 * Batches: mwf (Mon/Wed/Fri), tts (Tue/Thu/Sat), zumba (Tue–Fri)
 */

const BATCHES = {
  mwf: {
    id: 'mwf',
    title: 'Monday · Wednesday · Friday',
    classDays: [1, 3, 5],
  },
  tts: {
    id: 'tts',
    title: 'Tuesday · Thursday · Saturday',
    classDays: [2, 4, 6],
  },
  zumba: {
    id: 'zumba',
    title: 'Zumba (Ladies) — Tue · Wed · Thu · Fri',
    classDays: [2, 3, 4, 5],
  },
};

let data = { mwf: [], tts: [], zumba: [] };
let dataSha = null;
let currentBatch = null;
let editIndex = null;
let openMenuIndex = null;
let dirty = false;

function $(id) {
  return document.getElementById(id);
}

function toast(msg, isError) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

function setStatus(text, kind) {
  const el = $('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (kind ? ' ' + kind : '');
}

// ---------- dates ----------
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
  const fees = parseISO(feesISO);
  const now = new Date();
  return fees.getDate() === now.getDate();
}

// ---------- API (shared for everyone) ----------
async function loadFromServer() {
  setStatus('Loading…', '');
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Failed to load');
    }
    data = json.data || { mwf: [], tts: [], zumba: [] };
    dataSha = json.sha || null;
    dirty = false;
    setStatus('Synced — same list for everyone', 'ok');
    return true;
  } catch (e) {
    console.error(e);
    setStatus('Could not load shared data. Check Vercel setup.', 'err');
    toast(e.message || 'Load failed', true);
    return false;
  }
}

async function saveToServer() {
  setStatus('Saving…', '');
  $('btn-save').disabled = true;
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, sha: dataSha }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Save failed');
    }
    data = json.data || data;
    dataSha = json.sha || dataSha;
    dirty = false;
    setStatus('Saved — everyone will see this', 'ok');
    toast('Saved for everyone ✓');
    updateHomeCounts();
    renderDueBanner();
    return true;
  } catch (e) {
    console.error(e);
    setStatus('Save failed', 'err');
    toast(e.message || 'Save failed', true);
    return false;
  } finally {
    $('btn-save').disabled = false;
  }
}

// ---------- UI ----------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showView(name) {
  $('view-home').classList.toggle('hidden', name !== 'home');
  $('view-batch').classList.toggle('hidden', name !== 'batch');
}

function updateHomeCounts() {
  for (const id of ['mwf', 'tts', 'zumba']) {
    const n = data[id].length;
    const el = $('count-' + id);
    if (id === 'zumba') {
      el.textContent = `${n} student${n === 1 ? '' : 's'} · Tue–Fri`;
    } else {
      el.textContent = `${n} student${n === 1 ? '' : 's'}`;
    }
  }
}

function renderDueBanner() {
  const due = [];
  for (const [batchId, students] of Object.entries(data)) {
    const title = BATCHES[batchId].title;
    students.forEach((s) => {
      if (isFeesDueToday(s.feesDate)) {
        due.push({ name: s.name, batch: title, feesDate: s.feesDate });
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
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.name)}</strong> — ${escapeHtml(d.batch)} (${formatDisplay(d.feesDate)})</li>`
    )
    .join('');
}

function renderTable() {
  const tbody = $('student-tbody');
  const students = data[currentBatch] || [];
  $('empty-msg').classList.toggle('hidden', students.length > 0);

  tbody.innerHTML = students
    .map((s, i) => {
      const due = isFeesDueToday(s.feesDate);
      return `
      <tr class="clickable ${due ? 'fees-due' : ''}" data-index="${i}">
        <td>${i + 1}</td>
        <td class="name-cell">${escapeHtml(s.name)}</td>
        <td class="fees-cell">${formatDisplay(s.feesDate)}</td>
        <td class="actions">
          <div class="menu-wrap">
            <button type="button" class="btn ghost sm btn-menu" data-menu="${i}" aria-label="More">⋯</button>
            <div class="menu ${openMenuIndex === i ? '' : 'hidden'}" data-menu-panel="${i}">
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
  if (!name) {
    toast('Please enter a student name', true);
    return;
  }
  if (!feesDate) {
    toast('Please choose a fees date', true);
    return;
  }
  if (editIndex === null) {
    data[currentBatch].push({ name, feesDate });
  } else {
    data[currentBatch][editIndex] = { name, feesDate };
  }
  dirty = true;
  closeModal();
  openMenuIndex = null;
  renderTable();
  updateHomeCounts();
  toast('Changed — tap Save so everyone sees it');
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
  $('btn-save').addEventListener('click', () => saveToServer());
  $('btn-refresh').addEventListener('click', async () => {
    await loadFromServer();
    updateHomeCounts();
    renderDueBanner();
    if (currentBatch) renderTable();
    toast('Refreshed');
  });
  $('btn-add').addEventListener('click', () => openModal('add'));
  $('btn-advance').addEventListener('click', () => {
    if (!currentBatch) return;
    if (!data[currentBatch].length) {
      toast('No students to update', true);
      return;
    }
    const ok = confirm(
      "Advance every student's fees date by ONE class day for this batch?\n\n" +
        'Skips days with no class (including weekend gaps).\n\n' +
        'Tap Save afterwards so everyone sees the new dates.'
    );
    if (!ok) return;
    advanceAllOneClassDay(currentBatch);
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
      const name = data[currentBatch][i]?.name || 'this student';
      if (confirm(`Remove ${name}?`)) {
        data[currentBatch].splice(i, 1);
        dirty = true;
        openMenuIndex = null;
        renderTable();
        updateHomeCounts();
        toast('Removed — tap Save');
      }
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

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

(async function init() {
  bind();
  showView('home');
  await loadFromServer();
  updateHomeCounts();
  renderDueBanner();
})();
