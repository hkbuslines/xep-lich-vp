// Dữ liệu văn phòng: nhân sự, mã ca, đội/nhóm xoay vòng.
// Chuyển thể từ các file cấu hình gốc (lich_tongdai_config.json, lich_tongdai_sapa_config.json,
// lich_lam_viec_config.json) trong thư mục "Kế hoạch công việc" / "Xếp xe".
// Sửa trực tiếp file này khi có người vào/ra hoặc đổi khung giờ ca — không cần sửa code khác.

const REST_CODE = 'NGHI';
const REST_DEF = { code: REST_CODE, name: 'Nghỉ', hours: '', color: '#e03131' };

const OFFICES = [
  {
    id: 'tongdai',
    name: 'Tổng Đài VP',
    shiftDefs: [
      { code: 'CA1', name: 'Ca 1 (Sáng)', hours: '06:00-15:00', color: '#4C6EF5' },
      { code: 'CA2', name: 'Ca 2 (Chiều-Tối)', hours: '15:00-24:00', color: '#2F9E44' },
      { code: 'CA3', name: 'Ca 3 (Giữa)', hours: '11:00-20:00', color: '#F08C00' },
      { code: 'CADEM', name: 'Ca Đêm', hours: '21:00-07:00', color: '#5F3DC4' },
      { code: 'HC', name: 'Hành chính', hours: '08:00-17:00', color: '#868E96' },
    ],
    teams: [
      { id: 'QL', rotateBy: 'fixed', cycle: ['HC'], dayOff: [7],
        people: [{ id: 'HK0009', name: 'Nguyễn Thị Hương', title: 'Quản lý' }] },
      { id: 'DOI1', rotateBy: 'week', cycle: ['CA1', 'CA2', 'CA3'], cycleOffset: 0, restPerWeek: 1,
        people: [
          { id: 'HK0015', name: 'Hà Hiểu My' },
          { id: 'HK0046', name: 'Lê Thị Hương Giang' },
          { id: 'HK0059', name: 'Nguyễn Thành Luân' },
          { id: 'HK0066', name: 'Nguyễn Thị Duyên' },
        ] },
      { id: 'DOI2', rotateBy: 'week', cycle: ['CA1', 'CA2', 'CA3'], cycleOffset: 1, restPerWeek: 1,
        people: [
          { id: 'HK0104', name: 'Vì Yến Nhi' },
          { id: 'HK0131', name: 'Phạm Khánh Linh' },
          { id: 'HK0161', name: 'Nguyễn Thị Thu Hằng' },
          { id: 'HK0200', name: 'Nguyễn Thị Thanh Thanh' },
        ] },
      { id: 'DOI3', rotateBy: 'week', cycle: ['CA1', 'CA2', 'CA3'], cycleOffset: 2, restPerWeek: 1,
        people: [
          { id: 'HK0220', name: 'Đào Ngọc Dũng' },
          { id: 'HK0341', name: 'Phạm Thị Hoa Mai' },
          { id: 'HK0342', name: 'Phạm Phương Anh' },
          { id: 'HK0349', name: 'Trần Khánh Phương' },
        ] },
      { id: 'CADEM', rotateBy: 'fixed', cycle: ['CADEM'], restPerWeek: 1,
        people: [
          { id: 'HK0360', name: 'Phạm Trung Dũng' },
          { id: 'HK0412', name: 'Nguyễn Thị Thúy Hằng' },
        ] },
    ],
  },
  {
    id: 'tongdai_sapa',
    name: 'Tổng Đài Sapa',
    shiftDefs: [
      { code: 'CA_S', name: 'Ca Sáng', hours: '05:00-14:00', color: '#4C6EF5' },
      { code: 'CA_C', name: 'Ca Chiều', hours: '14:00-23:30', color: '#F08C00' },
      { code: 'DPTC', name: 'Điều phối trung chuyển', hours: '06:00-14:00 & 20:00-23:30', color: '#868E96' },
    ],
    teams: [
      { id: 'TO1', rotateBy: 'week', cycle: ['CA_S', 'CA_C'], cycleOffset: 0,
        people: [
          { id: 'HK0118', name: 'Nguyễn Tuấn Linh', title: 'Trưởng ca' },
          { id: 'HK0171', name: 'Trần Thị Phương Lan' },
          { id: 'HK0314', name: 'Nguyễn Thị Tú Uyên' },
        ] },
      { id: 'TO2', rotateBy: 'week', cycle: ['CA_S', 'CA_C'], cycleOffset: 1,
        people: [
          { id: 'HK0017', name: 'Phạm Thị Thu Phương', title: 'Trưởng ca' },
          { id: 'HK0286', name: 'Lê Anh Quân' },
          { id: 'HK0462', name: 'Phạm Hữu Hiếu' },
        ] },
      { id: 'DPTC', rotateBy: 'fixed', cycle: ['DPTC'],
        people: [{ id: 'HK0175', name: 'Hoàng Thị Ánh Phương', title: 'Điều phối trung chuyển' }] },
    ],
  },
  {
    id: 'tapvu_ruaxe',
    name: 'Tạp Vụ & Rửa Xe Sapa',
    shiftDefs: [
      { code: 'VP_SANG', name: 'VP sáng', hours: '06:00-15:00', color: '#4C6EF5' },
      { code: 'VP_GAY', name: 'VP ca gãy', hours: '6h-9h & 17h30-23h30', color: '#5F3DC4' },
      { code: 'CA_SANG', name: 'Ca sáng', hours: '06:00-15:00', color: '#2F9E44' },
      { code: 'CA_GIUA', name: 'Ca giữa', hours: '09:00-18:00', color: '#F08C00' },
      { code: 'CA_CHIEU', name: 'Ca chiều', hours: '12:00-21:00', color: '#E64980' },
      { code: 'RX', name: 'Rửa xe (cả ca)', hours: '07:00-12:00 & 13:00-18:00', color: '#15AABF' },
    ],
    teams: [
      { id: 'TAPVU', rotateBy: 'day', cycle: ['VP_SANG', 'VP_GAY', 'CA_SANG', 'CA_GIUA', 'CA_CHIEU'], restPerWeek: 1,
        people: [
          { id: 'TV01', name: 'Pàng' },
          { id: 'TV02', name: 'Dù' },
          { id: 'TV03', name: 'Giống' },
          { id: 'TV04', name: 'Say' },
          { id: 'TV05', name: 'Só' },
          { id: 'TV06', name: 'Đức Anh' },
        ] },
      { id: 'RUAXE', rotateBy: 'fixed', cycle: ['RX'],
        people: [
          { id: 'RX01', name: 'Máng' },
          { id: 'RX02', name: 'Sáu' },
        ] },
    ],
  },
  {
    id: 'tcsp',
    name: 'Lái Xe Trung Chuyển Sapa',
    shiftDefs: [
      { code: 'XE1', name: 'Xe 1', hours: 'Cả ngày', color: '#4C6EF5' },
      { code: 'XE2', name: 'Xe 2', hours: 'Cả ngày', color: '#2F9E44' },
      { code: 'XE3', name: 'Xe 3', hours: 'Cả ngày', color: '#F08C00' },
      { code: 'XE4', name: 'Xe 4', hours: 'Cả ngày', color: '#E64980' },
      { code: 'XE5', name: 'Xe 5', hours: 'Cả ngày', color: '#15AABF' },
      { code: 'XE6', name: 'Xe 6', hours: 'Cả ngày', color: '#5F3DC4' },
    ],
    teams: [
      { id: 'LAIXE', rotateBy: 'day', cycle: ['XE1', 'XE2', 'XE3', 'XE4', 'XE5', 'XE6', REST_CODE, REST_CODE],
        people: [
          { id: 'HK0125', name: 'Nguyễn Văn Đức' },
          { id: 'HK0471', name: 'Nguyễn Duy Đức' },
          { id: 'HK0392', name: 'Đồng Xuân Chinh' },
          { id: 'HK0311', name: 'Đỗ Đình Cường' },
          { id: 'HK0304', name: 'Phạm Văn Toàn' },
          { id: 'HK0335', name: 'Nguyễn Việt Ngọc' },
          { id: 'MANHCHUAN', name: 'Mạnh Chuẩn' },
          { id: 'HK0369', name: 'Trần Văn Tuân' },
        ] },
    ],
  },
];

function getOffice(id) {
  return OFFICES.find(o => o.id === id);
}
