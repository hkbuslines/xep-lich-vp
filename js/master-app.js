const mEls = {
  syncBadge: document.getElementById('syncBadge'),
  prevWeek: document.getElementById('prevWeek'),
  nextWeek: document.getElementById('nextWeek'),
  weekLabel: document.getElementById('weekLabel'),
  weekPicker: document.getElementById('weekPicker'),
  refreshBtn: document.getElementById('refreshBtn'),
  wrap: document.getElementById('officesWrap'),
};

let mMonday = mondayOf(todayUTC());
let unsubs = [];

function mQs() { return new URLSearchParams(location.search); }
function mSetUrl() {
  const p = mQs();
  p.set('w', isoDate(mMonday));
  history.replaceState(null, '', '?' + p.toString());
}

function renderWeekLabel() {
  const dates = weekDates(mMonday);
  const fmt = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  mEls.weekLabel.textContent = `Tuần ${fmt(dates[0])} – ${fmt(dates[6])}/${dates[6].getUTCFullYear()}`;
  mEls.weekPicker.value = isoDate(mMonday);
}

function officeCardSkeleton() {
  mEls.wrap.innerHTML = OFFICES.map(o => `
    <section class="office-card" data-office="${o.id}">
      <h2><a href="office.html?o=${o.id}&w=${isoDate(mMonday)}">${o.name} →</a></h2>
      <div class="office-meta" id="meta-${o.id}">Đang tải…</div>
      <div class="timeline-wrap"><div id="timeline-${o.id}"></div></div>
    </section>
  `).join('');
}

function renderOfficeTimeline(office, schedule, meta) {
  const root = document.getElementById(`timeline-${office.id}`);
  const metaEl = document.getElementById(`meta-${office.id}`);
  if (!root) return;
  metaEl.textContent = meta && meta.updatedAt
    ? `Đã lưu lúc ${new Date(meta.updatedAt).toLocaleString('vi-VN')}${meta.updatedBy ? ' bởi ' + meta.updatedBy : ''}`
    : (office.manualOnly ? 'Chưa có lịch đã lưu cho tuần này — sheet đang để trống.' : 'Chưa có lịch đã lưu cho tuần này — đang hiện gợi ý tự động.');
  renderTimeline(root, office, schedule, weekDates(mMonday), { editable: false });
}

function loadOffice(office) {
  const weekId = isoDate(mMonday);
  const unsub = StorageAPI.subscribeWeek(office.id, weekId, (saved) => {
    if (saved && saved.assignments) {
      renderOfficeTimeline(office, saved.assignments, saved);
    } else {
      renderOfficeTimeline(office, office.manualOnly ? blankWeekSchedule(office) : suggestWeekSchedule(office, mMonday), null);
    }
  });
  unsubs.push(unsub);
}

function loadAll() {
  unsubs.forEach(u => u && u());
  unsubs = [];
  officeCardSkeleton();
  OFFICES.forEach(loadOffice);
}

function shiftWeek(deltaDays) {
  const d = new Date(mMonday);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  mMonday = mondayOf(d);
  mSetUrl();
  renderWeekLabel();
  loadAll();
}

function init() {
  mEls.syncBadge.textContent = StorageAPI.mode === 'firebase' ? '🔥 Đồng bộ Firebase (real-time)' : '💻 Chế độ cục bộ (chưa cấu hình Firebase)';
  mEls.syncBadge.title = StorageAPI.mode === 'firebase'
    ? 'Trang này tự cập nhật khi bất kỳ văn phòng nào lưu lịch.'
    : 'Chưa điền js/firebase-config.js — trang này chỉ thấy lịch lưu trên CHÍNH trình duyệt này. Xem README.md để bật đồng bộ thật.';

  const p = mQs();
  const wParam = p.get('w');
  mMonday = mondayOf(wParam ? parseISODate(wParam) : todayUTC());
  mSetUrl();
  renderWeekLabel();

  mEls.prevWeek.addEventListener('click', () => shiftWeek(-7));
  mEls.nextWeek.addEventListener('click', () => shiftWeek(7));
  mEls.refreshBtn.addEventListener('click', loadAll);
  mEls.weekPicker.addEventListener('change', () => {
    if (!mEls.weekPicker.value) return;
    mMonday = mondayOf(parseISODate(mEls.weekPicker.value));
    mSetUrl();
    renderWeekLabel();
    loadAll();
  });

  loadAll();
}

init();
