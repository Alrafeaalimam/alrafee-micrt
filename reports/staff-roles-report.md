# تقرير تطبيق إدارة الموظفين والصلاحيات (Staff & Roles Management)
**المرجع:** Master Prompt (البند 14 - Security Rules، البند 19 - RBAC & API Design، البند 26 - MVP Roles)

---

## 1. نظرة عامة والهدف
تم تنفيذ نظام شامل لإدارة الموظفين والصلاحيات التشغيلية عبر طبقات النظام الخلفي (Backend) والواجهة الأمامية (Flutter)، بما يمكّن مدراء النظام (`TENANT_ADMIN` و `SUPER_ADMIN`) من إضافة موظفين بأدوار متباينة، استعراض فريق العمل، وتعطيل الحسابات دون حذف السجلات أو المساس بسجل التدقيق (Audit Log)، مع فرض قيود صلاحيات صارمة تمنع غير المخولين من الوصول إلى نقاط النهاية الحساسة.

---

## 2. بنية النظام الخلفي (Backend Architecture)

### 2.1 نموذج البيانات والتخزين (Repository Pattern)
- **`IUserRepository`**: تم توسيع الواجهة البرمجية لتشمل:
  - `createStaffUser`: إنشاء موظف جديد بكلمة مرور مشفرة وتعيين المستأجر والدور.
  - `findAllByTenant`: جلب جميع مستخدمي المستأجر مرتبين حسب تاريخ الإنشاء تنازلياً مع استبعاد تجريد الهاش.
  - `updateRole`: تحديث دور موظف محدد.
  - `deactivateUser`: تعطيل حساب الموظف بتحويل `status` إلى `INACTIVE` (بدون حذف فيزيائي).
  - `findByIdAndTenant`: التحقق من وجود الموظف ضمن نطاق المستأجر نفسه لمنع تسرب البيانات بين المستأجرين (Multi-Tenancy Isolation).
- **`PrismaUserRepository`**: تطبيق واجهة المستودع باستخدام Prisma Client، مع استرجاع كائنات مستخدمين آمنة خالية من حقل `passwordHash`.

### 2.2 حالات الاستخدام وسجل التدقيق (Use Cases & Audit Logs)
1. **`CreateStaffUserUseCase`**:
   - يتحقق من صلاحية المنفّذ (يُسمح فقط لـ `TENANT_ADMIN` و `SUPER_ADMIN`، ويُرفض أي دور آخر بـ `ForbiddenException` / HTTP 403).
   - يتحقق من عدم تكرار اسم المستخدم لنفس المستأجر (`ConflictException` / HTTP 409).
   - يشفّر كلمة المرور عبر دوال التشفير المعتمدة (`argon2` / `bcrypt`).
   - يسجل العملية بالكامل في جدول `audit_logs` بالإجراء `CREATE` والمورد `User`.
2. **`ListStaffUseCase`**:
   - يتحقق من صلاحية المنفّذ (`TENANT_ADMIN` / `SUPER_ADMIN`).
   - يرجع قائمة موظفي المستأجر مع تصفية البيانات الحساسة.
3. **`DeactivateStaffUseCase`**:
   - يمنع المدير من تعطيل حسابه الخاص (`callerId === targetUserId` ينتج خطأ `CANNOT_DEACTIVATE_SELF` / HTTP 400).
   - يتحقق من تبعية الموظف لنفس المستأجر (`UserNotFoundException` / HTTP 404).
   - يحول حالة الموظف إلى `INACTIVE`.
   - يسجل العملية في جدول `audit_logs` بالإجراء `UPDATE` والمورد `User`.
4. **`LoginUseCase`**:
   - يتحقق من حالة المستخدم عند تسجيل الدخول؛ إذا كان الحساب `INACTIVE`، يرفض الطلب فوراً باستثناء `InactiveUserException` ورسالة واضحة: *"هذا الحساب معطل، يرجى التواصل مع مسؤول النظام"*، مع تسجيل محاولة دخول فاشلة في سجل التدقيق.

