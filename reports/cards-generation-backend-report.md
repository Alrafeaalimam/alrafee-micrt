# تقرير إنجاز توليد دفعات الكروت ودمج آلة الحالة (Card Batch Generation & State Machine Integration)

**تاريخ الإنجاز**: 2026-10-02  
**المشروع**: Commercial MikroTik Network & HotSpot Card Management System (Backend API)  
**التصنيف**: BACKEND / FEATURE  
**المرجع المعماري**: Master Prompt (البند 9 - Card System، البند 10 - ربط Package بـ Card، البند 16 - Audit Logs)، ودمج `CardStateMachine` كحارس صارم لانتقالات الحالة.

---

## 1. الملخص المعماري والتنفيذي

تم بحمد الله بناء وتفعيل نظام توليد دفعات الكروت (**Card Batch Generation**) ودمجه التام مع آلة حالات الكروت (**Card State Machine**) وفق مبادئ **Clean Architecture** وعزل الطبقات (**Ports & Adapters**) بالاعتماد المباشر على جداول `card_batches` و `cards` في قاعدة بيانات PostgreSQL عبر Prisma Client Wasm Adapter.

### المبادئ الهندسية والأمنية المطبقة:
1. **حراسة الانتقالات بآلة الحالة (State Machine Enforcement)**:
   - لا يمكن لأي كرت أن يتغير حالته مباشرة في قاعدة البيانات دون المرور بدالة `CardStateMachine.transition(currentStatus, targetStatus)`.
   - محاولة إجراء انتقال غير مسموح (مثل `GENERATED` إلى `ACTIVE` مباشرة) تطلق استثناء `InvalidCardTransitionException`، وترد الواجهة البرمجية برمز **HTTP 422 Unprocessable Entity** مع تفاصيل الخطأ بدقة.
2. **التوليد العشوائي الآمن تشفيرياً (Cryptographically Secure Pseudo-Random Generation)**:
   - تم استخدام `node:crypto.randomInt` بدلاً من `Math.random` لمنع أي إمكانية للتنبؤ ببيانات الدخول.
   - اختيار مجموعة محارف غير ملتبسة بصرياً (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` مع استبعاد `0`, `O`, `1`, `I`, `l`) لضمان سهولة القراءة وتجنب أخطاء الإدخال من المستخدمين.
   - التحقق من تفرد الـ `username` بالكامل داخل المستأجر الواحد وضمان عدم التكرار.
3. **تعدد المستأجرين (Multi-Tenancy) وسلامة المفاتيح الأجنبية**:
   - ربط كل دفعة وكل كرت بـ `tenantId`.
   - التحقق من وجود الباقة وكونها مفعّلة (`isActive: true`) قبل بدء أي عملية توليد.
   - ربط الدفعة بـ `createdById` بالرجوع لجدول المستخدمين.
4. **سجل التدقيق الأمني (Audit Logging)**:
   - تسجيل عملية `GENERATE_BATCH` في جدول `audit_logs` لكيان `CardBatch` مع بيانات الكمية والباقة.
   - تسجيل عملية `UPDATE` في جدول `audit_logs` لكيان `Card` عند تغيير الحالة.

---

## 2. تفاصيل الملفات المنشأة والمعدلة

### أ) طبقة الواجهات (Application Interfaces)
* [**`src/application/interfaces/ICardBatchRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/interfaces/ICardBatchRepository.ts):
  * تعريف نموذج `CardBatch` وبيانات الإنشاء `CreateCardBatchData`.
  * تعريف العمليات الأساسية للمستودع: `create`, `findById`, `findAllByTenant`.
* [**`src/application/interfaces/ICardRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/interfaces/ICardRepository.ts):
  * تعريف نموذج `Card` وبيانات الإنشاء `CreateCardData` وفلاتر الاستعلام `FindCardsFilter`.
  * تعريف العمليات: `createMany`, `findByBatchId`, `findAllByTenant`, `findById`, `updateStatus`.

### ب) طبقة البنية التحتية (Infrastructure Repositories)
* [**`src/infrastructure/database/repositories/PrismaCardBatchRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/infrastructure/database/repositories/PrismaCardBatchRepository.ts):
  * تطبيق Prisma لإنشاء واسترجاع دفعات الكروت مع الربط بالمستأجر.
