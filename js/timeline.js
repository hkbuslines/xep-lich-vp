// Component "thanh thời gian" dùng chung cho office.html (chỉnh được) và index.html (chỉ xem) —
// học theo đúng UI/UX day-strip/ruler/track của các file lich_*.html do xep_lich_*.py xuất ra
// (xem "Xếp xe/lich_tongdai_thang_08_2026.html"), nhưng gộp cả tuần vào 1 ruler thay vì xem từng ngày,
// vì trang này vốn đã ở đơn vị "1 tuần".
//
// KHÔNG xử lý phần "carry" (đoạn ca đêm vắt sang ngày hôm sau) như bản gốc để đơn giản hoá — ca qua
// đêm (vd CADEM 21:00-07:00) chỉ vẽ từ giờ bắt đầu đến hết ngày (24:00) trên đúng ngày được xếp.

function parseHM(tok) {
  tok = tok.trim();
  let m = tok.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = tok.match(/^(\d{1,2})h(\d{0,2})$/);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return 0;
}

// "06:00-15:00" | "6h-9h & 17h30-23h30" | "Cả ngày" | "" -> [[start,end], ...] (giờ thập phân, 0-24)
function parseHoursSegments(hoursStr) {
  if (!hoursStr || hoursStr === 'Cả ngày') return [[0, 24]];
  return hoursStr.split('&').map(seg => {
    const [a, b] = seg.split('-');
    let s = parseHM(a), e = parseHM(b);
    if (e <= s) e = 24; // ca qua đêm: cắt tại nửa đêm, xem ghi chú ở đầu file
    return [s, e];
  });
}

function fmtHM(h) {
  let hh = Math.floor(h + 1e-9);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { mm = 0; hh += 1; }
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

const TL_WEEKDAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Vẽ thanh thời gian 1 tuần vào `root` (element rỗng, sẽ bị ghi đè toàn bộ).
 * office, schedule: như suggestWeekSchedule() trả về.
 * dates: mảng 7 Date (Date.UTC) của tuần đang xem.
 * opts.editable: cho bấm vào thanh để đổi ca hay không.
 * opts.onChange(personId, dayIdx, newCode): gọi khi người dùng đổi ca (chỉ khi editable).
 */
function renderTimeline(root, office, schedule, dates, opts) {
  opts = opts || {};
  root.innerHTML = '';
  root.className = 'tl-root';

  // Legend
  const legend = document.createElement('div');
  legend.className = 'tl-legend';
  [...office.shiftDefs, REST_DEF].forEach(d => {
    const chip = document.createElement('span');
    chip.className = 'tl-legend-chip';
    chip.style.setProperty('--c', d.color);
    chip.innerHTML = `<span class="tl-legend-dot"></span>${d.name}${d.hours ? ' · ' + d.hours : ''}`;
    legend.appendChild(chip);
  });
  root.appendChild(legend);

  // Ruler (7 cột ngày)
  const rulerRow = document.createElement('div');
  rulerRow.className = 'tl-row tl-ruler-row';
  const rulerSpacer = document.createElement('div');
  rulerSpacer.className = 'tl-name-col';
  rulerRow.appendChild(rulerSpacer);
  const ruler = document.createElement('div');
  ruler.className = 'tl-ruler';
  dates.forEach((d, i) => {
    const cell = document.createElement('div');
    cell.className = 'tl-ruler-cell';
    cell.innerHTML = `${TL_WEEKDAY[i]}<br><span class="date-sub">${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}</span>`;
    ruler.appendChild(cell);
  });
  rulerRow.appendChild(ruler);
  root.appendChild(rulerRow);

  // Rows
  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'tl-rows';

  for (const team of office.teams) {
    const label = document.createElement('div');
    label.className = 'team-row-label';
    label.textContent = team.id;
    rowsWrap.appendChild(label);

    for (const p of team.people) {
      const person = schedule[p.id];
      if (!person) continue;
      const row = document.createElement('div');
      row.className = 'tl-row';

      const nameCol = document.createElement('div');
      nameCol.className = 'tl-name-col';
      nameCol.innerHTML = `<div class="tl-name">${person.name}</div>${person.title ? `<div class="title-sub">${person.title}</div>` : ''}`;
      row.appendChild(nameCol);

      const track = document.createElement('div');
      track.className = 'tl-track';
      person.days.forEach((code, dayIdx) => {
        const dayCell = document.createElement('div');
        dayCell.className = 'tl-day-cell';
        const def = shiftDefFor(office, code);
        const segs = code === REST_CODE ? [[0, 24]] : parseHoursSegments(def.hours);
        segs.forEach(([s, e]) => {
          const bar = document.createElement('div');
          bar.className = 'tl-bar' + (code === REST_CODE ? ' tl-bar-rest' : '');
          bar.style.setProperty('--c', def.color);
          bar.style.left = (s / 24 * 100) + '%';
          bar.style.width = (((e - s) / 24) * 100) + '%';
          const hmLabel = code === REST_CODE ? 'Nghỉ' : (fmtHM(s) + '–' + fmtHM(e));
          bar.title = `${person.name} — ${def.name} (${hmLabel})`;
          const wide = (e - s) >= 4;
          bar.textContent = wide ? hmLabel : (code === REST_CODE ? 'Nghỉ' : '');
          if (opts.editable) {
            bar.style.cursor = 'pointer';
            bar.addEventListener('click', (ev) => {
              ev.stopPropagation();
              openTimelineMenu(root, bar, office, (newCode) => opts.onChange(p.id, dayIdx, newCode));
            });
          }
          dayCell.appendChild(bar);
        });
        track.appendChild(dayCell);
      });
      row.appendChild(track);
      rowsWrap.appendChild(row);
    }
  }
  root.appendChild(rowsWrap);

  // Biểu đồ sĩ số cả tuần
  const chartWrap = document.createElement('div');
  chartWrap.className = 'tl-chart-row';
  const chartSpacer = document.createElement('div');
  chartSpacer.className = 'tl-name-col tl-chart-label';
  chartSpacer.textContent = 'Sĩ số';
  chartWrap.appendChild(chartSpacer);
  const canvas = document.createElement('canvas');
  canvas.className = 'tl-chart';
  chartWrap.appendChild(canvas);
  root.appendChild(chartWrap);
  drawWeekHeadcountChart(canvas, office, schedule);
}

let tlOpenMenu = null;
function closeTimelineMenu() { if (tlOpenMenu) { tlOpenMenu.remove(); tlOpenMenu = null; } }
document.addEventListener('click', closeTimelineMenu);

function openTimelineMenu(root, anchorEl, office, onPick) {
  closeTimelineMenu();
  const rootRect = root.getBoundingClientRect();
  const btnRect = anchorEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'tl-menu';
  menu.style.top = (btnRect.bottom - rootRect.top + 4) + 'px';
  menu.style.left = Math.min(Math.max(0, btnRect.left - rootRect.left), rootRect.width - 210) + 'px';
  [...office.shiftDefs, REST_DEF].forEach(d => {
    const b = document.createElement('button');
    b.className = 'tl-menu-item';
    b.style.setProperty('--c', d.color);
    b.innerHTML = `<span class="tl-menu-dot"></span>${d.name}${d.hours ? ' · ' + d.hours : ''}`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeTimelineMenu();
      onPick(d.code);
    });
    menu.appendChild(b);
  });
  root.appendChild(menu);
  tlOpenMenu = menu;
}

