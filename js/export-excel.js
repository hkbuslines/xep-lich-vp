// Xuất Excel .xlsx cho 1 tuần — học theo đúng bố cục các file lich_*.xlsx do xep_lich_*.py xuất
// (sheet "Thong so" tóm tắt + sheet lịch có tô màu theo từng mã ca) — nhưng ở quy mô 1 tuần thay vì
// cả tháng, vì trang này xếp/lưu theo từng tuần.

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  return [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
// Trộn màu với trắng để làm nền nhạt (giống các ô CA1/CA2/CA3 pastel trong file gốc), giữ nguyên
// màu gốc làm màu chữ (đậm, dễ đọc) — cùng công thức "fill nhạt / font đậm" như GROUP_COLOR trong
// xep_lich_tongdai.py.
function tintFill(hex) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => c + (255 - c) * 0.82;
  return 'FF' + rgbToHex(mix(r), mix(g), mix(b)).toUpperCase();
}
function solidFont(hex) {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

const XLSX_WEEKDAY_VN = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const THIN_BORDER = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const BORDERS_ALL = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

async function exportWeekExcel(office, schedule, mondayDate) {
  const dates = weekDates(mondayDate);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Xếp Lịch VP';
  wb.created = new Date();

  buildThongSoSheet(wb, office, dates);
  buildLichTuanSheet(wb, office, schedule, dates);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  const fmt = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `lich_${office.id}_tuan_${fmt(dates[0])}_${fmt(dates[6])}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function buildThongSoSheet(wb, office, dates) {
  const ws = wb.addWorksheet('Thong so');
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 40 }, { width: 16 }];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = COMPANY_NAME;
  ws.getCell('A1').font = { bold: true, size: 13 };

  ws.mergeCells('A2:D2');
  const fmt = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  ws.getCell('A2').value = `Lịch làm việc — ${office.name} — Tuần ${fmt(dates[0])} đến ${fmt(dates[6])}`;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF666666' } };

  let r = 4;
  ws.getCell(`A${r}`).value = 'Chú giải mã ca';
  ws.getCell(`A${r}`).font = { bold: true };
  r++;
  const header = ws.getRow(r);
  header.values = ['', 'Mã ca', 'Tên ca / khung giờ', ''];
  header.font = { bold: true };
  r++;
  [...office.shiftDefs, REST_DEF].forEach(d => {
    const row = ws.getRow(r);
    row.getCell(2).value = d.code;
    row.getCell(3).value = d.hours ? `${d.name} (${d.hours})` : d.name;
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tintFill(d.color) } };
    row.getCell(2).font = { bold: true, color: { argb: solidFont(d.color) } };
    row.getCell(2).alignment = { horizontal: 'center' };
    [2, 3].forEach(c => row.getCell(c).border = BORDERS_ALL);
    r++;
  });

  r += 1;
  ws.getCell(`A${r}`).value = 'Danh sách nhân sự theo đội';
  ws.getCell(`A${r}`).font = { bold: true };
  r++;
  const h2 = ws.getRow(r);
  h2.values = ['', 'Đội', 'Họ tên', 'Chức danh'];
  h2.font = { bold: true };
  r++;
  for (const team of office.teams) {
    for (const p of team.people) {
      const row = ws.getRow(r);
      row.getCell(2).value = team.id;
      row.getCell(3).value = p.name;
      row.getCell(4).value = p.title || '';
      [2, 3, 4].forEach(c => row.getCell(c).border = BORDERS_ALL);
      r++;
    }
  }
}

function buildLichTuanSheet(wb, office, schedule, dates) {
  const ws = wb.addWorksheet('Lich tuan');
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  ws.columns = [{ width: 26 }, ...dates.map(() => ({ width: 14 }))];

  const header = ws.getRow(1);
  header.getCell(1).value = 'Nhân sự';
  dates.forEach((d, i) => {
    header.getCell(i + 2).value = `${XLSX_WEEKDAY_VN[i]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  header.font = { bold: true };
  header.eachCell(c => {
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    c.border = BORDERS_ALL;
  });

  let r = 2;
  for (const team of office.teams) {
    const teamRow = ws.getRow(r);
    teamRow.getCell(1).value = team.id;
    teamRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF888888' } };
    r++;
    for (const p of team.people) {
      const person = schedule[p.id];
      if (!person) continue;
      const row = ws.getRow(r);
      row.getCell(1).value = person.title ? `${person.name} (${person.title})` : person.name;
      row.getCell(1).border = BORDERS_ALL;
      person.days.forEach((code, i) => {
        const def = shiftDefFor(office, code);
        const cell = row.getCell(i + 2);
        const ranges = effectiveRanges(office, code, person.ranges && person.ranges[i]);
        const hoursText = code === REST_CODE ? '' : ranges.map(([s, e]) => `${fmtHM(s)}-${fmtHM(Math.min(e, 24))}`).join(' & ');
        cell.value = hoursText ? `${def.code}\n${hoursText}` : def.code;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tintFill(def.color) } };
        cell.font = { bold: true, color: { argb: solidFont(def.color) }, size: 10 };
        cell.border = BORDERS_ALL;
      });
      r++;
    }
  }
}
