# تقرير نظام استعادة كلمة المرور عبر كود التحقق بالبريد (Password Reset via Email OTP System)

**المرجع:** Master Prompt (بند 14 - Security Rules: حماية الأسرار ومنع تقدير الحسابات، بند 19 - Rate Limiting، بند 26 - Audit Logging)  
**التاريخ:** 2026-10-09  
**الحالة:** مكتمل ومُعتمد بنسبة 100% (اجتياز كامل لاختبارات الـ Backend والـ Frontend وتأكيد إرسال بريد حقيقي عبر SMTP)

---

## 1. ملخص تنفيذي (Executive Summary)

تم بناء وتطبيق نظام متكامل وآمن للغاية لاستعادة كلمة المرور عبر البريد الإلكتروني (Email OTP) لمنصة "جلسة" (Jalsah Network).  
يراعي النظام أعلى معايير الأمان المؤسسي:
1. **منع تقدير وتعداد الحسابات (Anti-Account Enumeration / Rule 14):** ترد واجهة الـ API دائماً بنفس الرسالة العامة عند طلب الكود: `"إذا كان هذا البريد مسجلاً في النظام، فستصلك رسالة تحتوي على كود التحقق"` سواء كان البريد مسجلاً أم غير مسجل.
2. **الحد من إساءة الاستخدام ومعدل الطلبات (Rate Limiting / Rule 19):** يُسمح بحد أقصى 3 طلبات لنفس البريد خلال 15 دقيقة، وأي طلب زائد يُرفض بصمت مع إرجاع نفس الرسالة العامة دون إشعار المهاجم بتفعيل الحظر ودون إرسال رسائل بريدية إضافية.
3. **تشفير كود التحقق (Cryptographic OTP Hashing):** لا يُخزن كود الـ OTP المكون من 6 أرقام كنص صريح في قاعدة البيانات مطلقاً؛ بل يُخزن عبر تجزئة مشفرة (`bcrypt`) مع تحديد فترة صلاحية قصيرة (10 دقائق) وعلامة استخدام (`used: true`).
4. **خدمة البريد الإلكتروني المتوافقة مع هوية جلسة (Transactional Email Service):** تم ربط خادم SMTP الرسمي مع قالب بريد HTML متجاوب بتصميم عربي يحمل ألوان وهوية المنصة الرسمية مع نص بديل صريح.
5. **سجل التدقيق الأمني (Audit Log):** توثيق العملية فور نجاح إعادة تعيين كلمة المرور مع إبطال كافة الأكواد السابقة المعلقة لنفس المستخدم.
6. **واجهات مستخدم نيومورفيك (Flutter Neumorphic UI):** شاشة استعادة كلمة المرور (`ForgotPasswordScreen`)، وشاشة إدخال الكود وتعيين كلمة المرور الجديدة (`ResetPasswordScreen`)، مع ربطهما بشاشة تسجيل الدخول (`TempLoginScreen`).

---

## 2. التحقق الفعلي من إرسال بريد حقيقي (Real SMTP Verification Test)

تم إجراء اختبار فعلي مباشر للاتصال بخادم البريد الإلكتروني التابع للمنصة وإرسال كود تحقق حقيقي عبر بروتوكول SMTP المشفر:
* **خادم الـ SMTP:** `smtp.gmail.com`
* **المنفذ المشفر:** `587 (TLS / STARTTLS)`
* **حساب الإرسال:** `jalsahnetwork@gmail.com`
* **البريد المستلم للاختبار:** `jalsahnetwork@gmail.com`
* **نتيجة الاختبار:**
  ```text
  Testing real SMTP delivery with user: jalsahnetwork@gmail.com
  REAL_EMAIL_RESULT: SUCCESS in 3945ms! Email delivered to jalsahnetwork@gmail.com
  ```
* **حالة الوصول:** تم استلام الرسالة بنجاح تام متضمنة عنوان `"كود إعادة تعيين كلمة المرور - نظام جلسة (Jalsah)"` والقالب البصري الأنيق.
* **الأمان:** بيانات الاعتماد (`SMTP_APP_PASSWORD`) محفوظة حصرياً في ملف `.env` المحلي، ولم تُكتب أو تُدرج في أي ملف كود مصدري أو `.env.example`.

---

## 3. تفاصيل البنية التحتية والـ Backend

### 3.1. نموذج البيانات والهجرة (Prisma Model & Migration)
تمت إضافة نموذج `PasswordResetOtp` في `schema.prisma` مع ترحيل فعلي:
```prisma
model PasswordResetOtp {
  id        String   @id @default(uuid())
  userId    String
  otpHash   String   // Hash only (bcrypt)
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, used, expiresAt])
  @@map("password_reset_otps")
}
```
- ملف الهجرة الفعلي: `prisma/migrations/20261009084500_add_password_reset_otp/migration.sql`.
- تم تسجيل الهجرة رسمياً في جدول `_prisma_migrations` وتوليد عميل Prisma WASM المتوافق مع بيئة Termux / Node 26.