function drawWeekHeadcountChart(canvas, office, schedule) {
  const SLOTS = 7 * 48;
  const counts = new Array(SLOTS).fill(0);
  Object.values(schedule).forEach(person => {
    person.days.forEach((code, dayIdx) => {
      if (code === REST_CODE) return;
      const def = shiftDefFor(office, code);
      parseHoursSegments(def.hours).forEach(([s, e]) => {
        const from = Math.round(dayIdx * 48 + s * 2);
        const to = Math.round(dayIdx * 48 + e * 2);
        for (let k = from; k < to && k < SLOTS; k++) counts[k]++;
      });
    });
  });

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.parentElement.clientWidth || 600;
  canvas.width = w * dpr;
  canvas.height = 90 * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = '90px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = w, H = 90;
  ctx.clearRect(0, 0, W, H);

  const styles = getComputedStyle(document.documentElement);
  const lineCol = styles.getPropertyValue('--border').trim() || '#ccc';
  const accent = styles.getPropertyValue('--accent').trim() || '#4C6EF5';
  const maxY = Math.max(2, Math.max(...counts) + 1);
  const pad = { l: 4, r: 4, t: 6, b: 4 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;

  ctx.strokeStyle = lineCol; ctx.lineWidth = 1;
  for (let d = 0; d <= 7; d++) {
    const x = pad.l + (d / 7) * plotW;
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
  }

  ctx.beginPath();
  counts.forEach((c, k) => {
    const x0 = pad.l + (k / SLOTS) * plotW;
    const x1 = pad.l + ((k + 1) / SLOTS) * plotW;
    const y = pad.t + plotH - (c / maxY) * plotH;
    if (k === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0, y);
    ctx.lineTo(x1, y);
  });
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  counts.forEach((c, k) => {
    const x = pad.l + (k / SLOTS) * plotW;
    const y = pad.t + plotH - (c / maxY) * plotH;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
}
