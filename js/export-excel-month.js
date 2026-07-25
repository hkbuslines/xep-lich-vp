// Xuất Excel THEO THÁNG: sheet "Lich thang" (lịch làm việc cả tháng, dạng text "HH:MM-HH:MM") +
// sheet "Cham cong thang" — CÔNG THỨC EXCEL đọc trực tiếp từ "Lich thang", đúng cơ chế/định dạng
// (STT, MÃ NV, HỌ & TÊN, CHỨC DANH, NGÀY VÀO, ngày trong tháng, ĐI LÀM/CÔNG LÀM THÊM/TỔNG CÔNG,
// 2 dòng/người) như các file thật trong "Chấm công từng VP T05.2026" VÀ như xep_lich_tapvu_rua_xe.py /
// xep_lich_lam_viec.py đã làm cho Tạp Vụ & TC Sapa — sửa giờ trực tiếp trong "Lich thang" (kể cả mở
// bằng Excel, không cần quay lại web app) thì "Cham cong" tự tính lại, không cần xuất lại file.

function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function monthDates(year, month) {
  const n = daysInMonth(year, month);
  const out = [];
  for (let d = 1; d <= n; d++) out.push(new Date(Date.UTC(year, month - 1, d)));
  return out;
}

function monthPersonList(office) {
  const list = [];
  for (const team of office.teams) {
    for (const p of team.people) list.push({ id: p.id, name: p.name, title: p.title || '', team });
  }
  return list;
}

/**
 * Gộp dữ liệu lịch đã lưu theo TUẦN (Firestore) của mọi tuần phủ tháng `month`/`year` thành 1 lịch
 * theo NGÀY cho cả tháng. Tuần nào chưa lưu thì dùng gợi ý tự động (suggestWeekSchedule) — giống hệt
 * những gì đang hiển thị trên web nếu tuần đó chưa ai chỉnh/lưu.
 * Trả về: { [personId]: { name, title, teamId, days: [code x N], ranges: [customRanges|null x N] } }
 */
