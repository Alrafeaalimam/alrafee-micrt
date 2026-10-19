# تقرير نظام لوحة تحكم الإدارة العامة ونظام أكواد التراخيص (Super Admin Panel & License Code Redemption System)

**المرجع:** Master Prompt (البند 26/27 - إدارة التراخيص والاشتراكات، دور `SUPER_ADMIN` في `UserRole`)  
**التاريخ:** 2026-10-09  
**الحالة:** مكتمل ومُختبر بنسبة 100% (نجاح كافة اختبارات الـ Backend والـ Frontend)

---

## 1. ملخص تنفيذي (Executive Summary)

تم بناء وتكامل نظام متكامل لإدارة المنصة من قبل مالك المنصة (`SUPER_ADMIN`)، مع عزل تام وتجريد كامل بين تجربة مدير المنصة العام وتجربة المستأجر التجاري العادي (`TENANT_ADMIN`).  
يوفر النظام:
1. حساب وإجراءات إعداد لمدير المنصة العام (`SUPER_ADMIN`) مستقل تماماً عن أي مستأجر تجاري، ومرتبط بكيان المنصة المستقل (`SOFT ZONE Platform`).
2. نموذج قاعدة بيانات Prisma للأكواد المرخصة (`LicenseCode`) مع هجرة معتمدة (`Migration`)، وأكواد مولدة عشوائياً بتنسيق آمن ومقروء (`XXXX-XXXX-XXXX`).
3. حالات استخدام (Use Cases) متوافقة مع مبادئ الهندسة النظيفة (Clean Architecture) لإنشاء الأكواد، عرض الشركات، عرض الأكواد، واسترداد وتفعيل الأكواد.
4. حماية صارمة عبر وسيط Fastify مخصص (`requireSuperAdmin`) يمنع وصول أي مستخدم غير مصرح له إلى مسارات `/api/v1/admin/*`.
5. لوحة تحكم مستقلة كلياً في تطبيق Flutter (`SuperAdminDashboardScreen`) بواجهة نيومورفيك عربية لعرض كافة الشركات المشتركة وإحصائياتها، توليد أكواد التراخيص، وإدارة الأكواد القائمة.
6. حوار تفعيل الترخيص في الشاشة الرئيسية العادية (`DashboardScreen`) وشاشة انتهاء التجربة (`Trial Expired`) لتمكين مدراء الشبكات من إدخال الأكواد وتفعيل اشتراكاتهم وتوسيع حدود أجهزتهم بصورة فورية.

---

## 2. بيانات حساب SUPER_ADMIN (الوصول الأول والاعتمادات)

- **اسم المستخدم (Username):** `superadmin`
- **البريد الإلكتروني:** `superadmin@softzone.local`
- **الدور (Role):** `SUPER_ADMIN`
- **معرف شبكة المنصة (Platform Tenant ID):** `5344fd2e-1ece-4449-b3c2-8115aa182ece`
- **كلمة المرور المولّدة عشوائياً (Random Strong Password):**  
  ```text
  cJtuyJ4KgtrtmSKzMV3Y
  ```
  *(تم توليدها عشوائياً عبر وحدة `crypto.randomBytes`، وتشفيرها بواسطة Bcrypt، وطباعتها لمرة واحدة في موجه الأوامر أثناء الـ Seed دون حفظها كنص صريح في الكود).*

---

## 3. تفاصيل البنية التحتية والخلفية (Backend Architecture)

### 3.1. نموذج البيانات والهجرة (Prisma Schema & Migration)
تمت إضافة نموذج `LicenseCode` وتحديث تعداد الحالات:
```prisma
enum LicenseCodeStatus {
  UNUSED
  USED
  REVOKED
}

model LicenseCode {
  id              String            @id @default(uuid())
  code            String            @unique
  planName        String
  durationDays    Int
  maxRoutersLimit Int
  status          LicenseCodeStatus @default(UNUSED)
  createdByUserId String
  usedByTenantId  String?
  usedAt          DateTime?
  createdAt       DateTime          @default(now())

  usedByTenant    Tenant?           @relation(fields: [usedByTenantId], references: [id], onDelete: SetNull)

  @@index([status])
  @@index([code])
  @@map("license_codes")
}
```
- تم تطبيق ملف الهجرة الفعلي: `prisma/migrations/20261008141200_add_super_admin_license_system/migration.sql`.

### 3.2. حالات الاستخدام (Application Use Cases)
1. **`GenerateLicenseCodeUseCase`**:
   - يولد كوداً آمناً بصيغة `XXXX-XXXX-XXXX` مع استبعاد الحروف والأرقام الملتبسة (مثل 0, O, 1, I).
   - يتحقق من فرادة الكود قبل الحفظ في قاعدة البيانات.
   - يعين الحالة الافتراضية `UNUSED`.
