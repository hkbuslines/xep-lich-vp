// Dữ liệu văn phòng: nhân sự, mã ca, đội/nhóm xoay vòng.
// Chuyển thể từ các file cấu hình gốc (lich_tongdai_config.json, lich_tongdai_sapa_config.json,
// lich_lam_viec_config.json) trong thư mục "Kế hoạch công việc" / "Xếp xe".
// Sửa trực tiếp file này khi có người vào/ra hoặc đổi khung giờ ca — không cần sửa code khác.

const COMPANY_NAME = 'CÔNG TY TNHH DỊCH VỤ VẬN TẢI VÀ THƯƠNG MẠI HK';
const REST_CODE = 'NGHI';
const REST_DEF = { code: REST_CODE, name: 'Nghỉ', hours: '', color: '#e03131' };

const OFFICES = [
  {
    id: 'tongdai',
    name: 'Tổng Đài 96 Võ Chí Công',
    standardHoursPerDay: 9, // đủ 9h/ngày = 1 công chính, vượt = 0.1 công/giờ tăng ca (sheet Cham cong)
    // Không dùng suggestWeekSchedule() gợi ý sẵn (vốn xoay CA1/2/3 theo đội cố định + giữ nguyên 2
    // người CADEM mãi mãi) — tuần chưa xếp thì để TRỐNG (blankWeekSchedule), để tổng đài tự xếp ca
    // từng người, kể cả tự đảo người trực đêm, không bị thuật toán áp đặt cố định.
    manualOnly: true,
    defaultTitle: 'Nhân viên Tổng đài', // chức danh mặc định khi xuất Excel, thay vì hiện tên đội (Đội 1/2/3)
    shiftDefs: [
      { code: 'CA1', name: 'Ca 1 (Sáng)', hours: '06:00-15:00', color: '#4C6EF5' },
      { code: 'CA2', name: 'Ca 2 (Chiều-Tối)', hours: '15:00-24:00', color: '#2F9E44' },
      { code: 'CA3', name: 'Ca 3 (Giữa)', hours: '11:00-20:00', color: '#F08C00' },
      { code: 'CADEM', name: 'Ca Đêm', hours: '21:00-07:00', color: '#5F3DC4' },
      { code: 'HC', name: 'Hành chính', hours: '08:00-17:00', color: '#868E96' },
    ],
    // Chỉ 1 team duy nhất (không còn Đội 1/2/3/Ca đêm cố định như trước) — vì manualOnly:true nên
    // rotateBy/cycle/restPerWeek của team KHÔNG được dùng nữa (blankWeekSchedule() bỏ qua hết,
    // Tổng Đài tự xếp tay từng người/ngày), và timeline giờ nhóm hiển thị theo CA đang làm (xem
    // groupPeopleByShift trong timeline.js) chứ không theo "Đội" — nên "Đội" chỉ còn là ngăn chứa nội
    // bộ, không có ý nghĩa gì để hiện ra, dẹp bỏ cho đỡ rối khi sửa "Danh sách nhân viên".
    teams: [
      { id: 'NV', name: 'Nhân viên',
        people: [
          { id: 'HK0009', name: 'Nguyễn Thị Hương', title: 'Quản lý' },
          { id: 'HK0015', name: 'Hà Hiểu My' },
          { id: 'HK0046', name: 'Lê Thị Hương Giang' },
          { id: 'HK0059', name: 'Nguyễn Thành Luân' },
          { id: 'HK0066', name: 'Nguyễn Thị Duyên' },
          { id: 'HK0104', name: 'Vì Yến Nhi' },
          { id: 'HK0131', name: 'Phạm Khánh Linh' },
          { id: 'HK0161', name: 'Nguyễn Thị Thu Hằng' },
          { id: 'HK0200', name: 'Nguyễn Thị Thanh Thanh' },
          { id: 'HK0220', name: 'Đào Ngọc Dũng' },
          { id: 'HK0341', name: 'Phạm Thị Hoa Mai' },
          { id: 'HK0342', name: 'Phạm Phương Anh' },
          { id: 'HK0349', name: 'Trần Khánh Phương' },
          { id: 'HK0360', name: 'Phạm Trung Dũng' },
          { id: 'HK0412', name: 'Nguyễn Thị Thúy Hằng' },
        ] },
    ],
  },
  {
    id: 'tongdai_sapa',
    name: 'Tổng Đài Sapa',
    standardHoursPerDay: 9,
    shiftDefs: [
      { code: 'CA_S', name: 'Ca Sáng', hours: '05:00-14:00', color: '#4C6EF5' },
      { code: 'CA_C', name: 'Ca Chiều', hours: '14:00-23:30', color: '#F08C00' },
      { code: 'DPTC', name: 'Điều phối trung chuyển', hours: '06:00-14:00 & 20:00-23:30', color: '#868E96' },
    ],
    teams: [
      { id: 'TO1', name: 'Tổ 2', rotateBy: 'week', cycle: ['CA_S', 'CA_C'], cycleOffset: 0,
        people: [
          { id: 'HK0118', name: 'Nguyễn Tuấn Linh', title: 'Trưởng ca' },
          { id: 'HK0314', name: 'Nguyễn Thị Tú Uyên' },
          { id: 'HK0286', name: 'Lê Anh Quân' },
        ] },
      { id: 'TO2', name: 'Tổ 1', rotateBy: 'week', cycle: ['CA_S', 'CA_C'], cycleOffset: 1,
        people: [
          { id: 'HK0017', name: 'Phạm Thị Thu Phương', title: 'Trưởng ca' },
          { id: 'HK0462', name: 'Phạm Hữu Hiếu' },
          { id: 'HOANGTHANHHAI', name: 'Hoàng Thanh Hải' }, // chưa có mã NV chính thức, điền sau
        ] },
      { id: 'DPTC', name: 'Điều phối trung chuyển', rotateBy: 'fixed', cycle: ['DPTC'],
        people: [{ id: 'HK0175', name: 'Hoàng Thị Ánh Phương', title: 'Điều phối trung chuyển' }] },
    ],
  },
  {
    id: 'tapvu_ruaxe',
    name: 'Tạp Vụ & Rửa Xe Sapa',
    standardHoursPerDay: 9,
    shiftDefs: [
      { code: 'VP_SANG', name: 'VP sáng', hours: '06:00-15:00', color: '#4C6EF5' },
      { code: 'VP_GAY', name: 'VP ca gãy', hours: '6h-9h & 17h30-23h30', color: '#5F3DC4' },
      { code: 'CA_SANG', name: 'Ca sáng', hours: '06:00-15:00', color: '#2F9E44' },
      { code: 'CA_GIUA', name: 'Ca giữa', hours: '09:00-18:00', color: '#F08C00' },
      { code: 'CA_CHIEU', name: 'Ca chiều', hours: '12:00-21:00', color: '#E64980' },
      { code: 'RX', name: 'Rửa xe (cả ca)', hours: '07:00-12:00 & 13:00-18:00', color: '#15AABF' },
      { code: 'HC', name: 'Hành chính', hours: '08:00-17:00', color: '#868E96' },
    ],
    // Tên đầy đủ: lấy từ "Xếp xe/lich_lam_viec_tapvu_config.json" — roster chốt theo xác nhận
    // 22/07/2026 (mã NV thật SAPA015/SAPA022/SAPA007 chưa có cho 5 người còn lại, cần HR bổ sung
    // trước khi dùng file chấm công thật, tạm dùng mã nội bộ TV0x/RX0x của app này).
    teams: [
      { id: 'QL', name: 'Quản lý', rotateBy: 'fixed', cycle: ['HC'], dayOff: [7],
        people: [{ id: 'HK0171', name: 'Trần Thị Phương Lan', title: 'Quản lý' }] },
      { id: 'TAPVU', name: 'Tạp vụ', rotateBy: 'day', cycle: ['VP_SANG', 'VP_GAY', 'CA_SANG', 'CA_GIUA', 'CA_CHIEU'], restPerWeek: 1,
        people: [
          { id: 'TV01', name: 'Giàng Thị Pàng' },
          { id: 'TV02', name: 'Má Thị Dù' },
          { id: 'TV03', name: 'Giàng Thị Giống' },
          { id: 'TV04', name: 'Lý Thị Say' },
          { id: 'TV05', name: 'Lò Thị Só' },
          { id: 'TV06', name: 'Phạm Lê Đức Anh' },
        ] },
      // noOvertime: rửa xe làm đủ 1 ngày công chuẩn 10h dù chỉ trực ~5h/ca — KHÔNG tính giờ vượt
      // thành tăng ca (giống branch 'rx' trong xep_lich_tapvu_rua_xe.py) — chấm công chỉ đếm có/không đi làm.
      { id: 'RUAXE', name: 'Rửa xe', rotateBy: 'fixed', cycle: ['RX'], noOvertime: true,
        people: [
          { id: 'RX01', name: 'Giàng A Máng' },
          { id: 'RX02', name: 'Chang A Sáu' },
        ] },
    ],
  },
  {
    id: 'tcsp',
    name: 'Lái Xe Trung Chuyển Sapa',
    standardHoursPerDay: null, // lái xe chấm công theo CA (Full/nửa ca), không tính giờ tăng ca theo giờ
    numVehicles: 6, // theo lich_lam_viec_config.json — 6 xe: 5 xe/1 người lái Full cả ngày + 1 xe chia đôi NS/NC
    // Mã ca đúng thực tế vận hành (Xếp xe/lich_lam_viec_config.json + xep_lich_lam_viec.py), KHÔNG
    // phải "mỗi người 1 xe cố định XE1..XE6" như bản cũ — mỗi ngày: numVehicles-1=5 người chạy Full
    // nguyên 1 xe cả ngày (F, hiển thị "C1" trên Cham cong), 1 xe còn lại chia đôi cho 2 người (NS
    // nửa sáng + NC nửa chiều), 1 người nghỉ. Giờ ca khớp đúng cột "Sapa" trong file thật
    // "Trung Chuyển/.../Chấm công TC Sapa - Tháng 07.2026.xlsx" (sheet "Ký hiệu").
    shiftDefs: [
      { code: 'F', name: 'Ca Full (C1)', hours: '05:30-23:00', color: '#4C6EF5' },
      { code: 'NS', name: 'Nửa ca Sáng (NS)', hours: '05:00-14:00', color: '#2F9E44' },
      { code: 'NC', name: 'Nửa ca Chiều (NC)', hours: '14:00-24:00', color: '#F08C00' },
    ],
    // Khớp đúng lich_lam_viec_config.json 'rates' — dùng chung cho sheet "Thong so" và bảng "Ký hiệu"
    // trong Cham cong khi xuất Excel, tránh lặp số liệu 2 nơi.
    rates: {
      half: { base: 450000, an_ca: 40000, thuong: 0 },
      full: { base: 650000, an_ca: 60000, thuong: 100000 },
    },
    teams: [
      // Trần Văn Tuân đã nghỉ việc — còn 7 người cho cycle 8 vị trí (5 Full+NS+NC+Nghỉ, vẫn giữ đủ 6
      // xe). suggestWeekSchedule() (rotateBy:'day', code = cycle[(dayIdx+memberIdx+wIdx)%cycle.length])
      // tự xử lý đúng trường hợp "số người ít hơn số vị trí trong cycle": mỗi ngày tự động THIẾU ĐÚNG
      // 1 vị trí (xoay vòng qua các ngày/tuần, không cố định ai) — 1/8 số ngày thiếu đúng vị trí Nghỉ
      // (đủ nguyên 6 xe, không ai nghỉ), 7/8 ngày còn lại thiếu 1 vị trí làm việc thật (có 1 người
      // nghỉ, xe giảm tải tương ứng) — y hệt build_schedule_hybrid_short() bên xep_lich_lam_viec.py.
      { id: 'LAIXE', name: 'Lái xe', rotateBy: 'day', noOvertime: true,
        cycle: ['F', 'F', 'F', 'F', 'F', 'NS', 'NC', REST_CODE],
        people: [
          { id: 'HK0125', name: 'Nguyễn Văn Đức' },
          { id: 'HK0471', name: 'Nguyễn Duy Đức' },
          { id: 'HK0392', name: 'Đồng Xuân Chinh' },
          { id: 'HK0311', name: 'Đỗ Đình Cường' },
          { id: 'HK0304', name: 'Phạm Văn Toàn' },
          { id: 'HK0335', name: 'Nguyễn Việt Ngọc' },
          { id: 'MANHCHUAN', name: 'Mạnh Chuẩn' }, // chưa có mã NV chính thức (employee_info để trống)
        ] },
    ],
  },
];

