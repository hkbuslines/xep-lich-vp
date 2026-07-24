const WEEKDAY_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const els = {
  officeSelect: document.getElementById('officeSelect'),
  syncBadge: document.getElementById('syncBadge'),
  tabDayBtn: document.getElementById('tabDayBtn'),
  tabWeekBtn: document.getElementById('tabWeekBtn'),
  dayStripWrap: document.getElementById('dayStripWrap'),
  dayStrip: document.getElementById('dayStrip'),
  dayPrev: document.getElementById('dayPrev'),
  dayNext: document.getElementById('dayNext'),
  prevWeek: document.getElementById('prevWeek'),
  nextWeek: document.getElementById('nextWeek'),
  weekLabel: document.getElementById('weekLabel'),
  weekPicker: document.getElementById('weekPicker'),
  whoInput: document.getElementById('whoInput'),
  regenBtn: document.getElementById('regenBtn'),
  saveBtn: document.getElementById('saveBtn'),
  exportBtn: document.getElementById('exportBtn'),
  statusText: document.getElementById('statusText'),
  timeline: document.getElementById('timeline'),
  hintText: document.getElementById('hintText'),
};

let state = {
  office: null,
  monday: null,
  schedule: {}, // personId -> {name, title, teamId, days:[7]}
  dirty: false,
  unsub: null,
  viewMode: 'day', // 'day' | 'week' — mặc định "Theo ngày" để tiện xếp/sửa hằng ngày
  dayIdx: 0,
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

function renderWeekLabel() {
  const dates = weekDates(state.monday);
  const fmt = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  els.weekLabel.textContent = `Tuần ${fmt(dates[0])} – ${fmt(dates[6])}/${dates[6].getUTCFullYear()}`;
  els.weekPicker.value = isoDate(state.monday);
}

function renderDayStrip() {
  const dates = weekDates(state.monday);
  els.dayStrip.innerHTML = dates.map((d, i) => `
    <button class="day-pill${i === state.dayIdx ? ' active' : ''}" data-idx="${i}">
      <span class="day-pill-wd">${TL_WEEKDAY[i]}</span>
      <span class="day-pill-num">${String(d.getUTCDate()).padStart(2, '0')}</span>
    </button>
  `).join('');
  els.dayStrip.querySelectorAll('.day-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dayIdx = Number(btn.dataset.idx);
      renderView();
    });
  });
}

function renderView() {
  const isDay = state.viewMode === 'day';
  els.tabDayBtn.classList.toggle('active', isDay);
  els.tabWeekBtn.classList.toggle('active', !isDay);
  els.dayStripWrap.style.display = isDay ? 'flex' : 'none';

  if (isDay) {
    renderDayStrip();
    const dates = weekDates(state.monday);
    els.hintText.textContent = `Đang xếp lịch cho ${WEEKDAY_FULL[state.dayIdx]}, ${String(dates[state.dayIdx].getUTCDate()).padStart(2, '0')}/${String(dates[state.dayIdx].getUTCMonth() + 1).padStart(2, '0')}. Bấm vào 1 thanh ca để chọn ca khác, hoặc kéo-thả đổi chỗ ca giữa 2 người.`;
    renderDayTimeline(els.timeline, state.office, state.schedule, state.dayIdx, dates[state.dayIdx], {
      editable: true,
      onChange: onChangeShift,
      onSwap: onSwapShift,
    });
  } else {
    els.hintText.textContent = 'Bấm vào 1 thanh ca để chọn ca khác (kể cả đổi thành "Nghỉ"). Hoặc kéo-thả 1 thanh ca thả vào ô của người/ngày khác để đổi chỗ 2 ca cho nhau. Thanh mờ ở đầu ngày là phần ca đêm hôm trước vắt sang — muốn đổi thì bấm vào đúng ngày ca đó bắt đầu.';
    renderTimeline(els.timeline, state.office, state.schedule, weekDates(state.monday), {
      editable: true,
      onChange: onChangeShift,
      onSwap: onSwapShift,
    });
  }
}

function onChangeShift(personId, dayIdx, newCode) {
  state.schedule[personId].days[dayIdx] = newCode;
  markDirty();
  renderView();
}

function onSwapShift(personA, dayA, personB, dayB) {
  const a = state.schedule[personA].days;
  const b = state.schedule[personB].days;
  const tmp = a[dayA];
  a[dayA] = b[dayB];
  b[dayB] = tmp;
  markDirty();
  renderView();
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
  renderView();
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

// Lùi/tiến đúng 1 ngày, tự nhảy sang tuần trước/sau nếu vượt biên (giống day-strip liên tục của bản gốc).
function shiftDay(delta) {
  let idx = state.dayIdx + delta;
  if (idx < 0) {
    state.dayIdx = 6;
    shiftWeek(-7);
  } else if (idx > 6) {
    state.dayIdx = 0;
    shiftWeek(7);
  } else {
    state.dayIdx = idx;
    renderView();
  }
}

function switchViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  renderView();
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
  const today = todayUTC();
  state.monday = mondayOf(wParam ? parseISODate(wParam) : today);
  setUrl();
  // Mặc định mở đúng ngày hôm nay nếu tuần đang xem chứa hôm nay, ngược lại mở Thứ 2.
  const todayOffset = Math.round((today - state.monday) / 86400000);
  state.dayIdx = (todayOffset >= 0 && todayOffset <= 6) ? todayOffset : 0;

  els.whoInput.value = localStorage.getItem('xeplich:who') || '';
  els.whoInput.addEventListener('input', () => localStorage.setItem('xeplich:who', els.whoInput.value));

  els.tabDayBtn.addEventListener('click', () => switchViewMode('day'));
  els.tabWeekBtn.addEventListener('click', () => switchViewMode('week'));
  els.dayPrev.addEventListener('click', () => shiftDay(-1));
  els.dayNext.addEventListener('click', () => shiftDay(1));

  els.prevWeek.addEventListener('click', () => shiftWeek(-7));
  els.nextWeek.addEventListener('click', () => shiftWeek(7));
  els.weekPicker.addEventListener('change', () => {
    if (!els.weekPicker.value) return;
    state.monday = mondayOf(parseISODate(els.weekPicker.value));
    setUrl();
    loadWeek();
  });
  els.regenBtn.addEventListener('click', () => {
    if (state.dirty && !confirm('Tạo lại gợi ý sẽ ghi đè các thay đổi chưa lưu. Tiếp tục?')) return;
    state.schedule = suggestWeekSchedule(state.office, state.monday);
    markDirty();
    renderView();
  });
  els.saveBtn.addEventListener('click', saveWeek);
  els.exportBtn.addEventListener('click', async () => {
    els.exportBtn.disabled = true;
    els.exportBtn.textContent = 'Đang tạo file…';
    try {
      await exportWeekExcel(state.office, state.schedule, state.monday);
    } finally {
      els.exportBtn.disabled = false;
      els.exportBtn.textContent = '📥 Xuất Excel';
    }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  loadWeek();
}

init();