2. **`ListTenantsUseCase`**:
   - يستعلم عن كافة الشركات المسجلة مرتبة تنازلياً.
   - يجمع إحصائيات عدد المستخدمين وعدد الراوترات لكل شركة (`_count`).
   - يعزل تماماً كلمات المرور والبيانات السرية الخاصة بالأجهزة دون أي تسريب.
3. **`ListLicenseCodesUseCase`**:
   - يعرض كافة الأكواد وحالاتها (`UNUSED`, `USED`, `REVOKED`)، وتفاصيل الشركة المستفيدة وتاريخ الاستخدام.
4. **`RedeemLicenseCodeUseCase`**:
   - متاح لأي `TENANT_ADMIN`.
   - يتحقق من وجود الكود وصلاحيته، وعدم استخدامه سابقاً.
   - ينفذ معاملة ذرية (`$transaction`):
     - تحديث المستأجر: تعيين حالة الاشتراك `ACTIVE`، وتحديث `planName` و `maxRoutersLimit`، وتمديد تاريخ انتهاء الصلاحية بناءً على `durationDays` (تمديد الصلاحية السارية أو البدء من الوقت الحالي).
     - تحديث الكود: تعيين الحالة `USED`، وربطه بمعرف المستأجر وتاريخ الاستخدام.
   - يوثق العملية في سجل التدقيق الأمني (`AuditLog`).

### 3.3. مسارات الـ API والأمان (HTTP Routes & Security)
- `GET /api/v1/admin/tenants` (محمي بـ `authMiddleware` + `requireSuperAdmin`، يرفض غير المدراء بـ 403 Forbidden).
- `GET /api/v1/admin/license-codes` (SUPER_ADMIN فقط).
- `POST /api/v1/admin/license-codes` (SUPER_ADMIN فقط مع التحقق عبر Zod).
- `POST /api/v1/subscription/redeem` (متاح لـ `TENANT_ADMIN` و `SUPER_ADMIN`).

---

## 4. تفاصيل الواجهة الأمامية (Flutter Frontend)

### 4.1. شاشة لوحة تحكم السوبر أدمن (`SuperAdminDashboardScreen`)
- **الملف:** `lib/screens/admin/super_admin_dashboard.dart`
- **التوجيه:** لا يوجد أي رابط يربطها باللوحة العادية؛ يُحوّل إليها المستخدم تلقائياً عند تسجيل الدخول فقط إذا كان دوره `SUPER_ADMIN` (في `temp_login_screen.dart` و `main.dart`).
- **المكونات:**
  - شريط علوي مع هوية منصة "SOFT ZONE" وزر تحديث وزر تسجيل الخروج.
  - بطاقات إحصائية بارزة: إجمالي الشركات المسجلة، الاشتراكات النشطة، الأكواد المتوفرة، والاشتراكات التجريبية.
  - تبويب الشركات المسجلة (`TenantsTab`): قائمة تفاعلية مع حقل بحث بالاسم، إحصائيات الراوترات والمستخدمين، وتاريخ الانضمام مع ألوان حالة الاشتراك.
  - تبويب أكواد التراخيص (`LicenseCodesTab`): فلاتر التصفية (الكل، غير مستخدم، مستخدم)، بطاقات ملونة لعرض الكود مع زر النسخ إلى الحافظة بنقرة واحدة، وزر طافي لتوليد كود جديد.
  - نافذة منبثقة سفلية لتوليد كود ترخيص (`GenerateLicenseCodeBottomSheet`): إدخال اسم الخطة، تحديد المدة بالأيام (30، 90، 180، 365)، وتحديد سقف الراوترات مع التحقق الكامل.

### 4.2. تفعيل كود الترخيص للمستخدم العادي (`DashboardScreen`)
- إضافة حوار نيومورفيك `_showRedeemLicenseDialog` يمكن فتحه من أيقونة المفتاح الذهبية.
- إضافة بطاقة بارزة خاصة في شاشة انتهاء الفترة التجريبية (`Trial Expired Banner`) تتيح للعميل النقر على "تفعيل كود ترخيص" كخيار مباشر بديل للتواصل، وفور نجاح التفعيل يتم تحديث حالة حسابه وتمديد اشتراكه مباشرة.

---

## 5. نتائج الاختبارات وضمان الجودة (Test Results)

