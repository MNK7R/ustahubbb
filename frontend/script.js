var selectedProblem = null;
// bo'sh qatorli manzil - frontend backend bilan bir xil serverdan xizmat qilgani uchun
// (server.js dagi express.static) domenni qattiq yozib qo'yish shart emas,
// shunda saytni boshqa domenga ko'chirganda ham kod o'zgarmaydi
var API_MANZIL = '';
var adminToken = null;

// HTML ichiga foydalanuvchi kiritgan matnni xavfsiz joylashtirish uchun
// (masalan buyurtma tavsifi yoki usta ismida <script> bo'lib qolmasligi uchun)
function ekranlaHtml(matn) {
  var div = document.createElement('div');
  div.textContent = matn == null ? '' : String(matn);
  return div.innerHTML;
}

// ===================== TAB =====================
function showTab(tabName) {
  var customerPage = document.getElementById('customerPage');
  var adminPage = document.getElementById('adminPage');
  var customerBtn = document.getElementById('tabCustomerBtn');
  var adminBtn = document.getElementById('tabAdminBtn');

  if (tabName === 'customer') {
    customerPage.style.display = 'block';
    adminPage.style.display = 'none';
    customerBtn.classList.add('active');
    adminBtn.classList.remove('active');
  } else {
    customerPage.style.display = 'none';
    adminPage.style.display = 'block';
    adminBtn.classList.add('active');
    customerBtn.classList.remove('active');

    // Token bo'lsa dashboard, bo'lmasa login forma
    if (adminToken) {
      document.getElementById('adminLoginBox').style.display = 'none';
      document.getElementById('adminDashboard').style.display = 'block';
      yuklaAdminMalumotlari();
    } else {
      document.getElementById('adminLoginBox').style.display = 'block';
      document.getElementById('adminDashboard').style.display = 'none';
      document.getElementById('adminLoginXato').textContent = '';
    }
  }
}

// ===================== ADMIN LOGIN =====================
function adminLogin() {
  var telefon = document.getElementById('adminPhoneInput').value.trim();
  var parol = document.getElementById('adminPassInput').value;
  var xatoEl = document.getElementById('adminLoginXato');
  var btn = document.getElementById('adminLoginBtn');

  xatoEl.textContent = '';
  if (!telefon || !parol) {
    xatoEl.textContent = 'Telefon va parolni kiriting';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Tekshirilmoqda...';

  fetch(API_MANZIL + '/api/admin/kirish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefon: telefon, parol: parol })
  })
    .then(function (javob) {
      return javob.json().then(function (data) {
        if (!javob.ok) throw new Error(data.xato || 'Kirish xato');
        return data;
      });
    })
    .then(function (data) {
      adminToken = data.token;
      try { sessionStorage.setItem('adminToken', data.token); } catch (e) {}
      document.getElementById('adminLoginBox').style.display = 'none';
      document.getElementById('adminDashboard').style.display = 'block';
      document.getElementById('adminPassInput').value = '';
      yuklaAdminMalumotlari();
    })
    .catch(function (xato) {
      xatoEl.textContent = xato.message || 'Telefon yoki parol xato';
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = 'Kirish';
    });
}

function adminChiqish() {
  adminToken = null;
  try { sessionStorage.removeItem('adminToken'); } catch (e) {}
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('adminLoginBox').style.display = 'block';
  document.getElementById('adminPassInput').value = '';
  document.getElementById('adminLoginXato').textContent = '';
}

// Sahifa yangilanganda token saqlansa, qayta kirmaslik
(function () {
  try {
    var t = sessionStorage.getItem('adminToken');
    if (t) adminToken = t;
  } catch (e) {}
})();

