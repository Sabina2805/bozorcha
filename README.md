# 🛍️ Bozorcha — onlayn marketplace

Ko'p sotuvchili onlayn do'kon (Uzum Market, Olx, Amazon kabi) uchun to'liq ishlaydigan boshlang'ich loyiha. **Tashqi paketlar kerak emas** — faqat Node.js.

## Ishga tushirish

Talab: **Node.js 22.5 yoki yangi** (o'rnatilgan `node:sqlite` moduli ishlatiladi).

```bash
cd bozorcha
npm start            # http://localhost:3000
```

Birinchi ishga tushishda baza (`data/bozorcha.db`) va namunaviy ma'lumotlar (10 toifa, 23 mahsulot) avtomatik yaratiladi. Qayta boshlash: `npm run seed`.

### Namunaviy hisoblar

| Rol | Telefon | Parol |
|---|---|---|
| Admin | +998900000000 | admin123 |
| Sotuvchi | +998901111111 | seller123 |
| Xaridor | +998904444444 | buyer123 |

> ⚠️ Haqiqiy serverga qo'yishdan oldin parollarni almashtiring: `ADMIN_PASSWORD=... JWT_SECRET=<uzun tasodifiy qator> npm start`

## Imkoniyatlar

**Xaridor:** katalog, toifalar, qidiruv, saralash, chegirmalar, mahsulot sahifasi, savat, buyurtma berish, buyurtmani bekor qilish, sharhlar (faqat xarid qilganlar).

**Sotuvchi:** o'z do'koni bilan ro'yxatdan o'tish, mahsulot qo'shish/tahrirlash/yashirish/o'chirish, ombor boshqaruvi, kelgan buyurtmalarni ko'rish va holatini o'zgartirish (yangi → tasdiqlangan → jo'natilgan → yetkazilgan), daromad.

**Admin:** statistika, foydalanuvchilarni bloklash, mahsulotlarni moderatsiya qilish, toifa qo'shish, barcha buyurtmalar.

## Tuzilma

```
server.js        API va statik fayllar (marshrutlar, autentifikatsiya)
db.js            SQLite sxemasi va namunaviy ma'lumotlar
public/          Frontend (index.html, style.css, app.js — SPA)
data/            Baza fayli (avtomatik yaratiladi)
```

## Xavfsizlik

- Parollar `scrypt` bilan xeshlanadi; sessiya — HMAC imzolangan token (7 kun).
- Buyurtma narxi va ombor **serverda** bazadan hisoblanadi, mijoz yuborgan narxga ishonilmaydi; buyurtma tranzaksiyada bajariladi.
- Kirish/ro'yxatdan o'tishga tezlik cheklovi; barcha chiqish HTML-escape qilinadi (XSS); rasm havolasi faqat `http(s)`.
- Rol tekshiruvi har bir sotuvchi/admin yo'lida.

## Haqiqiy loyihaga o'tish uchun (hozircha yo'q narsalar)

1. **To'lov:** hozir faqat naqd/karta (kuryerga). Payme / Click / Uzum Bank integratsiyasini `POST /api/orders` ichiga ulang (to'lov holati, webhook). Karta ma'lumotlarini hech qachon o'zingiz saqlamang.
2. **Rasm yuklash:** hozir rasm havolasi yoki emoji. Fayl yuklash uchun S3/R2 yoki lokal `uploads/` qo'shing.
3. **HTTPS va domen:** Nginx/Caddy orqasida ishlating; `JWT_SECRET` ni doimiy qiling.
4. **SMS tasdiqlash** (Eskiz.uz, Playmobile), parolni tiklash, email/SMS xabarnomalar.
5. **Yetkazib berish va komissiya:** viloyatlar bo'yicha narx, sotuvchidan komissiya hisobi, to'lovlarni sotuvchiga chiqarish.
6. **Katta yuk uchun:** SQLite o'rniga PostgreSQL, qidiruv uchun indeks (Meilisearch), keshlash.
7. Huquqiy tomon: foydalanish shartlari, maxfiylik siyosati, soliq/kassa talablari (O'zbekiston qonunchiligiga ko'ra).

## Brend haqida

Loyiha mustaqil dizayn va nomga ega. Uzum Market yoki boshqa mavjud kompaniyalarning logotipi, nomi va dizaynidan nusxa olinmagan — o'z brendingizni `public/index.html` va `public/style.css` (ranglar `:root` da) orqali o'rnating.
