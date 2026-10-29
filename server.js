'use strict';
// Bozorcha — marketplace serveri (tashqi paketlarsiz, faqat Node.js)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'); // productionda JWT_SECRET o'rnating
if (!process.env.JWT_SECRET) console.warn("Ogohlantirish: JWT_SECRET o'rnatilmagan, server qayta ishga tushganda sessiyalar bekor bo'ladi.");

// ---------- yordamchi funksiyalar ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expect.length || !crypto.timingSafeEqual(given, expect)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function authUser(req, required = true) {
  const h = req.headers.authorization || '';
  const data = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!data) { if (required) throw new HttpError(401, 'Avval tizimga kiring'); return null; }
  const user = db.prepare('SELECT id, name, phone, role, shop_name, blocked FROM users WHERE id = ?').get(data.id);
  if (!user || user.blocked) { if (required) throw new HttpError(401, 'Hisob mavjud emas yoki bloklangan'); return null; }
  return user;
}
function requireRole(req, ...roles) {
  const u = authUser(req);
  if (!roles.includes(u.role)) throw new HttpError(403, "Bu amal uchun ruxsat yo'q");
  return u;
}

// oddiy tezlik cheklovi (IP bo'yicha, kirish/ro'yxatdan o'tish uchun)
const hits = new Map();
function rateLimit(req, key, max, windowMs) {
  const id = `${key}:${req.socket.remoteAddress}`;
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring");
  arr.push(now); hits.set(id, arr);
}

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, def = 0) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : def; };
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 9 ? `+998${d}` : d.length === 12 && d.startsWith('998') ? `+${d}` : null; };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new HttpError(413, "So'rov juda katta")); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, "Noto'g'ri JSON")); }
    });
    req.on('error', reject);
  });
}

const publicUser = (u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, shop_name: u.shop_name });

const PRODUCT_SELECT = `
  SELECT p.id, p.title, p.description, p.price, p.old_price, p.stock, p.image_url, p.emoji, p.status, p.sold,
         p.category_id, c.name AS category, c.slug AS category_slug,
         p.seller_id, u.shop_name AS shop,
         COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.product_id = p.id), 0) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS reviews_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN users u ON u.id = p.seller_id`;

function validImage(url) {
  if (!url) return null;
  return /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : null;
}

// ---------- marshrutlar ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

// --- autentifikatsiya ---
route('POST', '/api/auth/register', async (req, res, { body }) => {
  rateLimit(req, 'register', 10, 3600e3);
  const name = str(body.name, 80), phone = normPhone(body.phone), password = str(body.password, 200);
  const role = body.role === 'seller' ? 'seller' : 'buyer';
  const shop = role === 'seller' ? str(body.shop_name, 80) : null;
  if (name.length < 2) throw new HttpError(400, 'Ismni kiriting');
  if (!phone) throw new HttpError(400, "Telefon raqami noto'g'ri (masalan: +998901234567)");
  if (password.length < 6) throw new HttpError(400, "Parol kamida 6 belgidan iborat bo'lsin");
  if (role === 'seller' && !shop) throw new HttpError(400, "Do'kon nomini kiriting");
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) throw new HttpError(409, "Bu raqam allaqachon ro'yxatdan o'tgan");
  const id = Number(db.prepare('INSERT INTO users (name, phone, password_hash, role, shop_name) VALUES (?,?,?,?,?)')
    .run(name, phone, hashPassword(password), role, shop).lastInsertRowid);
  const user = db.prepare('SELECT id, name, phone, role, shop_name FROM users WHERE id = ?').get(id);
  return { token: signToken({ id }), user: publicUser(user) };
});

route('POST', '/api/auth/login', async (req, res, { body }) => {
  rateLimit(req, 'login', 20, 600e3);
  const phone = normPhone(body.phone);
  const row = phone && db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!row || !verifyPassword(str(body.password, 200), row.password_hash)) throw new HttpError(401, "Telefon yoki parol noto'g'ri");
  if (row.blocked) throw new HttpError(403, 'Hisob bloklangan');
  return { token: signToken({ id: row.id }), user: publicUser(row) };
});

route('GET', '/api/me', async (req) => ({ user: publicUser(authUser(req)) }));

// --- katalog ---
route('GET', '/api/categories', async () => ({
  categories: db.prepare(`SELECT c.id, c.slug, c.name, c.icon,
    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status='active') AS count
    FROM categories c ORDER BY c.id`).all(),
}));

