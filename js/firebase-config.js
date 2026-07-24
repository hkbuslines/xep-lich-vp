// ĐIỀN thông tin Firebase project của bạn vào đây (xem hướng dẫn trong README.md, mục "Thiết lập Firebase").
// Trước khi điền, app tự chạy ở chế độ "cục bộ" (lưu trong trình duyệt, KHÔNG đồng bộ giữa các văn phòng)
// để bạn xem thử giao diện ngay — vẫn dùng được, chỉ là mỗi máy thấy dữ liệu riêng của máy đó.
//
// Lấy các giá trị bên dưới ở: Firebase Console -> Project settings -> General -> "Your apps" -> SDK setup.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCntEpnJ1lSWBZCalNDSUekHYpj0avK97k',
  authDomain: 'ke-hoach-lam-viec.firebaseapp.com',
  projectId: 'ke-hoach-lam-viec',
  storageBucket: 'ke-hoach-lam-viec.firebasestorage.app',
  messagingSenderId: '118503659720',
  appId: '1:118503659720:web:d487eaa8d70058ff612dfd',
};

function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}
