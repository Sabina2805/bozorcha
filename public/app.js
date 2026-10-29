'use strict';
// Bozorcha frontend — vanilla JS SPA (hash-routing)
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('uz-UZ').format(n).replace(/,/g, ' ') + " so'm";
const fmtDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' });
const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

const STATUS = { new: 'Yangi', confirmed: 'Tasdiqlangan', shipped: "Yo'lda", delivered: 'Yetkazildi', cancelled: 'Bekor qilingan', active: 'Faol', hidden: 'Yashirin', blocked: 'Bloklangan' };
const PAY = { cash: 'Naqd pul', card_on_delivery: 'Karta orqali (kuryerga)', online: "Onlayn to'lov" };
const pill = (s) => `<span class="pill ${esc(s)}">${esc(STATUS[s] || s)}</span>`;

// ---------- holat ----------
const store = {
  get token() { return localStorage.getItem('token'); },
  set token(v) { v ? localStorage.setItem('token', v) : localStorage.removeItem('token'); },
  user: null,
  get cart() { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } },
  set cart(v) { localStorage.setItem('cart', JSON.stringify(v)); renderNav(); },
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && store.token) { store.token = null; store.user = null; renderNav(); }
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

// ---------- navigatsiya ----------
function renderNav() {
  const u = store.user, n = store.cart.reduce((s, i) => s + i.qty, 0);
  $('#nav').innerHTML = [
    u?.role === 'seller' && `<a href="#/seller">🏪 Kabinet</a>`,
    u?.role === 'admin' && `<a href="#/admin">⚙️ Admin</a>`,
    u && u.role !== 'admin' && `<a href="#/orders">📦 Buyurtmalar</a>`,
    `<a href="#/cart">🛒 Savat${n ? `<span class="badge">${n}</span>` : ''}</a>`,
    u ? `<a href="#" data-action="logout" title="${esc(u.name)}">Chiqish</a>` : `<a href="#/login">Kirish</a>`,
  ].filter(Boolean).join('');
}
function parseHash() {
  const [p, qs = ''] = (location.hash.slice(1) || '/').split('?');
  return { parts: p.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}
const go = (h) => { location.hash = h; };

// ---------- komponentlar ----------
function productCard(p) {
  const disc = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${esc(p.emoji)}'))">` : esc(p.emoji);
  return `<article class="card">
    ${disc ? `<span class="tag">−${disc}%</span>` : ''}
    <a href="#/product/${p.id}" class="img" aria-label="${esc(p.title)}">${img}</a>
    <div class="body">
      <a href="#/product/${p.id}" class="title">${esc(p.title)}</a>
      <div class="meta"><span class="stars">${stars(p.rating)}</span> ${p.reviews_count ? `(${p.reviews_count})` : ''} · ${esc(p.shop)}</div>
      <div><span class="price">${money(p.price)}</span>${disc ? `<span class="old">${money(p.old_price)}</span>` : ''}</div>
      <button class="btn sm" data-action="add" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Tugagan' : '🛒 Savatga'}</button>
    </div>
  </article>`;
}
const empty = (icon, text, link = '') => `<div class="empty"><div class="big">${icon}</div><p>${text}</p>${link}</div>`;

function modal(html) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}

// ---------- sahifalar ----------
async function pageHome() {
  const [{ categories }, pop, disc] = await Promise.all([
    api('/categories'), api('/products?sort=popular&limit=8'), api('/products?discount=1&sort=popular&limit=4'),
  ]);
  app.innerHTML = `
    <section class="hero">
      <div><h1>Hamma narsa bir joyda</h1><p>Minglab mahsulotlar, tekshirilgan sotuvchilar va qulay yetkazib berish. Bugunoq xarid qiling.</p>
      <a class="btn" href="#/catalog?discount=1">🔥 Chegirmalar</a></div><div class="big">🛍️</div>
    </section>
    <div class="cats">${categories.map((c) => `<a class="cat" href="#/catalog?category=${esc(c.slug)}"><span class="ic">${esc(c.icon)}</span>${esc(c.name)}</a>`).join('')}</div>
    <h2>🔥 Chegirmadagi mahsulotlar</h2><div class="grid">${disc.items.map(productCard).join('')}</div>
    <h2>⭐ Ommabop mahsulotlar</h2><div class="grid">${pop.items.map(productCard).join('')}</div>
    <p style="text-align:center;margin-top:20px"><a class="btn ghost" href="#/catalog">Barcha mahsulotlar</a></p>`;
}