route('GET', '/api/products', async (req, res, { query }) => {
  const where = ["p.status = 'active'", 'u.blocked = 0'];
  const args = [];
  const q = str(query.get('q'), 100);
  if (q) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const cat = str(query.get('category'), 50);
  if (cat) { where.push('c.slug = ?'); args.push(cat); }
  const minP = int(query.get('min'), -1), maxP = int(query.get('max'), -1);
  if (minP >= 0) { where.push('p.price >= ?'); args.push(minP); }
  if (maxP >= 0) { where.push('p.price <= ?'); args.push(maxP); }
  if (query.get('discount') === '1') where.push('p.old_price IS NOT NULL AND p.old_price > p.price');
  const sorts = { popular: 'p.sold DESC', cheap: 'p.price ASC', expensive: 'p.price DESC', new: 'p.id DESC', rating: 'rating DESC, reviews_count DESC' };
  const order = sorts[query.get('sort')] || sorts.popular;
  const limit = Math.min(Math.max(int(query.get('limit'), 12), 1), 48);
  const page = Math.max(int(query.get('page'), 1), 1);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM products p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.seller_id WHERE ${where.join(' AND ')}`).get(...args).c;
  const items = db.prepare(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { items, total, page, pages: Math.ceil(total / limit) };
});

route('GET', '/api/products/:id', async (req, res, { params }) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(int(params.id));
  if (!p || p.status !== 'active') throw new HttpError(404, 'Mahsulot topilmadi');
  const reviews = db.prepare(`SELECT r.id, r.rating, r.comment, r.created_at, u.name FROM reviews r JOIN users u ON u.id=r.user_id
    WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 50`).all(p.id);
  return { product: p, reviews };
});

route('POST', '/api/products/:id/reviews', async (req, res, { params, body }) => {
  const u = authUser(req);
  const pid = int(params.id);
  const rating = int(body.rating);
  if (rating < 1 || rating > 5) throw new HttpError(400, "Baho 1 dan 5 gacha bo'lsin");
  const bought = db.prepare('SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.buyer_id=? AND oi.product_id=? AND oi.status != ?').get(u.id, pid, 'cancelled');
  if (!bought) throw new HttpError(403, 'Faqat xarid qilgan mahsulotga sharh yozish mumkin');
  db.prepare(`INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?)
    ON CONFLICT(product_id, user_id) DO UPDATE SET rating=excluded.rating, comment=excluded.comment`)
    .run(pid, u.id, rating, str(body.comment, 1000));
  return { ok: true };
});

// --- buyurtmalar (xaridor) ---
route('POST', '/api/orders', async (req, res, { body }) => {
  const u = authUser(req);
  const address = str(body.address, 300), phone = normPhone(body.phone) || u.phone;
  const payment = ['cash', 'card_on_delivery', 'online'].includes(body.payment) ? body.payment : 'cash';
  if (address.length < 5) throw new HttpError(400, "Yetkazib berish manzilini kiriting");
  const cart = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!cart.length) throw new HttpError(400, "Savat bo'sh");

  db.exec('BEGIN IMMEDIATE');
  try {
    const lines = [];
    for (const it of cart) {
      const qty = int(it.qty);
      const p = db.prepare('SELECT id, seller_id, title, price, stock, status FROM products WHERE id = ?').get(int(it.product_id));
      if (!p || p.status !== 'active') throw new HttpError(400, `Mahsulot mavjud emas: #${it.product_id}`);
      if (qty < 1 || qty > 99) throw new HttpError(400, "Miqdor noto'g'ri");
      if (p.stock < qty) throw new HttpError(400, `"${p.title}" omborda yetarli emas (qolgan: ${p.stock})`);
      if (p.seller_id === u.id) throw new HttpError(400, "O'z mahsulotingizni sotib ola olmaysiz");
      lines.push({ ...p, qty });
    }
    // narxlar serverda, bazadagi qiymatdan hisoblanadi — mijoz yuborgan narxga ishonilmaydi
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const oid = Number(db.prepare('INSERT INTO orders (buyer_id, total, address, phone, payment, note) VALUES (?,?,?,?,?,?)')
      .run(u.id, total, address, phone, payment, str(body.note, 300)).lastInsertRowid);
    const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, seller_id, title, price, qty) VALUES (?,?,?,?,?,?)');
    const dec = db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?');
    for (const l of lines) { addItem.run(oid, l.id, l.seller_id, l.title, l.price, l.qty); dec.run(l.qty, l.qty, l.id); }
    db.exec('COMMIT');
    return { order_id: oid, total };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
});

