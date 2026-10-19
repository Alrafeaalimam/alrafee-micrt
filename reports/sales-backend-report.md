# تقرير إنجاز نظام مبيعات الكروت الذري وتكامل آلة الحالة (Atomic Card Sales & State Machine Integration)

**تاريخ الإنجاز**: 2026-10-03  
**المشروع**: Commercial MikroTik Network & HotSpot Card Management System (Backend API)  
**التصنيف**: BACKEND / FEATURE  
**المرجع المعماري**: Master Prompt (البند 8 - Sales/Sale Items، البند 9 - Card Lifecycle: AVAILABLE→SOLD، البند 16 - Audit Logs)، ودمج `CardStateMachine` كحارس صارم وموثوق لعمليات البيع.

---

## 1. الملخص التنفيذي والمعماري

تم بحمد الله بناء وتفعيل نظام مبيعات الكروت (**Card Sales System**) المتكامل والذري بالكامل بالاعتماد المباشر على جداول `sales` و `sale_items` و `cards` في قاعدة بيانات PostgreSQL عبر Prisma Client Wasm Adapter، مع دمج صارم لآلة حالات الكروت (**Card State Machine**) لضمان ألا يُباع كرت إلا إذا كان بحالة **`AVAILABLE`** فقط، وانتقال حالته لحظياً إلى **`SOLD`**.

### المبادئ الهندسية والأمنية المحققة:
1. **الذرية الصارمة (Strict Atomicity via Prisma $transaction)**:
   - إنشاء الفاتورة (`Sale`)، وتوليد بنود الفاتورة (`SaleItems`)، وتحديث حالة الكروت المستهدفة إلى `SOLD` يتم داخل معاملة ذرية واحدة (`$transaction`).
   - لا توجد أي حالة بيع جزئي (Partial Sale)؛ فإذا فشل تحديث أي كرت أو تم انتهاك أي قيد فريد، تتدحرج المعاملة بالكامل (Full Rollback).
   - قيد التفرد `@unique` على حقل `cardId` في جدول `sale_items` يمنع منعاً باتاً على مستوى محرك قاعدة البيانات تكرار بيع الكرت ذاته في أكثر من فاتورة.
2. **الحراسة القاطعة بآلة الحالة (Domain State Machine Enforcement)**:
   - تم إلزام التحقق عبر `CardStateMachine.transition(currentStatus, 'SOLD')`.
   - عند محاولة بيع كرت في حالة غير مسموح بها (مثل `GENERATED` أو `SOLD` مسبقاً أو `EXPIRED`)، يتم رفض الطلب فوراً برسالة خطأ واضحة تبين معرّف الكرت واسم مستخدمه وحالته الحالية، مع إرجاع رمز الاستجابة المعياري **HTTP 422 Unprocessable Entity**.
3. **الدقة المالية وحساب الإجمالي (Financial Precision & Calculation)**:
   - يُحسب `totalAmount` تلقائياً بجمع أسعار الكروت المشتراة مع معالجة أخطاء الفاصلة العائمة (Floating-point precision rounding).
   - كل بند `SaleItem` يحتفظ بالسعر الفعلي للكرت `unitPrice` لحظة إتمام المعاملة.
4. **سجل التدقيق الأمني (Security Audit Logging)**:
   - تسجيل حركة بيع الكروت بالرمز المعياري `SELL_CARDS` في جدول `audit_logs` لكيان `Sale` موضحاً الموظف البائع، المبلغ الإجمالي، طريقة الدفع، وقائمة الكروت المباعة.

---

## 2. تفاصيل الملفات المنشأة والمعدلة