async function computeMonthSchedule(office, year, month) {
  const dates = monthDates(year, month);
  const mondays = [];
  let cursor = mondayOf(dates[0]);
  const lastMonday = mondayOf(dates[dates.length - 1]);
  while (cursor <= lastMonday) {
    mondays.push(new Date(cursor));
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  const weekSchedules = {};
  for (const monday of mondays) {
    const wId = isoDate(monday);
    const saved = await StorageAPI.loadWeek(office.id, wId);
    weekSchedules[wId] = (saved && saved.assignments) ? saved.assignments : suggestWeekSchedule(office, monday);
  }
  const result = {};
  for (const { id, name, title, team } of monthPersonList(office)) {
    const days = new Array(dates.length).fill(REST_CODE);
    const ranges = new Array(dates.length).fill(null);
    dates.forEach((d, i) => {
      const monday = mondayOf(d);
      const wSched = weekSchedules[isoDate(monday)];
      const person = wSched[id];
      if (person) {
        const dayIdx = Math.round((d - monday) / 86400000);
        days[i] = person.days[dayIdx];
        ranges[i] = (person.ranges && person.ranges[dayIdx]) || null;
      }
    });
    result[id] = { name, title, teamId: team.id, days, ranges };
  }
  return result;
}

// "HH:MM-HH:MM" (1 ca) hoặc "HH:MM-HH:MM, HH:MM-HH:MM" (ca gãy, tối đa 2 đoạn — công thức Cham cong
// chỉ tách được đúng 2 đoạn đầu, giống nguyên bản các script Python; đoạn thứ 3 trở đi vẫn HIỂN THỊ
// đủ ở đây nhưng không được cộng vào giờ tăng ca tự động).
function formatDayCellText(office, code, customRanges) {
  if (code === REST_CODE) return 'NGHỈ';
  const ranges = effectiveRanges(office, code, customRanges);
  return ranges.map(([s, e]) => `${fmtHM(s)}-${fmtHM(e % 24 === 0 && e > 0 ? 24 : e)}`).join(', ');
}

// Công thức Excel tính SỐ GIỜ từ 1 ô "Lich thang" dạng text cố định 11 hoặc 25 ký tự — dùng MOD(...,1)
// để tính đúng cả ca qua đêm (vd 21:00-07:00 -> 10h), khác bản Python gốc (không có ca qua đêm nên
// không cần MOD).
function hoursFormula(ltRef) {
  const seg1 = `MOD(TIMEVALUE(MID(${ltRef},7,5))-TIMEVALUE(LEFT(${ltRef},5)),1)*24`;
  const seg2 = `MOD(TIMEVALUE(MID(${ltRef},20,5))-TIMEVALUE(MID(${ltRef},14,5)),1)*24`;
  return `IF(LEN(${ltRef})=11,${seg1},IF(LEN(${ltRef})=25,${seg1}+${seg2},0))`;
}

const CC_NAVY = 'FF1F3864', CC_BLUE = 'FF2E75B6', CC_INPUTY = 'FFFFF2CC', CC_LEGENDY = 'FFFFF9E6', CC_GRAY = 'FFF2F2F2';
const TNR9 = { name: 'Times New Roman', size: 9 };
const TNR9B = { name: 'Times New Roman', size: 9, bold: true };
const TNR9BW = { name: 'Times New Roman', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
const TNR9G = { name: 'Times New Roman', size: 9, color: { argb: 'FF595959' } };
const CENW = { horizontal: 'center', vertical: 'middle', wrapText: true };
const LEFTW = { horizontal: 'left', vertical: 'middle', wrapText: true };
const THIN = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const BORD = { top: THIN, bottom: THIN, left: THIN, right: THIN };

async function exportMonthExcel(office, year, month) {
  const monthData = await computeMonthSchedule(office, year, month);
  const dates = monthDates(year, month);
  const people = monthPersonList(office);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Xếp Lịch VP';
  wb.created = new Date();

  const ltInfo = buildLichThangSheet(wb, office, monthData, people, dates, year, month);
  buildChamCongMonthSheet(wb, office, monthData, people, dates, year, month, ltInfo);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${office.id}_thang_${String(month).padStart(2, '0')}_${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Sheet "Lich thang MM" — 1 dòng/người, mỗi ô ngày là TEXT "HH:MM-HH:MM" (hoặc "NGHỈ") — nguồn dữ
// liệu để "Cham cong" tham chiếu công thức sang. Trả về vị trí hàng/cột để sheet Cham cong trỏ đúng.
function buildLichThangSheet(wb, office, monthData, people, dates, year, month) {
  const sheetName = `Lich thang ${String(month).padStart(2, '0')}`;
  const ws = wb.addWorksheet(sheetName);
  const dayCol0 = 3; // cột C
  const lastCol = dayCol0 + dates.length - 1;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `LỊCH LÀM VIỆC — ${office.name.toUpperCase()} — THÁNG ${String(month).padStart(2, '0')}/${year}`;
  ws.getCell(1, 1).font = TNR9BW;
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_NAVY } };
  ws.getCell(1, 1).alignment = CENW;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = COMPANY_NAME;
  ws.getCell(2, 1).font = TNR9;
  ws.getCell(2, 1).alignment = LEFTW;

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = 'Mỗi ô ghi đúng khung giờ làm dạng "HH:MM-HH:MM" (ca gãy: "HH:MM-HH:MM, HH:MM-HH:MM") hoặc "NGHỈ". '
    + 'Sửa trực tiếp ô này (kể cả mở bằng Excel) thì sheet "Cham cong" tự tính lại theo, không cần xuất lại file.';
  ws.getCell(3, 1).font = TNR9G;
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_LEGENDY } };
  ws.getCell(3, 1).alignment = LEFTW;

  const r0 = 4;
  [[1, 'STT'], [2, 'Họ tên']].forEach(([col, label]) => {
    ws.mergeCells(r0, col, r0 + 1, col);
    const c = ws.getCell(r0, col);
    c.value = label; c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_NAVY } };
  });
  ws.mergeCells(r0, dayCol0, r0, lastCol);
  const hcell = ws.getCell(r0, dayCol0);
  hcell.value = `NGÀY TRONG THÁNG ${String(month).padStart(2, '0')}/${year}`;
  hcell.font = TNR9BW; hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_BLUE } }; hcell.border = BORD;
  dates.forEach((d, i) => {
    const c = ws.getCell(r0 + 1, dayCol0 + i);
    c.value = `${d.getUTCDate()}\n${TL_WEEKDAY[(d.getUTCDay() + 6) % 7]}`;
    c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_BLUE } };
  });

  const dataStartRow = r0 + 2;
  people.forEach((p, idx) => {
    const row = dataStartRow + idx;
    ws.getCell(row, 1).value = idx + 1;
    ws.getCell(row, 2).value = p.title ? `${p.name} (${p.title})` : p.name;
    [1, 2].forEach(col => { ws.getCell(row, col).font = TNR9; ws.getCell(row, col).border = BORD; ws.getCell(row, col).alignment = col === 1 ? CENW : LEFTW; });
    const person = monthData[p.id];
    dates.forEach((d, i) => {
      const c = ws.getCell(row, dayCol0 + i);
      c.value = formatDayCellText(office, person.days[i], person.ranges[i]);
      c.font = TNR9; c.alignment = CENW; c.border = BORD;
    });
  });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 26;
  for (let i = 0; i < dates.length; i++) ws.getColumn(dayCol0 + i).width = 13;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: dataStartRow - 1 }];

  return { sheetName, dayCol0, dataStartRow };
}