### 2.3 حماية المسارات وRBAC Middleware
- **`roleMiddleware.ts`**: ميدلوير `requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])` يتحقق من دور المستخدم المستخرج من الـ JWT قبل تمرير الطلب إلى معالجات المسارات.
- **`user.routes.ts`**: تسجيل المسارات التالية تحت البادئة `/api/v1/users`:
  - `POST /`: إنشاء موظف جديد (مع التحقق عبر Zod Schema: اسم مستخدم، كلمة مرور، اسم كامل، دور تشغيلي، هاتف اختياري).
  - `GET /`: استعراض قائمة الموظفين للمستأجر الحالي.
  - `PATCH /:id/deactivate`: تعطيل حساب الموظف.

---

## 3. بنية الواجهة الأمامية (Flutter Architecture)

### 3.1 استخراج الصلاحيات محلياً (Zero-Latency JWT Decoding)
- في `lib/services/api_client.dart`:
  - دالة `getUserRole()`: تقوم بفك تشفير الـ Payload من الـ JWT المحفوظ محلياً باستخدام `base64Url.normalize` وقراءة حقل `role` دون الحاجة لأي طلب شبكة إضافي.
  - خاصية `isAdmin`: ترجع `true` إذا كان الدور `TENANT_ADMIN` أو `SUPER_ADMIN`، و`false` لجميع الأدوار الأخرى (`OPERATOR`, `RESELLER`, `ACCOUNTANT`) أو عند انعدام التوكن.
  - دوال الشبكة الجديدة: `getStaffUsers()`, `createStaffUser()`, `deactivateStaffUser()`.

### 3.2 واجهة إدارة الموظفين (`lib/screens/staff_screen.dart`)
- **تصميم نيومورفيك (Soft Neumorphic & Modern Dashboard)**: متناسق تماماً مع هوية التطبيق (بنفسجي متدرج `#6C5CE7` إلى `#3B2FA0` مع لمسات ذهبية `#FFC043`).
- **البانر العلوي (Top Hero Banner)**:
  - إحصائيات فورية: إجمالي الفريق، الحسابات النشطة، والحسابات المعطلة.
  - زر عائم سريع لإضافة موظف جديد.
  - زر رجوع ذكي مع دعم كامل للاتجاه من اليمين لليسار (RTL).
- **الحالات الأربع المعتمدة (Rule 35)**:
  - **Loading**: مؤشر تحميل نيومورفيك أنيق أثناء جلب البيانات.
  - **Error**: كارت خطأ مع رسالة واضحة وزر "إعادة المحاولة" يعمل فورياً.
  - **Empty**: شاشة فارغة إرشادية بأيقونة الفريق مع زر "إضافة أول موظف".
  - **Data**: قائمة نيومورفيك تفاعلية تعرض بطاقات الموظفين مع وسام الدور الملون، وسام الحالة، والبيانات التفصيلية.
- **نافذة الإضافة (Bottom Sheet Modal)**:
  - حقول إدخال نيومورفيكية (الاسم الكامل، اسم المستخدم، كلمة المرور مع إمكانية الإظهار/الإخفاء، الهاتف، وقائمة منسدلة بالأدوار التشغيلية).
  - تحقق مسبق من صحة المدخلات (Form Validation).
- **نافذة تأكيد التعطيل (Deactivate Confirmation Dialog)**:
  - تنبيه تحذيري يطلب تأكيد تعطيل الحساب قبل إرسال الطلب، لمنع التعطيل العرضي.

### 3.3 التحكم في شاشة لوحة التحكم (`lib/screens/dashboard_screen.dart`)
- إظهار زر "الموظفون" في الشريط العلوي بصورة مشروطة: يظهر فقط إذا كان المستخدم `TENANT_ADMIN` أو `SUPER_ADMIN` عبر فحص `ApiClient.isAdmin`.
- إخفاء الزر بالكامل للمشغلين والوكلاء والمحاسبين لحماية تجربة الاستخدام ومنع محاولات الوصول غير المصرح بها.

