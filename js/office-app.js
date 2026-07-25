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
  regenBtn: document.getElementById('regenBtn'),
  saveBtn: document.getElementById('saveBtn'),
  exportBtn: document.getElementById('exportBtn'),
  exportMonth: document.getElementById('exportMonth'),
  exportFromDay: document.getElementById('exportFromDay'),
  exportToDay: document.getElementById('exportToDay'),
  exportMonthBtn: document.getElementById('exportMonthBtn'),
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
    els.hintText.textContent = `Đang xếp lịch cho ${WEEKDAY_FULL[state.dayIdx]}, ${String(dates[state.dayIdx].getUTCDate()).padStart(2, '0')}/${String(dates[state.dayIdx].getUTCMonth() + 1).padStart(2, '0')}. Kéo 2 đầu thanh ca để tăng/giảm giờ, kéo giữa để dời cả ca, bấm × để xoá, bấm + để thêm ca. Bấm giữa thanh (không kéo) để đổi hẳn sang ca khác.`;
    renderDayTimeline(els.timeline, state.office, state.schedule, state.dayIdx, dates[state.dayIdx], {
      editable: true,
      onChange: onChangeShift,
      onAddSegment,
      onRemoveSegment,
      onResizeLive,
      onResizeEnd: () => renderView(),
      notesEditable: state.office.id === 'tongdai', // chia việc theo ca — chỉ Tổng Đài 96 Võ Chí Công
      getNote: (personId, dIdx) => (state.schedule[personId].notes || [])[dIdx] || '',
      onNoteChange,
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
  state.schedule[personId].ranges[dayIdx] = null; // đổi hẳn sang ca khác -> quay về giờ mặc định của ca đó
  markDirty();
  renderView();
}

function onSwapShift(personA, dayA, personB, dayB) {
  const a = state.schedule[personA];
  const b = state.schedule[personB];
  const tmpCode = a.days[dayA]; a.days[dayA] = b.days[dayB]; b.days[dayB] = tmpCode;
  const tmpRanges = a.ranges[dayA]; a.ranges[dayA] = b.ranges[dayB]; b.ranges[dayB] = tmpRanges;
  markDirty();
  renderView();
}

// Thêm 1 khối giờ: nếu ngày đó đang "Nghỉ" thì gán hẳn thành ca mới (giống bấm đổi ca); nếu đã có ca
// làm việc rồi thì THÊM 1 khối giờ nữa (lấy khung giờ mặc định của ca vừa chọn), giữ nguyên mã ca/màu
// gốc của ngày đó — dùng cho ca gãy/tăng ca thêm 1 đoạn, giống nút "+" trong file HTML gốc.
function onAddSegment(personId, dayIdx, newCode) {
  const person = state.schedule[personId];
  const currentCode = person.days[dayIdx];
  const hadCustom = !!(person.ranges[dayIdx] && person.ranges[dayIdx].length);
  if (currentCode === REST_CODE && !hadCustom) {
    person.days[dayIdx] = newCode;
    person.ranges[dayIdx] = null;
  } else {
    const base = effectiveRanges(state.office, currentCode, person.ranges[dayIdx]);
    const newDef = shiftDefFor(state.office, newCode);
    const newSegs = newCode === REST_CODE ? [[0, 24]] : parseHoursSegments(newDef.hours);
    person.ranges[dayIdx] = [...base, newSegs[0]];
  }
  markDirty();
  renderView();
}

// Xoá 1 khối giờ. Nếu xoá hết sạch (không còn khối nào), coi như cả ngày đó nghỉ.
function onRemoveSegment(personId, dayIdx, segIdx) {
  const person = state.schedule[personId];
  const base = effectiveRanges(state.office, person.days[dayIdx], person.ranges[dayIdx]);
  base.splice(segIdx, 1);
  if (base.length === 0) {
    person.days[dayIdx] = REST_CODE;
    person.ranges[dayIdx] = null;
  } else {
    person.ranges[dayIdx] = base;
  }
  markDirty();
  renderView();
}

// Gọi liên tục trong lúc đang kéo-giãn/di chuyển (mỗi lần chuột nhích) — chỉ ghi state, KHÔNG vẽ lại
// UI (đắt) — js/timeline.js tự cập nhật vị trí thanh + biểu đồ trực tiếp trong lúc kéo.
function onResizeLive(personId, dayIdx, segIdx, newS, newE) {
  const person = state.schedule[personId];
  const base = effectiveRanges(state.office, person.days[dayIdx], person.ranges[dayIdx]);
  base[segIdx] = [newS, newE];
  person.ranges[dayIdx] = base;
  if (!state.dirty) markDirty();
}

function markDirty() {
  state.dirty = true;
  els.statusText.textContent = 'Có thay đổi chưa lưu';
  els.statusText.className = 'status-text dirty';
}

// Số ngày của "YYYY-MM" (giá trị input type=month) — dùng để giới hạn 2 ô "Từ ngày"/"Đến ngày" luôn
// nằm trong đúng tháng đã chọn (vd không cho chọn ngày 30 khi đang ở tháng 2).
function daysInMonthOf(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampExportDayBounds() {
  const n = daysInMonthOf(els.exportMonth.value);
  els.exportFromDay.max = n; els.exportToDay.max = n;
  if (Number(els.exportFromDay.value) > n || !els.exportFromDay.value) els.exportFromDay.value = n;
  if (Number(els.exportToDay.value) > n || !els.exportToDay.value) els.exportToDay.value = n;
}

// Lịch lưu từ trước khi có tính năng kéo-giãn giờ có thể chưa có field `ranges` — bổ sung cho đủ 7 ô
// null để buildDaySegments/effectiveRanges không bị lỗi thiếu dữ liệu.
function normalizeSchedule(schedule) {
  Object.values(schedule).forEach(p => {
    if (!Array.isArray(p.ranges)) p.ranges = new Array(7).fill(null);
    if (!Array.isArray(p.notes)) p.notes = new Array(7).fill('');
  });
  return schedule;
}

// Ghi chú chia việc theo từng người/ngày — chỉ hiện ở tab "Theo ngày" cho văn phòng nào bật
// notesEditable (hiện chỉ Tổng Đài 96 Võ Chí Công, xem renderView()). KHÔNG renderView() lại ở đây
// (khác các onXxx khác) để không mất focus/con trỏ đang gõ dở trong ô input mỗi lần gõ phím.
function onNoteChange(personId, dayIdx, value) {
  state.schedule[personId].notes[dayIdx] = value;
  if (!state.dirty) markDirty();
}

async function loadWeek() {
  const weekId = isoDate(state.monday);
  if (state.unsub) { state.unsub(); state.unsub = null; }
  els.statusText.textContent = 'Đang tải…';
  const saved = await StorageAPI.loadWeek(state.office.id, weekId);
  if (saved && saved.assignments) {
    state.schedule = normalizeSchedule(saved.assignments);
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
  const origLabel = els.saveBtn.textContent;
  els.saveBtn.textContent = 'Đang lưu…';
  try {
    await StorageAPI.saveWeek(state.office.id, weekId, state.schedule, {});
    state.dirty = false;
    els.statusText.textContent = `Đã lưu lúc ${new Date().toLocaleString('vi-VN')}`;
    els.statusText.className = 'status-text';
  } catch (err) {
    console.error(err);
    els.statusText.textContent = 'Lưu thất bại: ' + err.message;
    els.statusText.className = 'status-text dirty';
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = origLabel;
  }
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
      els.exportBtn.textContent = '📥 Xuất Excel tuần';
    }
  });

  // Chọn THÁNG trước (quyết định "THÁNG MM/YYYY" trên tiêu đề file xuất), rồi chọn ngày bắt đầu/kết
  // thúc TRONG đúng tháng đó — mặc định cả tháng chứa tuần đang xem (ngày 1 -> ngày cuối tháng),
  // người dùng thu hẹp lại 2 ô ngày nếu chỉ cần xuất 1 phần của tháng.
  els.exportMonth.value = isoDate(state.monday).slice(0, 7);
  els.exportFromDay.value = 1;
  els.exportToDay.value = daysInMonthOf(els.exportMonth.value);
  els.exportMonth.addEventListener('change', () => {
    if (!els.exportMonth.value) return;
    clampExportDayBounds();
  });
  els.exportMonthBtn.addEventListener('click', async () => {
    if (!els.exportMonth.value || !els.exportFromDay.value || !els.exportToDay.value) {
      alert('Chọn tháng và ngày cần xuất trước đã.'); return;
    }
    clampExportDayBounds();
    const [y, m] = els.exportMonth.value.split('-').map(Number);
    const fromDate = new Date(Date.UTC(y, m - 1, Number(els.exportFromDay.value)));
    const toDate = new Date(Date.UTC(y, m - 1, Number(els.exportToDay.value)));
    if (fromDate > toDate) { alert('"Từ ngày" phải trước hoặc trùng "Đến ngày".'); return; }
    els.exportMonthBtn.disabled = true;
    els.exportMonthBtn.textContent = 'Đang gộp lịch…';
    try {
      await exportRangeExcel(state.office, fromDate, toDate);
    } catch (err) {
      console.error(err);
      alert('Xuất file bị lỗi: ' + err.message);
    } finally {
      els.exportMonthBtn.disabled = false;
      els.exportMonthBtn.textContent = '📊 Xuất Lịch + Chấm công';
    }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  loadWeek();
}

init();