// Sheet "Cham cong thang MM" — 2 dòng/người (chính = đi làm, phụ = công làm thêm), TẤT CẢ là công
// thức tham chiếu sang "Lich thang" — đúng định dạng file thật trong "Chấm công từng VP T05.2026".
function buildChamCongMonthSheet(wb, office, monthData, people, dates, year, month, ltInfo) {
  const sheetName = `Cham cong thang ${String(month).padStart(2, '0')}`;
  const ws = wb.addWorksheet(sheetName);
  const dayCol0 = 6; // F
  const colDiLam = dayCol0 + dates.length;
  const colCongThem = colDiLam + 1;
  const colTongCong = colDiLam + 2;
  const lastCol = colTongCong;
  const standardHours = office.standardHoursPerDay;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `BẢNG CHẤM CÔNG — ${office.name.toUpperCase()} — THÁNG ${String(month).padStart(2, '0')}/${year}`;
  ws.getCell(1, 1).font = TNR9BW;
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_NAVY } };
  ws.getCell(1, 1).alignment = CENW;

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = COMPANY_NAME;
  ws.getCell(2, 1).font = TNR9;
  ws.getCell(2, 1).alignment = LEFTW;

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = standardHours
    ? `Ký hiệu: 1 = 1 công (có đi làm) | ô trống = nghỉ | Đủ ${standardHours} tiếng/ngày = 1 công chính, mỗi giờ VƯỢT `
      + `${standardHours} tiếng = 0.1 công làm thêm (1h→0.1, 2h→0.2, ...) | Toàn bộ 2 dòng của mỗi người là CÔNG THỨC lấy `
      + `tự động từ sheet "${ltInfo.sheetName}" — sửa giờ làm ở đó thì bảng này tự cập nhật theo.`
    : `Ký hiệu: 1 = 1 công (có đi làm/được phân xe) | ô trống = nghỉ | Cả dòng là CÔNG THỨC lấy tự động từ sheet `
      + `"${ltInfo.sheetName}" — sửa lịch ở đó thì bảng này tự cập nhật theo.`;
  ws.getCell(3, 1).font = TNR9G;
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_LEGENDY } };
  ws.getCell(3, 1).alignment = LEFTW;

  const r0 = 4;
  [[1, 'STT'], [2, 'MÃ NV'], [3, 'HỌ & TÊN'], [4, 'CHỨC DANH'], [5, 'NGÀY VÀO']].forEach(([col, label]) => {
    ws.mergeCells(r0, col, r0 + 1, col);
    const c = ws.getCell(r0, col);
    c.value = label; c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_NAVY } };
  });
  ws.mergeCells(r0, dayCol0, r0, dayCol0 + dates.length - 1);
  const hcell = ws.getCell(r0, dayCol0);
  hcell.value = `NGÀY TRONG THÁNG ${String(month).padStart(2, '0')}/${year}`;
  hcell.font = TNR9BW; hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_BLUE } }; hcell.border = BORD;
  dates.forEach((d, i) => {
    const c = ws.getCell(r0 + 1, dayCol0 + i);
    c.value = `${d.getUTCDate()}\n${TL_WEEKDAY[(d.getUTCDay() + 6) % 7]}`;
    c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_BLUE } };
  });
  [[colDiLam, 'ĐI\nLÀM'], [colCongThem, 'CÔNG\nLÀM THÊM'], [colTongCong, 'TỔNG\nCÔNG']].forEach(([col, label]) => {
    ws.mergeCells(r0, col, r0 + 1, col);
    const c = ws.getCell(r0, col);
    c.value = label; c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_BLUE } };
  });

  const dataStartRow = r0 + 2;
  people.forEach((p, idx) => {
    const mainRow = dataStartRow + idx * 2;
    const subRow = mainRow + 1;
    const ltRow = ltInfo.dataStartRow + idx; // cùng thứ tự người như Lich thang
    [[1, idx + 1], [2, p.id], [3, p.name], [4, p.title || (p.team.name || p.team.id)], [5, '']].forEach(([col, val]) => {
      const c = ws.getCell(mainRow, col);
      c.value = val; c.font = TNR9; c.alignment = CENW; c.border = BORD;
      ws.getCell(subRow, col).border = BORD;
    });

    dates.forEach((d, i) => {
      const colLetter = colToLetter(ltInfo.dayCol0 + i);
      const ltRef = `'${ltInfo.sheetName}'!${colLetter}${ltRow}`;
      const cm = ws.getCell(mainRow, dayCol0 + i);
      const cs = ws.getCell(subRow, dayCol0 + i);
      cm.value = { formula: `IF(OR(${ltRef}="",${ltRef}="NGHỈ"),"",1)` };
      cs.value = p.team.noOvertime || !standardHours
        ? 0
        : { formula: `IFERROR(ROUND(MAX(${hoursFormula(ltRef)}-${standardHours},0)*0.1,2),0)` };
      cm.font = TNR9; cm.alignment = CENW; cm.border = BORD;
      cm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_INPUTY } };
      cs.font = TNR9B; cs.alignment = CENW; cs.border = BORD; // dòng "công làm thêm" in đậm, giống file thật
      cs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC_GRAY } };
    });

    const dayRng = `${colToLetter(dayCol0)}${mainRow}:${colToLetter(dayCol0 + dates.length - 1)}${mainRow}`;
    const otRng = `${colToLetter(dayCol0)}${subRow}:${colToLetter(dayCol0 + dates.length - 1)}${subRow}`;
    const cDL = ws.getCell(mainRow, colDiLam); cDL.value = { formula: `SUM(${dayRng})` }; cDL.font = TNR9; cDL.alignment = CENW; cDL.border = BORD;
    const cCT = ws.getCell(mainRow, colCongThem); cCT.value = { formula: `SUM(${otRng})` }; cCT.font = TNR9; cCT.alignment = CENW; cCT.border = BORD;
    const cTC = ws.getCell(mainRow, colTongCong);
    cTC.value = { formula: `${colToLetter(colDiLam)}${mainRow}+${colToLetter(colCongThem)}${mainRow}` };
    cTC.font = TNR9; cTC.alignment = CENW; cTC.border = BORD;
    [colDiLam, colCongThem, colTongCong].forEach(col => { ws.getCell(subRow, col).border = BORD; });
  });

  const rTot = dataStartRow + people.length * 2;
  ws.mergeCells(rTot, 1, rTot, 4);
  const cTot = ws.getCell(rTot, 1);
  cTot.value = `TỔNG CỘNG (${office.name}) — ${people.length} người`;
  cTot.font = TNR9B;
  [colDiLam, colCongThem, colTongCong].forEach(col => {
    const letter = colToLetter(col);
    const c = ws.getCell(rTot, col);
    c.value = { formula: `SUM(${letter}${dataStartRow}:${letter}${rTot - 1})` };
    c.font = TNR9B; c.border = BORD;
  });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 11;
  ws.getColumn(3).width = 23;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 11;
  for (let i = 0; i < dates.length; i++) ws.getColumn(dayCol0 + i).width = 7;
  ws.getColumn(colDiLam).width = 8;
  ws.getColumn(colCongThem).width = 10;
  ws.getColumn(colTongCong).width = 9;
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: dataStartRow - 1 }];
}

function colToLetter(col) {
  let s = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}