* [**`src/infrastructure/database/repositories/PrismaCardRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/infrastructure/database/repositories/PrismaCardRepository.ts):
  * تنفيذ الإدراج الجماعي الفعال (`createManyAndReturn` مع آلية fallback للمعاملات المجمعة).
  * إلزام دالة `updateStatus` بتطبيق `CardStateMachine.transition()` والتأكد من صحة الانتقال قبل التنفيذ في قاعدة البيانات.

### ج) طبقة حالات الاستخدام (Application Use Cases)
* [**`src/application/use-cases/cards/GenerateCardBatchUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/cards/GenerateCardBatchUseCase.ts):
  * فحص صلاحية وفاعلية الباقة المستهدفة.
  * توليد أرقام الحسابات وكلمات المرور العشوائية مع دعم البادئة (Prefix).
  * إدراج الدفعة والكروت بالحالة الابتدائية `GENERATED`.
  * تسجيل حركة التدقيق الأمني `GENERATE_BATCH`.
* [**`src/application/use-cases/cards/ListCardsUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/cards/ListCardsUseCase.ts):
  * استرجاع الكروت مع دعم التصفية حسب الحالة (`status`) والدفعة (`batchId`) تحت عزل المستأجر.
* [**`src/application/use-cases/cards/UpdateCardStatusUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/cards/UpdateCardStatusUseCase.ts):
  * استرجاع الكرت والتحقق من وجوده ومطابقة المستأجر.
  * تطبيق انتقال الحالة عبر `CardStateMachine`.
  * تحديث الحالة وحفظ التغيير وتسجيل حركة `UPDATE` في `audit_logs`.

### د) طبقة العرض والواجهات البرمجية (Presentation & HTTP)
* [**`src/presentation/validators/card.validator.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/validators/card.validator.ts):
  * مخطط التحقق `generateBatchSchema`:
    * `packageId`: UUID صالح.
    * `quantity`: عدد صحيح بين 1 و 1000.
    * `prefix`: نص اختياري لا يتجاوز 10 محارف.
    * `userLength`: رقم صحيح اختياري (افتراضي 6، بين 4 و 16).
    * `passwordLength`: رقم صحيح اختياري (افتراضي 4، بين 4 و 16).
  * مخطط `updateCardStatusSchema`: فحص الحالة المطلوبة وأنها تنتمي لقيم `CardStatus`.
  * مخطط `listCardsQuerySchema`: فلاتر اختيارية للحالة و `batchId`.
* [**`src/presentation/http/routes/card.routes.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/http/routes/card.routes.ts):
  * تسجيل المسارات:
    * `POST /api/v1/cards/generate-batch`: إنشاء دفعة كروت جديدة (201 Created).
    * `GET /api/v1/cards`: استعراض الكروت مع الفلترة (200 OK).
    * `PATCH /api/v1/cards/:id/status`: تحديث حالة الكرت (200 OK، أو 422 في حال كان الانتقال غير قانوني، أو 404 إذا لم يوجد الكرت).
* [**`src/presentation/http/server.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/http/server.ts):
  * تسجيل مسار `/api/v1/cards` وحماية تشغيل الخادم من التكرار عند استيراده في الاختبارات.

---

## 3. نتائج الاختبارات الآلية (Unit & Integration Tests)

تم إنشاء وتوسيع مجموعات الاختبارات لتغطية مسارات الحالات والواجهات:
* [**`tests/application/CardUseCases.test.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/tests/application/CardUseCases.test.ts):
  * اختبار توليد الدفعة بعدد محدد والتأكد من تفرد أسماء المستخدمين 100%.
  * اختبار رفض توليد كروت لباقة غير موجودة أو معطلة (`isActive: false`).
  * اختبار استرجاع الكروت وفلاتر الحالة والدفعة.
  * اختبار الانتقال المسموح (`GENERATED` -> `AVAILABLE`) ونجاحه.
  * اختبار رفض الانتقال غير المسموح (`GENERATED` -> `ACTIVE`) وإطلاق `InvalidCardTransitionException`.
