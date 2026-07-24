// Component "thanh thời gian" dùng chung cho office.html (chỉnh được) và index.html (chỉ xem) —
// học theo đúng UI/UX day-strip/ruler/track của các file lich_*.html do xep_lich_*.py xuất ra
// (xem "Xếp xe/lich_tongdai_thang_08_2026.html"), nhưng gộp cả tuần vào 1 ruler thay vì xem từng ngày,
// vì trang này vốn đã ở đơn vị "1 tuần".
//
// Cột tên KHÔNG dùng CSS `position: sticky` (đã thử — bị lỗi thanh ca cuộn ngang lộ ra đè lên cột tên
// trong mọi trình duyệt test được) — thay vào đó tách hẳn thành 2 khối DOM riêng biệt đặt cạnh nhau:
// khối tên (không cuộn) + khối lịch (cuộn ngang riêng) — đảm bảo về mặt cấu trúc không thể có chuyện
// nội dung bên khối cuộn "lộ" ra ngoài khối tên, vì 2 khối không chung 1 vùng cuộn.
//
// Ca qua đêm (vd CADEM 21:00-07:00) vẽ 2 đoạn: đoạn chính trên đúng ngày được xếp (21:00-24:00) VÀ
// đoạn "vắt" mờ hơn trên ngày HÔM SAU (00:00-07:00, cùng màu ca đêm) — giống bản gốc. Đoạn vắt chỉ để
// xem, không bấm/kéo được — muốn đổi ca đêm đó thì bấm vào đúng ngày nó bắt đầu.

function parseHM(tok) {
  tok = tok.trim();
  let m = tok.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = tok.match(/^(\d{1,2})h(\d{0,2})$/);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return 0;
}

// "06:00-15:00" | "6h-9h & 17h30-23h30" | "21:00-07:00" | "Cả ngày" | "" -> [[start,end], ...]
// (giờ thập phân; end CÓ THỂ > 24 khi ca qua đêm, vd 21:00-07:00 -> [21, 31] — người gọi tự tách đoạn).
function parseHoursSegments(hoursStr) {
  if (!hoursStr || hoursStr === 'Cả ngày') return [[0, 24]];
  return hoursStr.split('&').map(seg => {
    const [a, b] = seg.split('-');
    let s = parseHM(a), e = parseHM(b);
    if (e <= s) e += 24; // qua đêm: giữ nguyên độ dài thật, KHÔNG cắt tại nửa đêm
    return [s, e];
  });
}

function fmtHM(h) {
  h = ((h % 24) + 24) % 24;
  let hh = Math.floor(h + 1e-9);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { mm = 0; hh += 1; }
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

const TL_WEEKDAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Với 7 mã ca/ngày của 1 người, tính ra danh sách đoạn cần vẽ cho MỖI ngày (kể cả đoạn vắt từ hôm trước).
function buildDaySegments(office, days) {
  const perDay = days.map(() => []);
  days.forEach((code, dayIdx) => {
    const def = shiftDefFor(office, code);
    const segs = code === REST_CODE ? [[0, 24]] : parseHoursSegments(def.hours);
    segs.forEach(([s, e]) => {
      perDay[dayIdx].push({ s, e: Math.min(e, 24), code, carry: false });
      if (e > 24 && dayIdx + 1 < days.length) {
        perDay[dayIdx + 1].push({ s: 0, e: e - 24, code, carry: true });
      }
    });
  });
  return perDay;
}

function buildBarEl(office, person, p, dayIdx, seg, opts, root) {
  const { s, e, code, carry } = seg;
  const def = shiftDefFor(office, code);
  const bar = document.createElement('div');
  bar.className = 'tl-bar' + (code === REST_CODE ? ' tl-bar-rest' : '') + (carry ? ' tl-bar-carry' : '');
  bar.style.setProperty('--c', def.color);
  bar.style.left = (s / 24 * 100) + '%';
  bar.style.width = (((e - s) / 24) * 100) + '%';
  const hmLabel = code === REST_CODE ? 'Nghỉ' : (fmtHM(s) + '–' + fmtHM(e));
  const wide = (e - s) >= 4;
  if (carry) {
    bar.title = `${person.name} — ${def.name}: tiếp tục từ tối hôm trước đến ${fmtHM(e)} (đổi ca này ở ngày hôm trước)`;
    bar.textContent = wide ? '⋯' + fmtHM(e) : '';
  } else {
    bar.title = `${person.name} — ${def.name} (${hmLabel})`;
    bar.textContent = wide ? hmLabel : (code === REST_CODE ? 'Nghỉ' : '');
    if (opts.editable) {
      bar.draggable = true;
      bar.style.cursor = 'grab';
      bar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openTimelineMenu(root, bar, office, (newCode) => opts.onChange(p.id, dayIdx, newCode));
      });
      bar.addEventListener('dragstart', (ev) => {
        ev.stopPropagation();
        ev.dataTransfer.setData('text/plain', JSON.stringify({ p: p.id, d: dayIdx }));
        bar.classList.add('tl-bar-dragging');
      });
      bar.addEventListener('dragend', () => bar.classList.remove('tl-bar-dragging'));
    }
  }
  return bar;
}