### أ) طبقة الواجهات (Application Interfaces)
* [**`src/application/interfaces/ISaleRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/interfaces/ISaleRepository.ts):
  * تعريف أنواع البيانات: `PaymentMethod` (`CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`)، ونموذج `Sale` و `SaleItem`.
  * تعريف عمليات المستودع:
    * `create(data: CreateSaleInput): Promise<Sale>`
    * `findAllByTenant(tenantId: string, dateFrom?: Date, dateTo?: Date): Promise<Sale[]>`
    * `getTodaySalesTotal(tenantId: string): Promise<number>`
* [**`src/application/interfaces/ICardRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/interfaces/ICardRepository.ts):
  * إضافة التابع `findByIds(ids: string[], tenantId: string): Promise<Card[]>` لاسترجاع مجموعة كروت دفعة واحدة بأعلى كفاءة.

### ب) طبقة البنية التحتية ومستودعات البيانات (Infrastructure Repositories)
* [**`src/infrastructure/database/repositories/PrismaSaleRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/infrastructure/database/repositories/PrismaSaleRepository.ts):
  * تنفيذ المعاملة الذرية `prisma.$transaction` التي تجمع بين إدراج `Sale` و `SaleItem` وتحديث `Card.status` إلى `SOLD`.
  * استرجاع المبيعات مع دعم الفلاتر الزمنية وعزل المستأجر.
  * حساب إجمالي مبيعات اليوم `getTodaySalesTotal` بدقة التجميع لليوم التقويمي الحالي.
* [**`src/infrastructure/database/repositories/PrismaCardRepository.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/infrastructure/database/repositories/PrismaCardRepository.ts):
  * تطبيق التابع `findByIds` للاستعلام الجماعي عبر عامل `in`.

### ج) طبقة حالات الاستخدام (Application Use Cases)
* [**`src/application/use-cases/sales/CreateSaleUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/sales/CreateSaleUseCase.ts):
  * التحقق من سلامة المدخلات وخلوها من التكرار.
  * التحقق الصارم من أن جميع الكروت بحالة `AVAILABLE`، ورفض العملية مع ذكر الكرت تحديداً وحالته إن وُجد كرت غير متاح.
  * تطبيق انتقال الحالة `CardStateMachine.transition(status, 'SOLD')`.
  * احتساب المجموع المالي بدقة وتمريره لعملية الإنشاء الذرية.
  * تسجيل حركة التدقيق الأمني `SELL_CARDS` في `audit_logs`.
* [**`src/application/use-cases/sales/GetTodaySalesUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/sales/GetTodaySalesUseCase.ts):
  * استرجاع إجمالي مبيعات اليوم للمستأجر الحالي.
* [**`src/application/use-cases/sales/ListSalesUseCase.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/application/use-cases/sales/ListSalesUseCase.ts):
  * استعراض فواتير المبيعات وبنودها مع دعم التصفية الزمنية الاختيارية (`dateFrom`, `dateTo`).

### د) طبقة العرض والتحقق والمسارات (Presentation & Routes)
* [**`src/presentation/validators/sale.validator.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/validators/sale.validator.ts):
  * مخطط `createSaleSchema`: مصفوفة غير فارغة من معرفات UUID للكروت، وقيمة `paymentMethod` محصورة بين (`CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`).
  * مخطط `listSalesQuerySchema`: فلاتر تاريخ اختيارية مع التحويل الآلي (`z.coerce.date()`).
* [**`src/presentation/http/routes/sale.routes.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/http/routes/sale.routes.ts):
  * `POST /api/v1/sales`: تسجيل معاملة بيع ذري (201 Created)، ومعالجة واضحة لـ 422 (غير متاح)، 404 (غير موجود)، 409 (تم بيعه مسبقاً)، 400 (أخطاء التحقق).
  * `GET /api/v1/sales/today-total`: إرجاع إجمالي مبيعات اليوم (200 OK).
  * `GET /api/v1/sales`: قائمة المعاملات وبنودها (200 OK).
* [**`src/presentation/http/server.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/src/presentation/http/server.ts):
  * تسجيل المسار `/api/v1/sales` في خادم Fastify.

---

## 3. نتائج الاختبارات الآلية الشاملة (`npm test`)