// ===================== ADMIN MA'LUMOTLAR =====================
function yuklaAdminMalumotlari() {
  var headers = {
    'Authorization': 'Bearer ' + adminToken
  };

  // 1. Statistika
  fetch(API_MANZIL + '/api/statistika', { headers: headers })
    .then(function (javob) { return javob.json(); })
    .then(function (stat) {
      document.getElementById('statBugungi').textContent = stat.bugungiBuyurtmalar;
      document.getElementById('statFaolUstalar').textContent = stat.faolUstalar;
      document.getElementById('statBandBosh').textContent =
        stat.bandUstalar + ' band, ' + stat.boshUstalar + ' bo\'sh';
      document.getElementById('statBandSoni').textContent = stat.bandUstalar;
    })
    .catch(function (xato) {
      console.error('Statistika xato:', xato);
    });

  // 2. Buyurtmalar
  fetch(API_MANZIL + '/api/buyurtmalar', { headers: headers })
    .then(function (javob) { return javob.json(); })
    .then(function (buyurtmalar) {
      var jadvalTana = document.getElementById('ordersTableBody');

      if (!buyurtmalar || buyurtmalar.length === 0) {
        jadvalTana.innerHTML = '<tr><td colspan="6">Hali buyurtma yo\'q</td></tr>';
        return;
      }

      var qatorlarHtml = '';
      for (var i = 0; i < buyurtmalar.length; i++) {
        var b = buyurtmalar[i];

        var holatPill = '';
        if (b.holat === 'yolda') {
          holatPill = '<span class="pill pill-active">Yo\'lda</span>';
        } else if (b.holat === 'bajarildi') {
          holatPill = '<span class="pill pill-done">Bajarildi</span>';
        } else {
          holatPill = '<span class="pill pill-wait">Kutilmoqda</span>';
        }

        var vaqt = b.yaratilgan_vaqt
          ? b.yaratilgan_vaqt.slice(11, 16)   // faqat soat:daqiqa
          : '-';

        qatorlarHtml += '<tr>';
        qatorlarHtml += '<td>' + ekranlaHtml(b.tavsif || '-') + '</td>';
        qatorlarHtml += '<td>' + ekranlaHtml(b.muammo_turi || '-') + '</td>';
        qatorlarHtml += '<td>' + ekranlaHtml(b.usta_ism || '-') + '</td>';
        qatorlarHtml += '<td>' + holatPill + '</td>';
        qatorlarHtml += '<td>' + vaqt + '</td>';
        qatorlarHtml += '<td>' + (b.holat === 'yolda'
          ? '<button class="btn-small" onclick="buyurtmaniTugat(' + Number(b.id) + ')">Bajarildi</button>'
          : '') + '</td>';
        qatorlarHtml += '</tr>';
      }

      jadvalTana.innerHTML = qatorlarHtml;
    })
    .catch(function (xato) {
      console.error('Buyurtmalar xato:', xato);
    });

  // 3. Ustalar
  fetch(API_MANZIL + '/api/ustalar', { headers: headers })
    .then(function (javob) { return javob.json(); })
    .then(function (ustalar) {
      var konteyner = document.getElementById('ustaListContainer');
      var qatorlarHtml = '';

      for (var i = 0; i < ustalar.length; i++) {
        var u = ustalar[i];
        var nuqtaKlass = (u.holat === 'band') ? 'dot-busy' : 'dot-free';
        var holatSoz = (u.holat === 'band') ? 'band' : 'bo\'sh';

        qatorlarHtml += '<div class="usta-row">';
        qatorlarHtml += '<div class="dot ' + nuqtaKlass + '"></div>';
        qatorlarHtml += '<div>';
        qatorlarHtml += '<div class="usta-row-name">' + ekranlaHtml(u.ism) + '</div>';
        qatorlarHtml += '<div class="usta-row-sub">' + ekranlaHtml(u.turi) + ', ' + holatSoz + '</div>';
        qatorlarHtml += '</div>';
        if (u.holat === 'band') {
          qatorlarHtml += '<button class="btn-small" style="margin-left:auto" onclick="ustaniBosh(' + Number(u.id) + ')">Bo\'shatish</button>';
        }
        qatorlarHtml += '</div>';
      }

      konteyner.innerHTML = qatorlarHtml || '<div class="usta-row">Ustalar topilmadi</div>';
    })
    .catch(function (xato) {
      console.error('Ustalar xato:', xato);
    });
}

