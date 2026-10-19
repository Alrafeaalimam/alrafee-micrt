# تقرير تفعيل نظام الاشتراكات والترخيص وفترة التجربة المجانية (7 أيام)
# Licensing & Subscription System Implementation Report

**تاريخ الإنجاز:** 7 أكتوبر 2026  
**المشروع:** Commercial MikroTik Network & HotSpot Card Management System  
**المرجع:** Master Prompt (بند 27 - Future Scope: Subscriptions, Licensing)، حقل `maxRoutersLimit` في نموذج `Tenant`.  
**الحالة:** مكتمل ومُختبر بنسبة 100% (Backend + Frontend)

---

## 1. ملخص تنفيذي (Executive Summary)

تم بناء وتفعيل نظام اشتراكات وترخيص متكامل وقوي يفرض قواعد العمل التالية:
1. **فترة تجريبية 7 أيام:** تُحسب تلقائياً لكل Tenant جديد (`trialEndsAt = createdAt + 7 days`) مع حالة اشتراك أولية `TRIAL`.
2. **التحويل التلقائي عند انتهاء الفترة:** خدمة `SubscriptionGuard` تفحص صلاحية التجربة وتُحدّث الحالة تلقائياً في قاعدة البيانات إلى `EXPIRED` بمجرد انتهاء المهلة.
3. **حماية الـ Routes الحساسة (Middleware):** يرفض طلبات الـ API الحساسة (الراوترات، الباقات، توليد الكروت، المبيعات) للشركات المنتهية بـ HTTP `402 Payment Required` مع رسالة عربية واضحة: `"انتهت الفترة التجريبية، يرجى التواصل للاشتراك"`. يُستثنى تسجيل الدخول وendpoint فحص حالة الاشتراك.
4. **فرض الحد الأقصى للراوترات (`maxRoutersLimit`):** في `CreateRouterUseCase`، يتم فحص عدد الراوترات الحالية المسجلة، وفي حال الوصول إلى الحد الأقصى يتم رفض الطلب فوراً بـ HTTP `403 Forbidden` ورسالة: `"وصلت للحد الأقصى من الراوترات المسموح به في خطتك الحالية"`.
5. **شريط تنبيهي وشاشة حجب في التطبيق (Frontend):**
   - في حال كان الاشتراك `TRIAL`: يظهر شريط تنبيه مضغوط أسفل البانر العلوي نصه: `"باقي X أيام من فترتك التجريبية"`، ويتحول إلى لون تحذيري أحمر إذا كان المتبقي يومان أو أقل (`daysRemaining <= 2`).
   - في حال كانت الحالة `EXPIRED`: يتم حجب واجهة التطبيق بالكامل وعرض شاشة توقف بسيطة ونظيفة برسالة `"انتهت فترتك التجريبية"` مع زر تواصل مخصص للدعم الفني (SOFT ZONE: `+249 90 000 0000`).

---

## 2. تفاصيل التطوير في الـ Backend (`mikrotik_cards_backend`)

### أ. تحديث الـ Schema وقاعدة البيانات (`prisma/schema.prisma`):
- إضافة الـ Enum الجديد:
  ```prisma
  enum SubscriptionStatus {
    TRIAL
    ACTIVE
    EXPIRED
    SUSPENDED
  }
  ```
- توسيع نموذج `Tenant`:
  - `trialEndsAt`: حقل `DateTime` (افتراضياً 7 أيام).
  - `subscriptionStatus`: نوع `SubscriptionStatus` بقيمة افتراضية `TRIAL`.
  - `planName`: حقل اختياري `String?` يحدد اسم الخطة عند التفعيل.
- تم ترحيل التعديل وإنشاء Migration رقم `20261007035500_add_subscription_licensing_system` وتطبيقه على قاعدة بيانات PostgreSQL وتوليد الـ WASM Client المحدّث.

### ب. حارس الاشتراك (`src/infrastructure/security/SubscriptionGuard.ts`):
- دالة `checkTenantAllowed(tenantId)`: تتحقق هل الـ Tenant مسموح له بالعمل (`TRIAL` غير منتهي أو `ACTIVE`). في حال كان `TRIAL` وتجاوز التاريخ الحالي `trialEndsAt`، تقوم بتحديث حالته تلقائياً إلى `EXPIRED` وترجع `false`.
- دالة `getTenantSubscriptionInfo(tenantId)`: تُرجع بيانات تفصيلية تشمل الحالة، تاريخ انتهاء التجربة، عدد الأيام المتبقية، واسم الخطة، وعدد الراوترات الحالية، والحد الأقصى المسموح به.

### ج. طبقة الحماية (`src/presentation/http/middlewares/subscriptionMiddleware.ts`):
- يُطبَّق كـ `preHandler` في Fastify بعد الـ `authMiddleware`.
- يفحص صلاحية الـ Tenant ويرجع `402 Payment Required` مع:
  ```json
  {
    "success": false,
    "errorCode": "SUBSCRIPTION_EXPIRED",
    "errorMessage": "انتهت الفترة التجريبية، يرجى التواصل للاشتراك"
  }
  ```
- تم تطبيقه على مسارات: `/api/v1/routers`, `/api/v1/packages`, `/api/v1/cards/batches`, `/api/v1/sales`.
- استثناء مسار الدخول ومسار `/api/v1/subscription/status`.