async function pageCatalog({ query }) {
  const state = { q: query.get('q') || '', category: query.get('category') || '', sort: query.get('sort') || 'popular', page: +query.get('page') || 1, discount: query.get('discount') || '' };
  const qs = new URLSearchParams({ ...state, limit: 12 });
  const [{ categories }, data] = await Promise.all([api('/categories'), api('/products?' + qs)]);
  const link = (o) => '#/catalog?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...state, ...o }).filter(([, v]) => v && v !== 1 && v !== 'popular'))).toString();
  const cur = categories.find((c) => c.slug === state.category);
  app.innerHTML = `
    <h1>${cur ? esc(cur.icon + ' ' + cur.name) : state.q ? `“${esc(state.q)}” bo'yicha natijalar` : state.discount ? '🔥 Chegirmalar' : 'Katalog'}</h1>
    <div class="toolbar">
      <select id="f-cat" aria-label="Toifa"><option value="">Barcha toifalar</option>${categories.map((c) => `<option value="${esc(c.slug)}" ${c.slug === state.category ? 'selected' : ''}>${esc(c.name)} (${c.count})</option>`).join('')}</select>
      <select id="f-sort" aria-label="Saralash">${[['popular', 'Ommabop'], ['cheap', 'Arzonroq'], ['expensive', 'Qimmatroq'], ['rating', 'Reyting'], ['new', 'Yangi']].map(([v, l]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="muted">${data.total} ta mahsulot</span>
    </div>
    ${data.items.length ? `<div class="grid">${data.items.map(productCard).join('')}</div>` : empty('🔎', 'Hech narsa topilmadi. Boshqa so\'z bilan urinib ko\'ring.', '<a class="btn" href="#/catalog">Barcha mahsulotlar</a>')}
    ${data.pages > 1 ? `<div class="pager">${Array.from({ length: data.pages }, (_, i) => `<a class="btn sm ${i + 1 === data.page ? '' : 'ghost'}" href="${link({ page: i + 1 })}">${i + 1}</a>`).join('')}</div>` : ''}`;
  $('#f-cat').onchange = (e) => go(link({ category: e.target.value, page: 1 }));
  $('#f-sort').onchange = (e) => go(link({ sort: e.target.value, page: 1 }));
}

async function pageProduct({ parts }) {
  const { product: p, reviews } = await api('/products/' + parts[1]);
  const disc = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${esc(p.emoji)}'))">` : esc(p.emoji);
  app.innerHTML = `
    <p><a href="#/catalog?category=${esc(p.category_slug)}">← ${esc(p.category)}</a></p>
    <div class="panel two">
      <div class="pimg">${img}</div>
      <div>
        <h1>${esc(p.title)}</h1>
        <div class="row muted"><span class="stars">${stars(p.rating)}</span> ${p.rating || '—'} · ${p.reviews_count} sharh · ${p.sold} ta sotilgan</div>
        <p style="margin:14px 0"><span class="price" style="font-size:30px">${money(p.price)}</span>${disc ? `<span class="old">${money(p.old_price)}</span> <span class="pill new">−${disc}%</span>` : ''}</p>
        <p class="muted">Sotuvchi: <b>${esc(p.shop)}</b> · ${p.stock > 0 ? `Omborda: ${p.stock} dona` : 'Tugagan'}</p>
        <div class="row" style="margin:16px 0">
          <div class="qty"><button data-action="dec" aria-label="Kamaytirish">−</button><span id="pq">1</span><button data-action="inc" aria-label="Oshirish" data-max="${p.stock}">+</button></div>
          <button class="btn" data-action="add" data-id="${p.id}" data-qtyel="pq" ${p.stock < 1 ? 'disabled' : ''}>🛒 Savatga qo'shish</button>
          <button class="btn warn" data-action="buy" data-id="${p.id}" data-qtyel="pq" ${p.stock < 1 ? 'disabled' : ''}>Hozir sotib olish</button>
        </div>
        <h3>Tavsif</h3><p style="white-space:pre-line">${esc(p.description) || '<span class="muted">Tavsif kiritilmagan</span>'}</p>
      </div>
    </div>
    <h2>Sharhlar</h2>
    <div class="panel">
      ${reviews.length ? reviews.map((r) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(r.name)}</b> <span class="stars">${stars(r.rating)}</span> <span class="muted">${fmtDate(r.created_at)}</span><p style="margin:4px 0">${esc(r.comment)}</p></div>`).join('') : '<p class="muted">Hali sharhlar yo\'q.</p>'}
      ${store.user?.role === 'buyer' ? `<form id="review" class="form" style="margin-top:16px"><h3>Sharh qoldirish</h3>
        <label>Baho<select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select></label>
        <label>Izoh<textarea name="comment" rows="3" maxlength="1000"></textarea></label>
        <button class="btn" type="submit">Yuborish</button><small class="muted">Faqat shu mahsulotni xarid qilgan foydalanuvchilar sharh yoza oladi.</small></form>` : ''}
    </div>`;
  const f = $('#review');
  if (f) f.onsubmit = guard(async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await api(`/products/${p.id}/reviews`, { method: 'POST', body: d });
    toast('Sharh saqlandi'); route();
  });
}

function pageCart() {
  const cart = store.cart;
  if (!cart.length) { app.innerHTML = `<h1>Savat</h1>` + empty('🛒', "Savatingiz bo'sh", '<a class="btn" href="#/catalog">Xaridni boshlash</a>'); return; }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  app.innerHTML = `<h1>Savat</h1><div class="panel">
    ${cart.map((i) => `<div class="cart-line">
      <div class="t">${i.image_url ? `<img src="${esc(i.image_url)}" alt="" referrerpolicy="no-referrer">` : esc(i.emoji)}</div>
      <div><a href="#/product/${i.id}">${esc(i.title)}</a><div class="price">${money(i.price)}</div></div>
      <div class="qty"><button data-action="cart-dec" data-id="${i.id}">−</button><span>${i.qty}</span><button data-action="cart-inc" data-id="${i.id}">+</button></div>
      <button class="btn sm danger" data-action="cart-del" data-id="${i.id}" aria-label="O'chirish">✕</button></div>`).join('')}
    <div class="row" style="justify-content:space-between;margin-top:18px"><div><span class="muted">Jami:</span> <span class="price" style="font-size:24px">${money(total)}</span></div>
    <a class="btn warn" href="#/checkout">Buyurtma berish →</a></div></div>`;
}

function pageCheckout() {
  const cart = store.cart;
  if (!cart.length) return go('#/cart');
  if (!store.user) { toast('Buyurtma berish uchun tizimga kiring'); return go('#/login?next=checkout'); }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  app.innerHTML = `<h1>Buyurtmani rasmiylashtirish</h1><div class="panel two">
    <form id="co" class="form" style="max-width:none">
      <label>Telefon<input name="phone" value="${esc(store.user.phone)}" required></label>
      <label>Yetkazib berish manzili<textarea name="address" rows="3" placeholder="Shahar, tuman, ko'cha, uy" required minlength="5"></textarea></label>
      <label>To'lov usuli<select name="payment"><option value="cash">${PAY.cash}</option><option value="card_on_delivery">${PAY.card_on_delivery}</option></select></label>
      <label>Izoh (ixtiyoriy)<input name="note" maxlength="300"></label>
      <div class="error" id="co-err"></div>
      <button class="btn warn block" type="submit">Buyurtmani tasdiqlash</button>
      <small class="muted">Onlayn to'lov integratsiyasi (Payme/Click) hozircha ulanmagan — README'ga qarang.</small>
    </form>
    <div><h3>Buyurtmangiz</h3>${cart.map((i) => `<div class="row" style="justify-content:space-between;padding:6px 0"><span>${esc(i.title)} × ${i.qty}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <hr style="border:0;border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between"><span>Jami</span><span class="price" style="font-size:22px">${money(total)}</span></div></div></div>`;
  $('#co').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('/orders', { method: 'POST', body: { ...d, items: cart.map((i) => ({ product_id: i.id, qty: i.qty })) } });
      store.cart = [];
      app.innerHTML = empty('🎉', `Buyurtma №${r.order_id} qabul qilindi! Jami: <b>${money(r.total)}</b>`, '<a class="btn" href="#/orders">Buyurtmalarim</a>');
    } catch (err) { $('#co-err').textContent = err.message; }
  };
}

async function pageOrders() {
  if (!store.user) return go('#/login');
  const { orders } = await api('/orders');
  app.innerHTML = `<h1>Mening buyurtmalarim</h1>` + (orders.length ? orders.map((o) => `
    <div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>Buyurtma №${o.id}</b><span class="muted">${fmtDate(o.created_at)}</span></div>
    ${o.items.map((i) => `<div class="row" style="justify-content:space-between;padding:6px 0"><a href="#/product/${i.product_id}">${esc(i.title)} × ${i.qty}</a><span>${money(i.price * i.qty)} ${pill(i.status)}</span></div>`).join('')}
    <div class="row" style="justify-content:space-between;margin-top:8px"><span class="muted">${esc(o.address)} · ${esc(PAY[o.payment])}</span><b>${money(o.total)}</b></div>
    ${o.items.some((i) => i.status === 'new') ? `<button class="btn sm danger" style="margin-top:10px" data-action="cancel-order" data-id="${o.id}">Bekor qilish</button>` : ''}
    </div>`).join('') : empty('📦', "Hali buyurtmalar yo'q", '<a class="btn" href="#/catalog">Xarid qilish</a>'));
}

function pageAuth(mode, { query }) {
  const reg = mode === 'register';
  const seller = query.get('role') === 'seller';
  app.innerHTML = `<div class="panel" style="max-width:480px;margin:20px auto"><h1>${reg ? (seller ? "Sotuvchi sifatida ro'yxatdan o'tish" : "Ro'yxatdan o'tish") : 'Kirish'}</h1>
    <form id="auth" class="form" style="max-width:none">
      ${reg ? `<label>Ism<input name="name" required minlength="2" maxlength="80"></label>` : ''}
      <label>Telefon<input name="phone" type="tel" placeholder="+998 90 123 45 67" required></label>
      <label>Parol<input name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      ${reg && seller ? `<label>Do'kon nomi<input name="shop_name" required maxlength="80"></label><input type="hidden" name="role" value="seller">` : ''}
      <div class="error" id="auth-err"></div>
      <button class="btn block" type="submit">${reg ? "Ro'yxatdan o'tish" : 'Kirish'}</button>
    </form>
    <p class="muted">${reg ? `Hisobingiz bormi? <a href="#/login">Kirish</a>${seller ? '' : ` · <a href="#/register?role=seller">Sotuvchi bo'lish</a>`}` : `Hisobingiz yo'qmi? <a href="#/register">Ro'yxatdan o'tish</a>`}</p></div>`;
  $('#auth').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      store.token = r.token; store.user = r.user; renderNav();
      toast(`Xush kelibsiz, ${r.user.name}!`);
      go(query.get('next') === 'checkout' ? '#/checkout' : r.user.role === 'seller' ? '#/seller' : r.user.role === 'admin' ? '#/admin' : '#/');
    } catch (err) { $('#auth-err').textContent = err.message; }
  };
}

