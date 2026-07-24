// Engine gợi ý lịch tuần — dùng chung cho mọi văn phòng, dựa trên cấu trúc "teams" trong offices-data.js.
// Đây chỉ là GỢI Ý khởi điểm công bằng (xoay vòng round-robin); người dùng luôn có thể kéo-thả sửa tay
// trước khi lưu, nên thuật toán cố tình đơn giản thay vì chép lại nguyên bộ luật phức tạp của các script
// Python gốc (xem README).

const EPOCH_MONDAY = new Date(Date.UTC(2024, 0, 1)); // 2024-01-01 là Thứ 2 — mốc tính "tuần số mấy"

// Mọi Date dùng trong app phải là mốc UTC-midnight đại diện cho 1 ngày lịch (xem parseISODate/todayUTC) —
// mondayOf() luôn đọc bằng getter UTC để không bị lệch ngày theo múi giờ trình duyệt.
function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sun=0 -> 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

// "YYYY-MM-DD" -> Date UTC-midnight, không qua parser timezone của Date() để tránh lệch ngày.
function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function weekIndexOf(mondayDate) {
  const diffDays = Math.round((mondayDate - EPOCH_MONDAY) / 86400000);
  return Math.floor(diffDays / 7);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekId(mondayDate) {
  return isoDate(mondayDate);
}

function weekDates(mondayDate) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d);
  }
  return out;
}

// Phân bổ round-robin `target` lượt nghỉ/tuần cho `n` người, dàn đều trên 7 ngày, so le nhau.
// (Rút gọn từ build_rest_indices trong các script Python gốc.)
function restDayIndicesFor(memberIdx, nMembers, targetPerWeek) {
  if (!targetPerWeek) return new Set();
  const out = new Set();
  for (let k = 0; k < targetPerWeek; k++) {
    const slot = memberIdx * targetPerWeek + k;
    const dayIdx = Math.min(Math.round((slot * 7) / (nMembers * targetPerWeek)), 6);
    out.add(dayIdx);
  }
  return out;
}

/**
 * Tính lịch gợi ý cho 1 văn phòng trong 1 tuần (Thứ 2 -> Chủ nhật).
 * Trả về: { [personId]: { name, title, days: [code x7], ranges: [null x7] } }
 * `ranges[i]` = null nghĩa là dùng đúng khung giờ mặc định của mã ca `days[i]`; nếu người dùng kéo
 * giãn/di chuyển/thêm/xoá giờ ở tab "Theo ngày", `ranges[i]` được ghi đè thành mảng [[s,e], ...] riêng
 * cho đúng ngày đó (xem effectiveRanges() trong js/timeline.js).
 */
function suggestWeekSchedule(office, mondayDate) {
  const wIdx = weekIndexOf(mondayDate);
  const dates = weekDates(mondayDate);
  const result = {};

  for (const team of office.teams) {
    const n = team.people.length;
    team.people.forEach((person, memberIdx) => {
      const days = [];
      const restDays = team.dayOff
        ? new Set(team.dayOff.map(w => w - 1)) // 1=Mon..7=Sun -> 0-indexed
        : restDayIndicesFor(memberIdx, n, team.restPerWeek || 0);

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        if (restDays.has(dayIdx)) {
          days.push(REST_CODE);
          continue;
        }
        let code;
        if (team.rotateBy === 'day') {
          code = team.cycle[(dayIdx + memberIdx) % team.cycle.length];
        } else if (team.rotateBy === 'week') {
          const off = team.cycleOffset || 0;
          code = team.cycle[(wIdx + off) % team.cycle.length];
        } else {
          code = team.cycle[0];
        }
        days.push(code);
      }
      result[person.id] = { name: person.name, title: person.title || '', teamId: team.id, days, ranges: new Array(7).fill(null) };
    });
  }
  return result;
}

function shiftDefFor(office, code) {
  if (code === REST_CODE) return REST_DEF;
  return office.shiftDefs.find(s => s.code === code) || { code, name: code, hours: '', color: '#999' };
}
