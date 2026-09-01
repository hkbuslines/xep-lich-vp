(function () {
  'use strict';

  var setupHint = document.getElementById('setupHint');
  var table = document.getElementById('arrivalTable');
  var tbody = document.getElementById('arrivalBody');
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

  function render() {
    if (!roster) return;
    var trips = roster.trips || [];
    if (!trips.length) {
      table.hidden = true;
      emptyHint.hidden = false;
      return;
    }
    table.hidden = false;
    emptyHint.hidden = true;
    tbody.innerHTML = '';

    trips.forEach(function (row) {
      var state = arrivals[row.id] || {};
      var isArrived = !!state.arrived;
      var delayed = state.delayedTime || null;

      var tr = document.createElement('tr');
      tr.className = isArrived ? 'is-arrived' : 'is-waiting';

      var driver = row.driver || '';
      if (row.driver2) driver += (driver ? ' & ' : '') + row.driver2;

      var timeCell = delayed
        ? '<span class="time-original">' + (row.departure_time || '—') + '</span>' +
          '<span class="time-delay">→ ' + delayed + '</span>'
        : (row.departure_time || '—');

      tr.innerHTML =
        '<td>' + timeCell + '</td>' +
        '<td class="col-route">' + fmtRoute(row) + '</td>' +
        '<td class="col-plate">' + (row.plate || '—') + '</td>' +
        '<td>' + (driver || '—') + '</td>' +
        '<td>' + (
          isArrived
            ? '<span class="status-pill arrived">✅ ĐÃ ĐẾN</span>'
            : delayed
            ? '<span class="status-pill delay">🕓 TRỄ GIỜ</span>'
            : '<span class="status-pill waiting">⏳ CHƯA ĐẾN</span>'
        ) + '</td>' +
        '<td></td>';

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
        promptDelay(row.id, row.departure_time, delayed);
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

      tr.lastChild.appendChild(actions);
      tbody.appendChild(tr);
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
    delayModalSub.textContent = 'Giờ gốc trên lịch: ' + (originalTime || '—');
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
