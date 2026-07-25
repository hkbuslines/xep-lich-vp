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
const TNR9BG = { name: 'Times New Roman', size: 9, bold: true, color: { argb: 'FF595959' } };
const TNR8G = { name: 'Times New Roman', size: 8, color: { argb: 'FF7F7F7F' } };
const CENW = { horizontal: 'center', vertical: 'middle', wrapText: true };
const LEFTW = { horizontal: 'left', vertical: 'middle', wrapText: true };
const RIGHTW = { horizontal: 'right', vertical: 'middle', wrapText: true };
const THIN = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const BORD = { top: THIN, bottom: THIN, left: THIN, right: THIN };
function fillOf(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }

async function exportMonthExcel(office, year, month) {
  const monthData = await computeMonthSchedule(office, year, month);
  const dates = monthDates(year, month);
  const people = monthPersonList(office);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Xếp Lịch VP';
  wb.created = new Date();

  const ltInfo = buildLichThangSheet(wb, office, monthData, people, dates, year, month);
  if (office.id === 'tcsp') {
    buildChamCongTcSapaSheet(wb, office, monthData, people, dates, year, month, ltInfo);
  } else {
    buildChamCongMonthSheet(wb, office, monthData, people, dates, year, month, ltInfo);
  }

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

// Sheet "Cham cong thang MM" RIÊNG cho Lái Xe Trung Chuyển Sapa (tcsp) — bố cục/cột/công thức lấy
// đúng theo file thật "Trung Chuyển/Chấm công Trung Chuyển/Chấm công TC Sapa - Tháng 07.2026.xlsx"
// (sheet "BCC tháng X" + "Ký hiệu"), KHÁC hẳn buildChamCongMonthSheet dùng cho 3 văn phòng kia:
// chấm công theo MÃ CA (C1/NS/NC) đếm bằng COUNTIF, không phải đếm giờ. Ô ngày là công thức dịch
// ngược từ giờ ghi trong "Lich thang" (vd "05:30-23:00") sang đúng mã hiển thị ("C1") — sửa giờ ở
// Lich thang thì bảng này tự cập nhật, giống cơ chế Lich lam viec -> Cham cong trong xep_lich_lam_viec.py.
function tcsapaDayFormula(office, ltRef) {
  const label = { F: 'C1', NS: 'NS', NC: 'NC' };
  let expr = ltRef; // không khớp mã nào (vd bị kéo giãn giờ tuỳ chỉnh) -> hiện nguyên giờ
  for (const def of office.shiftDefs) {
    expr = `IF(${ltRef}="${def.hours}","${label[def.code] || def.code}",${expr})`;
  }
  return `IF(${ltRef}="NGHỈ","",${expr})`;
}

function buildChamCongTcSapaSheet(wb, office, monthData, people, dates, year, month, ltInfo) {
  const sheetName = `Cham cong thang ${String(month).padStart(2, '0')}`;
  const ws = wb.addWorksheet(sheetName);
  const ndays = dates.length;
  const dayCol0 = 5; // E
  const offCC = dayCol0 + ndays;
  const lastCol = offCC + 10;
  const dayColLetter0 = colToLetter(dayCol0), dayColLetter1 = colToLetter(dayCol0 + ndays - 1);

  ws.mergeCells(1, 1, 1, lastCol); // hàng băng rôn để trống, đúng file thật (không có tiêu đề)
  ws.getCell(1, 1).border = BORD;

  ws.mergeCells(2, 1, 2, 3);
  const lblCell = ws.getCell(2, 1);
  lblCell.value = 'Ngày trong tháng:'; lblCell.font = TNR9BG; lblCell.fill = fillOf(CC_LEGENDY); lblCell.alignment = RIGHTW;
  const ndaysCell = ws.getCell(2, 4);
  ndaysCell.value = ndays; ndaysCell.font = TNR9BG; ndaysCell.fill = fillOf(CC_LEGENDY); ndaysCell.alignment = CENW;
  ws.mergeCells(2, dayCol0, 2, lastCol);
  const legendCell = ws.getCell(2, dayCol0);
  legendCell.value = `Ký hiệu: C1 = ca Full (${office.shiftDefs.find(d => d.code === 'F').hours}) | NS = nửa ca Sáng (${office.shiftDefs.find(d => d.code === 'NS').hours}) | `
    + `NC = nửa ca Chiều (${office.shiftDefs.find(d => d.code === 'NC').hours}) | để trống = nghỉ | TV/HV/KL/C2/HC/T#/L# = mã nhập tay nếu cần (không tự sinh từ web) | `
    + `Cột ngày lấy tự động từ sheet "${ltInfo.sheetName}", sửa giờ ở đó thì bảng này tự cập nhật, không cần xuất lại file.`;
  legendCell.font = TNR9; legendCell.fill = fillOf(CC_LEGENDY); legendCell.alignment = LEFTW;

  const r0 = 4;
  [[1, 'STT'], [2, 'Mã NV'], [3, 'Họ tên'], [4, 'Chức danh']].forEach(([col, label]) => {
    ws.mergeCells(r0, col, r0 + 1, col);
    const c = ws.getCell(r0, col);
    c.value = label; c.font = TNR9BW; c.alignment = CENW; c.border = BORD; c.fill = fillOf(CC_NAVY);
  });
  ws.mergeCells(r0, dayCol0, r0, dayCol0 + ndays - 1);
  const hcell = ws.getCell(r0, dayCol0);
  hcell.value = `NGÀY TRONG THÁNG ${String(month).padStart(2, '0')}/${year}`;
  hcell.font = TNR9BW; hcell.fill = fillOf(CC_BLUE); hcell.alignment = CENW; hcell.border = BORD;
  dates.forEach((d, i) => {
    const c = ws.getCell(r0 + 1, dayCol0 + i);
    c.value = d.getUTCDate();
    c.font = TNR9BW; c.fill = fillOf(CC_BLUE); c.alignment = CENW; c.border = BORD;
  });
  const g1Labels = ['Công chính thức', 'Công Thử việc', 'Công Học việc', 'Công C1', 'Công C2', 'Công NS', 'Công NC'];
  const g2Labels = ['Giờ tăng ca \n(100%)', 'Giờ tăng ca \n(200%)'];
  const g3Labels = ['Nghỉ KL', 'Ngày vào'];
  ws.mergeCells(r0, offCC, r0, offCC + 6);
  ws.getCell(r0, offCC).value = 'Tổng\n ngày\n công';
  ws.mergeCells(r0, offCC + 7, r0, offCC + 8);
  ws.getCell(r0, offCC + 7).value = 'Làm thêm giờ';
  ws.mergeCells(r0, offCC + 9, r0, offCC + 10);
  ws.getCell(r0, offCC + 9).value = 'Thông tin cá nhân';
  [...g1Labels, ...g2Labels, ...g3Labels].forEach((lbl, k) => { ws.getCell(r0 + 1, offCC + k).value = lbl; });
  for (let col = dayCol0; col <= lastCol; col++) {
    for (const row of [r0, r0 + 1]) {
      const c = ws.getCell(row, col);
      c.font = TNR9BW; c.fill = fillOf(CC_BLUE); c.alignment = CENW; c.border = BORD;
    }
  }

  const r0c = r0 + 2;
  ws.mergeCells(r0c, 1, r0c, 4);
  const sec = ws.getCell(r0c, 1);
  sec.value = 'TC SAPA'; sec.fill = fillOf(CC_BLUE); sec.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  sec.alignment = { horizontal: 'left', vertical: 'middle' };

  // (đếm cả "0.5X" — mã nhập tay cho nửa công — dù web không tự sinh, vẫn tính đúng nếu HR gõ tay sau)
  const g1Formula = (rng) => [
    `COUNTIF(${rng},1)+COUNTIF(${rng},"x")`,
    `COUNTIF(${rng},"TV")+(COUNTIF(${rng},"0.5TV")/2)`,
    `COUNTIF(${rng},"HV")+(COUNTIF(${rng},"0.5HV")/2)`,
    `COUNTIF(${rng},"C1")+(COUNTIF(${rng},"0.5C1")/2)`,
    `COUNTIF(${rng},"C2")+(COUNTIF(${rng},"0.5C2")/2)`,
    `COUNTIF(${rng},"NS")+(COUNTIF(${rng},"0.5NS")/2)`,
    `COUNTIF(${rng},"NC")+(COUNTIF(${rng},"0.5NC")/2)`,
  ];
  const L_STEPS = []; // L0.5, L1, L1.5, ... L12 — hệ số giờ tăng ca ngày lễ, nhập tay
  for (let h = 0.5; h <= 12; h += 0.5) L_STEPS.push(h);
  const g2FormulaOT200 = (rng) => L_STEPS.map(h => `COUNTIF(${rng},"L${h}")*${h}`).join('+');

  let row = r0c + 1;
  people.forEach((p, idx) => {
    const ltRow = ltInfo.dataStartRow + idx;
    const isFirst = idx === 0;
    const sttCell = ws.getCell(row, 1);
    sttCell.value = isFirst ? 1 : { formula: `1+A${row - 2}` };
    ws.getCell(row, 2).value = p.id === 'MANHCHUAN' ? '' : p.id;
    ws.getCell(row, 3).value = p.name;
    ws.getCell(row, 4).value = p.title || 'Lái xe TC Sapa';
    for (let col = 1; col <= 4; col++) {
      const c = ws.getCell(row, col); c.font = TNR9; c.alignment = CENW; c.border = BORD;
    }
    ws.getCell(row, 3).alignment = LEFTW;

    dates.forEach((d, i) => {
      const colLetter = colToLetter(ltInfo.dayCol0 + i);
      const ltRef = `'${ltInfo.sheetName}'!${colLetter}${ltRow}`;
      const c = ws.getCell(row, dayCol0 + i);
      c.value = { formula: tcsapaDayFormula(office, ltRef) };
      c.font = TNR9; c.alignment = CENW; c.border = BORD; c.fill = fillOf(CC_INPUTY);
    });

    const rng = `${dayColLetter0}${row}:${dayColLetter1}${row}`;
    g1Formula(rng).forEach((f, k) => {
      const c = ws.getCell(row, offCC + k);
      c.value = { formula: f }; c.font = TNR9B; c.alignment = CENW; c.border = BORD;
    });
    const otRow = row + 1;
    const otRng = `${dayColLetter0}${otRow}:${dayColLetter1}${otRow}`;
    const c100 = ws.getCell(row, offCC + 7);
    c100.value = { formula: `SUM(${otRng})` }; c100.font = TNR9B; c100.alignment = CENW; c100.border = BORD;
    const c200 = ws.getCell(row, offCC + 8);
    c200.value = { formula: g2FormulaOT200(rng) }; c200.font = TNR9B; c200.alignment = CENW; c200.border = BORD;
    const cKL = ws.getCell(row, offCC + 9);
    cKL.value = { formula: `COUNTIF(${rng},"KL")+(COUNTIF(${rng},"0.5KL")/2)` }; cKL.font = TNR9B; cKL.alignment = CENW; cKL.border = BORD;
    ws.getCell(row, offCC + 10).border = BORD; // Ngày vào — nhập tay

    // dòng "↳ Tăng ca (giờ/ngày)" — để trống, nhập tay số giờ tăng ca 100% mỗi ngày (T#) hoặc mã L# cho 200%
    ws.getCell(otRow, 4).value = '   ↳ Tăng ca (giờ/ngày)';
    ws.getCell(otRow, 4).font = TNR8G;
    for (let col = 1; col <= lastCol; col++) {
      const c = ws.getCell(otRow, col); c.fill = fillOf(CC_GRAY); c.font = TNR8G; c.border = BORD;
    }
    ws.getRow(row).height = 22.25;
    ws.getRow(otRow).height = 14;
    row += 2;
  });

  row += 1;
  ws.mergeCells(row, 1, row, Math.min(lastCol, 48));
  const sig = ws.getCell(row, 1);
  sig.value = 'Người lập' + ' '.repeat(40) + 'Phòng HCNS' + ' '.repeat(40) + 'Kế toán trưởng' + ' '.repeat(40) + 'Ban Lãnh đạo';
  sig.font = { name: 'Times New Roman', size: 11, bold: true }; sig.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  row += 2;

  ws.getCell(row, 1).value = 'Hướng dẫn chấm công:'; ws.getCell(row, 1).font = TNR9B;
  row += 1;
  ['Diễn giải', '', 'Ký hiệu ca làm việc', 'Mức lương', 'PC ăn'].forEach((t, j) => {
    const c = ws.getCell(row, j + 1);
    c.value = t; c.fill = fillOf(CC_NAVY); c.font = TNR9BW; c.alignment = CENW; c.border = BORD;
  });
  const legendRows = [
    [`${office.shiftDefs.find(d => d.code === 'F').hours} (ca Full)`, '', 'C1', 650000, 60000],
    [`${office.shiftDefs.find(d => d.code === 'NS').hours} (nửa Sáng)`, '', 'NS', 450000, 40000],
    [`${office.shiftDefs.find(d => d.code === 'NC').hours} (nửa Chiều)`, '', 'NC', 450000, 40000],
    ['Học việc', '', 'HV', '', ''],
    ["VP/lái xe không chia ca: đi làm chấm '1'", '', 1, '', ''],
  ];
  legendRows.forEach(r => {
    row += 1;
    r.forEach((v, j) => { const c = ws.getCell(row, j + 1); c.value = v; c.font = TNR9; c.border = BORD; });
    ws.mergeCells(row, 1, row, 2);
  });

  ws.getColumn(1).width = 5.5; ws.getColumn(2).width = 14.5; ws.getColumn(3).width = 18; ws.getColumn(4).width = 20.5;
  for (let i = 0; i < ndays; i++) ws.getColumn(dayCol0 + i).width = 6;
  for (let k = 0; k < 7; k++) ws.getColumn(offCC + k).width = 9;
  ws.getColumn(offCC + 7).width = 9; ws.getColumn(offCC + 8).width = 9;
  ws.getColumn(offCC + 9).width = 9; ws.getColumn(offCC + 10).width = 10;
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: r0c }];
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