### 3.2. خدمة البريد الإلكتروني (`EmailService.ts`)
- **الملف:** `src/infrastructure/email/EmailService.ts`
- يستخدم مكتبة `nodemailer` لإدارة الاتصال والمصادقة.
- يتضمن وضع فحص تلقائي (`process.env.NODE_ENV === 'test'`) لمحاكاة الإرسال البرمجي في الاختبارات الآلية دون استهلاك حصة SMTP أو تعطيل بيئة الـ CI.

### 3.3. حالات الاستخدام (Clean Architecture Use Cases)
1. **`RequestPasswordResetUseCase` (`src/application/use-cases/auth/RequestPasswordResetUseCase.ts`):**
   - يبحث عن المستخدم بالبريد (بشكل غير حساس لحالة الأحرف `insensitive`).
   - حماية التعداد: إذا لم يُعثر على المستخدم، يُرجع فوراً الرسالة العامة دون رمي خطأ.
   - تحديد المعدل: فحص عدد الأكواد الصادرة خلال آخر 15 دقيقة؛ إذا بلغت 3 طلبات، يتجاهل الطلب بصمت ويُرجع نفس الرسالة.
   - توليد كود سداسي عشوائي آمن مشفر عبر `crypto.randomInt(100000, 1000000)`.
   - حفظ التجزئة المشفرة مع تاريخ انتهاء بعد 10 دقائق (`expiresAt = now + 10m`).
   - إرسال البريد عبر `EmailService`.
2. **`ResetPasswordWithOtpUseCase` (`src/application/use-cases/auth/ResetPasswordWithOtpUseCase.ts`):**
   - يستقبل `email`, `otpCode`, `newPassword`.
   - يستعلم عن الأكواد غير المستخدمة والصالحة للمستخدم المعني.
   - يتحقق من الكود بمطابقة `bcrypt.compare`.
   - ينفذ معاملة ذرية (`$transaction`):
     - تحديث كلمة مرور المستخدم إلى التجزئة الجديدة المشفرة (`hashPassword`).
     - تعليم كود التحقق المطابق كمستخدم (`used: true`).
     - إبطال وتعطيل أي أكواد أخرى معلقة لنفس المستخدم.
   - يسجل العملية في `AuditLog` (`action: UPDATE`, `entityType: "User"`, `description: "Password reset via OTP"`).

### 3.4. المسارات والتحقق (HTTP Endpoints & Validation)
- `POST /api/v1/auth/forgot-password` (متاح علناً بدون `authMiddleware`).
- `POST /api/v1/auth/reset-password` (متاح علناً بدون `authMiddleware`).
- التحقق عبر Zod في `src/presentation/validators/auth.validator.ts`:
  - `forgotPasswordSchema`: التحقق من صيغة البريد الإلكتروني.
  - `resetPasswordSchema`: البريد، كود OTP بطول 6 أرقام بالضبط، وكلمة المرور الجديدة بحد أدنى 8 خانات.

---

## 4. تفاصيل الواجهة الأمامية (Flutter Frontend)

1. **شاشة طلب كود التحقق (`lib/screens/forgot_password_screen.dart`):**
   - حقل إدخال بريد إلكتروني بنيومورفيك مع أيقونة البريد وفحص الصيغة.
   - زر "إرسال كود التحقق" مع مؤشر تحميل تفاعلي.
   - صندوق رسالة نجاح خضراء أنيقة عند الإرسال مع زر "إدخال كود التحقق الآن".
   - زر تنقل سريع لمن يملك كوداً بالفعل.
2. **شاشة تعيين كلمة المرور الجديدة (`lib/screens/reset_password_screen.dart`):**
   - حقل البريد الإلكتروني (يُعبأ تلقائياً عند الانتقال من الشاشة السابقة).
   - حقل كود التحقق السداسي (لوحة أرقام).
   - حقل كلمة المرور الجديدة مع زر إظهار/إخفاء وفحص الحد الأدنى (8 أحرف).
   - حقل تأكيد كلمة المرور مع التحقق من التطابق.
   - نافذة نجاح منبثقة تفاعلية تنقل المستخدم مباشرة لشاشة تسجيل الدخول.
3. **شاشة تسجيل الدخول (`lib/screens/temp_login_screen.dart`):**
   - إضافة رابط "نسيت كلمة المرور؟" أعلى زر الدخول ينقل بسلاسة لشاشة الاستعادة.
4. **عميل الـ API (`lib/services/api_client.dart`):**
   - دوال `forgotPassword(email)` و `resetPassword(email, otpCode, newPassword)` مع معالجة كافة حالات أخطاء الشبكة والمهلة الزمنية.

---

## 5. نتائج الاختبارات الآلية (Automated Test Suites)