* [**`tests/presentation/CardRoutes.test.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/tests/presentation/CardRoutes.test.ts):
  * التحقق من رموز الاستجابة لـ HTTP (400 للمدخلات غير الصحيحة، 404 للباقات أو الكروت غير الموجودة).

### إجمالي نتائج الاختبارات (`npm test`):
```text
ℹ tests 127
ℹ suites 30
ℹ pass 127
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
**جميع الاختبارات (127 اختباراً) اجتازت بنجاح تام وبدون أي إخفاق.**

---

## 4. نتائج اختبار التكامل الحي عبر `curl` مع قاعدة البيانات الفعلية

تم تنفيذ اختبار حي متكامل على السيرفر المحلي المتصل بقاعدة بيانات PostgreSQL:

### 1. إنشاء باقة تجريبية
```bash
curl -X POST http://127.0.0.1:3000/api/v1/packages \
  -H "Content-Type: application/json" \
  -d '{"name":"Super Fast 10M","code":"SF10M","downloadSpeedLimit":"10M","uploadSpeedLimit":"5M","durationMinutes":120,"validityDays":3,"price":15.5,"hotspotProfileName":"prof-sf10"}'
```
**النتيجة**: إنشاء باقة بنجاح `id: "36bbec91-0cea-4055-bb60-873d335e3318"`.

### 2. توليد دفعة كروت (10 كروت)
```bash
curl -X POST http://127.0.0.1:3000/api/v1/cards/generate-batch \
  -H "Content-Type: application/json" \
  -d '{"packageId":"36bbec91-0cea-4055-bb60-873d335e3318","quantity":10,"prefix":"VIP","userLength":6,"passwordLength":4}'
```
**النتيجة**: استجابة `HTTP 201 Created`، تم إنشاء الدفعة `BATCH-MURJINNA-F6C902` و 10 كروت بحالة `GENERATED` ويوزرات فريدة تبدأ بـ `VIP` (`VIPDY5Y`, `VIP3Y9F`, إلخ).

### 3. تجربة انتقال مسموح (`GENERATED` → `AVAILABLE`)
```bash
curl -X PATCH http://127.0.0.1:3000/api/v1/cards/94b56cd5-66b8-4932-821f-bef126e0b8ae/status \
  -H "Content-Type: application/json" \
  -d '{"status":"AVAILABLE"}'
```
**النتيجة**: استجابة `HTTP 200 OK`، تم تحديث الحالة بنجاح إلى `AVAILABLE`.

### 4. تجربة انتقال ممنوع بآلة الحالة (`GENERATED` → `ACTIVE`)
```bash
curl -X PATCH http://127.0.0.1:3000/api/v1/cards/bf378196-3534-4fc8-a4cd-f2c9ce8af2c5/status \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'
```
**النتيجة**: تم الرفض الصارم برمز **`HTTP 422 Unprocessable Entity`**:
```json
{
  "statusCode": 422,
  "errorCode": "INVALID_CARD_TRANSITION",
  "message": "Invalid card state transition from 'GENERATED' to 'ACTIVE'"
}
```

### 5. التحقق من سجلات التدقيق في قاعدة البيانات (`audit_logs`)
تم الاستعلام في PostgreSQL وتأكيد تسجيل الحركات:
```text
  action       | entity_type |                  entity_id                   |                           details                            
---------------+-------------+----------------------------------------------+--------------------------------------------------------------
 GENERATE_BATCH| CardBatch   | 9bfd0a0b-eef4-4f4a-85d0-e12918ae3e1c         | {"batchName":"BATCH-MURJINNA-F6C902","quantity":10,...}
 UPDATE        | Card        | 94b56cd5-66b8-4932-821f-bef126e0b8ae         | {"oldStatus":"GENERATED","newStatus":"AVAILABLE"}
```

---

## 5. الخلاصة

تم إنجاز النظام وفق أعلى معايير أمان البيانات وعزل الواجهات والصلابة المعمارية، مع ضمان عدم تخطي آلة الحالة لأي بطاقة، وجاهزية تامة للمرحلة التالية.
