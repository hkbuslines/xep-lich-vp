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
const SNAP_H = 0.5; // kéo giãn/di chuyển giờ luôn làm tròn tới 30 phút, như bản gốc
const MIN_SEG_H = 0.5;

function snapH(h) { return Math.round(h * (1 / SNAP_H)) / (1 / SNAP_H); }
function clampH(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// customRanges (person.ranges[dayIdx]) ghi đè khung giờ mặc định của mã ca nếu người dùng đã
// kéo-giãn/di chuyển/thêm/xoá giờ ở tab "Theo ngày". null/undefined -> dùng giờ mặc định của code.
function effectiveRanges(office, code, customRanges) {
  if (customRanges && customRanges.length) return customRanges.map(r => r.slice());
  if (code === REST_CODE) return [[0, 24]];
  return parseHoursSegments(shiftDefFor(office, code).hours);
}

// Với 1 người (days + ranges tuỳ chỉnh), tính ra danh sách đoạn cần vẽ cho MỖI ngày (kể cả đoạn vắt
// từ hôm trước). Mỗi đoạn có segIdx = vị trí của nó trong effectiveRanges(...) của đúng ngày đó, để
// biết cần sửa/xoá đúng phần tử nào khi kéo-giãn hoặc bấm xoá.
function buildDaySegments(office, person) {
  const days = person.days;
  const perDay = days.map(() => []);
  days.forEach((code, dayIdx) => {
    const segs = effectiveRanges(office, code, person.ranges && person.ranges[dayIdx]);
    // Nếu ca đêm hôm trước đã vắt sang tới giờ carryEnd (vd 07:00), đoạn của CHÍNH ngày hôm nay
    // (thường là cả ngày "Nghỉ", s=0) phải bắt đầu tính từ carryEnd trở đi — nếu không sẽ đè lên
    // đúng khoảng giờ mà đoạn vắt đang vẽ, nhìn như vừa làm vừa nghỉ cùng lúc.
    const carryEnd = perDay[dayIdx].reduce((m, seg) => seg.carry ? Math.max(m, seg.e) : m, 0);
    segs.forEach(([s, e], segIdx) => {
      const cs = Math.max(s, carryEnd);
      const ce = Math.min(e, 24);
      if (cs < ce) perDay[dayIdx].push({ s: cs, e: ce, code, carry: false, segIdx });
      if (e > 24 && dayIdx + 1 < days.length) {
        perDay[dayIdx + 1].push({ s: 0, e: e - 24, code, carry: true, segIdx });
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
  const label = document.createElement('span');
  label.className = 'tl-bar-label';
  bar.appendChild(label);
  if (carry) {
    bar.title = `${person.name} — ${def.name}: tiếp tục từ tối hôm trước đến ${fmtHM(e)} (đổi ca này ở ngày hôm trước)`;
    label.textContent = wide ? '⋯' + fmtHM(e) : '';
  } else {
    bar.title = `${person.name} — ${def.name} (${hmLabel})`;
    label.textContent = wide ? hmLabel : (code === REST_CODE ? 'Nghỉ' : '');
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
      const daySegs = buildDaySegments(office, person);
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

// Thanh ca CÓ THỂ kéo-giãn 2 đầu / kéo giữa để dời cả khối / bấm × để xoá — dùng riêng cho tab
// "Theo ngày" (đủ rộng để thao tác chính xác), giống hệt cơ chế trong file lich_tongdai_sapa_*.html
// gốc (pointerdown + snap 30 phút). refreshChart() được gọi liên tục khi đang kéo để cập nhật biểu
// đồ sĩ số theo thời gian thực, không cần vẽ lại cả bảng.
function buildDayBarEl(office, person, p, dayIdx, seg, opts, root, refreshChart) {
  const { s, e, code, carry, segIdx } = seg;
  const def = shiftDefFor(office, code);
  const bar = document.createElement('div');
  bar.className = 'tl-bar' + (code === REST_CODE ? ' tl-bar-rest' : '') + (carry ? ' tl-bar-carry' : '');
  bar.style.setProperty('--c', def.color);
  bar.style.left = (s / 24 * 100) + '%';
  bar.style.width = (((e - s) / 24) * 100) + '%';

  const label = document.createElement('span');
  label.className = 'tl-bar-label';
  const hmLabel = code === REST_CODE ? 'Nghỉ' : (fmtHM(s) + '–' + fmtHM(e));
  label.textContent = hmLabel;
  bar.appendChild(label);

  if (carry) {
    bar.title = `${person.name} — ${def.name}: tiếp tục từ tối hôm trước đến ${fmtHM(e)} (đổi ca này ở ngày hôm trước)`;
    label.textContent = '⋯' + fmtHM(e);
    return bar;
  }
  bar.title = `${person.name} — ${def.name} (${hmLabel})`;
  if (!opts.editable) return bar;

  if (code === REST_CODE) {
    // Cả ngày đang "Nghỉ" — chỉ bấm để gán 1 ca làm việc, không có gì để kéo-giãn/xoá.
    bar.style.cursor = 'pointer';
    bar.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openTimelineMenu(root, bar, office, (newCode) => opts.onAddSegment(p.id, dayIdx, newCode));
    });
    return bar;
  }

  bar.style.cursor = 'grab';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'tl-bar-remove';
  removeBtn.setAttribute('aria-label', 'Xoá ca này');
  removeBtn.textContent = '×';
  removeBtn.addEventListener('pointerdown', ev => ev.stopPropagation());
  removeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeTimelineMenu();
    opts.onRemoveSegment(p.id, dayIdx, segIdx);
  });
  bar.appendChild(removeBtn);

  ['l', 'r'].forEach(side => {
    const h = document.createElement('div');
    h.className = 'tl-bar-handle tl-bar-handle-' + side;
    h.dataset.handle = side;
    bar.appendChild(h);
  });

  let justDragged = false;
  bar.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (justDragged) { justDragged = false; return; }
    openTimelineMenu(root, bar, office, (newCode) => opts.onChange(p.id, dayIdx, newCode));
  });

  bar.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.dataset && ev.target.dataset.handle;
    const mode = handle === 'l' ? 'left' : handle === 'r' ? 'right' : 'move';
    const track = bar.parentElement;
    const trackWidth = track.getBoundingClientRect().width;
    const startX = ev.clientX;
    const origS = s, origE = e;
    justDragged = false;
    try { bar.setPointerCapture(ev.pointerId); } catch (err) {}
    bar.style.cursor = 'grabbing';

    function onMove(mv) {
      const deltaH = (mv.clientX - startX) / trackWidth * 24;
      if (Math.abs(deltaH) > 0.05) justDragged = true;
      let ns = origS, ne = origE;
      if (mode === 'move') {
        const dur = origE - origS;
        ns = clampH(snapH(origS + deltaH), 0, 24 - dur);
        ne = ns + dur;
      } else if (mode === 'left') {
        ns = clampH(snapH(origS + deltaH), 0, origE - MIN_SEG_H);
        ne = origE;
      } else {
        ne = clampH(snapH(origE + deltaH), origS + MIN_SEG_H, 24);
        ns = origS;
      }
      bar.style.left = (ns / 24 * 100) + '%';
      bar.style.width = (((ne - ns) / 24) * 100) + '%';
      label.textContent = fmtHM(ns) + '–' + fmtHM(ne);
      opts.onResizeLive(p.id, dayIdx, segIdx, ns, ne);
      refreshChart();
    }
    function onUp(up) {
      try { bar.releasePointerCapture(up.pointerId); } catch (err) {}
      bar.style.cursor = 'grab';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (justDragged) opts.onResizeEnd();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    ev.preventDefault();
  });

  return bar;
}

/**
 * Vẽ thanh thời gian CHỈ 1 NGÀY (tab "Theo ngày") — mỗi người 1 thanh rộng hết khổ, kéo-giãn 2 đầu
 * để tăng/giảm giờ, kéo giữa để dời cả ca, bấm + để thêm ca/× để xoá — giống hệt file HTML gốc.
 * dateObj: Date của đúng ngày đang xem (chỉ để hiển thị nhãn).
 * opts.editable, opts.onChange(personId, dayIdx, newCode) — giống renderTimeline.
 * opts.onAddSegment(personId, dayIdx, newCode) — thêm 1 khối giờ mới (hoặc gán hẳn ca mới nếu đang Nghỉ).
 * opts.onRemoveSegment(personId, dayIdx, segIdx) — xoá 1 khối giờ.
 * opts.onResizeLive(personId, dayIdx, segIdx, newS, newE) — gọi liên tục khi đang kéo (không vẽ lại UI).
 * opts.onResizeEnd() — gọi khi thả chuột sau khi đã thực sự kéo (vẽ lại UI đầy đủ 1 lần).
 */
function renderDayTimeline(root, office, schedule, dayIdx, dateObj, opts) {
  opts = opts || {};
  root.innerHTML = '';
  root.className = 'tl-root';

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

  const namesPane = document.createElement('div');
  namesPane.className = 'tl-names-pane';
  split.appendChild(namesPane);
  const namesHeaderSpacer = document.createElement('div');
  namesHeaderSpacer.className = 'tl-header-cell';
  namesPane.appendChild(namesHeaderSpacer);

  const scrollPane = document.createElement('div');
  scrollPane.className = 'tl-scroll-pane';
  split.appendChild(scrollPane);
  const scrollInner = document.createElement('div');
  scrollInner.className = 'tl-scroll-inner tl-scroll-inner-day';
  scrollPane.appendChild(scrollInner);

  const hourRuler = document.createElement('div');
  hourRuler.className = 'tl-hour-ruler tl-header-cell';
  for (let h = 0; h <= 24; h += 3) {
    const tick = document.createElement('span');
    tick.className = 'tl-hour-tick';
    tick.style.left = (h / 24 * 100) + '%';
    tick.textContent = h + 'h';
    hourRuler.appendChild(tick);
  }
  scrollInner.appendChild(hourRuler);

  let dayCanvasEl = null;
  const refreshChart = () => { if (dayCanvasEl) drawDayHeadcountChart(dayCanvasEl, office, schedule, dayIdx); };

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

      const rowInner = document.createElement('div');
      rowInner.className = 'tl-person-row tl-day-row-inner';

      const track = document.createElement('div');
      track.className = 'tl-track';
      const daySegs = buildDaySegments(office, person);
      const dayCell = document.createElement('div');
      dayCell.className = 'tl-day-cell';
      daySegs[dayIdx].forEach(seg => dayCell.appendChild(buildDayBarEl(office, person, p, dayIdx, seg, opts, root, refreshChart)));
      track.appendChild(dayCell);
      rowInner.appendChild(track);

      if (opts.editable) {
        const addBtn = document.createElement('button');
        addBtn.className = 'round-btn tl-add-btn';
        addBtn.setAttribute('aria-label', 'Thêm ca cho ' + person.name);
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openTimelineMenu(root, addBtn, office, (newCode) => opts.onAddSegment(p.id, dayIdx, newCode));
        });
        rowInner.appendChild(addBtn);
      }

      scrollInner.appendChild(rowInner);
    }
  }

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
  dayCanvasEl = canvas;
  drawDayHeadcountChart(canvas, office, schedule, dayIdx);
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
    const daySegs = buildDaySegments(office, person);
    daySegs.forEach((segs, dayIdx) => {
      segs.forEach(({ s, e, code }) => {
        if (code === REST_CODE) return;
        const from = Math.round(dayIdx * 48 + s * 2);
        const to = Math.round(dayIdx * 48 + e * 2);
        for (let k = Math.max(0, from); k < to && k < SLOTS; k++) counts[k]++;
      });
    });
  });
  drawHeadcountChart(canvas, counts, 7);
}

function drawDayHeadcountChart(canvas, office, schedule, dayIdx) {
  const SLOTS = 48;
  const counts = new Array(SLOTS).fill(0);
  Object.values(schedule).forEach(person => {
    const daySegs = buildDaySegments(office, person);
    daySegs[dayIdx].forEach(({ s, e, code }) => {
      if (code === REST_CODE) return;
      const from = Math.round(s * 2);
      const to = Math.round(e * 2);
      for (let k = Math.max(0, from); k < to && k < SLOTS; k++) counts[k]++;
    });
  });
  drawHeadcountChart(canvas, counts, 4);
}

function drawHeadcountChart(canvas, counts, gridDivisions) {
  const SLOTS = counts.length;
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
  for (let d = 0; d <= gridDivisions; d++) {
    const x = pad.l + (d / gridDivisions) * plotW;
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
