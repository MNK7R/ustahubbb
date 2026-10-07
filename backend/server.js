require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { tokenYarat, ruxsatTekshir } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// O'zbekiston telefon raqami formatini tekshirish: +998901234567
const TELEFON_REGEX = /^\+998\d{9}$/;

app.use(cors());
app.use(express.json());

// frontend papkasidagi fayllarni xizmat qilamiz
app.use(express.static(path.join(__dirname, '..', 'frontend')));



app.post('/api/buyurtmalar', (req, res) => {
  const { tavsif, manzil, muammoTuri } = req.body;

  if (!tavsif || !manzil || !muammoTuri) {
    return res.status(400).json({ xato: 'Barcha maydonlar to\'ldirilishi kerak' });
  }


  // usta topish + band qilish + buyurtma yaratishni bitta tranzaksiyada qilamiz,
  // shunda ikkita mijoz bir vaqtda so'rov yuborsa ham bitta ustaga ikkita buyurtma tushmaydi
  const buyurtmaYarat = db.transaction((tavsif, manzil, muammoTuri) => {
    var ustaTop = db.prepare(
      "SELECT * FROM ustalar WHERE turi = ? AND holat = 'bosh' LIMIT 1"
    ).get(muammoTuri);

    if (!ustaTop) {
      ustaTop = db.prepare("SELECT * FROM ustalar WHERE holat = 'bosh' LIMIT 1").get();
    }

    if (!ustaTop) {
      return null;
    }

    const natija = db.prepare(
      'INSERT INTO buyurtmalar (tavsif, manzil, muammo_turi, usta_id, holat) VALUES (?, ?, ?, ?, ?)'
    ).run(tavsif, manzil, muammoTuri, ustaTop.id, 'yolda');

    db.prepare("UPDATE ustalar SET holat = 'band' WHERE id = ?").run(ustaTop.id);

    return { buyurtmaId: natija.lastInsertRowid, usta: ustaTop };
  });

  const natijaObj = buyurtmaYarat(tavsif, manzil, muammoTuri);

  if (!natijaObj) {
    return res.status(404).json({ xato: 'Hozircha bo\'sh usta yo\'q, biroz kuting' });
  }

  res.json({
    buyurtmaId: natijaObj.buyurtmaId,
    usta: {
      ism: natijaObj.usta.ism,
      turi: natijaObj.usta.turi,
      reyting: natijaObj.usta.reyting,
      ishlarSoni: natijaObj.usta.ishlar_soni
    },
    daqiqa: 8 + Math.floor(Math.random() * 10)
  });
});

// mijoz o'z buyurtmasining holatini tekshirishi uchun (kutish ekrani shu orqali yangilanadi)
app.get('/api/buyurtmalar/:id', (req, res) => {
  const buyurtma = db.prepare(`
    SELECT buyurtmalar.*, ustalar.ism as usta_ism, ustalar.telefon as usta_telefon, ustalar.reyting as usta_reyting
    FROM buyurtmalar
    LEFT JOIN ustalar ON buyurtmalar.usta_id = ustalar.id
    WHERE buyurtmalar.id = ?
  `).get(req.params.id);

  if (!buyurtma) {
    return res.status(404).json({ xato: 'Bunday buyurtma topilmadi' });
  }

  res.json(buyurtma);
});