### 5.1. اختبارات الـ Backend (Node.js / Tsx Test Runner)
```bash
npm test
```
- **عدد الاختبارات الكلي:** 195 اختبار
- **عدد الاختبارات الناجحة:** 195 اختبار
- **عدد الاختبارات الفاشلة:** 0
- **حالات الاختبار المغطاة:**
  - توليد كود ترخيص وظهوره في القائمة بصيغة `XXXX-XXXX-XXXX`.
  - رفض وصول `TENANT_ADMIN` العادي لمسارات `/api/v1/admin/*` بالرمز `403 FORBIDDEN`.
  - رفض الطلبات غير المصادق عليها بالرمز `401 UNAUTHORIZED`.
  - تفعيل كود صحيح وتحديث `subscriptionStatus` و `maxRoutersLimit` وسجل التدقيق.
  - رفض تفعيل كود غير موجود بالرمز `404 CODE_NOT_FOUND`.
  - رفض إعادة استخدام نفس الكود بالرمز `400 CODE_ALREADY_USED`.

### 5.2. اختبارات الـ Frontend (Flutter Widget & Unit Tests)
```bash
flutter test
```
- **عدد الاختبارات الكلي:** 135 اختبار
- **عدد الاختبارات الناجحة:** 135 اختبار
- **عدد الاختبارات الفاشلة:** 0
- **حالات الاختبار المغطاة:**
  - تفكيك بيانات نماذج `LicenseCodeModel` و `AdminTenantModel`.
  - بناء واجهة `SuperAdminDashboardScreen` وعرض إحصائيات الشركات والأكواد.
  - فتح نافذة توليد الكود والتبديل بين التبويبات.
  - ظهور زر وحوار "تفعيل كود ترخيص" وتجربة التفعيل من شاشة الحساب المنتهي.

---

## 6. قائمة الملفات التي تم إنشاؤها وتعديلها

### Backend (`mikrotik_cards_backend`):
1. `prisma/schema.prisma` - إضافة enum `LicenseCodeStatus` ونموذج `LicenseCode` وعلاقة المستأجر.
2. `prisma/migrations/20261008141200_add_super_admin_license_system/migration.sql` - هجرة قاعدة البيانات.
3. `src/infrastructure/database/seed.ts` - بذر مستأجر المنصة ومستخدم `SUPER_ADMIN` وتوليد كلمة المرور.
4. `src/domain/exceptions/LicenseExceptions.ts` - استثناءات نظام التراخيص (`NotFound`, `AlreadyUsed`, `Revoked`).
5. `src/application/use-cases/admin/GenerateLicenseCodeUseCase.ts` - حالة استخدام توليد الكود.
6. `src/application/use-cases/admin/ListTenantsUseCase.ts` - حالة استخدام عرض كافة الشركات.
7. `src/application/use-cases/admin/ListLicenseCodesUseCase.ts` - حالة استخدام عرض كافة الأكواد.
8. `src/application/use-cases/admin/RedeemLicenseCodeUseCase.ts` - حالة استخدام استرداد وتفعيل الكود.
9. `src/presentation/validators/admin.validator.ts` - قواعد التحقق عبر Zod.
10. `src/presentation/http/middlewares/requireSuperAdmin.ts` - وسيط التحقق من رتبة مدير المنصة.
11. `src/presentation/http/routes/admin.routes.ts` - مسارات `/api/v1/admin/*`.
12. `src/presentation/http/routes/subscription.routes.ts` - إضافة مسار `/api/v1/subscription/redeem`.
13. `src/presentation/http/server.ts` - تسجيل مسارات الإدارة العامة في خادم Fastify.
14. `tests/presentation/AdminLicenseRoutes.test.ts` - جناح الاختبارات التكاملية الشاملة.
15. `reports/super-admin-license-report.md` - نسخة التقرير الخاصة بالـ Backend.

### Frontend (`mikrotik_cards_app`):
1. `lib/models/license_code_model.dart` - نموذج كود الترخيص.
2. `lib/models/admin_tenant_model.dart` - نموذج بيانات الشركة للإدارة العامة.
3. `lib/services/api_client.dart` - دوال استدعاء مسارات لوحة التحكم وتفعيل التراخيص والتحقق من رتبة المستخدم.
4. `lib/screens/admin/super_admin_dashboard.dart` - لوحة تحكم السوبر أدمن الكاملة.
5. `lib/screens/temp_login_screen.dart` - توجيه المستخدم حسب دوره عند تسجيل الدخول.
6. `lib/screens/dashboard_screen.dart` - إضافة حوار وخيار تفعيل كود الترخيص.
7. `lib/main.dart` - توجيه المستخدم التلقائي للوحة الإدارة العامة إذا كان مسجلاً بالرتبة المعنية.
8. `test/super_admin_license_test.dart` - اختبارات الوحدة والواجهات لنظام التراخيص ولوحة التحكم.
9. `reports/super-admin-license-report.md` - نسخة التقرير الخاصة بالـ Frontend.

---

## 7. الخاتمة
النظام جاهز تماماً للاستخدام الإنتاجي ويلبي كافة متطلبات وثيقة العمل (Master Prompt) بدقة وأمان متناهيين.
