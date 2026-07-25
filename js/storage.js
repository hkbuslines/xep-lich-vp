// Lớp lưu trữ dùng chung: Firestore nếu đã điền js/firebase-config.js, ngược lại localStorage
// (chế độ xem thử cục bộ, không đồng bộ giữa các máy/văn phòng).

const StorageAPI = (() => {
  let mode = 'local';
  let db = null;

  if (typeof isFirebaseConfigured === 'function' && isFirebaseConfigured() && typeof firebase !== 'undefined') {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      mode = 'firebase';
    } catch (e) {
      console.error('Không khởi tạo được Firebase, chuyển sang chế độ cục bộ.', e);
    }
  }

  const docId = (officeId, weekId) => `${officeId}_${weekId}`;
  const localKey = (officeId, weekId) => `xeplich:${officeId}:${weekId}`;

  async function loadWeek(officeId, weekId) {
    if (mode === 'firebase') {
      const snap = await db.collection('schedules').doc(docId(officeId, weekId)).get();
      return snap.exists ? snap.data() : null;
    }
    const raw = localStorage.getItem(localKey(officeId, weekId));
    return raw ? JSON.parse(raw) : null;
  }

  async function saveWeek(officeId, weekId, data, meta) {
    const payload = {
      officeId,
      weekId,
      assignments: data,
      updatedAt: new Date().toISOString(),
      updatedBy: (meta && meta.updatedBy) || '',
    };
    if (mode === 'firebase') {
      await db.collection('schedules').doc(docId(officeId, weekId)).set(payload);
    } else {
      localStorage.setItem(localKey(officeId, weekId), JSON.stringify(payload));
    }
    return payload;
  }

  // cb(payload | null). Trả về hàm để hủy theo dõi.
  function subscribeWeek(officeId, weekId, cb) {
    if (mode === 'firebase') {
      return db.collection('schedules').doc(docId(officeId, weekId)).onSnapshot(
        snap => cb(snap.exists ? snap.data() : null),
        err => console.error('Lỗi theo dõi Firestore:', err)
      );
    }
    loadWeek(officeId, weekId).then(cb);
    const handler = (e) => {
      if (e.key === localKey(officeId, weekId)) {
        cb(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  // ===== Danh sách nhân viên (roster) — GHI ĐÈ lên office.teams[].people tĩnh trong offices-data.js.
  // 1 doc/văn phòng: { teams: { [teamId]: [{id,name,title}, ...] } }. Chưa có doc (văn phòng chưa ai
  // sửa roster qua UI) -> null, code gọi applyRosterOverride() sẽ tự dùng danh sách tĩnh gốc.
  const rosterDocId = (officeId) => officeId;
  const rosterLocalKey = (officeId) => `xeplich:roster:${officeId}`;

  async function loadRoster(officeId) {
    if (mode === 'firebase') {
      const snap = await db.collection('rosters').doc(rosterDocId(officeId)).get();
      return snap.exists ? snap.data() : null;
    }
    const raw = localStorage.getItem(rosterLocalKey(officeId));
    return raw ? JSON.parse(raw) : null;
  }

  async function saveRoster(officeId, teamsPeople) {
    const payload = { teams: teamsPeople, updatedAt: new Date().toISOString() };
    if (mode === 'firebase') {
      await db.collection('rosters').doc(rosterDocId(officeId)).set(payload);
    } else {
      localStorage.setItem(rosterLocalKey(officeId), JSON.stringify(payload));
    }
    return payload;
  }

  function subscribeRoster(officeId, cb) {
    if (mode === 'firebase') {
      return db.collection('rosters').doc(rosterDocId(officeId)).onSnapshot(
        snap => cb(snap.exists ? snap.data() : null),
        err => {
          // vd firestore.rules chưa được deploy (rules trong repo KHÔNG tự áp dụng khi push code —
          // phải deploy riêng qua Firebase Console/CLI) -> đừng treo app chờ mãi, coi như chưa có
          // roster override, dùng tạm danh sách tĩnh gốc trong offices-data.js.
          console.error('Lỗi theo dõi roster (có thể do firestore.rules chưa được deploy):', err);
          cb(null);
        }
      );
    }
    loadRoster(officeId).then(cb);
    const handler = (e) => {
      if (e.key === rosterLocalKey(officeId)) cb(e.newValue ? JSON.parse(e.newValue) : null);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  return { loadWeek, saveWeek, subscribeWeek, loadRoster, saveRoster, subscribeRoster, get mode() { return mode; } };
})();