app.post('/api/usta/royxatdan-otish', (req, res) => {
  const { ism, turi, telefon, parol, tuman } = req.body;

  if (!ism || !turi || !telefon || !parol) {
    return res.status(400).json({ xato: 'Ism, turi, telefon va parol kiritilishi shart' });
  }
  if (!TELEFON_REGEX.test(telefon)) {
    return res.status(400).json({ xato: 'Telefon raqami +998901234567 formatida bo\'lishi kerak' });
  }
  if (parol.length < 6) {
    return res.status(400).json({ xato: 'Parol kamida 6 belgidan iborat bo\'lishi kerak' });
  }

  const mavjud = db.prepare('SELECT id FROM ustalar WHERE telefon = ?').get(telefon);
  if (mavjud) {
    return res.status(409).json({ xato: 'Bu telefon raqami bilan usta allaqachon ro\'yxatdan o\'tgan' });
  }

  const parolHash = bcrypt.hashSync(parol, 10);
  const natija = db.prepare(
    'INSERT INTO ustalar (ism, turi, telefon, parol_hash, tuman, holat) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(ism, turi, telefon, parolHash, tuman || '', 'bosh');

  const token = tokenYarat({ id: natija.lastInsertRowid, rol: 'usta', ism });
  res.json({ token, ism, id: natija.lastInsertRowid });
});

app.post('/api/usta/kirish', (req, res) => {
  const { telefon, parol } = req.body;
  if (!telefon || !parol) {
    return res.status(400).json({ xato: 'Telefon va parolni kiriting' });
  }

  const usta = db.prepare('SELECT * FROM ustalar WHERE telefon = ?').get(telefon);
  if (!usta || !usta.parol_hash) {
    return res.status(401).json({ xato: 'Telefon raqami yoki parol xato' });
  }

  const togri = bcrypt.compareSync(parol, usta.parol_hash);
  if (!togri) {
    return res.status(401).json({ xato: 'Telefon raqami yoki parol xato' });
  }

  const token = tokenYarat({ id: usta.id, rol: 'usta', ism: usta.ism });
  res.json({ token, ism: usta.ism, id: usta.id });
});




app.get('/api/usta/men', ruxsatTekshir('usta'), (req, res) => {
  const usta = db.prepare('SELECT id, ism, turi, telefon, tuman, reyting, ishlar_soni, holat FROM ustalar WHERE id = ?')
    .get(req.foydalanuvchi.id);

  if (!usta) {
    return res.status(404).json({ xato: 'Profil topilmadi' });
  }

 
  const joriyBuyurtma = db.prepare(
    "SELECT * FROM buyurtmalar WHERE usta_id = ? AND holat = 'yolda' ORDER BY yaratilgan_vaqt DESC LIMIT 1"
  ).get(usta.id);

  const tarix = db.prepare(
    "SELECT * FROM buyurtmalar WHERE usta_id = ? AND holat = 'bajarildi' ORDER BY yaratilgan_vaqt DESC LIMIT 10"
  ).all(usta.id);

  res.json({ usta, joriyBuyurtma: joriyBuyurtma || null, tarix });
});


app.post('/api/usta/holat', ruxsatTekshir('usta'), (req, res) => {
  const { holat } = req.body;
  if (holat !== 'bosh' && holat !== 'band') {
    return res.status(400).json({ xato: 'Holat "bosh" yoki "band" bo\'lishi kerak' });
  }

  const faolBuyurtma = db.prepare(
    "SELECT id FROM buyurtmalar WHERE usta_id = ? AND holat = 'yolda'"
  ).get(req.foydalanuvchi.id);

  if (faolBuyurtma && holat === 'bosh') {
    return res.status(400).json({ xato: 'Avval joriy buyurtmani yakunlang' });
  }

  db.prepare('UPDATE ustalar SET holat = ? WHERE id = ?').run(holat, req.foydalanuvchi.id);
  res.json({ xabar: 'Holat yangilandi', holat });
});

// usta o'z buyurtmasini bajarildi deb belgilaydi -> o'zi avtomatik bo'shaydi
app.post('/api/usta/buyurtmalar/:id/tugatish', ruxsatTekshir('usta'), (req, res) => {
  const buyurtmaId = req.params.id;
  const buyurtma = db.prepare('SELECT * FROM buyurtmalar WHERE id = ?').get(buyurtmaId);

  if (!buyurtma) {
    return res.status(404).json({ xato: 'Bunday buyurtma topilmadi' });
  }
  if (buyurtma.usta_id !== req.foydalanuvchi.id) {
    return res.status(403).json({ xato: 'Bu buyurtma sizga tegishli emas' });
  }

  db.prepare("UPDATE buyurtmalar SET holat = 'bajarildi' WHERE id = ?").run(buyurtmaId);
  db.prepare("UPDATE ustalar SET holat = 'bosh', ishlar_soni = ishlar_soni + 1 WHERE id = ?").run(req.foydalanuvchi.id);

  res.json({ xabar: 'Buyurtma yakunlandi' });
});



app.post('/api/admin/kirish', (req, res) => {
  const { telefon, parol } = req.body;
  if (!telefon || !parol) {
    return res.status(400).json({ xato: 'Telefon va parolni kiriting' });
  }

  const admin = db.prepare('SELECT * FROM adminlar WHERE telefon = ?').get(telefon);
  if (!admin || !bcrypt.compareSync(parol, admin.parol_hash)) {
    return res.status(401).json({ xato: 'Telefon raqami yoki parol xato' });
  }

  const token = tokenYarat({ id: admin.id, rol: 'admin', ism: admin.ism });
  res.json({ token, ism: admin.ism });
});



app.get('/api/statistika', ruxsatTekshir('admin'), (req, res) => {
  const bugungiBuyurtmalar = db.prepare(
    "SELECT COUNT(*) as soni FROM buyurtmalar WHERE date(yaratilgan_vaqt) = date('now')"
  ).get();

  const faolUstalar = db.prepare('SELECT COUNT(*) as soni FROM ustalar').get();
  const bandUstalar = db.prepare("SELECT COUNT(*) as soni FROM ustalar WHERE holat = 'band'").get();
  const boshUstalar = db.prepare("SELECT COUNT(*) as soni FROM ustalar WHERE holat = 'bosh'").get();

  res.json({
    bugungiBuyurtmalar: bugungiBuyurtmalar.soni,
    faolUstalar: faolUstalar.soni,
    bandUstalar: bandUstalar.soni,
    boshUstalar: boshUstalar.soni
  });
});

app.get('/api/buyurtmalar', ruxsatTekshir('admin'), (req, res) => {
  const buyurtmalar = db.prepare(`
    SELECT buyurtmalar.*, ustalar.ism as usta_ism
    FROM buyurtmalar
    LEFT JOIN ustalar ON buyurtmalar.usta_id = ustalar.id
    ORDER BY buyurtmalar.yaratilgan_vaqt DESC
    LIMIT 20
  `).all();

  res.json(buyurtmalar);
});

app.get('/api/ustalar', ruxsatTekshir('admin'), (req, res) => {
  const ustalar = db.prepare(
    'SELECT id, ism, turi, telefon, tuman, reyting, ishlar_soni, holat FROM ustalar ORDER BY yaratilgan_vaqt DESC'
  ).all();
  res.json(ustalar);
});

// admin tomonidan qo'lda usta qo'shish (masalan ustaning o'zi ro'yxatdan o'tolmasa)
app.post('/api/ustalar', ruxsatTekshir('admin'), (req, res) => {
  const { ism, turi, telefon, tuman } = req.body;

  if (!ism || !turi) {
    return res.status(400).json({ xato: 'Ism va turi kerak' });
  }
  if (telefon && !TELEFON_REGEX.test(telefon)) {
    return res.status(400).json({ xato: 'Telefon raqami +998901234567 formatida bo\'lishi kerak' });
  }
  if (telefon) {
    const mavjud = db.prepare('SELECT id FROM ustalar WHERE telefon = ?').get(telefon);
    if (mavjud) {
      return res.status(409).json({ xato: 'Bu telefon raqami bilan usta allaqachon mavjud' });
    }
  }

  // telefon berilmasa NULL saqlaymiz - bo'sh satr '' saqlansa, UNIQUE cheklov
  // tufayli telefonsiz ikkinchi ustani qo'shib bo'lmay qoladi
  const natija = db.prepare(
    'INSERT INTO ustalar (ism, turi, telefon, tuman) VALUES (?, ?, ?, ?)'
  ).run(ism, turi, telefon || null, tuman || '');

  res.json({ id: natija.lastInsertRowid, xabar: 'Usta qo\'shildi' });
});

// admin buyurtmani bajarildi deb belgilaydi -> usta avtomatik bo'shaydi
app.post('/api/admin/buyurtmalar/:id/tugatish', ruxsatTekshir('admin'), (req, res) => {
  const tugatish = db.transaction((id) => {
    const buyurtma = db.prepare('SELECT * FROM buyurtmalar WHERE id = ?').get(id);
    if (!buyurtma) return { kod: 404, xato: 'Bunday buyurtma topilmadi' };
    if (buyurtma.holat === 'bajarildi') return { kod: 400, xato: 'Buyurtma allaqachon yakunlangan' };

    db.prepare("UPDATE buyurtmalar SET holat = 'bajarildi' WHERE id = ?").run(id);
    if (buyurtma.usta_id) {
      db.prepare("UPDATE ustalar SET holat = 'bosh', ishlar_soni = ishlar_soni + 1 WHERE id = ?").run(buyurtma.usta_id);
    }
    return { kod: 200 };
  });

  const natija = tugatish(req.params.id);
  if (natija.kod !== 200) return res.status(natija.kod).json({ xato: natija.xato });
  res.json({ xabar: 'Buyurtma yakunlandi, usta bo\'shadi' });
});

// admin ustaning holatini qo'lda o'zgartiradi (masalan "qotib qolgan" band ustani bo'shatish)
app.post('/api/admin/ustalar/:id/holat', ruxsatTekshir('admin'), (req, res) => {
  const { holat } = req.body;
  if (holat !== 'bosh' && holat !== 'band') {
    return res.status(400).json({ xato: 'Holat "bosh" yoki "band" bo\'lishi kerak' });
  }
  const natija = db.prepare('UPDATE ustalar SET holat = ? WHERE id = ?').run(holat, req.params.id);
  if (natija.changes === 0) return res.status(404).json({ xato: 'Usta topilmadi' });
  res.json({ xabar: 'Holat yangilandi', holat });
});

// noma'lum /api/* yo'l uchun JSON javob (aks holda frontend static handleriga tushib ketardi)
app.use('/api', (req, res) => {
  res.status(404).json({ xato: 'Bunday API yo\'li topilmadi' });
});

// umumiy xatoliklarni ushlab, HTML stack-trace o'rniga JSON qaytaramiz
app.use((xato, req, res, next) => {
  console.error(xato);

  if (xato && xato.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ xato: 'Bu ma\'lumot allaqachon mavjud (masalan telefon raqami)' });
  }

  res.status(500).json({ xato: 'Serverda kutilmagan xatolik yuz berdi' });
});

app.listen(PORT, () => {
  console.log('server ishga tushdi, port: ' + PORT);
});



const path = require('path');

app.use(express.static(path.join(__dirname, '../frontend')));

// Barcha soʻrovlarda frontend index.html faylini koʻrsatish
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});