// ----- sotuvchi kabineti -----
let sellerTab = 'products';
async function pageSeller() {
  if (store.user?.role !== 'seller') return (app.innerHTML = empty('🔒', "Bu sahifa faqat sotuvchilar uchun", '<a class="btn" href="#/register?role=seller">Sotuvchi bo\'lish</a>'));
  const tabs = `<div class="tabs">${[['products', '📦 Mahsulotlarim'], ['orders', '🧾 Buyurtmalar']].map(([k, l]) => `<button class="${sellerTab === k ? 'on' : ''}" data-action="stab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  if (sellerTab === 'products') {
    const { items } = await api('/seller/products');
    app.innerHTML = `<h1>🏪 ${esc(store.user.shop_name)}</h1>${tabs}
      <p><button class="btn" data-action="prod-form">+ Yangi mahsulot</button></p>
      <div class="tbl"><table><thead><tr><th></th><th>Nomi</th><th>Narx</th><th>Ombor</th><th>Sotilgan</th><th>Holat</th><th></th></tr></thead><tbody>
      ${items.map((p) => `<tr><td style="font-size:26px">${esc(p.emoji)}</td><td><a href="#/product/${p.id}">${esc(p.title)}</a></td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.sold}</td><td>${pill(p.status)}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-action="prod-form" data-id="${p.id}">Tahrirlash</button> <button class="btn sm danger" data-action="prod-del" data-id="${p.id}">O'chirish</button></td></tr>`).join('') || `<tr><td colspan="7" class="muted">Hali mahsulot qo'shilmagan</td></tr>`}
      </tbody></table></div>`;
    pageSeller.items = items;
  } else {
    const { items, stats } = await api('/seller/orders');
    const NEXT = { new: [['confirmed', 'Tasdiqlash'], ['cancelled', 'Bekor']], confirmed: [['shipped', 'Jo\'natildi'], ['cancelled', 'Bekor']], shipped: [['delivered', 'Yetkazildi']] };
    app.innerHTML = `<h1>🏪 ${esc(store.user.shop_name)}</h1>${tabs}
      <div class="stats" style="margin-bottom:16px"><div class="stat">Daromad (tasdiqlangan)<b>${money(stats.revenue)}</b></div><div class="stat">Yangi buyurtmalar<b>${items.filter((i) => i.status === 'new').length}</b></div></div>
      <div class="tbl"><table><thead><tr><th>№</th><th>Mahsulot</th><th>Xaridor</th><th>Manzil / telefon</th><th>Summa</th><th>Holat</th><th></th></tr></thead><tbody>
      ${items.map((i) => `<tr><td>${i.order_id}</td><td>${esc(i.title)} × ${i.qty}</td><td>${esc(i.buyer)}</td><td>${esc(i.address)}<br><span class="muted">${esc(i.phone)} · ${esc(PAY[i.payment])}</span></td><td>${money(i.price * i.qty)}</td><td>${pill(i.status)}</td>
        <td style="white-space:nowrap">${(NEXT[i.status] || []).map(([s, l]) => `<button class="btn sm ${s === 'cancelled' ? 'danger' : ''}" data-action="item-status" data-id="${i.id}" data-status="${s}">${l}</button>`).join(' ')}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">Buyurtmalar yo'q</td></tr>`}
      </tbody></table></div>`;
  }
}

async function openProductForm(id) {
  const [{ categories }] = await Promise.all([api('/categories')]);
  const p = id ? pageSeller.items.find((x) => x.id === +id) : {};
  const bg = modal(`<h2 style="margin-top:0">${id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
    <form id="pf" class="form" style="max-width:none">
      <label>Nomi<input name="title" required minlength="3" maxlength="150" value="${esc(p.title)}"></label>
      <label>Toifa<select name="category_id">${categories.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`).join('')}</select></label>
      <div class="row"><label style="flex:1">Narx (so'm)<input name="price" type="number" min="0" required value="${p.price ?? ''}"></label>
      <label style="flex:1">Eski narx (chegirma uchun)<input name="old_price" type="number" min="0" value="${p.old_price ?? ''}"></label></div>
      <div class="row"><label style="flex:1">Ombordagi soni<input name="stock" type="number" min="0" required value="${p.stock ?? ''}"></label>
      <label style="width:90px">Emoji<input name="emoji" maxlength="4" value="${esc(p.emoji || '📦')}"></label></div>
      <label>Rasm havolasi (https://…, ixtiyoriy)<input name="image_url" type="url" value="${esc(p.image_url || '')}"></label>
      <label>Tavsif<textarea name="description" rows="4" maxlength="3000">${esc(p.description)}</textarea></label>
      ${id ? `<label>Holat<select name="status"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Faol</option><option value="hidden" ${p.status === 'hidden' ? 'selected' : ''}>Yashirin</option></select></label>` : ''}
      <div class="error" id="pf-err"></div>
      <div class="row"><button class="btn" type="submit">Saqlash</button><button class="btn ghost" type="button" data-action="close-modal">Bekor</button></div>
    </form>`);
  $('#pf', bg).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(id ? `/seller/products/${id}` : '/seller/products', { method: id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) });
      bg.remove(); toast('Saqlandi'); route();
    } catch (err) { $('#pf-err', bg).textContent = err.message; }
  };
}

