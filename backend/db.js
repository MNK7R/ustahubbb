const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'ustahub.db'));


db.exec(`
  CREATE TABLE IF NOT EXISTS ustalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ism TEXT NOT NULL,
    turi TEXT NOT NULL,
    telefon TEXT UNIQUE,
    parol_hash TEXT,
    tuman TEXT DEFAULT '',
    reyting REAL DEFAULT 5.0,
    ishlar_soni INTEGER DEFAULT 0,
    holat TEXT DEFAULT 'bosh',
    yaratilgan_vaqt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS buyurtmalar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tavsif TEXT NOT NULL,
    manzil TEXT NOT NULL,
    muammo_turi TEXT NOT NULL,
    usta_id INTEGER,
    holat TEXT DEFAULT 'kutilmoqda',
    yaratilgan_vaqt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usta_id) REFERENCES ustalar(id)
  )
`);

// boshliqlar (admin) uchun alohida jadval - parol bilan himoyalangan panel
db.exec(`
  CREATE TABLE IF NOT EXISTS adminlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ism TEXT NOT NULL,
    telefon TEXT UNIQUE NOT NULL,
    parol_hash TEXT NOT NULL,
    yaratilgan_vaqt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// eski bazalarda (parol_hash, tuman, yaratilgan_vaqt ustunlari bo'lmasa) jadvalni
// to'g'ri sxema bilan qayta quramiz. Bunday qilamiz, chunki SQLite "ALTER TABLE
// ADD COLUMN" buyrug'iga CURRENT_TIMESTAMP kabi o'zgaruvchan standart qiymatni
// qo'shishga ruxsat bermaydi ("Cannot add a column with non-constant default")
const ustalarUstunlari = db.prepare("PRAGMA table_info(ustalar)").all().map(u => u.name);
const kerakliUstunlar = ['id', 'ism', 'turi', 'telefon', 'parol_hash', 'tuman', 'reyting', 'ishlar_soni', 'holat', 'yaratilgan_vaqt'];
const yetishmayotganUstunlar = kerakliUstunlar.filter(u => !ustalarUstunlari.includes(u));

if (yetishmayotganUstunlar.length > 0) {
  console.log('eski "ustalar" jadvali topildi, yetishmayotgan ustunlar bilan qayta quriladi: ' + yetishmayotganUstunlar.join(', '));

  // buyurtmalar jadvali ustalar(id)ga FOREIGN KEY orqali bog'langani uchun,
  // jadvalni qayta qurishdan oldin FK tekshiruvini vaqtincha o'chiramiz
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE ustalar_yangi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ism TEXT NOT NULL,
      turi TEXT NOT NULL,
      telefon TEXT UNIQUE,
      parol_hash TEXT,
      tuman TEXT DEFAULT '',
      reyting REAL DEFAULT 5.0,
      ishlar_soni INTEGER DEFAULT 0,
      holat TEXT DEFAULT 'bosh',
      yaratilgan_vaqt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // faqat eski jadvalda mavjud bo'lgan ustunlarni ko'chiramiz, qolganlari standart qiymat bilan to'ladi
  const mavjudUstunlar = kerakliUstunlar.filter(u => ustalarUstunlari.includes(u)).join(', ');
  db.exec(`INSERT INTO ustalar_yangi (${mavjudUstunlar}) SELECT ${mavjudUstunlar} FROM ustalar`);

  db.exec('DROP TABLE ustalar');
  db.exec('ALTER TABLE ustalar_yangi RENAME TO ustalar');

  // yangi qo'shilgan yaratilgan_vaqt ustuni bo'sh (NULL) qolgan eski qatorlarni to'ldiramiz
  db.exec("UPDATE ustalar SET yaratilgan_vaqt = CURRENT_TIMESTAMP WHERE yaratilgan_vaqt IS NULL");

  db.pragma('foreign_keys = ON');

  console.log('"ustalar" jadvali muvaffaqiyatli yangilandi, eski ma\'lumotlar saqlanib qoldi');
}


const ustalarSoni = db.prepare('SELECT COUNT(*) as soni FROM ustalar').get();

if (ustalarSoni.soni === 0) {
  const qoshish = db.prepare(
    'INSERT INTO ustalar (ism, turi, telefon, reyting, ishlar_soni, holat, tuman) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  qoshish.run('Aziz Rahimov', 'Santexnik', '+998901112233', 4.9, 312, 'bosh', 'Chilonzor');
  qoshish.run('Bekzod Tursunov', 'Elektrik', '+998902223344', 4.8, 198, 'bosh', 'Yunusobod');
  qoshish.run('Sardor Yusupov', 'Konditsioner', '+998903334455', 4.7, 145, 'bosh', 'Mirobod');
  qoshish.run('Farrux Nazarov', 'Boshqa', '+998904445566', 4.6, 89, 'bosh', 'Chilonzor');

  console.log('boshlang\'ich ustalar qo\'shildi (demo, parolsiz - kirish uchun ro\'yxatdan qayta o\'tish kerak)');
}

// boshlang'ich admin - .env orqali sozlash mumkin
const adminlarSoni = db.prepare('SELECT COUNT(*) as soni FROM adminlar').get();
if (adminlarSoni.soni === 0) {
  const adminTelefon = process.env.ADMIN_PHONE || '+998900000000';
  const adminParol = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminParol, 10);
  db.prepare('INSERT INTO adminlar (ism, telefon, parol_hash) VALUES (?, ?, ?)').run(
    'Bosh administrator',
    adminTelefon,
    hash
  );
  console.log('boshlang\'ich admin yaratildi -> telefon: ' + adminTelefon + ', parol: ' + adminParol);
}

module.exports = db;