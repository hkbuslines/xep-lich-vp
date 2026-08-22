// Xuất Excel THEO KHOẢNG NGÀY tuỳ chọn (không nhất thiết trọn 1 tháng, không nhất thiết bắt đầu từ
// ngày 1 — người dùng chọn "Từ ngày"/"Đến ngày" bất kỳ trên office.html): sheet "Lich thang" (lịch
// làm việc cả kỳ, dạng text "HH:MM-HH:MM") + sheet "Cham cong" — CÔNG THỨC EXCEL đọc trực tiếp từ
// "Lich thang", đúng cơ chế/định dạng (STT, MÃ NV, HỌ & TÊN, CHỨC DANH, NGÀY VÀO, ngày trong kỳ,
// ĐI LÀM/CÔNG LÀM THÊM/TỔNG CÔNG, 2 dòng/người) như các file thật trong "Chấm công từng VP T05.2026"
// VÀ như xep_lich_tapvu_rua_xe.py / xep_lich_lam_viec.py đã làm cho Tạp Vụ & TC Sapa — sửa giờ trực
// tiếp trong "Lich thang" (kể cả mở bằng Excel, không cần quay lại web app) thì "Cham cong" tự tính
// lại, không cần xuất lại file.

// [fromDate, toDate] (Date UTC-midnight, bao gồm cả 2 đầu) -> mảng Date từng ngày trong khoảng.
function rangeDates(fromDate, toDate) {
  const out = [];
  let d = new Date(fromDate);
  while (d <= toDate) {
    out.push(new Date(d));
    d = new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function fmtDDMM(d) { return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

// Nhãn hiển thị cho khoảng ngày ĐANG CHỌN (fromDate..toDate) — office.html cho chọn THÁNG trước rồi
// mới chọn ngày trong đúng tháng đó, nên luôn giữ được đúng "THÁNG MM/YYYY" quen thuộc trên tiêu đề
// file xuất; nếu người dùng chỉ xuất 1 phần của tháng (không phải ngày 1 -> ngày cuối) thì ghi thêm
// khoảng ngày cụ thể bên cạnh — CÁC CỘT trong sheet vẫn đủ cả tháng (xem inRange()), nhãn này chỉ nói
// rõ phần nào trong đó là kỳ thực sự đang xuất.
function periodLabel(fromDate, toDate) {
  const sameMonth = fromDate.getUTCFullYear() === toDate.getUTCFullYear() && fromDate.getUTCMonth() === toDate.getUTCMonth();
  if (!sameMonth) {
    return fromDate.getUTCFullYear() === toDate.getUTCFullYear()
      ? `${fmtDDMM(fromDate)} – ${fmtDDMM(toDate)}/${toDate.getUTCFullYear()}`
      : `${fmtDDMM(fromDate)}/${fromDate.getUTCFullYear()} – ${fmtDDMM(toDate)}/${toDate.getUTCFullYear()}`;
  }
  const mm = String(fromDate.getUTCMonth() + 1).padStart(2, '0'), yyyy = fromDate.getUTCFullYear();
  const daysInThisMonth = new Date(Date.UTC(yyyy, fromDate.getUTCMonth() + 1, 0)).getUTCDate();
  const isFullMonth = fromDate.getUTCDate() === 1 && toDate.getUTCDate() === daysInThisMonth;
  return isFullMonth
    ? `THÁNG ${mm}/${yyyy}`
    : `THÁNG ${mm}/${yyyy} (${String(fromDate.getUTCDate()).padStart(2, '0')}–${String(toDate.getUTCDate()).padStart(2, '0')})`;
}

// Ngày `d` có nằm trong khoảng ĐANG CHỌN không — cột nào ngoài khoảng này (nhưng vẫn trong tháng) thì
// ĐỂ TRỐNG dữ liệu thay vì không hiện cột, để file xuất luôn đủ cả tháng theo đúng yêu cầu.
function inRange(d, fromDate, toDate) { return d >= fromDate && d <= toDate; }

function monthPersonList(office) {
  const list = [];
  for (const team of office.teams) {
    for (const p of team.people) list.push({ id: p.id, name: p.name, title: p.title || '', team });
  }
  return list;
}

/**
 * Gộp dữ liệu lịch đã lưu theo TUẦN (Firestore) của mọi tuần phủ khoảng `dates` thành 1 lịch theo
 * NGÀY cho cả khoảng đó. CHỈ lấy tuần nào đã "✅ Xác nhận kế hoạch" (saved.confirmed === true) —
 * tuần chưa xác nhận (kể cả đã lưu tay hoặc đang hiện gợi ý tự động trên web) thì để TRỐNG (Nghỉ),
 * theo đúng yêu cầu: không xuất Chấm công dựa trên gợi ý máy, chỉ xuất phần đã người thật duyệt qua.
 * Trả về: { schedule: {...}, unconfirmedWeeks: [Date thứ Hai, ...] } — unconfirmedWeeks để báo cho
 * người dùng biết tuần nào bị bỏ trống trước khi xuất file.
 */
async function computeRangeSchedule(office, dates) {
  const mondays = [];
  let cursor = mondayOf(dates[0]);
  const lastMonday = mondayOf(dates[dates.length - 1]);
  while (cursor <= lastMonday) {
    mondays.push(new Date(cursor));
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  const weekSchedules = {};
  const unconfirmedWeeks = [];
  for (const monday of mondays) {
    const wId = isoDate(monday);
    const saved = await StorageAPI.loadWeek(office.id, wId);
    if (saved && saved.assignments && saved.confirmed) {
      weekSchedules[wId] = saved.assignments;
    } else {
      weekSchedules[wId] = blankWeekSchedule(office);
      unconfirmedWeeks.push(monday);
    }
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
  return { schedule: result, unconfirmedWeeks };
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

// Style riêng cho 3 sheet "Thong so / Lich lam viec / Bang luong" của TCSP (Lái Xe Trung Chuyển Sapa)
// — PHỎNG THEO ĐÚNG export_hybrid_formula_excel() trong xep_lich_lam_viec.py (font mặc định, KHÔNG
// phải Times New Roman như sheet Cham cong — file thật cũng phân biệt vậy).
const TS_HDR_ARGB = 'FF1F4E78';
const TS_TIT = { size: 14, bold: true, color: { argb: 'FF1F4E78' } };
const TS_SUB = { italic: true, color: { argb: 'FF666666' } };
const TS_HF = { bold: true, color: { argb: 'FFFFFFFF' } };
const TS_REST_FILL = 'FFFFC7CE', TS_REST_FONT = 'FF9C0006';
const TS_HALF_FILL = 'FFFFF2CC', TS_HALF_FONT = 'FF9C6500';

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

async function exportRangeExcel(office, fromDate, toDate) {
  // Cột trong sheet luôn đủ CẢ THÁNG chứa fromDate (office.html đảm bảo fromDate/toDate cùng 1 tháng)
  // — ngày ngoài [fromDate, toDate] vẫn có cột nhưng ĐỂ TRỐNG dữ liệu, theo đúng yêu cầu người dùng
  // (dễ đối chiếu với bảng công giấy vốn luôn in đủ ngày trong tháng).
  const year = fromDate.getUTCFullYear(), month = fromDate.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const dates = rangeDates(monthStart, monthEnd);
  const { schedule: monthData, unconfirmedWeeks } = await computeRangeSchedule(office, dates);
  const people = monthPersonList(office);

  // Chỉ cảnh báo những tuần CHƯA xác nhận mà thực sự nằm trong [fromDate, toDate] đang chọn xuất —
  // tuần ngoài khoảng đó vốn đã bị để trống bởi inRange() dù có xác nhận hay không, cảnh báo thêm chỉ
  // gây nhiễu.
  const relevantUnconfirmed = unconfirmedWeeks.filter(monday => {
    const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
    return monday <= toDate && sunday >= fromDate;
  });
  if (relevantUnconfirmed.length) {
    const list = relevantUnconfirmed.map(m => {
      const sun = new Date(m); sun.setUTCDate(sun.getUTCDate() + 6);
      return `${fmtDDMM(m)}–${fmtDDMM(sun)}`;
    }).join(', ');
    const proceed = confirm(`Các tuần sau CHƯA "Xác nhận kế hoạch" nên sẽ để TRỐNG trong file: ${list}.\n\nVẫn tiếp tục xuất?`);
    if (!proceed) return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Xếp Lịch VP';
  wb.created = new Date();

  if (office.id === 'tcsp') {
    // TCSP xuất đúng 4 sheet (Thong so / Lich lam viec / Bang luong / Cham cong) — y hệt cấu trúc
    // export_hybrid_formula_excel() trong xep_lich_lam_viec.py, KHÁC hẳn 3 văn phòng kia (2 sheet
    // Lich thang + Cham cong). Theo yêu cầu người dùng: chỉ TCSP cần đổi, các văn phòng khác giữ nguyên.
    buildTcspExcel(wb, office, monthData, people, dates, fromDate, toDate);
  } else {
    const ltInfo = buildLichThangSheet(wb, office, monthData, people, dates, fromDate, toDate);
    buildChamCongMonthSheet(wb, office, monthData, people, dates, ltInfo, fromDate, toDate);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${office.id}_${fileNameSuffix(fromDate, toDate)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Trọn tháng -> đúng tên file quen thuộc "..._thang_MM_YYYY.xlsx" như trước; xuất 1 phần tháng thì
// ghi rõ khoảng ngày trong tên file để phân biệt.
function fileNameSuffix(fromDate, toDate) {
  const daysInThisMonth = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 0)).getUTCDate();
  const isFullMonth = fromDate.getUTCDate() === 1 && toDate.getUTCDate() === daysInThisMonth
    && fromDate.getUTCFullYear() === toDate.getUTCFullYear() && fromDate.getUTCMonth() === toDate.getUTCMonth();
  return isFullMonth
    ? `thang_${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}_${fromDate.getUTCFullYear()}`
    : `${isoDate(fromDate)}_${isoDate(toDate)}`;
}

// Sheet "Lich thang" — 1 dòng/người, mỗi ô ngày là TEXT "HH:MM-HH:MM" (hoặc "NGHỈ") — nguồn dữ liệu
// để "Cham cong" tham chiếu công thức sang. Trả về vị trí hàng/cột để sheet Cham cong trỏ đúng.
function buildLichThangSheet(wb, office, monthData, people, dates, fromDate, toDate) {
  const sheetName = 'Lich thang';
  const ws = wb.addWorksheet(sheetName);
  const dayCol0 = 3; // cột C
  const lastCol = dayCol0 + dates.length - 1;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `LỊCH LÀM VIỆC — ${office.name.toUpperCase()} — ${periodLabel(fromDate, toDate)}`;
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
  hcell.value = `NGÀY TRONG KỲ ${periodLabel(fromDate, toDate)}`;
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
      c.font = TNR9; c.alignment = CENW; c.border = BORD;
      if (inRange(d, fromDate, toDate)) c.value = formatDayCellText(office, person.days[i], person.ranges[i]);
    });
  });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 26;
  for (let i = 0; i < dates.length; i++) ws.getColumn(dayCol0 + i).width = 13;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: dataStartRow - 1 }];

  return { sheetName, dayCol0, dataStartRow };
}

// Sheet "Cham cong" — 2 dòng/người (chính = đi làm, phụ = công làm thêm), TẤT CẢ là công thức tham
// chiếu sang "Lich thang" — đúng định dạng file thật trong "Chấm công từng VP T05.2026".
function buildChamCongMonthSheet(wb, office, monthData, people, dates, ltInfo, fromDate, toDate) {
  const sheetName = 'Cham cong';
  const ws = wb.addWorksheet(sheetName);
  const dayCol0 = 6; // F
  const colDiLam = dayCol0 + dates.length;
  const colCongThem = colDiLam + 1;
  const colTongCong = colDiLam + 2;
  const lastCol = colTongCong;
  const standardHours = office.standardHoursPerDay;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `BẢNG CHẤM CÔNG — ${office.name.toUpperCase()} — ${periodLabel(fromDate, toDate)}`;
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
  hcell.value = `NGÀY TRONG KỲ ${periodLabel(fromDate, toDate)}`;
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
    [[1, idx + 1], [2, p.id], [3, p.name], [4, p.title || office.defaultTitle || p.team.name || p.team.id], [5, '']].forEach(([col, val]) => {
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

// 4 sheet của TCSP (Thong so / Lich lam viec / Bang luong / Cham cong) — PHỎNG THEO ĐÚNG
// export_hybrid_formula_excel() trong xep_lich_lam_viec.py, để file xuất từ web y hệt file mẫu
// "lich_lam_viec_hybrid_thang_MM_YYYY.xlsx". Chỉ áp dụng cho TCSP, không đụng 3 văn phòng khác.
function buildTcspExcel(wb, office, monthData, people, dates, fromDate, toDate) {
  const rateInfo = buildThongSoSheet(wb, office);
  const ltInfo = buildLichLamViecSheet(wb, office, monthData, people, dates, rateInfo, fromDate, toDate);
  buildBangLuongSheet(wb, office, people, dates, ltInfo, fromDate, toDate);
  buildChamCongTcSapaSheet(wb, office, monthData, people, dates, ltInfo, fromDate, toDate);
}

// Sheet "Thong so" — bảng lương cơ bản/phụ cấp ăn ca/thưởng theo Ca nửa (NS/NC) vs Ca Full (C1),
// lấy từ office.rates (khớp lich_lam_viec_config.json). Tổng thu nhập/ca là CÔNG THỨC (B7/C7) —
// Lich lam viec tham chiếu ngược lại 2 ô này để tính lương từng người.
function buildThongSoSheet(wb, office) {
  const sheetName = 'Thong so';
  const ws = wb.addWorksheet(sheetName);
  ws.getCell(1, 1).value = `THÔNG SỐ LƯƠNG & PHỤ CẤP — ${office.name.toUpperCase()}`;
  ws.getCell(1, 1).font = TS_TIT;

  const half = office.rates.half, full = office.rates.full;
  const rows = [
    ['Hạng mục', 'Ca nửa (NS/NC)', 'Ca Full (C1)', 'Ghi chú'],
    ['Lương cơ bản/ca (đ)', half.base, full.base, ''],
    ['Phụ cấp ăn ca (đ)', half.an_ca, full.an_ca, ''],
    ['Thưởng/ca (đ)', half.thuong, full.thuong, full.thuong ? 'Chỉ ca Full có thưởng' : ''],
    ['Tổng thu nhập/ca (đ)', { formula: 'B4+B5+B6' }, { formula: 'C4+C5+C6' }, 'Lương + phụ cấp + thưởng (công thức)'],
  ];
  rows.forEach((r, i) => {
    const row = 3 + i;
    r.forEach((v, j) => {
      const c = ws.getCell(row, j + 1);
      c.value = v; c.border = BORD;
      if (i === 0) { c.fill = fillOf(TS_HDR_ARGB); c.font = TS_HF; c.alignment = CENW; }
    });
  });
  ws.getColumn(1).width = 28; ws.getColumn(2).width = 20; ws.getColumn(3).width = 16; ws.getColumn(4).width = 34;

  return { sheetName, halfRef: `'${sheetName}'!$B$7`, fullRef: `'${sheetName}'!$C$7` };
}

// Sheet "Lich lam viec" — STT/Họ và tên/Chức danh + mỗi ngày là MÃ CA (F/NS/NC/N), đúng định dạng
// "Lich lam viec" của file mẫu (khác "Lich thang" dùng cho 3 văn phòng kia, vốn ghi giờ dạng text).
// Cột tổng hợp cuối (Số ca Full/Số ca nửa/Ngày nghỉ/Tổng thu nhập) đều là CÔNG THỨC.
function buildLichLamViecSheet(wb, office, monthData, people, dates, rateInfo, fromDate, toDate) {
  const sheetName = 'Lich lam viec';
  const ws = wb.addWorksheet(sheetName);
  const dayCol0 = 4; // D
  const fullCol = dayCol0 + dates.length;
  const halfCol = fullCol + 1, restCol = fullCol + 2, incomeCol = fullCol + 3;
  const dayColLetter0 = colToLetter(dayCol0), dayColLetter1 = colToLetter(dayCol0 + dates.length - 1);

  ws.getCell(1, 1).value = `LỊCH LÀM VIỆC ${office.name.toUpperCase()} — ${periodLabel(fromDate, toDate)} (PA HYBRID)`;
  ws.getCell(1, 1).font = TS_TIT;
  ws.getCell(2, 1).value = `Mỗi ngày: ${office.numVehicles - 1} Full (C1) + 1 cặp nửa (NS/NC) + 1 nghỉ (N). `
    + `Sửa 1 ô ca ở đây thì Bảng lương và Chấm công tự cập nhật theo.`;
  ws.getCell(2, 1).font = TS_SUB;

  const r0 = 4;
  [[1, 'STT'], [2, 'Họ và tên'], [3, 'Chức danh']].forEach(([col, label]) => {
    const c = ws.getCell(r0, col);
    c.value = label; c.fill = fillOf(TS_HDR_ARGB); c.font = TS_HF; c.alignment = CENW; c.border = BORD;
  });
  dates.forEach((d, i) => {
    const c = ws.getCell(r0, dayCol0 + i);
    c.value = `${TL_WEEKDAY[(d.getUTCDay() + 6) % 7]}\n${fmtDDMM(d)}`;
    c.fill = fillOf(TS_HDR_ARGB); c.font = TS_HF; c.alignment = CENW; c.border = BORD;
  });
  ['Số ca Full', 'Số ca nửa', 'Ngày nghỉ', 'Tổng thu nhập (đ)'].forEach((label, k) => {
    const c = ws.getCell(r0, fullCol + k);
    c.value = label; c.fill = fillOf(TS_HDR_ARGB); c.font = TS_HF; c.alignment = CENW; c.border = BORD;
  });

  people.forEach((p, idx) => {
    const row = r0 + 1 + idx;
    ws.getCell(row, 1).value = idx + 1;
    ws.getCell(row, 2).value = p.name;
    ws.getCell(row, 3).value = p.title || 'Lái xe TC Sapa';
    [1, 2, 3].forEach(col => { ws.getCell(row, col).border = BORD; ws.getCell(row, col).alignment = col === 2 ? LEFTW : CENW; });

    const person = monthData[p.id];
    dates.forEach((d, i) => {
      const code = person.days[i];
      const cell = ws.getCell(row, dayCol0 + i);
      cell.value = code === REST_CODE ? 'N' : code;
      cell.alignment = CENW; cell.border = BORD;
      if (code === REST_CODE) { cell.fill = fillOf(TS_REST_FILL); cell.font = { bold: true, color: { argb: TS_REST_FONT } }; }
      else if (code === 'NS' || code === 'NC') { cell.fill = fillOf(TS_HALF_FILL); cell.font = { bold: true, color: { argb: TS_HALF_FONT } }; }
    });

    const rng = `${dayColLetter0}${row}:${dayColLetter1}${row}`;
    ws.getCell(row, fullCol).value = { formula: `COUNTIF(${rng},"F")` }; ws.getCell(row, fullCol).border = BORD;
    ws.getCell(row, halfCol).value = { formula: `COUNTIF(${rng},"NS")+COUNTIF(${rng},"NC")` }; ws.getCell(row, halfCol).border = BORD;
    ws.getCell(row, restCol).value = { formula: `COUNTIF(${rng},"N")` }; ws.getCell(row, restCol).border = BORD;
    ws.getCell(row, incomeCol).value = { formula: `${colToLetter(fullCol)}${row}*${rateInfo.fullRef}+${colToLetter(halfCol)}${row}*${rateInfo.halfRef}` };
    ws.getCell(row, incomeCol).border = BORD;
  });

  const rTotal = r0 + 1 + people.length;
  ws.getCell(rTotal, 2).value = 'SỐ XE HOẠT ĐỘNG TRONG NGÀY';
  dates.forEach((d, i) => {
    const col = dayCol0 + i, letter = colToLetter(col);
    const drng = `${letter}${r0 + 1}:${letter}${r0 + people.length}`;
    ws.getCell(rTotal, col).value = { formula: `COUNTIF(${drng},"F")+(COUNTIF(${drng},"NS")+COUNTIF(${drng},"NC"))/2` };
  });
  ws.getCell(rTotal + 1, 2).value = 'TỔNG CHI PHÍ LƯƠNG (đ)';
  const incomeColLetter = colToLetter(incomeCol);
  ws.getCell(rTotal + 1, 5).value = { formula: `SUM(${incomeColLetter}${r0 + 1}:${incomeColLetter}${r0 + people.length})` };

  ws.getColumn(1).width = 6; ws.getColumn(2).width = 20; ws.getColumn(3).width = 16;
  for (let i = 0; i < dates.length; i++) ws.getColumn(dayCol0 + i).width = 8;
  ws.getColumn(fullCol).width = 10; ws.getColumn(halfCol).width = 10; ws.getColumn(restCol).width = 10; ws.getColumn(incomeCol).width = 16;
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: r0 }];

  return { sheetName, dayCol0, dataStartRow: r0 + 1, fullCol, halfCol, restCol, incomeCol };
}

// Sheet "Bang luong" — mỗi dòng CÔNG THỨC tham chiếu thẳng sang "Lich lam viec", không tính lại —
// sửa lịch thì bảng lương tự cập nhật theo, đúng cơ chế file mẫu.
function buildBangLuongSheet(wb, office, people, dates, ltInfo, fromDate, toDate) {
  const sheetName = 'Bang luong';
  const ws = wb.addWorksheet(sheetName);
  ws.getCell(1, 1).value = `BẢNG LƯƠNG — ${office.name.toUpperCase()} — ${periodLabel(fromDate, toDate)}`;
  ws.getCell(1, 1).font = TS_TIT;
  ws.getCell(2, 1).value = `Giờ TC đêm lấy tự động từ sheet "Cham cong" (dòng "↳ Tăng ca đêm (giờ)", chấm tay) `
    + `× ${office.rates.night_ot.toLocaleString('vi-VN')}đ/giờ — điền số giờ bên đó thì cột này tự cập nhật.`;
  ws.getCell(2, 1).font = TS_SUB;

  // Layout sheet "Cham cong" (được tạo SAU trong buildTcspExcel) — xem ghi chú tại tcspChamCongLayout().
  const ccLayout = tcspChamCongLayout(dates.length);
  const nightOtRef = (ccRow) => `'Cham cong'!${colToLetter(ccLayout.nightOtCol)}${ccRow}`;

  const hdr = ['Họ và tên', 'Chức danh', 'Số ca Full', 'Số ca nửa', 'Ngày nghỉ', 'Giờ TC đêm', 'Tiền TC đêm (đ)', 'Tổng thu nhập (đ)'];
  hdr.forEach((label, j) => {
    const c = ws.getCell(3, j + 1);
    c.value = label; c.fill = fillOf(TS_HDR_ARGB); c.font = TS_HF; c.alignment = CENW; c.border = BORD;
  });

  const ref = (col, lichRow) => `'${ltInfo.sheetName}'!${colToLetter(col)}${lichRow}`;
  people.forEach((p, idx) => {
    const row = 4 + idx;
    const lichRow = ltInfo.dataStartRow + idx;
    const ccRow = ccLayout.dataStartRow + idx * ccLayout.rowStep;
    ws.getCell(row, 1).value = { formula: ref(2, lichRow) };
    ws.getCell(row, 2).value = { formula: ref(3, lichRow) };
    ws.getCell(row, 3).value = { formula: ref(ltInfo.fullCol, lichRow) };
    ws.getCell(row, 4).value = { formula: ref(ltInfo.halfCol, lichRow) };
    ws.getCell(row, 5).value = { formula: ref(ltInfo.restCol, lichRow) };
    ws.getCell(row, 6).value = { formula: nightOtRef(ccRow) };
    ws.getCell(row, 7).value = { formula: `F${row}*${office.rates.night_ot}` };
    ws.getCell(row, 8).value = { formula: `${ref(ltInfo.incomeCol, lichRow)}+G${row}` };
    for (let c = 1; c <= 8; c++) ws.getCell(row, c).border = BORD;
  });

  const rTot = 4 + people.length;
  ws.getCell(rTot, 1).value = 'TỔNG CỘNG'; ws.getCell(rTot, 1).border = BORD;
  ws.getCell(rTot, 8).value = { formula: `SUM(H4:H${rTot - 1})` }; ws.getCell(rTot, 8).border = BORD;
  ws.getCell(rTot + 1, 1).value = 'Thu nhập bình quân/người (đ):';
  ws.getCell(rTot + 1, 8).value = { formula: `H${rTot}/${people.length}` };

  ws.getColumn(1).width = 20; ws.getColumn(2).width = 20; ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 12; ws.getColumn(5).width = 12; ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 16; ws.getColumn(8).width = 20;
}

// Sheet "Cham cong" RIÊNG cho Lái Xe Trung Chuyển Sapa (tcsp) — bố cục/cột/công thức lấy đúng theo
// file thật "Trung Chuyển/Chấm công Trung Chuyển/Chấm công TC Sapa - Tháng 07.2026.xlsx" (sheet
// "BCC tháng X" + "Ký hiệu"), KHÁC hẳn buildChamCongMonthSheet dùng cho 3 văn phòng kia: chấm công
// theo MÃ CA (C1/NS/NC) đếm bằng COUNTIF, không phải đếm giờ. Ô ngày là công thức dịch mã ca
// (F/NS/NC/N) ghi sẵn trong "Lich lam viec" sang đúng mã hiển thị ("C1") — sửa mã ở đó thì bảng này
// tự cập nhật, đúng cơ chế Lich lam viec -> Cham cong trong xep_lich_lam_viec.py.
function tcsapaDayFormula(ltRef) {
  return `IF(${ltRef}="F","C1",IF(${ltRef}="N","",${ltRef}))`;
}

// Toạ độ cố định của sheet "Cham cong" (TCSP) — dùng chung giữa buildBangLuongSheet (cần tham chiếu
// SANG sheet này để tính tiền tăng ca đêm, dù "Cham cong" được tạo SAU trong thứ tự gọi hàm — không
// sao, ExcelJS chỉ ghi công thức dạng text, Excel tự resolve khi mở file, không quan tâm thứ tự tạo
// sheet) và buildChamCongTcSapaSheet (nơi layout này thực sự được dựng). Mỗi người chiếm 3 dòng: dòng
// chính (mã ca) + "↳ Tăng ca (giờ/ngày)" (100%, chấm tay) + "↳ Tăng ca đêm (giờ)" (chấm tay).
function tcspChamCongLayout(ndays) {
  const dayCol0 = 5; // E
  const offCC = dayCol0 + ndays; // cột đầu nhóm tổng hợp bên phải (Công chính thức...)
  const dataStartRow = 7; // r0(4, dòng tiêu đề) + 2 (dòng "TC SAPA") + 1
  return { dayCol0, offCC, dataStartRow, rowStep: 3, nightOtCol: offCC + 9 };
}

function buildChamCongTcSapaSheet(wb, office, monthData, people, dates, ltInfo, fromDate, toDate) {
  const sheetName = 'Cham cong';
  const ws = wb.addWorksheet(sheetName);
  const ndays = dates.length;
  const { dayCol0, offCC, nightOtCol } = tcspChamCongLayout(ndays);
  const lastCol = offCC + 11;
  const dayColLetter0 = colToLetter(dayCol0), dayColLetter1 = colToLetter(dayCol0 + ndays - 1);

  ws.mergeCells(1, 1, 1, lastCol); // hàng băng rôn để trống, đúng file thật (không có tiêu đề)
  ws.getCell(1, 1).border = BORD;

  ws.mergeCells(2, 1, 2, 3);
  const lblCell = ws.getCell(2, 1);
  lblCell.value = 'Số ngày:'; lblCell.font = TNR9BG; lblCell.fill = fillOf(CC_LEGENDY); lblCell.alignment = RIGHTW;
  const ndaysCell = ws.getCell(2, 4);
  ndaysCell.value = ndays; ndaysCell.font = TNR9BG; ndaysCell.fill = fillOf(CC_LEGENDY); ndaysCell.alignment = CENW;
  ws.mergeCells(2, dayCol0, 2, lastCol);
  const legendCell = ws.getCell(2, dayCol0);
  legendCell.value = `Kỳ chấm công: ${periodLabel(fromDate, toDate)} | Ký hiệu: C1 = ca Full (${office.shiftDefs.find(d => d.code === 'F').hours}) | `
    + `NS = nửa ca Sáng (${office.shiftDefs.find(d => d.code === 'NS').hours}) | NC = nửa ca Chiều (${office.shiftDefs.find(d => d.code === 'NC').hours}) | `
    + `để trống = nghỉ | TV/HV/KL/C2/HC/T#/L# = mã nhập tay nếu cần (không tự sinh từ web) | `
    + `Cột ngày lấy tự động từ sheet "${ltInfo.sheetName}", sửa mã ca ở đó thì bảng này tự cập nhật, không cần xuất lại file | `
    + `Tăng ca đêm CHẤM TAY ở dòng "↳ Tăng ca đêm (giờ)" dưới mỗi người, ${office.rates.night_ot.toLocaleString('vi-VN')}đ/giờ (xem sheet "Bang luong").`;
  legendCell.font = TNR9; legendCell.fill = fillOf(CC_LEGENDY); legendCell.alignment = LEFTW;

  const r0 = 4;
  [[1, 'STT'], [2, 'Mã NV'], [3, 'Họ tên'], [4, 'Chức danh']].forEach(([col, label]) => {
    ws.mergeCells(r0, col, r0 + 1, col);
    const c = ws.getCell(r0, col);
    c.value = label; c.font = TNR9BW; c.alignment = CENW; c.border = BORD; c.fill = fillOf(CC_NAVY);
  });
  ws.mergeCells(r0, dayCol0, r0, dayCol0 + ndays - 1);
  const hcell = ws.getCell(r0, dayCol0);
  hcell.value = `NGÀY TRONG KỲ ${periodLabel(fromDate, toDate)}`;
  hcell.font = TNR9BW; hcell.fill = fillOf(CC_BLUE); hcell.alignment = CENW; hcell.border = BORD;
  dates.forEach((d, i) => {
    const c = ws.getCell(r0 + 1, dayCol0 + i);
    c.value = fmtDDMM(d); // dd/mm (không chỉ số ngày) vì kỳ có thể vắt qua nhiều tháng
    c.font = TNR9BW; c.fill = fillOf(CC_BLUE); c.alignment = CENW; c.border = BORD;
  });
  const g1Labels = ['Công chính thức', 'Công Thử việc', 'Công Học việc', 'Công C1', 'Công C2', 'Công NS', 'Công NC'];
  const g2Labels = ['Giờ tăng ca \n(100%)', 'Giờ tăng ca \n(200%)', 'Giờ tăng\nca đêm'];
  const g3Labels = ['Nghỉ KL', 'Ngày vào'];
  ws.mergeCells(r0, offCC, r0, offCC + 6);
  ws.getCell(r0, offCC).value = 'Tổng\n ngày\n công';
  ws.mergeCells(r0, offCC + 7, r0, offCC + 9);
  ws.getCell(r0, offCC + 7).value = 'Làm thêm giờ';
  ws.mergeCells(r0, offCC + 10, r0, offCC + 11);
  ws.getCell(r0, offCC + 10).value = 'Thông tin cá nhân';
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
    sttCell.value = isFirst ? 1 : { formula: `1+A${row - 3}` };
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
      c.value = { formula: tcsapaDayFormula(ltRef) };
      c.font = TNR9; c.alignment = CENW; c.border = BORD; c.fill = fillOf(CC_INPUTY);
    });

    const rng = `${dayColLetter0}${row}:${dayColLetter1}${row}`;
    g1Formula(rng).forEach((f, k) => {
      const c = ws.getCell(row, offCC + k);
      c.value = { formula: f }; c.font = TNR9B; c.alignment = CENW; c.border = BORD;
    });
    const otRow = row + 1;
    const nightRow = row + 2;
    const otRng = `${dayColLetter0}${otRow}:${dayColLetter1}${otRow}`;
    const c100 = ws.getCell(row, offCC + 7);
    c100.value = { formula: `SUM(${otRng})` }; c100.font = TNR9B; c100.alignment = CENW; c100.border = BORD;
    const c200 = ws.getCell(row, offCC + 8);
    c200.value = { formula: g2FormulaOT200(rng) }; c200.font = TNR9B; c200.alignment = CENW; c200.border = BORD;
    const nightRng = `${dayColLetter0}${nightRow}:${dayColLetter1}${nightRow}`;
    const cDem = ws.getCell(row, nightOtCol);
    cDem.value = { formula: `SUM(${nightRng})` }; cDem.font = TNR9B; cDem.alignment = CENW; cDem.border = BORD;
    const cKL = ws.getCell(row, offCC + 10);
    cKL.value = { formula: `COUNTIF(${rng},"KL")+(COUNTIF(${rng},"0.5KL")/2)` }; cKL.font = TNR9B; cKL.alignment = CENW; cKL.border = BORD;
    ws.getCell(row, offCC + 11).border = BORD; // Ngày vào — nhập tay

    // dòng "↳ Tăng ca (giờ/ngày)" — để trống, nhập tay số giờ tăng ca 100% mỗi ngày (T#) hoặc mã L# cho 200%
    ws.getCell(otRow, 4).value = '   ↳ Tăng ca (giờ/ngày)';
    ws.getCell(otRow, 4).font = TNR8G;
    // dòng "↳ Tăng ca đêm (giờ)" — để trống, nhập tay số giờ tăng ca đêm mỗi ngày (luôn chấm tay, không
    // có ca đêm trong offices-data.js để xoay tự động) — Bang luong tự tính tiền theo office.rates.night_ot.
    ws.getCell(nightRow, 4).value = '   ↳ Tăng ca đêm (giờ)';
    ws.getCell(nightRow, 4).font = TNR8G;
    for (const r of [otRow, nightRow]) {
      for (let col = 1; col <= lastCol; col++) {
        const c = ws.getCell(r, col); c.fill = fillOf(CC_GRAY); c.font = TNR8G; c.border = BORD;
      }
    }
    ws.getRow(row).height = 22.25;
    ws.getRow(otRow).height = 14;
    ws.getRow(nightRow).height = 14;
    row += 3;
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
    [`${office.shiftDefs.find(d => d.code === 'F').hours} (ca Full)`, '', 'C1', office.rates.full.base, office.rates.full.an_ca],
    [`${office.shiftDefs.find(d => d.code === 'NS').hours} (nửa Sáng)`, '', 'NS', office.rates.half.base, office.rates.half.an_ca],
    [`${office.shiftDefs.find(d => d.code === 'NC').hours} (nửa Chiều)`, '', 'NC', office.rates.half.base, office.rates.half.an_ca],
    ['Học việc', '', 'HV', '', ''],
    ["VP/lái xe không chia ca: đi làm chấm '1'", '', 1, '', ''],
  ];
  legendRows.forEach(r => {
    row += 1;
    r.forEach((v, j) => { const c = ws.getCell(row, j + 1); c.value = v; c.font = TNR9; c.border = BORD; });
    ws.mergeCells(row, 1, row, 2);
  });

  ws.getColumn(1).width = 5.5; ws.getColumn(2).width = 14.5; ws.getColumn(3).width = 18; ws.getColumn(4).width = 20.5;
  for (let i = 0; i < ndays; i++) ws.getColumn(dayCol0 + i).width = 7;
  for (let k = 0; k < 7; k++) ws.getColumn(offCC + k).width = 9;
  ws.getColumn(offCC + 7).width = 9; ws.getColumn(offCC + 8).width = 9; ws.getColumn(offCC + 9).width = 9;
  ws.getColumn(offCC + 10).width = 9; ws.getColumn(offCC + 11).width = 10;
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