// ===================== MUAMMO TANLASH =====================
function selectProblem(cardElement, problemName) {
  var allCards = document.querySelectorAll('.problem-card');
  for (var i = 0; i < allCards.length; i++) {
    allCards[i].classList.remove('selected');
  }

  cardElement.classList.add('selected');
  selectedProblem = problemName;

  document.getElementById('orderForm').style.display = 'block';
  document.getElementById('searchingBox').style.display = 'none';
  document.getElementById('matchedBox').style.display = 'none';
}

// ===================== BUYURTMA YUBORISH =====================
function sendOrder() {
  var desc = document.getElementById('descInput').value.trim();
  var addr = document.getElementById('addrInput').value.trim();

  if (!desc || !addr) {
    if (!desc) document.getElementById('descInput').style.borderColor = 'red';
    if (!addr) document.getElementById('addrInput').style.borderColor = 'red';
    return;
  }

  if (!selectedProblem) {
    alert('Avval muammo turini tanlang');
    return;
  }

  // Inputlarni tozalash
  document.getElementById('descInput').style.borderColor = '';
  document.getElementById('addrInput').style.borderColor = '';

  document.getElementById('orderForm').style.display = 'none';
  document.getElementById('matchedBox').style.display = 'none';
  document.getElementById('searchingBox').style.display = 'block';

  fetch(API_MANZIL + '/api/buyurtmalar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tavsif: desc,
      manzil: addr,
      muammoTuri: selectedProblem
    })
  })
    .then(function (javob) {
      if (!javob.ok) {
        return javob.json().then(function (err) {
          throw new Error(err.xato || 'Server xatolik qaytardi');
        });
      }
      return javob.json();
    })
    .then(function (natija) {
      document.getElementById('ustaAvatar').textContent = natija.usta.ism.charAt(0);
      document.getElementById('ustaName').textContent = natija.usta.ism;
      document.getElementById('ustaJobs').textContent = natija.usta.ishlarSoni + ' ta ish';
      document.getElementById('ustaType').textContent = natija.usta.turi;
      document.getElementById('etaNumber').textContent = natija.daqiqa;

      document.getElementById('searchingBox').style.display = 'none';
      document.getElementById('matchedBox').style.display = 'block';

      // Formani tozalash
      document.getElementById('descInput').value = '';
      document.getElementById('addrInput').value = '';
    })
    .catch(function (xato) {
      document.getElementById('searchingBox').style.display = 'none';
      document.getElementById('orderForm').style.display = 'block';
      alert('Xatolik: ' + xato.message);
      console.error(xato);
    });
}

// ===================== ADMIN AMALLARI =====================
function adminPost(url, body) {
  return fetch(API_MANZIL + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
    body: JSON.stringify(body || {})
  }).then(function (javob) {
    return javob.json().then(function (data) {
      if (!javob.ok) throw new Error(data.xato || 'Xatolik');
      return data;
    });
  });
}

function buyurtmaniTugat(id) {
  adminPost('/api/admin/buyurtmalar/' + id + '/tugatish')
    .then(yuklaAdminMalumotlari)
    .catch(function (xato) { alert(xato.message); });
}

function ustaniBosh(id) {
  adminPost('/api/admin/ustalar/' + id + '/holat', { holat: 'bosh' })
    .then(yuklaAdminMalumotlari)
    .catch(function (xato) { alert(xato.message); });
}


// Admin login forma: Enter tugmasi
document.addEventListener('DOMContentLoaded', function () {
  var pass = document.getElementById('adminPassInput');
  var phone = document.getElementById('adminPhoneInput');
  if (pass) {
    pass.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') adminLogin();
    });
  }
  if (phone) {
    phone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var p = document.getElementById('adminPassInput');
        if (p) p.focus();
      }
    });
  }
});
