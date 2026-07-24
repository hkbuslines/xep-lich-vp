const WEEKDAY_VN_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const mEls = {
  syncBadge: document.getElementById('syncBadge'),
  prevWeek: document.getElementById('prevWeek'),
  nextWeek: document.getElementById('nextWeek'),
  weekLabel: document.getElementById('weekLabel'),
  weekPicker: document.getElementById('weekPicker'),
  refreshBtn: document.getElementById('refreshBtn'),
  wrap: document.getElementById('officesWrap'),
};

let mMonday = mondayOf(new Date());
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
  const dates = weekDates(mMonday);
  mEls.wrap.innerHTML = OFFICES.map(o => `
    <section class="office-card" data-office="${o.id}">
      <h2><a href="office.html?o=${o.id}&w=${isoDate(mMonday)}">${o.name} →</a></h2>
      <div class="office-meta" id="meta-${o.id}">Đang tải…</div>
      <div class="master-grid-wrap">
        <table class="schedule-grid">
          <thead><tr><th class="name-col">Nhân sự</th>${dates.map((d, i) =>
            `<th>${WEEKDAY_VN_SHORT[i]}<br><span class="date-sub">${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}</span></th>`).join('')}</tr></thead>
          <tbody id="body-${o.id}"></tbody>
        </table>
      </div>
    </section>
  `).join('');
}

function renderOfficeBody(office, schedule, meta) {
  const tbody = document.getElementById(`body-${office.id}`);
  const metaEl = document.getElementById(`meta-${office.id}`);
  if (!tbody) return;
  metaEl.textContent = meta && meta.updatedAt
    ? `Đã lưu lúc ${new Date(meta.updatedAt).toLocaleString('vi-VN')}${meta.updatedBy ? ' bởi ' + meta.updatedBy : ''}`
    : 'Chưa có lịch đã lưu cho tuần này — đang hiện gợi ý tự động.';

  let teamSeen = null;
  let html = '';
  for (const team of office.teams) {
    for (const p of team.people) {
      const person = schedule[p.id];
      if (!person) continue;
      if (team.id !== teamSeen) {
        teamSeen = team.id;
        html += `<tr class="team-row"><td colspan="8">${team.id}</td></tr>`;
      }
      html += `<tr><td class="name-col">${person.name}${person.title ? `<br><span class="title-sub">${person.title}</span>` : ''}</td>`;
      person.days.forEach(code => {
        const def = shiftDefFor(office, code);
        html += `<td class="cell" style="--c:${def.color}"><span class="chip">${def.code}</span></td>`;
      });
      html += '</tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadOffice(office) {
  const weekId = isoDate(mMonday);
  const unsub = StorageAPI.subscribeWeek(office.id, weekId, (saved) => {
    if (saved && saved.assignments) {
      renderOfficeBody(office, saved.assignments, saved);
    } else {
      renderOfficeBody(office, suggestWeekSchedule(office, mMonday), null);
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
  mMonday = mondayOf(wParam ? new Date(wParam + 'T00:00:00Z') : new Date());
  mSetUrl();
  renderWeekLabel();

  mEls.prevWeek.addEventListener('click', () => shiftWeek(-7));
  mEls.nextWeek.addEventListener('click', () => shiftWeek(7));
  mEls.refreshBtn.addEventListener('click', loadAll);
  mEls.weekPicker.addEventListener('change', () => {
    if (!mEls.weekPicker.value) return;
    mMonday = mondayOf(new Date(mEls.weekPicker.value + 'T00:00:00Z'));
    mSetUrl();
    renderWeekLabel();
    loadAll();
  });

  loadAll();
}

init();
