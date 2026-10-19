# Alrafee MikroTik API

واجهة API الخلفية لإدارة شبكات MikroTik وبطاقات HotSpot.

## الرابط الأساسي

```text
https://alrafeerouter.zone.id
```

## فحص الخادم

```bash
curl https://alrafeerouter.zone.id/health
```

## إنشاء حساب

```bash
curl -X POST https://alrafeerouter.zone.id/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{'"networkName":"شبكتي","adminFullName":"اسم المدير","username":"admin","email":"admin@example.com","password":"Password123","phone":"+249115715672"}'
```

## تسجيل الدخول

```bash
curl -X POST https://alrafeerouter.zone.id/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{'"identifier":"admin","password":"Password123"}'
```

الاستجابة الناجحة تحتوي على التوكن داخل `data.token`.

## استخدام التوكن

أرسل التوكن مع أي endpoint محمي داخل ترويسة `Authorization`:

```bash
curl https://alrafeerouter.zone.id/api/v1/packages \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json"
```

## JavaScript

```javascript
const API_URL = "https://alrafeerouter.zone.id";

const loginResponse = await fetch(`${API_URL}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    identifier: "admin",
    password: "Password123"
  })
});

const loginResult = await loginResponse.json();
const token = loginResult.data.token;

const packagesResponse = await fetch(`${API_URL}/api/v1/packages`, {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  }
});
```

## مسارات المصادقة

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/v1/auth/register` | إنشاء حساب وشبكة جديدة |
| POST | `/api/v1/auth/login` | تسجيل الدخول |
| POST | `/api/v1/auth/forgot-password` | طلب رمز استعادة كلمة المرور |
| POST | `/api/v1/auth/reset-password` | إعادة تعيين كلمة المرور |

لا تضع مفاتيح قاعدة البيانات أو الأسرار داخل هذا الملف أو داخل GitHub.
## WhatsApp

رابط التواصل المباشر: [واتساب +249 11 571 5672](https://wa.me/249115715672)