---

## 4. نتائج الاختبارات وضمان الجودة (Test Results)

### 4.1 اختبارات النظام الخلفي (Backend Tests)
- **الأداة**: Node.js Test Runner & Supertest
- **الملفات**: `tests/presentation/UserRoutes.test.ts`, `tests/application/LoginUseCase.test.ts`, وكافة اختبارات الحزم والمبيعات والمصادقة.
- **النتيجة**: **172 اختباراً ناجحاً (0 فشل)**:
  ```text
  ✔ Staff & Roles Management Integration Tests (Rule 26)
    ✔ RBAC Authorization Rules: OPERATOR cannot create staff (403 FORBIDDEN)
    ✔ RBAC Authorization Rules: OPERATOR cannot list staff (403 FORBIDDEN)
    ✔ RBAC Authorization Rules: Unauthenticated request rejected (401 UNAUTHORIZED)
    ✔ TENANT_ADMIN Staff Lifecycle: Creates staff user (201 Created)
    ✔ TENANT_ADMIN Staff Lifecycle: Staff appears in GET /api/v1/users
    ✔ TENANT_ADMIN Staff Lifecycle: Newly created staff logs in successfully
    ✔ TENANT_ADMIN Staff Lifecycle: Admin cannot deactivate self (400 CANNOT_DEACTIVATE_SELF)
    ✔ TENANT_ADMIN Staff Lifecycle: Admin deactivates staff (200 OK, INACTIVE)
    ✔ TENANT_ADMIN Staff Lifecycle: Deactivated user rejected on login (403 ACCOUNT_INACTIVE)
  ℹ tests 172
  ℹ pass 172
  ℹ fail 0
  ```

### 4.2 اختبارات الواجهة الأمامية (Frontend Tests)
- **الأداة**: Flutter Test & WidgetTester
- **الملفات**: `test/staff_test.dart` بالإضافة لجميع مجموعات الاختبارات السابقة.
- **النتيجة**: **95 اختباراً ناجحاً (0 فشل)**:
  ```text
  StaffUserModel Unit Tests:
    ✔ fromJson accurately parses all user roles and active status
    ✔ roleArabic and roleIcon return proper Arabic labels for all roles
    ✔ toJson serializes model accurately
  ApiClient Staff & Role Management:
    ✔ getUserRole extracts role directly from JWT payload
    ✔ getStaffUsers sends GET /api/v1/users with auth header
    ✔ createStaffUser sends POST /api/v1/users with correct payload
    ✔ deactivateStaffUser sends PATCH /api/v1/users/:id/deactivate
    ✔ getStaffUsers returns FORBIDDEN error when role is non-admin
  StaffScreen Widget Tests:
    ✔ renders hero banner, stats, and list of staff with badges
    ✔ shows empty state when no staff members exist
    ✔ shows error state and retries successfully
    ✔ tapping "إضافة موظف" opens modal sheet and validates empty fields
    ✔ successfully creates staff user and reloads list
    ✔ deactivate dialog confirms and deactivates staff member
  DashboardScreen RBAC Widget Tests:
    ✔ shows "الموظفون" button when user is TENANT_ADMIN and navigates to StaffScreen
    ✔ hides "الموظفون" button when user is OPERATOR
    ✔ hides "الموظفون" button when no token is present
  00:26 +95: All tests passed!
  ```

### 4.3 الفحص والتحليل البرمجي (Static Analysis)
- `flutter analyze`: **No issues found!**
- `npm run build`: نجاح تام في الترجمة البرمجية (0 أخطاء TypeScript).
- `flutter build web`: تم بناء حزمة الويب للإنتاج بنجاح (`✓ Built build/web`).

---

## 5. الخلاصة
النظام الآن يمتلك منظومة متكاملة لإدارة موظفي وصلاحيات المشتركين التجاريين تدعم التوسع والتدقيق الأمني الصارم، مع جاهزية كاملة للتشغيل في بيئات الإنتاج.
