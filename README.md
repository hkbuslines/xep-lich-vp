# Xếp Lịch VP

Web app xếp lịch làm việc hằng tuần cho từng văn phòng (Tổng Đài VP, Tổng Đài Sapa, Tạp Vụ & Rửa Xe Sapa,
Lái Xe Trung Chuyển Sapa) — kéo-thả đổi ca ngay trên trình duyệt, cộng thêm 1 trang **master** xem tổng hợp
lịch của cả 4 văn phòng cùng lúc.

- `office.html?o=<mã văn phòng>` — mỗi văn phòng vào link riêng của mình để xếp/sửa lịch, dạng
  thanh thời gian (giống UI các file `lich_*.html` cũ). Có 2 tab: **"Theo ngày"** (mặc định, mở đúng
  hôm nay — có day-strip chuyển ngày, để hằng ngày vào chỉnh) và **"Theo tuần"** (xem/sửa cả 7 ngày
  cùng lúc). Bấm vào 1 thanh ca để đổi ca, kéo-thả để đổi chỗ 2 ca, có nút xuất file Excel .xlsx
  (2 sheet: "Thong so" tóm tắt + "Lich tuan" có tô màu theo ca, giống định dạng các file `.xlsx` do
  các script `xep_lich_*.py` xuất ra).
- `index.html` — trang master, xem lịch hiện tại của tất cả văn phòng, chỉ để xem + link sang từng văn phòng để sửa.

Không cần cài đặt gì để chạy — thuần HTML/CSS/JS, mở thẳng bằng trình duyệt hoặc host tĩnh (GitHub Pages).

## Chạy thử ngay (chưa cần Firebase)

Mở `index.html` hoặc `office.html` bằng trình duyệt (hoặc `python3 -m http.server` rồi vào `localhost:8000`).
Mặc định app chạy ở **chế độ cục bộ**: lịch lưu trong `localStorage` của trình duyệt — xem giao diện, kéo-thả,
lưu được, nhưng **không đồng bộ** giữa các máy/văn phòng khác nhau. Để 4 văn phòng thấy chung 1 lịch và trang
master thấy hết, cần bật Firebase theo hướng dẫn dưới.

## Thiết lập Firebase (đồng bộ thật giữa các văn phòng)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên bất kỳ (vd. `xep-lich-vp`) → tạo project (miễn phí).
2. Trong project, vào **Build → Firestore Database → Create database** → chọn **Start in production mode** → chọn region gần VN (vd. `asia-southeast1`) → Enable.
3. Vào **Firestore Database → Rules**, dán nội dung file [`firestore.rules`](firestore.rules) trong repo này vào, bấm **Publish**.
4. Vào **Project settings** (bánh răng cạnh "Project Overview") → tab **General** → mục "Your apps" → bấm icon `</>` (Web) → đặt nickname bất kỳ → **Register app**.
5. Firebase hiện ra 1 đoạn `firebaseConfig = {...}` — copy các giá trị đó vào file [`js/firebase-config.js`](js/firebase-config.js) trong repo, ví dụ:
   ```js
   const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "xep-lich-vp.firebaseapp.com",
     projectId: "xep-lich-vp",
     storageBucket: "xep-lich-vp.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
6. Lưu file, tải lại trang — góc trên bên phải sẽ hiện **"🔥 Đồng bộ Firebase"** thay vì "💻 Chế độ cục bộ". Từ giờ mọi văn phòng lưu lịch đều ghi lên Firestore, trang master thấy ngay lập tức (real-time, không cần bấm Làm mới).

Các giá trị trong `firebaseConfig` (`apiKey`...) là public-safe theo thiết kế của Firebase (chúng chỉ định danh
project, không phải mật khẩu) — an toàn khi để trong code đẩy lên GitHub công khai. Quyền truy cập dữ liệu thật
sự do **Firestore Rules** (bước 3) kiểm soát.

### Bảo mật thêm (tuỳ chọn)

Rules mặc định trong repo cho **ai có link cũng sửa được** (không đăng nhập) — phù hợp dùng nội bộ, tin tưởng
nhau. Nếu sau này muốn chặn người ngoài xem/sửa, cách đơn giản nhất là bật **Firebase Authentication** (đăng
nhập bằng email công ty) rồi sửa rule `allow read, write: if request.auth != null;` — báo lại nếu cần, đây là
việc làm thêm ngoài phạm vi bản hiện tại.

## Đưa lên GitHub + GitHub Pages

```bash
cd xep-lich-vp
git init                     # nếu chưa có
git add .
git commit -m "Xếp lịch VP: web app đa văn phòng + trang master"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/xep-lich-vp.git
git push -u origin main
```

Sau đó: vào repo trên GitHub → **Settings → Pages** → "Build and deployment" → Source: **Deploy from a branch**
→ Branch: `main` / `(root)` → Save. Sau 1-2 phút, trang chạy tại
`https://<tên-bạn>.github.io/xep-lich-vp/` — gửi link `.../index.html` cho quản lý xem tổng hợp, và
`.../office.html?o=tongdai` (đổi `o=` theo từng văn phòng) cho từng văn phòng tự xếp lịch.