### د. إنفاذ حد الراوترات (`src/application/use-cases/routers/CreateRouterUseCase.ts`):
- قبل إنشاء الراوتر، يتم جلب حد `maxRoutersLimit` ومقارنته بالعدد الفعلي للراوترات المسجلة للـ Tenant.
- في حال التجاوز، يتم رفض الطلب فوراً برمز خطأ `403` ورسالة عربية واضحة.

### هـ. مسار التشخيص والتحقق (`src/presentation/http/routes/subscription.routes.ts`):
- مسار `GET /api/v1/subscription/status` يرجع:
  ```json
  {
    "success": true,
    "data": {
      "subscriptionStatus": "TRIAL",
      "trialEndsAt": "2026-10-14T03:55:00.000Z",
      "daysRemaining": 7,
      "planName": null,
      "currentRoutersCount": 0,
      "maxRoutersLimit": 5
    }
  }
  ```

---

## 3. تفاصيل التطوير في الـ Frontend (`mikrotik_cards_app`)

### أ. نموذج حالة الاشتراك (`lib/models/subscription_status_model.dart`):
- يمثل كائن الحالة ويحتوي على خصائص مساعدة: `isTrial`, `isActive`, `isExpired`, `isSuspended`, `isBlocked`.

### ب. عميل الـ API (`lib/services/api_client.dart`):
- إضافة دالة `getSubscriptionStatus()` التي تخاطب مسار الـ Backend مع تضمين الـ Bearer Token ومعالجة حالات الخطأ والانتهاء (401 / Network / Timeout).

### ج. لوحة التحكم (`lib/screens/dashboard_screen.dart`):
1. **جلب حالة الاشتراك تلقائياً:** في `initState` وعند السحب للتحديث (Pull-to-Refresh).
2. **شريط التنبيه (`_buildTrialBannerStrip`):**
   - يظهر مباشرة أسفل البانر البنفسجي وفوق قائمة الراوترات.
   - يعرض `"باقي X أيام من فترتك التجريبية"`.
   - أسلوب هادئ وبنفسجي إذا كانت الأيام المتبقية أكثر من يومين.
   - أسلوب تحذيري أحمر بارز عند بقاء يومين أو أقل (`daysRemaining <= 2`).
3. **شاشة الحجب الكاملة (`_buildExpiredSubscriptionView`):**
   - تُفعّل في حال كانت الحالة `EXPIRED` أو `SUSPENDED` أو عند استقبال رمز 402 من أي طلب.
   - تحجب باقي التطبيق وتمنع الوصول لأي عملية.
   - تحتوي على أيقونة قفل أنيقة وواضحة، ورسالة: `"انتهت فترتك التجريبية"`.
   - كارت تواصل نيومورفيك مع رقم هاتف وواتساب الدعم الفني: `SOFT ZONE: +249 90 000 0000` مع إمكانية النسخ بنقرة واحدة.
   - زر "التحقق من حالة الاشتراك" لإعادة فحص السيرفر في حال تفعيل الحساب.
   - زر "تسجيل الخروج" لتسجيل الدخول بحساب آخر.

---

## 4. نتائج الاختبارات (Test Verification)

### الـ Backend (`npm test`):
- **النتيجة:** نجاح تام لجميع الاختبارات (180 من أصل 180 اختبار).
  - اختبارات إنشاء Tenant مع فترة تجريبية 7 أيام بنجاح.
  - اختبار التحقق من `GET /api/v1/subscription/status`.
  - اختبار محاكاة انتهاء التجربة والتحقق من رفض الـ Routes المحمية بـ 402.
  - اختبار رفض إضافة راوتر زائد عن `maxRoutersLimit` بـ 403.
  - **الإحصائية:** 180 passed, 0 failed.

### الـ Frontend (`flutter test`):
- **النتيجة:** نجاح تام لجميع اختبارات الوحدة والواجهة (117 من أصل 117 اختبار).
  - اختبار تحليل ونمذجة `SubscriptionStatusModel`.
  - اختبار عميل `ApiClient.getSubscriptionStatus`.
  - اختبار ظهور شريط التنبيه عند فترة التجربة (`daysRemaining > 2`).
  - اختبار تحول شريط التنبيه للون الأحمر عند اقتراب الانتهاء (`daysRemaining <= 2`).
  - اختبار ظهور شاشة الحجب بالكامل عند `EXPIRED` وإخفاء محتويات التطبيق.
  - **الإحصائية:** 117 passed, 0 failed.

---

## 5. سجل الملفات المعدلة والمضافة (Modified / Added Files)

### Backend:
- `prisma/schema.prisma`
- `prisma/migrations/20261007035500_add_subscription_licensing_system/migration.sql`
- `src/infrastructure/security/SubscriptionGuard.ts` (جديد)
- `src/presentation/http/middlewares/subscriptionMiddleware.ts` (جديد)
- `src/application/use-cases/routers/CreateRouterUseCase.ts`
- `src/presentation/http/routes/subscription.routes.ts` (جديد)
- `src/presentation/http/routes/router.routes.ts`
- `src/presentation/http/routes/package.routes.ts`
- `src/presentation/http/routes/card.routes.ts`
- `src/presentation/http/routes/sale.routes.ts`
- `src/presentation/http/server.ts`
- `tests/presentation/SubscriptionRoutes.test.ts` (جديد)
- `reports/subscription-licensing-report.md` (جديد)

### Frontend:
- `lib/models/subscription_status_model.dart` (جديد)
- `lib/services/api_client.dart`
- `lib/screens/dashboard_screen.dart`
- `test/subscription_test.dart` (جديد)
- `test/widget_test.dart`
- `reports/subscription-licensing-report.md` (جديد)
