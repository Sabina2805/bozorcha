'use strict';
// SQLite bazasi (Node o'rnatilgan node:sqlite moduli — tashqi paket kerak emas)
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'bozorcha.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

if (process.argv.includes('--reseed') && fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','admin')),
  shop_name TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦'
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  old_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT,
  emoji TEXT NOT NULL DEFAULT '📦',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','blocked')),
  sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  total INTEGER NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  payment TEXT NOT NULL CHECK (payment IN ('cash','card_on_delivery','online')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','shipped','delivered','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_items_seller ON order_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

// ---------- parol xeshlash ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// ---------- boshlang'ich ma'lumotlar ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const addUser = db.prepare('INSERT INTO users (name, phone, password_hash, role, shop_name) VALUES (?,?,?,?,?)');
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  addUser.run('Administrator', '+998900000000', hashPassword(adminPass), 'admin', null);
  const s1 = Number(addUser.run('Dilshod Karimov', '+998901111111', hashPassword('seller123'), 'seller', 'TexnoMir').lastInsertRowid);
  const s2 = Number(addUser.run('Malika Yusupova', '+998902222222', hashPassword('seller123'), 'seller', 'Moda Markazi').lastInsertRowid);
  const s3 = Number(addUser.run('Bobur Aliyev', '+998903333333', hashPassword('seller123'), 'seller', 'Uy Baraka').lastInsertRowid);
  addUser.run('Test Xaridor', '+998904444444', hashPassword('buyer123'), 'buyer', null);

  const cats = [
    ['elektronika', 'Elektronika', '📱'],
    ['maishiy-texnika', 'Maishiy texnika', '🏠'],
    ['kiyim', 'Kiyim', '👕'],
    ['poyabzal', 'Poyabzal', '👟'],
    ['uy-royzgor', "Uy-ro'zg'or", '🍳'],
    ['gozallik', "Go'zallik va salomatlik", '💄'],
    ['bolalar', 'Bolalar tovarlari', '🧸'],
    ['sport', 'Sport va dam olish', '⚽'],
    ['kitoblar', 'Kitoblar', '📚'],
    ['avto', 'Avto tovarlar', '🚗'],
  ];
  const addCat = db.prepare('INSERT INTO categories (slug, name, icon) VALUES (?,?,?)');
  const cid = {};
  for (const [slug, name, icon] of cats) cid[slug] = Number(addCat.run(slug, name, icon).lastInsertRowid);

  const P = db.prepare(`INSERT INTO products
    (seller_id, category_id, title, description, price, old_price, stock, emoji, sold) VALUES (?,?,?,?,?,?,?,?,?)`);
  const items = [
    [s1, 'elektronika', 'Smartfon X12 128GB', "6.5 dyuymli AMOLED ekran, 50 MP kamera, 5000 mAh batareya. 1 yil kafolat.", 3290000, 3790000, 25, '📱', 142],
    [s1, 'elektronika', 'Simsiz quloqchin Air Pro', "Shovqinni bostirish, 24 soat ish vaqti, zaryadlash g'ilofi bilan.", 349000, 449000, 80, '🎧', 310],
    [s1, 'elektronika', 'Noutbuk 15.6" 8GB/256GB', "Kundalik ish va o'qish uchun. Full HD ekran, yengil korpus.", 5890000, null, 12, '💻', 37],
    [s1, 'elektronika', 'Smart-soat Fit 3', "Yurak urishi, uyqu va qadam sanagich. IP68 suvdan himoya.", 459000, 590000, 40, '⌚', 98],
    [s1, 'elektronika', 'Powerbank 20000 mAh', "Tezkor zaryad 22.5W, ikki USB va Type-C chiqish.", 219000, null, 60, '🔋', 205],
    [s1, 'maishiy-texnika', 'Robot-changyutgich Clean S', "Xaritalash, telefondan boshqarish, 2 soat ish vaqti.", 1990000, 2490000, 15, '🤖', 54],
    [s1, 'maishiy-texnika', 'Elektr choynak 1.7 L', "Zanglamaydigan po'lat, avtomatik o'chish.", 159000, null, 90, '🫖', 260],
    [s2, 'kiyim', "Erkaklar futbolkasi (paxta)", "100% paxta, S–XXL o'lchamlari, bir nechta rang.", 89000, 119000, 200, '👕', 540],
    [s2, 'kiyim', 'Ayollar ko\'ylagi', "Yengil mato, yozgi fasl uchun qulay.", 249000, 320000, 45, '👗', 120],
    [s2, 'kiyim', "Qishki kurtka unisex", "Issiq, suv o'tkazmaydigan, olinadigan kapyushon.", 599000, 790000, 30, '🧥', 76],
    [s2, 'poyabzal', "Sport krossovkalari Run Max", "Yengil taglik, nafas oluvchi to'r material.", 389000, 499000, 70, '👟', 330],
    [s2, 'poyabzal', "Ayollar tuflisi klassik", "Qulay poshna, haqiqiy teri ichki qismi.", 329000, null, 35, '👠', 64],
    [s2, 'gozallik', 'Yuz uchun namlovchi krem', "24 soatlik namlik, hamma teri turlari uchun.", 79000, 99000, 150, '🧴', 410],
    [s2, 'gozallik', "Atir 50 ml", "Gulli-mevali hid, uzoq saqlanadi.", 189000, null, 55, '🌸', 88],
    [s3, 'uy-royzgor', "Qozon to'plami 5 dona", "Yopishmaydigan qoplama, induksion plitalarga mos.", 429000, 560000, 25, '🍳', 92],
    [s3, 'uy-royzgor', "Ortopedik yostiq", "Xotirali ko'pik, bo'yin uchun qulay.", 139000, 179000, 100, '🛏️', 230],
    [s3, 'uy-royzgor', "LED stol chirog'i", "3 rejim, USB orqali zaryadlanadi.", 99000, null, 85, '💡', 175],
    [s3, 'bolalar', "Konstruktor 500 detal", "Bolalar uchun rivojlantiruvchi o'yin, 6+ yosh.", 169000, 219000, 60, '🧱', 148],
    [s3, 'bolalar', "Yumshoq ayiqcha 60 sm", "Gipoallergen to'ldirgich, yuvish mumkin.", 119000, null, 70, '🧸', 205],
    [s3, 'sport', "Yoga gilami 6 mm", "Sirpanmaydigan, ko'tarish uchun kamar bilan.", 109000, 139000, 90, '🧘', 132],
    [s3, 'sport', "Gantellar to'plami 2x5 kg", "Neopren qoplama, uyda mashq uchun.", 199000, null, 40, '🏋️', 66],
    [s3, 'kitoblar', "O'zbek adabiyoti antologiyasi", "Mashhur yozuvchilarning tanlangan asarlari.", 79000, null, 120, '📚', 89],
    [s3, 'avto', "Avtomobil video-registrator", "Full HD, tungi ko'rish, 170° kamera burchagi.", 289000, 359000, 33, '📹', 71],
    [s3, 'avto', "Avto kompressor 12V", "Shinalarni tez shishirish, raqamli manometr.", 179000, null, 48, '🛞', 58],
  ];
  const addReview = db.prepare('INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?)');
  const buyer = db.prepare("SELECT id FROM users WHERE role='buyer'").get().id;
  items.forEach((it, i) => {
    const id = Number(P.run(it[0], cid[it[1]], it[2], it[3], it[4], it[5], it[6], it[7], it[8]).lastInsertRowid);
    if (i % 3 === 0) addReview.run(id, buyer, 4 + (i % 2), 'Sifati yaxshi, tavsiya qilaman.');
  });
  console.log('Boshlang\'ich ma\'lumotlar yuklandi.');
}
seed();

module.exports = { db, hashPassword, verifyPassword };
if (require.main === module) console.log('Baza tayyor:', DB_FILE);