// ----- admin -----
let adminTab = 'stats';
async function pageAdmin() {
  if (store.user?.role !== 'admin') return (app.innerHTML = empty('🔒', 'Bu sahifa faqat administrator uchun'));
  const tabs = `<div class="tabs">${[['stats', '📊 Statistika'], ['users', '👥 Foydalanuvchilar'], ['products', '📦 Mahsulotlar'], ['orders', '🧾 Buyurtmalar'], ['cats', '🗂 Toifalar']].map(([k, l]) => `<button class="${adminTab === k ? 'on' : ''}" data-action="atab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (adminTab === 'stats') {
    const s = await api('/admin/stats');
    body = `<div class="stats">${[['Xaridorlar', s.users], ['Sotuvchilar', s.sellers], ['Mahsulotlar', s.products], ['Buyurtmalar', s.orders], ['Aylanma', money(s.revenue)]].map(([l, v]) => `<div class="stat">${l}<b>${v}</b></div>`).join('')}</div>`;
  } else if (adminTab === 'users') {
    const { items } = await api('/admin/users');
    body = `<div class="tbl"><table><thead><tr><th>Ism</th><th>Telefon</th><th>Rol</th><th>Do'kon</th><th>Holat</th><th></th></tr></thead><tbody>${items.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.phone)}</td><td>${esc(u.role)}</td><td>${esc(u.shop_name || '—')}</td><td>${u.blocked ? pill('blocked') : pill('active')}</td>
      <td>${u.role === 'admin' ? '' : `<button class="btn sm ${u.blocked ? '' : 'danger'}" data-action="user-block" data-id="${u.id}" data-blocked="${u.blocked ? 0 : 1}">${u.blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (adminTab === 'products') {
    const { items } = await api('/admin/products');
    body = `<div class="tbl"><table><thead><tr><th>Mahsulot</th><th>Sotuvchi</th><th>Narx</th><th>Holat</th><th></th></tr></thead><tbody>${items.map((p) => `<tr><td><a href="#/product/${p.id}">${esc(p.emoji)} ${esc(p.title)}</a></td><td>${esc(p.shop)}</td><td>${money(p.price)}</td><td>${pill(p.status)}</td>
      <td><button class="btn sm ${p.status === 'blocked' ? '' : 'danger'}" data-action="prod-status" data-id="${p.id}" data-status="${p.status === 'blocked' ? 'active' : 'blocked'}">${p.status === 'blocked' ? 'Faollashtirish' : 'Bloklash'}</button></td></tr>`).join('')}</tbody></table></div>`;
  } else if (adminTab === 'orders') {
    const { items } = await api('/admin/orders');
    body = `<div class="tbl"><table><thead><tr><th>№</th><th>Sana</th><th>Xaridor</th><th>Manzil</th><th>Qatorlar</th><th>To'lov</th><th>Summa</th></tr></thead><tbody>${items.map((o) => `<tr><td>${o.id}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.buyer)}</td><td>${esc(o.address)}</td><td>${o.lines}</td><td>${esc(PAY[o.payment])}</td><td>${money(o.total)}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const { categories } = await api('/categories');
    body = `<div class="panel"><form id="cf" class="form" style="max-width:none"><h3>Yangi toifa</h3><div class="row"><input name="name" placeholder="Nomi" required style="flex:1"><input name="icon" placeholder="🙂" maxlength="4" style="width:70px"></div><button class="btn" type="submit">Qo'shish</button></form></div>
      <div class="cats">${categories.map((c) => `<div class="cat"><span class="ic">${esc(c.icon)}</span>${esc(c.name)}<br><span class="muted">${c.count} ta</span></div>`).join('')}</div>`;
  }
  app.innerHTML = `<h1>⚙️ Admin panel</h1>${tabs}${body}`;
  const cf = $('#cf');
  if (cf) cf.onsubmit = guard(async (e) => { e.preventDefault(); await api('/admin/categories', { method: 'POST', body: Object.fromEntries(new FormData(cf)) }); toast("Toifa qo'shildi"); route(); });
}

