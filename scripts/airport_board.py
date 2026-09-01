#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Đẩy danh sách chuyến hôm nay (các tuyến có đón khách ở Sân bay Nội Bài) từ
Odoo -> Firestore, để trang arrival.html (repo này) hiển thị kiểu bảng thông
báo sân bay ("xe nào đã đến / chưa đến").

Cách chạy:

    python airport_board.py                # hôm nay
    python airport_board.py 2026-08-28     # 1 ngày cụ thể

Chạy lại bao nhiêu lần cũng an toàn — mỗi lần chỉ GHI ĐÈ phần "roster" (giờ
chạy/biển số/tài xế) ở document Firestore "roster_<ngày>". Trạng thái "đã đến
sân bay" nhân viên bấm tay trên arrival.html được lưu ở document RIÊNG
"arrivals_<ngày>" nên không bao giờ bị script này ghi đè mất.
"""
import sys
import os
import json
import datetime
import urllib.request
import xmlrpc.client

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# --------------------------------------------------------------------------- #
# Cấu hình Odoo — KHÔNG viết cứng API key/mật khẩu ở đây vì file này nằm trong
# repo public (đẩy lên GitHub Pages). Đặt biến môi trường trước khi chạy:
#
#   macOS/Linux:  export ODOO_PASSWORD="dán_key_thật_vào_đây"
#   Windows:      $env:ODOO_PASSWORD = "dán_key_thật_vào_đây"
#
# Lấy key: xem note.txt / odoo_conn.py trong thư mục fleet_odoo (KHÔNG commit
# key thật vào file này).
# --------------------------------------------------------------------------- #
URL = os.environ.get("ODOO_URL", "https://odoo.nicesupport.net")
DB = os.environ.get("ODOO_DB", "hkbuslines")
USER = os.environ.get("ODOO_USER", "nhakhtn@gmail.com")
KEY = os.environ.get("ODOO_PASSWORD") or os.environ.get("ODOO_KEY")
if not KEY:
    raise SystemExit(
        "Thiếu API key Odoo — đặt biến môi trường ODOO_PASSWORD trước khi chạy "
        "(xem hướng dẫn đầu file airport_board.py)."
    )

# Nhóm tuyến (fleet.vehicle.hk_schedule_group trong Odoo) có đón khách Sân bay
# Nội Bài trên đường Hà Nội - Sa Pa. Sửa danh sách này nếu điều hành thêm/bớt
# nhóm tuyến chạy sân bay.
AIRPORT_GROUPS = ["CD_HNSP", "HD_MB", "KLOOK"]

# --------------------------------------------------------------------------- #
# Cấu hình Firestore — CÙNG project mà trang xep-lich-vp đang dùng để lưu lịch
# làm việc (xem js/firebase-config.js). Rules đã cho ghi tự do lên collection
# "airport_board", giống "schedules"/"rosters" đã có sẵn — xem firestore.rules.
# --------------------------------------------------------------------------- #
FIREBASE_PROJECT = "ke-hoach-lam-viec"
FIREBASE_API_KEY = "AIzaSyCntEpnJ1lSWBZCalNDSUekHYpj0avK97k"


# --------------------------------------------------------------------------- #
# Kết nối Odoo — Cloudflare chặn user-agent lạ nên phải giả trình duyệt.
# --------------------------------------------------------------------------- #
class _UA(xmlrpc.client.SafeTransport):
    def send_headers(self, conn, headers):
        conn.putheader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        super().send_headers(conn, headers)


def connect():
    common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common", transport=_UA())
    uid = common.authenticate(DB, USER, KEY, {})
    if not uid:
        raise SystemExit("Đăng nhập Odoo thất bại — kiểm tra lại API key / user.")
    models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object", transport=_UA())

    def call(model, method, *args, **kw):
        return models.execute_kw(DB, uid, KEY, model, method, list(args), kw)

    return call


def m2o_name(v):
    """many2one của Odoo trả về [id, 'tên'] hoặc False."""
    return v[1] if isinstance(v, (list, tuple)) and len(v) > 1 else None


def fetch_airport_trips(call, day):
    rows = call(
        "vexere.trip", "search_read",
        [["date", "=", day], ["vehicle_id.hk_schedule_group", "in", AIRPORT_GROUPS]],
        ["id", "departure_time", "from_city", "to_city", "route_id",
         "vehicle_id", "driver_id", "driver2_id", "vexere_bus_plate"],
    )
    rows.sort(key=lambda r: r.get("departure_time") or "")
    return [{
        "id": r["id"],
        "departure_time": r["departure_time"] or "",
        "from_city": r["from_city"] or "",
        "to_city": r["to_city"] or "",
        "route_code": m2o_name(r["route_id"]) or "",
        "plate": m2o_name(r["vehicle_id"]) or r["vexere_bus_plate"] or "",
        "driver": m2o_name(r["driver_id"]) or "",
        "driver2": m2o_name(r["driver2_id"]) or "",
    } for r in rows]


# --------------------------------------------------------------------------- #
# Firestore REST — không dùng SDK ngoài (chỉ urllib). Rules
# "allow read, write: if true" nên không cần token đăng nhập, chỉ cần API key
# public của project.
# --------------------------------------------------------------------------- #
def _fs_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_fs_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: _fs_value(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}


def firestore_set(collection, doc_id, data):
    """Ghi đè TOÀN BỘ document (PATCH không kèm updateMask = tạo mới/ghi đè)."""
    url = (f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
           f"/databases/(default)/documents/{collection}/{doc_id}?key={FIREBASE_API_KEY}")
    body = json.dumps({"fields": {k: _fs_value(v) for k, v in data.items()}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PATCH",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
    print(f"① Đang lấy chuyến sân bay ngày {day} từ Odoo...")
    call = connect()
    trips = fetch_airport_trips(call, day)
    print(f"② Tìm thấy {len(trips)} chuyến (nhóm tuyến: {', '.join(AIRPORT_GROUPS)}).")

    firestore_set("airport_board", f"roster_{day}", {
        "date": day,
        "trips": trips,
        "syncedAt": datetime.datetime.now().isoformat(timespec="seconds"),
    })
    print(f"③ Đã đẩy lên Firestore project '{FIREBASE_PROJECT}' "
          f"(collection airport_board, doc roster_{day}).")
    print("   Mở arrival.html để xem bảng.")


if __name__ == "__main__":
    main()