function getOffice(id) {
  return OFFICES.find(o => o.id === id);
}

// Ghi đè office.teams[].people TĨNH bằng danh sách đã lưu qua UI "Danh sách nhân viên" (Firestore/
// localStorage, xem StorageAPI.loadRoster/subscribeRoster) — GHI TRỰC TIẾP vào object office đang
// dùng chung toàn app (getOffice() luôn trả về CÙNG 1 object), để mọi nơi đọc office.teams (xếp
// lịch, xuất Excel, trang tổng hợp...) tự thấy danh sách mới nhất mà không cần sửa lại từng chỗ.
// rosterDoc null/không có team nào khớp -> giữ nguyên people tĩnh gốc trong offices-data.js.
function applyRosterOverride(office, rosterDoc) {
  if (!rosterDoc || !rosterDoc.teams) return office;
  for (const team of office.teams) {
    if (Array.isArray(rosterDoc.teams[team.id])) team.people = rosterDoc.teams[team.id];
  }
  return office;
}

// "Nguyễn Văn Đức" -> "NGUYENVANDUC" — id tạm cho nhân viên CHƯA CÓ mã NV chính thức khi thêm qua UI
// (giống các trường hợp có sẵn MANHCHUAN/HOANGTHANHHAI) — bỏ dấu, chỉ giữ chữ+số, thêm số phía sau
// nếu trùng id đã có trong `existingIds`.
function slugifyPersonId(name, existingIds) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NV';
  let id = base, n = 2;
  while (existingIds.has(id)) { id = base + n; n += 1; }
  return id;
}