تم إنشاء حزمتين متكاملتين من الاختبارات:
* [**`tests/application/SaleUseCases.test.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/tests/application/SaleUseCases.test.ts): 10 اختبارات unit تغطي:
  * البيع الناجح لعدة كروت متاحة دفعة واحدة.
  * تحديث الحالة إلى `SOLD` لكل كرت.
  * الرفض الصارم مع تفاصيل واضحة لكرت بحالة `GENERATED`.
  * الرفض الصارم مع تفاصيل واضحة لكرت بحالة `SOLD` مسبقاً.
  * التحقق من الذرية عند وجود كرت غير متاح وسط كروت متاحة (عدم بيع أي منها).
  * دقة الحساب المالي لـ `totalAmount`.
  * فحص إجمالي مبيعات اليوم وقائمة المبيعات.
* [**`tests/presentation/SaleRoutes.test.ts`**](file:///data/data/com.termux/files/home/mikrotik_cards_backend/tests/presentation/SaleRoutes.test.ts): 7 اختبارات تكامل للواجهة تفحص رموز HTTP (400, 404, 200, 201).

### النتيجة الإجمالية (`npm test`):
```text
ℹ tests 144
ℹ suites 35
ℹ pass 144
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14828.558276
```
**جميع الاختبارات (144 اختباراً بدون أي استثناء) اجتازت بنجاح تام وبنسبة 100%.**

---

## 4. نتائج اختبار التكامل الحي عبر `curl` وقاعدة البيانات الفعلية

تم تنفيذ سيناريو التكامل العملي كاملاً على الخادم الحي المتصل بـ PostgreSQL:

### الخطوة 1: توليد دفعة كروت جديدة (5 كروت)
```bash
curl -X POST http://127.0.0.1:3000/api/v1/cards/generate-batch \
  -H "Content-Type: application/json" \
  -d '{"packageId":"36bbec91-0cea-4055-bb60-873d335e3318","quantity":5,"prefix":"SALE","userLength":6,"passwordLength":4}'
```
**الاستجابة**: تم توليد الدفعة بنجاح برمز `201 Created`، ومنها الكرتان:
* الكرت الأول: `710dff51-9724-4797-923a-c9c438622d24` (اليوزر: `SALEGHN8JR`، السعر: 500 SDG، الحالة: `GENERATED`).
* الكرت الثاني: `781a7de4-a045-4624-8414-4ddfd0393cfd` (اليوزر: `SALEFMNJFW`، السعر: 500 SDG، الحالة: `GENERATED`).

### الخطوة 2: اختبار الرفض الصارم عند محاولة بيع كرت في حالة `GENERATED`
```bash
curl -i -X POST http://127.0.0.1:3000/api/v1/sales \
  -H "Content-Type: application/json" \
  -d '{"cardIds":["710dff51-9724-4797-923a-c9c438622d24"],"paymentMethod":"CASH"}'
```
**الاستجابة**: تم الرفض القاطع برمز **`HTTP 422 Unprocessable Entity`** مع تفاصيل واضحة:
```json
{
  "success": false,
  "errorCode": "CARD_NOT_AVAILABLE",
  "errorMessage": "Cannot complete sale: Card '710dff51-9724-4797-923a-c9c438622d24' (username: 'SALEGHN8JR') is in 'GENERATED' state and is not AVAILABLE for sale"
}
```

### الخطوة 3: تحويل الكرتين إلى حالة `AVAILABLE`
```bash
curl -X PATCH http://127.0.0.1:3000/api/v1/cards/710dff51-9724-4797-923a-c9c438622d24/status \
  -H "Content-Type: application/json" -d '{"newStatus":"AVAILABLE"}'

curl -X PATCH http://127.0.0.1:3000/api/v1/cards/781a7de4-a045-4624-8414-4ddfd0393cfd/status \
  -H "Content-Type: application/json" -d '{"newStatus":"AVAILABLE"}'
```
**الاستجابة**: استجابة `HTTP 200 OK`، وأصبحت حالة كل منهما `AVAILABLE`.

### الخطوة 4: بيع الكرتين معاً في معاملة بيع واحدة ذرية
```bash
curl -i -X POST http://127.0.0.1:3000/api/v1/sales \
  -H "Content-Type: application/json" \
  -d '{"cardIds":["710dff51-9724-4797-923a-c9c438622d24", "781a7de4-a045-4624-8414-4ddfd0393cfd"],"paymentMethod":"CASH"}'
```
**الاستجابة**: نجاح العملية بالرمز **`HTTP 201 Created`**:
```json
{
  "success": true,
  "data": {
    "id": "e783c3a7-dbca-4221-9eb0-feace5ce95ea",
    "tenantId": "372c6d84-b67d-4ad0-887c-1afcd6a8e5ba",
    "soldById": "faf42d70-d122-40eb-8075-999441fd7096",
    "totalAmount": 1000,
    "paymentMethod": "CASH",
    "createdAt": "2026-10-03T04:37:38.798Z",
    "items": [
      {
        "id": "fb36d0b2-ba29-43b5-abb8-05e5d8eee210",
        "saleId": "e783c3a7-dbca-4221-9eb0-feace5ce95ea",
        "cardId": "781a7de4-a045-4624-8414-4ddfd0393cfd",
        "unitPrice": 500
      },
      {
        "id": "44e9c190-62a1-45f2-993e-c20fbd05bfd8",
        "saleId": "e783c3a7-dbca-4221-9eb0-feace5ce95ea",
        "cardId": "710dff51-9724-4797-923a-c9c438622d24",
        "unitPrice": 500
      }
    ]
  }
}
```

### الخطوة 5: التحقق من تحول حالة الكرتين تلقائياً إلى `SOLD`
```bash
curl -s http://127.0.0.1:3000/api/v1/cards?status=SOLD
```
**الاستجابة**: كلا الكرتين يظهران في قائمة الكروت المباعة بحالة **`SOLD`**.

### الخطوة 6: التحقق من إجمالي مبيعات اليوم `GET /api/v1/sales/today-total`
```bash
curl -s http://127.0.0.1:3000/api/v1/sales/today-total
```
**الاستجابة**:
```json
{
  "success": true,
  "data": {
    "tenantId": "372c6d84-b67d-4ad0-887c-1afcd6a8e5ba",
    "todayTotal": 1000,
    "totalAmount": 1000
  }
}
```
المبلغ يعكس بدقة السعر الصحيح (500 + 500 = 1000 SDG).

### الخطوة 7: التحقق من سجل التدقيق الأمني في PostgreSQL (`audit_logs`)
تم الاستعلام في قاعدة البيانات وتأكيد تسجيل حركة `SELL_CARDS`:
```sql
SELECT "action", "entityType", "entityId", "description", "result", "createdAt" 
FROM audit_logs 
ORDER BY "createdAt" DESC LIMIT 1;
```
**النتيجة**:
```text
   action   | entityType |               entityId               |                                  description                                  | result  |        createdAt        
------------+------------+--------------------------------------+-------------------------------------------------------------------------------+---------+-------------------------
 SELL_CARDS | Sale       | e783c3a7-dbca-4221-9eb0-feace5ce95ea | Sold 2 card(s) for total amount 1000 via CASH. Cards: SALEFMNJFW, SALEGHN8JR  | SUCCESS | 2026-10-03 04:37:38.863
```

---

## 5. حالة مستودع Git والالتزام (Git Commit)

تم الالتزام بكافة المعايير الهندسية والقيود المحددة (عدم لمس طبقة Flutter مطلقاً، استخدام Prisma `$transaction` الذرية التامة).
تم توثيق التغييرات بعمل الـ Commit المطلوب:
* **رسالة الالتزام**: `feat(sales): add atomic card sale transaction with state machine integration`