route('GET', '/api/orders', async (req) => {
  const u = authUser(req);
  const orders = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 100').all(u.id);
  const itemsQ = db.prepare('SELECT product_id, title, price, qty, status FROM order_items WHERE order_id = ?');
  return { orders: orders.map((o) => ({ ...o, items: itemsQ.all(o.id) })) };
});

route('POST', '/api/orders/:id/cancel', async (req, res, { params }) => {
  const u = authUser(req);
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(int(params.id), u.id);
  if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
  db.exec('BEGIN IMMEDIATE');
  try {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status = 'new'").all(o.id);
    if (!items.length) throw new HttpError(400, "Bekor qilib bo'lmaydi: sotuvchi allaqachon tasdiqlagan");
    for (const it of items) {
      db.prepare("UPDATE order_items SET status='cancelled' WHERE id = ?").run(it.id);
      db.prepare('UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?').run(it.qty, it.qty, it.product_id);
    }
    db.exec('COMMIT');
    return { ok: true, cancelled: items.length };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
});

// --- sotuvchi kabineti ---
function productInput(body, partial = false) {
  const out = {};
  const need = (cond, msg) => { if (!cond) throw new HttpError(400, msg); };
  if (!partial || 'title' in body) { out.title = str(body.title, 150); need(out.title.length >= 3, 'Mahsulot nomi kamida 3 belgi'); }
  if (!partial || 'price' in body) { out.price = int(body.price, -1); need(out.price >= 0, "Narx noto'g'ri"); }
  if (!partial || 'stock' in body) { out.stock = int(body.stock, -1); need(out.stock >= 0, "Ombor miqdori noto'g'ri"); }
  if (!partial || 'category_id' in body) {
    out.category_id = int(body.category_id);
    need(db.prepare('SELECT 1 FROM categories WHERE id = ?').get(out.category_id), 'Toifani tanlang');
  }
  if ('description' in body) out.description = str(body.description, 3000);
  if ('old_price' in body) { const op = int(body.old_price, 0); out.old_price = op > 0 ? op : null; }
  if ('image_url' in body) out.image_url = validImage(str(body.image_url, 500));
  if ('emoji' in body) out.emoji = str(body.emoji, 8) || '📦';
  if ('status' in body) { need(['active', 'hidden'].includes(body.status), "Holat noto'g'ri"); out.status = body.status; }
  return out;
}

route('GET', '/api/seller/products', async (req) => {
  const u = requireRole(req, 'seller');
  return { items: db.prepare(`${PRODUCT_SELECT} WHERE p.seller_id = ? ORDER BY p.id DESC`).all(u.id) };
});

route('POST', '/api/seller/products', async (req, res, { body }) => {
  const u = requireRole(req, 'seller');
  const d = productInput(body);
  const r = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price, old_price, stock, image_url, emoji)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(u.id, d.category_id, d.title, d.description || '', d.price, d.old_price ?? null, d.stock, d.image_url ?? null, d.emoji || '📦');
  return { id: Number(r.lastInsertRowid) };
});

route('PUT', '/api/seller/products/:id', async (req, res, { params, body }) => {
  const u = requireRole(req, 'seller');
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(int(params.id), u.id);
  if (!p) throw new HttpError(404, 'Mahsulot topilmadi');
  if (p.status === 'blocked') throw new HttpError(403, "Mahsulot admin tomonidan bloklangan");
  const d = productInput(body, true);
  const keys = Object.keys(d);
  if (keys.length) db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => d[k]), p.id);
  return { ok: true };
});

route('DELETE', '/api/seller/products/:id', async (req, res, { params }) => {
  const u = requireRole(req, 'seller');
  const p = db.prepare('SELECT id FROM products WHERE id = ? AND seller_id = ?').get(int(params.id), u.id);
  if (!p) throw new HttpError(404, 'Mahsulot topilmadi');
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ?').get(p.id);
  if (used) db.prepare("UPDATE products SET status='hidden', stock=0 WHERE id = ?").run(p.id); // buyurtma tarixi saqlanadi
  else db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
  return { ok: true, archived: !!used };
});

