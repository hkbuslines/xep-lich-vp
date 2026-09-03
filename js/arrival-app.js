(function () {
  'use strict';

  var setupHint = document.getElementById('setupHint');
  var boardWrap = document.getElementById('arrivalTable');
  var emptyHint = document.getElementById('emptyHint');
  var footerStatus = document.getElementById('footerStatus');

  function todayISO() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  var params = new URLSearchParams(location.search);
  var day = params.get('date') || todayISO();

  function tickClock() {
    var d = new Date();
    document.getElementById('clockTime').textContent = d.toLocaleTimeString('vi-VN', { hour12: false });
    document.getElementById('clockDate').textContent = d.toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
  tickClock();
  setInterval(tickClock, 1000);

  if (typeof isFirebaseConfigured !== 'function' || !isFirebaseConfigured() || typeof firebase === 'undefined') {
    setupHint.hidden = false;
    setupHint.innerHTML =
      'Chưa cấu hình Firebase.<br><br>' +
      'Điền <code>js/firebase-config.js</code> theo hướng dẫn trong <code>README.md</code> ' +
      '(mục "Thiết lập Firebase") — trang này dùng chung project với lịch làm việc.';
    footerStatus.textContent = 'Chưa kết nối';
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  var db = firebase.firestore();
  var rosterRef = db.collection('airport_board').doc('roster_' + day);
  var arrivalsRef = db.collection('airport_board').doc('arrivals_' + day);

  var roster = null;   // { date, trips: [...], syncedAt }
  var arrivals = {};   // { [tripId]: { arrived, arrivedAt, delayedTime } }

  function fmtRoute(row) {
    var from = row.from_city || '';
    var to = row.to_city || '';
    if (from && to) return from + ' → ' + to;
    return row.route_code || from || to || '—';
  }

  // Xe xuất phát cần ~45' mới tới điểm đón Sân bay Nội Bài — giờ hiển thị
  // trên bảng là giờ DỰ KIẾN ĐẾN SÂN BAY (= giờ chạy trên lịch + 45'),
  // không phải giờ xuất bến.
  var AIRPORT_TRAVEL_MIN = 45;
  function addMinutes(timeStr, mins) {
    var m = (timeStr || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return timeStr || '';
    var total = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  var filterFromEl = document.getElementById('filterFrom');
  var filterToEl = document.getElementById('filterTo');
  var filterClearEl = document.getElementById('filterClear');
  var FILTER_KEY = 'arrivalTimeFilter';

  function loadFilter() {
    try {
      var saved = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
      filterFromEl.value = saved.from || '';
      filterToEl.value = saved.to || '';
    } catch (e) { /* localStorage không khả dụng — bỏ qua, coi như không lọc */ }
  }
  function saveFilter() {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ from: filterFromEl.value, to: filterToEl.value }));
    } catch (e) { /* ignore */ }
  }
  loadFilter();
  [filterFromEl, filterToEl].forEach(function (el) {
    el.addEventListener('change', function () { saveFilter(); render(); });
  });
  filterClearEl.addEventListener('click', function () {
    filterFromEl.value = '';
    filterToEl.value = '';
    saveFilter();
    render();
  });

  function render() {
    if (!roster) return;
    var allTrips = roster.trips || [];
    var from = filterFromEl.value;
    var to = filterToEl.value;
    var trips = allTrips.filter(function (row) {
      var est = addMinutes(row.departure_time, AIRPORT_TRAVEL_MIN);
      if (from && est < from) return false;
      if (to && est > to) return false;
      return true;
    });

    if (!trips.length) {
      boardWrap.hidden = true;
      emptyHint.hidden = false;
      emptyHint.textContent = allTrips.length
        ? 'Không có chuyến nào trong khung giờ đã chọn.'
        : 'Hôm nay chưa có chuyến nào trong danh sách đón sân bay.';
      return;
    }
    boardWrap.hidden = false;
    emptyHint.hidden = true;

    // Xoá các ô dữ liệu cũ, GIỮ LẠI 6 ô tiêu đề (.head) — cả header lẫn mọi
    // hàng đều là ô rời trực tiếp trong CÙNG 1 grid (.board-wrap) để đảm bảo
    // luôn thẳng cột: 1 grid duy nhất tính độ rộng cột chung cho tất cả, khác
    // với việc mỗi hàng tự làm 1 grid riêng (sẽ lệch cột giữa các hàng).
    Array.prototype.slice.call(boardWrap.querySelectorAll('.board-cell:not(.head), .board-row-bg'))
      .forEach(function (el) { el.remove(); });

    trips.forEach(function (row, i) {
      var state = arrivals[row.id] || {};
      var isArrived = !!state.arrived;
      var delayed = state.delayedTime || null;
      var statusClass = isArrived ? 'is-arrived' : 'is-waiting';
      // Header chiếm hàng lưới 1 -> mỗi chuyến ở hàng lưới i+2. Đặt rõ
      // gridRow cho cả lớp nền lẫn 6 ô chữ để chúng nằm ĐÚNG 1 hàng — nếu để
      // tự động sắp xếp, ô nền (chiếm hết 6 cột) sẽ bị đẩy sang hàng riêng.
      var gridRow = i + 2;

      var rowBg = document.createElement('div');
      rowBg.className = 'board-row-bg ' + statusClass;
      rowBg.style.gridRow = gridRow;
      boardWrap.appendChild(rowBg);

      var driver = row.driver || '';
      if (row.driver2) driver += (driver ? ' & ' : '') + row.driver2;

      var estArrival = addMinutes(row.departure_time, AIRPORT_TRAVEL_MIN);
      var timeCell = delayed
        ? '<span class="time-original">' + estArrival + '</span>' +
          '<span class="time-delay">→ ' + delayed + '</span>'
        : estArrival;

      var cellDefs = [
        { cls: 'col-time', html: timeCell },
        { cls: 'col-route', html: fmtRoute(row) },
        { cls: 'col-plate', html: row.plate || '—' },
        { cls: '', html: driver || '—' },
        { cls: '', html: isArrived
            ? '<span class="status-pill arrived">✅ ĐÃ ĐẾN</span>'
            : delayed
            ? '<span class="status-pill delay">🕓 TRỄ GIỜ</span>'
            : '<span class="status-pill waiting">⏳ CHƯA ĐẾN</span>' },
      ];

      cellDefs.forEach(function (def, colIdx) {
        var cell = document.createElement('div');
        cell.className = ('board-cell ' + statusClass + ' ' + def.cls).trim();
        cell.style.gridRow = gridRow;
        cell.style.gridColumn = colIdx + 1;
        cell.innerHTML = def.html;
        boardWrap.appendChild(cell);
      });

      var actionsCell = document.createElement('div');
      actionsCell.className = 'board-cell ' + statusClass;
      actionsCell.style.gridRow = gridRow;
      actionsCell.style.gridColumn = 6;
      var actions = document.createElement('div');
      actions.className = 'row-actions';

      var arriveBtn = document.createElement('button');
      arriveBtn.className = 'icon-btn' + (isArrived ? ' is-on' : '');
      arriveBtn.title = isArrived ? 'Bỏ đánh dấu đã đến' : 'Đánh dấu đã đến sân bay';
      arriveBtn.setAttribute('aria-label', arriveBtn.title);
      arriveBtn.textContent = isArrived ? '↺' : '✓';
      arriveBtn.addEventListener('click', function () {
        setArrived(row.id, !isArrived);
      });
      actions.appendChild(arriveBtn);

      var delayBtn = document.createElement('button');
      delayBtn.className = 'icon-btn' + (delayed ? ' is-on' : '');
      delayBtn.title = delayed ? 'Sửa giờ trễ' : 'Báo trễ giờ';
      delayBtn.setAttribute('aria-label', delayBtn.title);
      delayBtn.textContent = '⏰';
      delayBtn.addEventListener('click', function () {
        promptDelay(row.id, estArrival, delayed);
      });
      actions.appendChild(delayBtn);

      if (delayed) {
        var clearBtn = document.createElement('button');
        clearBtn.className = 'icon-btn';
        clearBtn.title = 'Bỏ báo trễ giờ';
        clearBtn.setAttribute('aria-label', clearBtn.title);
        clearBtn.textContent = '✕';
        clearBtn.addEventListener('click', function () {
          setDelay(row.id, null);
        });
        actions.appendChild(clearBtn);
      }

      actionsCell.appendChild(actions);
      boardWrap.appendChild(actionsCell);
    });
  }

  function setArrived(tripId, arrived) {
    var patch = {};
    patch[tripId] = {
      arrived: arrived,
      arrivedAt: arrived ? new Date().toISOString() : null,
    };
    arrivalsRef.set(patch, { merge: true }).catch(function (err) {
      alert('Không lưu được: ' + err.message);
    });
  }

  var delayModal = document.getElementById('delayModal');
  var delayModalSub = document.getElementById('delayModalSub');
  var delayModalInput = document.getElementById('delayModalInput');
  var delayModalCancel = document.getElementById('delayModalCancel');
  var delayModalSave = document.getElementById('delayModalSave');
  var delayModalTripId = null;

  function promptDelay(tripId, originalTime, current) {
    delayModalTripId = tripId;
    delayModalSub.textContent = 'Giờ dự kiến đến SB (theo lịch): ' + (originalTime || '—');
    delayModalInput.value = current || originalTime || '';
    delayModal.hidden = false;
    delayModalInput.focus();
  }

  function closeDelayModal() {
    delayModal.hidden = true;
    delayModalTripId = null;
  }

  delayModalCancel.addEventListener('click', closeDelayModal);
  delayModal.addEventListener('click', function (e) {
    if (e.target === delayModal) closeDelayModal();
  });
  delayModalSave.addEventListener('click', function () {
    if (!delayModalTripId) return;
    if (!delayModalInput.value) {
      alert('Chọn giờ trước khi lưu.');
      return;
    }
    setDelay(delayModalTripId, delayModalInput.value);
    closeDelayModal();
  });

  function setDelay(tripId, time) {
    var patch = {};
    patch[tripId] = { delayedTime: time };
    arrivalsRef.set(patch, { merge: true }).catch(function (err) {
      alert('Không lưu được: ' + err.message);
    });
  }

  rosterRef.onSnapshot(function (snap) {
    roster = snap.exists ? snap.data() : { date: day, trips: [] };
    footerStatus.textContent = roster.syncedAt
      ? 'Odoo đồng bộ lúc ' + new Date(roster.syncedAt).toLocaleTimeString('vi-VN', { hour12: false })
      : 'Chưa có dữ liệu — chạy scripts/airport_board.py để đồng bộ từ Odoo.';
    render();
  }, function (err) {
    footerStatus.textContent = 'Lỗi theo dõi Firestore: ' + err.message;
  });

  arrivalsRef.onSnapshot(function (snap) {
    arrivals = snap.exists ? (snap.data() || {}) : {};
    render();
  }, function (err) {
    footerStatus.textContent = 'Lỗi theo dõi Firestore: ' + err.message;
  });
})();
