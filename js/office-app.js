const WEEKDAY_VN = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const els = {
  officeSelect: document.getElementById('officeSelect'),
  syncBadge: document.getElementById('syncBadge'),
  prevWeek: document.getElementById('prevWeek'),
  nextWeek: document.getElementById('nextWeek'),
  weekLabel: document.getElementById('weekLabel'),
  weekPicker: document.getElementById('weekPicker'),
  whoInput: document.getElementById('whoInput'),
  regenBtn: document.getElementById('regenBtn'),
  saveBtn: document.getElementById('saveBtn'),
  statusText: document.getElementById('statusText'),
  legend: document.getElementById('legend'),
  grid: document.getElementById('scheduleGrid'),
};

let state = {
  office: null,
  monday: null,
  schedule: {}, // personId -> {name, title, teamId, days:[7]}
  dirty: false,
  unsub: null,
};

function qs() { return new URLSearchParams(location.search); }

function setUrl() {
  const p = qs();
  p.set('o', state.office.id);
  p.set('w', isoDate(state.monday));
  history.replaceState(null, '', '?' + p.toString());
}

function initOfficeSelect() {
  els.officeSelect.innerHTML = OFFICES.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  els.officeSelect.addEventListener('change', () => {
    location.href = `office.html?o=${els.officeSelect.value}&w=${isoDate(state.monday)}`;
  });
}

function renderLegend() {
  const defs = [...state.office.shiftDefs, REST_DEF];
  els.legend.innerHTML = defs.map(d =>
    `<span class="chip-legend" style="--c:${d.color}"><b>${d.code}</b> ${d.name}${d.hours ? ' · ' + d.hours : ''}</span>`
  ).join('');
}

function renderWeekLabel() {
  const dates = weekDates(state.monday);
  const fmt = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  els.weekLabel.textContent = `Tuần ${fmt(dates[0])} – ${fmt(dates[6])}/${dates[6].getUTCFullYear()}`;
  els.weekPicker.value = isoDate(state.monday);
}

function personRows() {
  const rows = [];
  for (const team of state.office.teams) {
    for (const p of team.people) rows.push({ personId: p.id, teamId: team.id });
  }
  return rows;
}