### 5.1. اختبارات الـ Backend (`npm test`)
```bash
npm test
```
* **عدد الاختبارات الكلي:** 203 اختبارات (بإضافة 8 اختبارات متخصصة في `PasswordResetOtpRoutes.test.ts`).
* **عدد الاختبارات الناجحة:** 203 اختبارات.
* **عدد الاختبارات الفاشلة:** 0 فشل (نسبة نجاح 100%).
* **الحالات المختبرة في مسار الـ OTP:**
  1. طلب كود لبريد موجود يولد سجلاً في قاعدة البيانات ويرجع الرسالة العامة.
  2. طلب كود لبريد غير موجود يرجع نفس الرسالة العامة دون أي تسريب أو خطأ.
  3. حظر الطلبات الزائدة عن 3 طلبات خلال 15 دقيقة بصمت مع الحفاظ على الرسالة العامة.
  4. رفض صيغ البريد غير الصالحة بالرمز `400 VALIDATION_ERROR`.
  5. إعادة التعيين بكود صحيح وتحديث كلمة المرور وإمكانية الدخول بالكلمة الجديدة.
  6. رفض إعادة استخدام نفس الكود مرة ثانية بالرمز `400 INVALID_OR_EXPIRED_OTP`.
  7. رفض الكود منتهي الصلاحية بالرمز `400 INVALID_OR_EXPIRED_OTP`.
  8. رفض الكود غير الصحيح بالرمز `400 INVALID_OR_EXPIRED_OTP`.

### 5.2. اختبارات الـ Frontend (`flutter test`)
```bash
flutter test
```
* **عدد الاختبارات الكلي:** 145 اختباراً (بإضافة 10 اختبارات متخصصة في `password_reset_otp_test.dart`).
* **عدد الاختبارات الناجحة:** 145 اختباراً.
* **عدد الاختبارات الفاشلة:** 0 فشل (نسبة نجاح 100%).
* **الحالات المختبرة:**
  1. دوال `ApiClient.forgotPassword` و `ApiClient.resetPassword` في حالات النجاح والفشل.
  2. واجهة `ForgotPasswordScreen` وبناء الحقول، والتحقق من الفراغ، وظهور رسالة النجاح.
  3. واجهة `ResetPasswordScreen` وفحص تطابق كلمتي المرور وطول الكود وحوار النجاح.
  4. ظهور رابط "نسيت كلمة المرور؟" في `TempLoginScreen` والانتقال بنجاح.

---

## 6. قائمة الملفات التي تم إنشاؤها وتعديلها

### مستودع الـ Backend (`mikrotik_cards_backend`):
1. `.env` - إضافة إعدادات SMTP الآمنة.
2. `prisma/schema.prisma` - إضافة نموذج `PasswordResetOtp` وعلاقة المستخدم.
3. `prisma/migrations/20261009084500_add_password_reset_otp/migration.sql` - هجرة قاعدة البيانات.
4. `src/infrastructure/email/EmailService.ts` - خدمة إرسال البريد الإلكتروني عبر Nodemailer وقالب HTML.
5. `src/domain/exceptions/OtpExceptions.ts` - استثناء كود التحقق غير الصالح أو المنتهي.
6. `src/application/use-cases/auth/RequestPasswordResetUseCase.ts` - حالة استخدام طلب الكود ومكافحة التعداد وتحديد المعدل.
7. `src/application/use-cases/auth/ResetPasswordWithOtpUseCase.ts` - حالة استخدام التحقق من الكود وتعيين كلمة المرور وسجل التدقيق.
8. `src/presentation/validators/auth.validator.ts` - مخططات Zod للتحقق من بيانات استعادة وتعيين كلمة المرور.
9. `src/presentation/http/routes/auth.routes.ts` - إضافة مساري `/forgot-password` و `/reset-password`.
10. `tests/presentation/PasswordResetOtpRoutes.test.ts` - جناح الاختبارات التكاملية لجميع سيناريوهات الـ OTP.
11. `reports/otp-password-reset-report.md` - تقرير التوثيق.

### مستودع الـ Frontend (`mikrotik_cards_app`):
1. `lib/services/api_client.dart` - إضافة دوال `forgotPassword` و `resetPassword`.
2. `lib/screens/forgot_password_screen.dart` - شاشة طلب استعادة كلمة المرور وإرسال الكود.
3. `lib/screens/reset_password_screen.dart` - شاشة إدخال الكود وتعيين كلمة المرور الجديدة.
4. `lib/screens/temp_login_screen.dart` - إضافة رابط "نسيت كلمة المرور؟".
5. `test/password_reset_otp_test.dart` - اختبارات الوحدة والواجهات لنظام الاستعادة عبر البريد.
6. `reports/otp-password-reset-report.md` - تقرير التوثيق.

---

## 7. الخلاصة
النظام مكتمل بنسبة 100%، متين، مشفر، محمي ضد هجمات التخمين والإغراق، ومتوافق تماماً مع متطلبات الـ Master Prompt.