route('GET', '/api/seller/orders', async (req) => {
  const u = requireRole(req, 'seller');
  const items = db.prepare(`SELECT oi.id, oi.order_id, oi.title, oi.price, oi.qty, oi.status, o.created_at, o.address, o.phone, o.payment, o.note, b.name AS buyer
    FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN users b ON b.id=o.buyer_id
    WHERE oi.seller_id = ? ORDER BY oi.id DESC LIMIT 200`).all(u.id);
  const stats = db.prepare(`SELECT COALESCE(SUM(price*qty),0) AS revenue, COUNT(*) AS lines FROM order_items WHERE seller_id=? AND status IN ('confirmed','shipped','delivered')`).get(u.id);
  return { items, stats };
});

const NEXT = { new: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
route('PATCH', '/api/seller/order-items/:id', async (req, res, { params, body }) => {
  const u = requireRole(req, 'seller');
  const it = db.prepare('SELECT * FROM order_items WHERE id = ? AND seller_id = ?').get(int(params.id), u.id);
  if (!it) throw new HttpError(404, 'Topilmadi');
  const to = body.status;
  if (!NEXT[it.status].includes(to)) throw new HttpError(400, `"${it.status}" holatidan "${to}" ga o'tib bo'lmaydi`);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE order_items SET status = ? WHERE id = ?').run(to, it.id);
    if (to === 'cancelled') db.prepare('UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?').run(it.qty, it.qty, it.product_id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true };
});

// --- admin ---
route('GET', '/api/admin/stats', async (req) => {
  requireRole(req, 'admin');
  const one = (sql) => db.prepare(sql).get().c;
  return {
    users: one("SELECT COUNT(*) AS c FROM users WHERE role='buyer'"),
    sellers: one("SELECT COUNT(*) AS c FROM users WHERE role='seller'"),
    products: one("SELECT COUNT(*) AS c FROM products"),
    orders: one('SELECT COUNT(*) AS c FROM orders'),
    revenue: one("SELECT COALESCE(SUM(price*qty),0) AS c FROM order_items WHERE status != 'cancelled'"),
  };
});
route('GET', '/api/admin/users', async (req) => {
  requireRole(req, 'admin');
  return { items: db.prepare('SELECT id, name, phone, role, shop_name, blocked, created_at FROM users ORDER BY id DESC LIMIT 300').all() };
});
route('PATCH', '/api/admin/users/:id', async (req, res, { params, body }) => {
  const a = requireRole(req, 'admin');
  const id = int(params.id);
  if (id === a.id) throw new HttpError(400, "O'zingizni bloklab bo'lmaydi");
  db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(body.blocked ? 1 : 0, id);
  return { ok: true };
});
route('GET', '/api/admin/products', async (req) => {
  requireRole(req, 'admin');
  return { items: db.prepare(`${PRODUCT_SELECT} ORDER BY p.id DESC LIMIT 300`).all() };
});
route('PATCH', '/api/admin/products/:id', async (req, res, { params, body }) => {
  requireRole(req, 'admin');
  if (!['active', 'blocked', 'hidden'].includes(body.status)) throw new HttpError(400, "Holat noto'g'ri");
  db.prepare('UPDATE products SET status = ? WHERE id = ?').run(body.status, int(params.id));
  return { ok: true };
});
route('POST', '/api/admin/categories', async (req, res, { body }) => {
  requireRole(req, 'admin');
  const name = str(body.name, 60), icon = str(body.icon, 8) || '📦';
  const slug = str(body.slug || name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (name.length < 2 || !slug) throw new HttpError(400, "Toifa nomi va slug (lotin harflarida) kerak");
  try { db.prepare('INSERT INTO categories (slug, name, icon) VALUES (?,?,?)').run(slug, name, icon); }
  catch { throw new HttpError(409, 'Bunday toifa mavjud'); }
  return { ok: true };
});
route('GET', '/api/admin/orders', async (req) => {
  requireRole(req, 'admin');
  return { items: db.prepare(`SELECT o.id, o.total, o.payment, o.address, o.phone, o.created_at, b.name AS buyer,
    (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) AS lines FROM orders o JOIN users b ON b.id=o.buyer_id ORDER BY o.id DESC LIMIT 200`).all() };
});

// ---------- statik fayllar ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html'); // SPA
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      return send(200, await r.handler(req, res, { params, body, query: url.searchParams }));
    }
    send(404, { error: 'Topilmadi' });
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message });
    console.error(e);
    send(500, { error: 'Server xatosi' });
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`Bozorcha ishga tushdi: http://localhost:${PORT}`));
module.exports = server;