Mã văn phòng (`o=`): `tongdai`, `tongdai_sapa`, `tapvu_ruaxe`, `tcsp`.

## Sửa danh sách nhân sự / ca làm việc

**Cần làm ngay:** đội Tạp Vụ (`tapvu_ruaxe` → team `TAPVU`) hiện có 5/6 người còn để biệt danh
("Pàng", "Dù", "Giống", "Say", "Đức Anh") vì không tìm được họ tên đầy đủ khớp trong dữ liệu có sẵn —
mở [`js/offices-data.js`](js/offices-data.js) và điền họ tên thật vào field `name` của từng người.

Toàn bộ nhân sự, mã ca, khung giờ nằm trong [`js/offices-data.js`](js/offices-data.js) — sửa trực tiếp file
này (thêm/xoá người trong mảng `people`, đổi giờ trong `shiftDefs`), không cần sửa code chỗ khác. Sau khi sửa,
tuần chưa lưu sẽ tự tính lại gợi ý theo dữ liệu mới; tuần đã lưu giữ nguyên lịch cũ.

## Cách thuật toán gợi ý hoạt động

Mỗi "đội" (`team`) trong `offices-data.js` xoay vòng ca theo 1 trong 3 kiểu (`rotateBy`):

- `week` — cả đội đổi sang mã ca kế tiếp trong `cycle` mỗi tuần (vd. Tổng Đài VP: Đội 1/2/3 đảo CA1→CA2→CA3).
- `day` — từng người trong đội đổi mã ca mỗi ngày, lệch nhau theo thứ tự (vd. Tạp vụ 6 người / 5 vai trò/ngày; Lái xe TC Sapa 8 người / 6 xe, 2 người nghỉ mỗi ngày).
- `fixed` — luôn 1 mã ca cố định (vd. CADEM ca đêm, Quản lý hành chính).

Ngày nghỉ (`restPerWeek`) được rải đều và so le giữa các thành viên cùng đội. Đây **chỉ là gợi ý khởi điểm công
bằng** — không chép lại nguyên bộ luật chi tiết (ưu tiên giờ cao điểm, độ tin cậy từng người...) của các script
Python gốc trong thư mục "Kế hoạch công việc", vì mục tiêu của app này là để từng văn phòng **kéo-thả chỉnh tay**
mỗi tuần trước khi lưu — xem mã nguồn gốc trong `../Kế hoạch công việc/*.py` nếu cần đối chiếu quy tắc chi tiết.

## Cấu trúc file

```
index.html          Trang master — tổng hợp cả 4 văn phòng
office.html          Trang xếp lịch của 1 văn phòng
js/offices-data.js   Danh sách nhân sự + mã ca từng văn phòng — SỬA Ở ĐÂY khi có thay đổi nhân sự
js/scheduler.js       Thuật toán gợi ý lịch tuần (round-robin)
js/storage.js         Lớp lưu trữ: Firestore nếu đã cấu hình, localStorage nếu chưa
js/firebase-config.js Điền config Firebase project của bạn vào đây (xem hướng dẫn ở trên)
js/office-app.js      Logic trang office.html (kéo-thả, lưu, chọn tuần)
js/master-app.js      Logic trang index.html (tổng hợp, theo dõi real-time)
css/style.css         Giao diện chung (tự đổi sáng/tối theo hệ điều hành)
firestore.rules       Rule Firestore đề xuất — dán vào Firebase Console
```
