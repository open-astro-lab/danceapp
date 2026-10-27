/**
 * Dance Class Manager
 * Batches:
 *  - mwf: Mon / Wed / Fri
 *  - tts: Tue / Thu / Sat
 *  - zumba: Tue / Wed / Thu / Fri
 *
 * "Advance 1 class day" moves fees date to the next class day for that batch
 * (not +1 calendar day). Weekend gaps are handled correctly.
 */

const STORAGE_KEY = 'dance-class-manager-v1';

const BATCHES = {
  mwf: {
    id: 'mwf',
    title: 'Monday · Wednesday · Friday',
    // JS getDay(): 0 Sun ... 6 Sat
    classDays: [1, 3, 5], // Mon, Wed, Fri
  },
  tts: {
    id: 'tts',
    title: 'Tuesday · Thursday · Saturday',
    classDays: [2, 4, 6], // Tue, Thu, Sat
  },
  zumba: {
    id: 'zumba',
    title: 'Zumba (Ladies) — Tue · Wed · Thu · Fri',
    classDays: [2, 3, 4, 5], // Tue–Fri
  },
};

/** @type {{ mwf: Student[], tts: Student[], zumba: Student[] }} */
let data = { mwf: [], tts: [], zumba: [] };
let currentBatch = null;
let editIndex = null; // null = add mode
let openMenuIndex = null;

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    data = {
      mwf: Array.isArray(parsed.mwf) ? parsed.mwf : [],
      tts: Array.isArray(parsed.tts) ? parsed.tts : [],
      zumba: Array.isArray(parsed.zumba) ? parsed.zumba : [],
    };
  } catch (e) {
    console.warn('Load failed', e);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  toast('Saved ✓');
  updateHomeCounts();
  renderDueBanner();
}

// ---------- date helpers ----------
function parseISO(iso) {
  // local date from YYYY-MM-DD
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
  const d = parseISO(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Advance to the next class day for this batch (strictly after the given date).
 * Examples (MWF): Fri → Mon (+3). Wed → Fri (+2).
 * Examples (TTS): Sat → Tue (+3). Tue → Thu (+2).
 * Examples (Zumba Tue–Fri): Fri → Tue (+4).
 */
function nextClassDay(iso, classDays) {
  const d = parseISO(iso);
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if (classDays.includes(d.getDay())) {
      return toISO(d);
    }
  }
  // fallback (should not happen)
  d.setDate(d.getDate() + 1);
  return toISO(d);
}

function advanceAllOneClassDay(batchId) {
  const days = BATCHES[batchId].classDays;
  data[batchId] = data[batchId].map((s) => ({
    ...s,
    feesDate: nextClassDay(s.feesDate, days),
  }));
}

// ---------- UI helpers ----------
function $(id) {
  return document.getElementById(id);
}

function toast(msg, isError) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
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

/**
 * Fees due "today" means the calendar day-of-month of feesDate equals today's day-of-month
 * AND we are in a later month/year than the stored fees date's month
 * OR the stored fees date is exactly today.
 *
 * Simpler rule matching the request:
 * Show student if feesDate's day-of-month === today's day-of-month
 * (monthly anniversary). Also show if feesDate === today exactly.
 *
 * Even clearer for the teacher:
 * Show if the day number matches today (e.g. 27th every month),
 * so on Nov 27, anyone with fees date *27 of any month* appears.
 */
function isFeesDueToday(feesISO) {
  if (!feesISO) return false;
  const fees = parseISO(feesISO);
  const now = new Date();
  // exact match on day-of-month (monthly cycle)
  return fees.getDate() === now.getDate();
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
        `<li><strong>${escapeHtml(d.name)}</strong> — ${escapeHtml(d.batch)} (fees date ${formatDisplay(d.feesDate)})</li>`
    )
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ---------- modal ----------
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
  closeModal();
  openMenuIndex = null;
  renderTable();
  toast(editIndex === null ? 'Student added (tap Save)' : 'Student updated (tap Save)');
}

// ---------- navigation ----------
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

// ---------- events ----------
function bind() {
  document.querySelectorAll('.batch-card').forEach((btn) => {
    btn.addEventListener('click', () => openBatch(btn.dataset.batch));
  });

  $('btn-back').addEventListener('click', goHome);
  $('btn-save').addEventListener('click', () => {
    save();
  });
  $('btn-add').addEventListener('click', () => openModal('add'));
  $('btn-advance').addEventListener('click', () => {
    if (!currentBatch) return;
    if (!data[currentBatch].length) {
      toast('No students to update', true);
      return;
    }
    const ok = confirm(
      'Advance every student\'s fees date by ONE class day for this batch?\n\n' +
        'This jumps to the next class day (skips days with no class, including weekend gaps).\n\n' +
        'Remember to tap Save afterwards.'
    );
    if (!ok) return;
    advanceAllOneClassDay(currentBatch);
    openMenuIndex = null;
    renderTable();
    toast('All fees dates advanced by 1 class day (tap Save)');
  });

  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-ok').addEventListener('click', submitModal);
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // table delegation
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
        openMenuIndex = null;
        renderTable();
        toast('Removed (tap Save)');
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
      renderTable();
    }
  });
}

// ---------- init ----------
load();
bind();
updateHomeCounts();
renderDueBanner();
showView('home');