function renderGrid() {
  const dates = weekDates(state.monday);
  let teamSeen = null;
  let html = '<thead><tr><th class="name-col">Nhân sự</th>';
  dates.forEach((d, i) => {
    html += `<th>${WEEKDAY_VN[i]}<br><span class="date-sub">${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  for (const row of personRows()) {
    const person = state.schedule[row.personId];
    if (!person) continue;
    if (row.teamId !== teamSeen) {
      teamSeen = row.teamId;
      html += `<tr class="team-row"><td colspan="8">${row.teamId}</td></tr>`;
    }
    html += `<tr><td class="name-col">${person.name}${person.title ? `<br><span class="title-sub">${person.title}</span>` : ''}</td>`;
    person.days.forEach((code, dayIdx) => {
      const def = shiftDefFor(state.office, code);
      html += `<td class="cell" data-person="${row.personId}" data-day="${dayIdx}" draggable="true" style="--c:${def.color}">
        <span class="chip">${def.code}</span>
      </td>`;
    });
    html += '</tr>';
  }
  html += '</tbody>';
  els.grid.innerHTML = html;
  wireCellEvents();
}

function wireCellEvents() {
  const cells = els.grid.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ p: cell.dataset.person, d: cell.dataset.day }));
      cell.classList.add('dragging');
    });
    cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
    cell.addEventListener('dragover', e => e.preventDefault());
    cell.addEventListener('drop', e => {
      e.preventDefault();
      const src = JSON.parse(e.dataTransfer.getData('text/plain'));
      const dst = { p: cell.dataset.person, d: cell.dataset.day };
      if (src.p === dst.p && src.d === dst.d) return;
      swapCells(src, dst);
    });
    cell.addEventListener('click', () => openPicker(cell));
  });
}

function swapCells(src, dst) {
  const a = state.schedule[src.p].days;
  const b = state.schedule[dst.p].days;
  const tmp = a[src.d];
  a[src.d] = b[dst.d];
  b[dst.d] = tmp;
  markDirty();
  renderGrid();
}

function openPicker(cell) {
  const personId = cell.dataset.person;
  const dayIdx = Number(cell.dataset.day);
  const defs = [...state.office.shiftDefs, REST_DEF];
  const select = document.createElement('select');
  select.className = 'inline-picker';
  defs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.code;
    opt.textContent = `${d.code} — ${d.name}`;
    if (d.code === state.schedule[personId].days[dayIdx]) opt.selected = true;
    select.appendChild(opt);
  });
  cell.innerHTML = '';
  cell.appendChild(select);
  select.focus();
  const commit = () => {
    state.schedule[personId].days[dayIdx] = select.value;
    markDirty();
    renderGrid();
  };
  select.addEventListener('change', commit);
  select.addEventListener('blur', () => renderGrid());
}

function markDirty() {
  state.dirty = true;
  els.statusText.textContent = 'Có thay đổi chưa lưu';
  els.statusText.className = 'status-text dirty';
}

async function loadWeek() {
  const weekId = isoDate(state.monday);
  if (state.unsub) { state.unsub(); state.unsub = null; }
  els.statusText.textContent = 'Đang tải…';
  const saved = await StorageAPI.loadWeek(state.office.id, weekId);
  if (saved && saved.assignments) {
    state.schedule = saved.assignments;
    els.statusText.textContent = `Đã lưu lúc ${new Date(saved.updatedAt).toLocaleString('vi-VN')}${saved.updatedBy ? ' bởi ' + saved.updatedBy : ''}`;
    els.statusText.className = 'status-text';
  } else {
    state.schedule = suggestWeekSchedule(state.office, state.monday);
    els.statusText.textContent = 'Chưa có lịch đã lưu — đang hiện gợi ý tự động, bấm Lưu để chốt.';
    els.statusText.className = 'status-text dirty';
  }
  state.dirty = false;
  renderWeekLabel();
  renderLegend();
  renderGrid();
}

async function saveWeek() {
  const weekId = isoDate(state.monday);
  els.saveBtn.disabled = true;
  await StorageAPI.saveWeek(state.office.id, weekId, state.schedule, { updatedBy: els.whoInput.value.trim() });
  els.saveBtn.disabled = false;
  state.dirty = false;
  els.statusText.textContent = `Đã lưu lúc ${new Date().toLocaleString('vi-VN')}${els.whoInput.value ? ' bởi ' + els.whoInput.value : ''}`;
  els.statusText.className = 'status-text';
}

function shiftWeek(deltaDays) {
  const d = new Date(state.monday);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  state.monday = mondayOf(d);
  setUrl();
  loadWeek();
}

function init() {
  initOfficeSelect();
  els.syncBadge.textContent = StorageAPI.mode === 'firebase' ? '🔥 Đồng bộ Firebase' : '💻 Chế độ cục bộ (chưa cấu hình Firebase)';
  els.syncBadge.title = StorageAPI.mode === 'firebase'
    ? 'Lịch được đồng bộ real-time giữa các văn phòng qua Firestore.'
    : 'Chưa điền js/firebase-config.js — lịch chỉ lưu trong trình duyệt này, không đồng bộ. Xem README.md.';

  const p = qs();
  const officeId = p.get('o') || OFFICES[0].id;
  state.office = getOffice(officeId) || OFFICES[0];
  els.officeSelect.value = state.office.id;

  const wParam = p.get('w');
  state.monday = mondayOf(wParam ? new Date(wParam + 'T00:00:00Z') : new Date());
  setUrl();

  els.whoInput.value = localStorage.getItem('xeplich:who') || '';
  els.whoInput.addEventListener('input', () => localStorage.setItem('xeplich:who', els.whoInput.value));

  els.prevWeek.addEventListener('click', () => shiftWeek(-7));
  els.nextWeek.addEventListener('click', () => shiftWeek(7));
  els.weekPicker.addEventListener('change', () => {
    if (!els.weekPicker.value) return;
    state.monday = mondayOf(new Date(els.weekPicker.value + 'T00:00:00Z'));
    setUrl();
    loadWeek();
  });
  els.regenBtn.addEventListener('click', () => {
    if (state.dirty && !confirm('Tạo lại gợi ý sẽ ghi đè các thay đổi kéo-thả chưa lưu. Tiếp tục?')) return;
    state.schedule = suggestWeekSchedule(state.office, state.monday);
    markDirty();
    renderGrid();
  });
  els.saveBtn.addEventListener('click', saveWeek);

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  loadWeek();
}

init();