// ---------- savat amallari ----------
async function addToCart(id, qty = 1) {
  const { product: p } = await api('/products/' + id);
  const cart = store.cart;
  const line = cart.find((i) => i.id === p.id);
  const next = (line ? line.qty : 0) + qty;
  if (next > p.stock) throw new Error(`Omborda faqat ${p.stock} dona bor`);
  if (line) { line.qty = next; line.price = p.price; }
  else cart.push({ id: p.id, title: p.title, price: p.price, emoji: p.emoji, image_url: p.image_url, qty });
  store.cart = cart;
}
function cartChange(id, d) {
  const cart = store.cart; const l = cart.find((i) => i.id === id);
  if (!l) return;
  l.qty += d;
  store.cart = l.qty < 1 ? cart.filter((i) => i !== l) : cart;
  pageCart();
}

// ---------- hodisalar (delegatsiya) ----------
document.addEventListener('click', guard(async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = +el.dataset.id;
  const qtyOf = () => +($('#' + el.dataset.qtyel)?.textContent || 1);
  switch (a) {
    case 'logout': e.preventDefault(); store.token = null; store.user = null; renderNav(); go('#/'); toast('Tizimdan chiqdingiz'); break;
    case 'add': await addToCart(id, el.dataset.qtyel ? qtyOf() : 1); toast('Savatga qo\'shildi ✓'); break;
    case 'buy': await addToCart(id, qtyOf()); go('#/checkout'); break;
    case 'inc': { const s = el.parentElement.querySelector('span'); if (+s.textContent < +el.dataset.max) s.textContent = +s.textContent + 1; break; }
    case 'dec': { const s = el.parentElement.querySelector('span'); if (+s.textContent > 1) s.textContent = +s.textContent - 1; break; }
    case 'cart-inc': cartChange(id, 1); break;
    case 'cart-dec': cartChange(id, -1); break;
    case 'cart-del': store.cart = store.cart.filter((i) => i.id !== id); pageCart(); break;
    case 'cancel-order': if (confirm('Buyurtmani bekor qilasizmi?')) { await api(`/orders/${id}/cancel`, { method: 'POST' }); toast('Bekor qilindi'); route(); } break;
    case 'stab': sellerTab = el.dataset.tab; route(); break;
    case 'atab': adminTab = el.dataset.tab; route(); break;
    case 'prod-form': await openProductForm(el.dataset.id); break;
    case 'prod-del': if (confirm("Mahsulotni o'chirasizmi?")) { const r = await api(`/seller/products/${id}`, { method: 'DELETE' }); toast(r.archived ? 'Buyurtma tarixi bor — mahsulot yashirildi' : "O'chirildi"); route(); } break;
    case 'item-status': await api(`/seller/order-items/${id}`, { method: 'PATCH', body: { status: el.dataset.status } }); toast('Yangilandi'); route(); break;
    case 'user-block': await api(`/admin/users/${id}`, { method: 'PATCH', body: { blocked: el.dataset.blocked === '1' } }); route(); break;
    case 'prod-status': await api(`/admin/products/${id}`, { method: 'PATCH', body: { status: el.dataset.status } }); route(); break;
    case 'close-modal': el.closest('.modal-bg').remove(); break;
  }
}));
$('#search').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value.trim(); go(q ? '#/catalog?q=' + encodeURIComponent(q) : '#/catalog'); };

// ---------- marshrutlash ----------
async function route() {
  const r = parseHash();
  const [name] = r.parts;
  window.scrollTo(0, 0);
  try {
    if (!name) await pageHome();
    else if (name === 'catalog') { $('#q').value = r.query.get('q') || ''; await pageCatalog(r); }
    else if (name === 'product') await pageProduct(r);
    else if (name === 'cart') pageCart();
    else if (name === 'checkout') pageCheckout();
    else if (name === 'orders') await pageOrders();
    else if (name === 'login') pageAuth('login', r);
    else if (name === 'register') pageAuth('register', r);
    else if (name === 'seller') await pageSeller();
    else if (name === 'admin') await pageAdmin();
    else app.innerHTML = empty('🧭', 'Sahifa topilmadi', '<a class="btn" href="#/">Bosh sahifa</a>');
  } catch (e) {
    app.innerHTML = empty('⚠️', esc(e.message), '<a class="btn" href="#/">Bosh sahifa</a>');
  }
}
window.addEventListener('hashchange', route);

(async function init() {
  $('#year').textContent = new Date().getFullYear();
  if (store.token) { try { store.user = (await api('/me')).user; } catch { store.token = null; } }
  renderNav();
  route();
})();