/**
 * Vẽ thanh thời gian 1 tuần vào `root` (element rỗng, sẽ bị ghi đè toàn bộ).
 * office, schedule: như suggestWeekSchedule() trả về.
 * dates: mảng 7 Date (Date.UTC) của tuần đang xem.
 * opts.editable: cho bấm/kéo vào thanh để đổi ca hay không.
 * opts.onChange(personId, dayIdx, newCode): gọi khi người dùng đổi ca qua menu.
 * opts.onSwap(personA, dayA, personB, dayB): gọi khi người dùng kéo-thả đổi chỗ 2 ca.
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

  const split = document.createElement('div');
  split.className = 'tl-split';
  root.appendChild(split);

  // ===== Cột tên (không cuộn) =====
  const namesPane = document.createElement('div');
  namesPane.className = 'tl-names-pane';
  split.appendChild(namesPane);

  const namesHeaderSpacer = document.createElement('div');
  namesHeaderSpacer.className = 'tl-header-cell';
  namesPane.appendChild(namesHeaderSpacer);

  // ===== Khối lịch (cuộn ngang riêng) =====
  const scrollPane = document.createElement('div');
  scrollPane.className = 'tl-scroll-pane';
  split.appendChild(scrollPane);
  const scrollInner = document.createElement('div');
  scrollInner.className = 'tl-scroll-inner';
  scrollPane.appendChild(scrollInner);

  const ruler = document.createElement('div');
  ruler.className = 'tl-ruler tl-header-cell';
  dates.forEach((d, i) => {
    const cell = document.createElement('div');
    cell.className = 'tl-ruler-cell';
    cell.innerHTML = `${TL_WEEKDAY[i]}<br><span class="date-sub">${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}</span>`;
    ruler.appendChild(cell);
  });
  scrollInner.appendChild(ruler);

  for (const team of office.teams) {
    const label = document.createElement('div');
    label.className = 'team-row-label';
    label.textContent = team.name || team.id;
    namesPane.appendChild(label);
    const labelSpacer = document.createElement('div');
    labelSpacer.className = 'team-row-label-spacer';
    scrollInner.appendChild(labelSpacer);

    for (const p of team.people) {
      const person = schedule[p.id];
      if (!person) continue;

      const nameCell = document.createElement('div');
      nameCell.className = 'tl-person-row tl-name-cell';
      nameCell.innerHTML = `<div class="tl-name">${person.name}</div>${person.title ? `<div class="title-sub">${person.title}</div>` : ''}`;
      namesPane.appendChild(nameCell);

      const track = document.createElement('div');
      track.className = 'tl-person-row tl-track';
      const daySegs = buildDaySegments(office, person.days);
      daySegs.forEach((segs, dayIdx) => {
        const dayCell = document.createElement('div');
        dayCell.className = 'tl-day-cell';
        segs.forEach(seg => dayCell.appendChild(buildBarEl(office, person, p, dayIdx, seg, opts, root)));
        if (opts.editable) {
          dayCell.addEventListener('dragover', (ev) => { ev.preventDefault(); dayCell.classList.add('tl-day-cell-over'); });
          dayCell.addEventListener('dragleave', () => dayCell.classList.remove('tl-day-cell-over'));
          dayCell.addEventListener('drop', (ev) => {
            ev.preventDefault();
            dayCell.classList.remove('tl-day-cell-over');
            const src = JSON.parse(ev.dataTransfer.getData('text/plain'));
            if (src.p === p.id && src.d === dayIdx) return;
            opts.onSwap && opts.onSwap(src.p, src.d, p.id, dayIdx);
          });
        }
        track.appendChild(dayCell);
      });
      scrollInner.appendChild(track);
    }
  }

  // Biểu đồ sĩ số cả tuần
  const chartLabel = document.createElement('div');
  chartLabel.className = 'tl-chart-label-cell';
  chartLabel.textContent = 'Sĩ số';
  namesPane.appendChild(chartLabel);

  const chartCellWrap = document.createElement('div');
  chartCellWrap.className = 'tl-chart-canvas-cell';
  const canvas = document.createElement('canvas');
  canvas.className = 'tl-chart';
  chartCellWrap.appendChild(canvas);
  scrollInner.appendChild(chartCellWrap);
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
    const daySegs = buildDaySegments(office, person.days);
    daySegs.forEach((segs, dayIdx) => {
      segs.forEach(({ s, e, code }) => {
        if (code === REST_CODE) return;
        const from = Math.round(dayIdx * 48 + s * 2);
        const to = Math.round(dayIdx * 48 + e * 2);
        for (let k = Math.max(0, from); k < to && k < SLOTS; k++) counts[k]++;
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
