const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ustahub-dev-secret-oxirida-almashtiring';

if (!process.env.JWT_SECRET) {
  console.warn('OGOHLANTIRISH: JWT_SECRET .env faylda berilmagan, standart (nomaxfiy) kalit ishlatilyapti. Production uchun .env ga JWT_SECRET qo\'shing!');
}

// token yaratish (usta yoki admin uchun)
function tokenYarat(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

// tokenni tekshirish, noto'g'ri bo'lsa null qaytaradi
function tokenniTekshir(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (xato) {
    return null;
  }
}

// Authorization: Bearer <token> headerini o'qiydigan middleware
// rol parametri berilsa ('usta' yoki 'admin'), faqat shu rolga ruxsat beradi
function ruxsatTekshir(rol) {
  return function (req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ xato: 'Tizimga kirish talab qilinadi' });
    }

    const malumot = tokenniTekshir(token);
    if (!malumot) {
      return res.status(401).json({ xato: 'Sessiya muddati tugagan, qayta kiring' });
    }

    if (rol && malumot.rol !== rol) {
      return res.status(403).json({ xato: 'Bu amal uchun ruxsatingiz yo\'q' });
    }

    req.foydalanuvchi = malumot;
    next();
  };
}

module.exports = { tokenYarat, tokenniTekshir, ruxsatTekshir };