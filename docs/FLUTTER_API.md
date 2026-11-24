# توثيق REST API لتطبيق Flutter | قاعتي — Qa3aty

دليل شامل ومفصل لربط تطبيق Flutter بنظام **قاعتي** باستخدام مكتبة **Dio**.

---

## 1. نظرة عامة والمعلومات الأساسية

- **Base URL:** `https://<YOUR_DOMAIN>/api/public/v1`
- **التشفير والنوع:** `Content-Type: application/json`
- **المصادقة:** `Authorization: Bearer <access_token>`
- **تنسيق الاستجابة القياسي:**

### استجابة ناجحة:
```json
{
  "success": true,
  "data": { ... }
}
```

### استجابة خطأ:
```json
{
  "success": false,
  "error": {
    "code": "error_code_string",
    "message": "رسالة توضيحية باللغة العربية"
  }
}
```

---

## 2. إعداد مكتبة Dio في Flutter

```dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const String baseUrl = 'https://your-domain.com/api/public/v1';
  final Dio dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    ),
  );

  final FlutterSecureStorage storage = const FlutterSecureStorage();

  ApiClient() {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storage.read(key: 'access_token');
          if (token != null && !options.path.contains('/auth/login') && !options.path.contains('/auth/refresh')) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          // تجديد التوكن تلقائيًا عند انتهاء صلاحية الجلسة
          if (error.response?.statusCode == 401 && !error.requestOptions.path.contains('/auth/')) {
            final refreshed = await refreshToken();
            if (refreshed) {
              final token = await storage.read(key: 'access_token');
              error.requestOptions.headers['Authorization'] = 'Bearer $token';
              final response = await dio.fetch(error.requestOptions);
              return handler.resolve(response);
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<bool> refreshToken() async {
    try {
      final refreshToken = await storage.read(key: 'refresh_token');
      if (refreshToken == null) return false;

      final response = await dio.post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final data = response.data['data'];
        await storage.write(key: 'access_token', value: data['access_token']);
        await storage.write(key: 'refresh_token', value: data['refresh_token']);
        return true;
      }
    } catch (_) {}
    return false;
  }
}
```

---

## 3. المصادقة والحساب (Authentication)

### 3.1 تسجيل الدخول (Login)
- **المسار:** `POST /auth/login`
- **الحماية:** عام
- **الطلب:**
```json
{
  "username": "hall_owner",
  "password": "StrongPassword123!"
}
```
- **الاستجابة الناجحة (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "def5020...",
    "expires_at": 1732500000,
    "token_type": "bearer",
    "user": {
      "id": "c76b9e22-8318-47bc-9269-e970bcfb8b79",
      "username": "hall_owner",
      "full_name": "أحمد السعيد",
      "role": "tenant_admin"
    }
  }
}
```

### 3.2 تجديد الجلسة (Refresh Token)
- **المسار:** `POST /auth/refresh`
- **الطلب:**
```json
{
  "refresh_token": "def5020..."
}
```

### 3.3 تسجيل الخروج (Logout)
- **المسار:** `POST /auth/logout`
- **الحماية:** Bearer Token
- **الاستجابة:** `{"success": true, "data": {"logged_out": true}}`

### 3.4 بيانات المستخدم الحالي (Current User)
- **المسار:** `GET /auth/me`
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "id": "c76b9e22-8318-47bc-9269-e970bcfb8b79",
    "username": "hall_owner",
    "full_name": "أحمد السعيد",
    "role": "tenant_admin",
    "tenant_id": "a1b2c3d4-..."
  }
}
```

### 3.5 تغيير كلمة المرور (Change Password)
- **المسار:** `POST /auth/change-password`
- **الطلب:**
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewStrongPassword456!"
}
```

---

## 4. لوحة الإحصائيات (Dashboard Summary)

- **المسار:** `GET /dashboard/summary`
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "halls_count": 3,
    "customers_count": 120,
    "bookings_count": 45,
    "daily_financial": {
      "booking_revenue": 150000.00,
      "collected_payments": 85000.00,
      "outstanding_receivables": 65000.00,
      "operating_expenses": 12000.00,
      "worker_costs": 4500.00,
      "drinks_cake_costs": 8000.00,
      "inventory_costs": 2000.00,
      "actual_waste_costs": 500.00,
      "net_profit": 123000.00
    },
    "upcoming_bookings": [
      {
        "id": "uuid",
        "event_name": "حفل زفاف محمد ومريم",
        "event_date": "2026-11-25",
        "start_time": "18:00:00",
        "status": "confirmed",
        "remaining_balance": 5000.00,
        "halls": { "name": "القاعة الكبرى" },
        "customers": { "full_name": "محمد علي", "phone": "01012345678" }
      }
    ]
  }
}
```

---

## 5. إدارة القاعات (Halls)

### 5.1 قائمة القاعات
- **المسار:** `GET /halls?limit=50&offset=0&search=الملكية&active=true`
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "القاعة الملكية",
        "description": "قاعة مناسبات تتسع لـ 500 فرد مع إضاءات ليزر",
        "address": "طريق مصر إسكندرية الصحراوي",
        "capacity": 500,
        "contact_phone": "01000000000",
        "default_booking_price": 25000.00,
        "image_path": null,
        "is_active": true
      }
    ],
    "pagination": { "total": 1, "limit": 50, "offset": 0, "has_more": false }
  }
}
```

### 5.2 إضافة قاعة جديدة
- **المسار:** `POST /halls`
- **الطلب:**
```json
{
  "name": "القاعة الفضية",
  "description": "مناسبة للمؤتمرات والخطوبات الصغيرة",
  "address": "المهندسين",
  "capacity": 150,
  "contact_phone": "01099999999",
  "default_booking_price": 10000.00,
  "is_active": true
}
```

### 5.3 تفاصيل / تعديل / إيقاف قاعة
- `GET /halls/:id`
- `PUT /halls/:id`
- `DELETE /halls/:id` (إيقاف القاعة soft delete)

---

## 6. إدارة العملاء (Customers)

### 6.1 قائمة العملاء
- **المسار:** `GET /customers?search=أحمد&limit=20&offset=0`

### 6.2 إضافة عميل جديد
- **المسار:** `POST /customers`
- **الطلب:**
```json
{
  "full_name": "إبراهيم حسن",
  "phone": "01011112222",
  "address": "القاهرة",
  "notes": "عميل VIP"
}
```
*ملاحظة: إذا كان الهاتف مسجلاً مسبقًا لنفس المنشأة، سيقوم النظام تلقائيًا بإرجاع العميل الحالي دون تكرار.*

### 6.3 تفاصيل عميل (تشمل سجل حجوزاته)
- **المسار:** `GET /customers/:id`

### 6.4 تعديل عميل
- **المسار:** `PUT /customers/:id`

### 6.5 حذف عميل
- **المسار:** `DELETE /customers/:id` (يمنع الحذف في حال وجود حجوزات مرتبطة)

---

## 7. إدارة الحجوزات (Bookings)

### 7.1 قائمة الحجوزات
- **المسار:** `GET /bookings?hall_id=...&start_date=2026-11-01&end_date=2026-11-30&status=confirmed&event_type=wedding`

### 7.2 عرض التقويم (Calendar View)
- **المسار:** `GET /bookings/calendar?start_date=2026-11-01&end_date=2026-11-30&hall_id=...`
- **الاستجابة:** قائمة أحداث جاهزة ومجهزة لودجت Calendar في Flutter.

### 7.3 إنشاء حجز جديد
- **المسار:** `POST /bookings`
- **الطلب (باستخدام معرف عميل موجود):**
```json
{
  "hall_id": "uuid-hall",
  "customer_id": "uuid-customer",
  "event_name": "زفاف أحمد وسارة",
  "event_type": "wedding",
  "event_date": "2026-12-15",
  "start_time": "18:00",
  "end_time": "23:00",
  "total_price": 30000.00,
  "advance_payment": 5000.00,
  "status": "confirmed",
  "drinks_cake_responsibility": "tenant",
  "notes": "الاتفاق يشمل دي جي وكوشة"
}
```
- **الطلب (بإضافة عميل جديد مباشرة أثناء الحجز):**
```json
{
  "hall_id": "uuid-hall",
  "customer": {
    "full_name": "محمود سمير",
    "phone": "01123456789"
  },
  "event_name": "خطوبة محمود",
  "event_type": "engagement",
  "event_date": "2026-12-20",
  "start_time": "17:00",
  "end_time": "21:00",
  "total_price": 18000.00,
  "advance_payment": 3000.00
}
```

### 7.4 تفاصيل الحجز
- **المسار:** `GET /bookings/:id` (يشمل القاعة، العميل، المدفوعات، المستلزمات والمصروفات)

### 7.5 تعديل حجز
- **المسار:** `PUT /bookings/:id`

### 7.6 إلغاء حجز مع خيار الاسترداد المالي (Cancel Booking with Refund)
- **المسار:** `POST /bookings/:id/cancel` (أو `DELETE /bookings/:id`)
- **وصف العملية:**
  - إذا لم يكن مدفوعاً أي مبالغ (`total_paid = 0`): يتم إلغاء الحجز مباشرة.
  - إذا كان الحجز مدفوعاً بالكامل أو مدفوع عربون فقط (`total_paid > 0`): يتيح لك النظام اختيار استرداد الفلوس للعميل أو احتجازها كرسوم إلغاء، وتحديد كم سيرجع، مع تسجيل الأثر المالي فوراً في المصروفات ورصيد الحجز.
- **جسم الطلب (Body):**
```json
{
  "reason": "طلب العميل إلغاء المناسبة لظروف طارئة",
  "refund": true,
  "refund_amount": 3000.00,
  "refund_method": "cash",
  "refund_notes": "تم تسليم المبلغ نقداً بالخزينة"
}
```
*ملاحظة: إذا اخترت عدم الاسترداد، أرسل `"refund": false` وسيتم احتجاز كامل المدفوع كرسوم إلغاء.*

- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-booking",
    "status": "cancelled",
    "event_name": "زفاف أحمد وسارة",
    "event_date": "2026-12-15",
    "financial_summary": {
      "total_price": 30000.00,
      "total_paid": 5000.00,
      "refund_amount": 3000.00,
      "retained_amount": 2000.00,
      "refund_status": "partial_refund"
    },
    "cancellation": {
      "cancelled_at": "2026-11-23T10:00:00Z",
      "reason": "طلب العميل إلغاء المناسبة لظروف طارئة",
      "total_paid": 5000.00,
      "refunded": true,
      "refund_amount": 3000.00,
      "retained_amount": 2000.00,
      "refund_method": "cash",
      "refund_status": "partial_refund",
      "refund_notes": "تم تسليم المبلغ نقداً بالخزينة"
    }
  }
}
```

- **نموذج استدعاء في Flutter (Dio):**
```dart
Future<Map<String, dynamic>> cancelBooking({
  required String bookingId,
  String? reason,
  bool refund = false,
  double refundAmount = 0.0,
  String refundMethod = 'cash',
  String? refundNotes,
}) async {
  final dio = ApiClient().dio;
  final response = await dio.post(
    '/bookings/$bookingId/cancel',
    data: {
      'reason': reason,
      'refund': refund,
      'refund_amount': refundAmount,
      'refund_method': refundMethod,
      'refund_notes': refundNotes,
    },
  );
  return response.data['data'];
}
```

---

## 8. المدفوعات للحجز (Payments)

### 8.1 قائمة مدفوعات الحجز
- **المسار:** `GET /bookings/:id/payments`

### 8.2 تسجيل دفعة جديدة
- **المسار:** `POST /bookings/:id/payments`
- **الطلب:**
```json
{
  "amount": 7000.00,
  "payment_method": "cash",
  "payment_date": "2026-11-22T10:00:00Z",
  "notes": "الدفعة الثانية نقداً بالإدارة"
}
```
*ملاحظة: يتحقق النظام تلقائيًا أن الدفعة لا تتجاوز الرصيد المتبقي، ويقوم بتحديث `total_paid` و `remaining_balance` فوراً.*

---

## 9. مستلزمات المناسبة والمشروبات (Drinks & Cake)

### 9.1 قائمة المستلزمات لحجز
- **المسار:** `GET /bookings/:id/items`

### 9.2 إضافة مستلزم / مشروبات لحجز
- **المسار:** `POST /bookings/:id/items`
- **الطلب:**
```json
{
  "product_name": "كانز بيبسي ودساني",
  "responsibility": "tenant",
  "quantity_purchased": 200,
  "purchase_unit_price": 15.00,
  "quantity_consumed": 180,
  "quantity_wasted": 5,
  "waste_cost": 75.00,
  "notes": "المتبقي 15 علبة أعيد للمخزن"
}
```

---

## 10. المصروفات وتصنيفاتها (Expenses)

### 10.1 قائمة المصروفات
- **المسار:** `GET /expenses?start_date=2026-11-01&end_date=2026-11-30&hall_id=...`
- ترجع كل عنصر من المصروفات متضمناً `receipt_path` ورابط العرض المباشر الموقع `receipt_url` الصالح للاستعراض داخل التطبيق مباشرة عبر `Image.network(item['receipt_url'])`.

### 10.2 إضافة مصروف مع إمكانية رفع صورة الإيصال والفاتورة
يدعم الـ API طريقتين مريحتين جداً لتطبيق Flutter:

#### أ. الطريقة المباشرة بـ Multipart (رفع البيانات والصورة بطلب واحد):
- **المسار:** `POST /expenses`
- **نوع المحتوى (Content-Type):** `multipart/form-data`
- **الحقول:**
  - `description`: وصف المصروف
  - `amount`: المبلغ
  - `expense_date`: تاريخ الصرف (مثلاً `2026-11-23`)
  - `category_id`: معرف التصنيف (اختياري)
  - `hall_id`: معرف القاعة (اختياري)
  - `booking_id`: معرف الحجز (اختياري)
  - `receipt`: ملف صورة الفاتورة (File / Image)
  - `notes`: ملاحظات إضافية

- **كود Flutter باستخدام Dio:**
```dart
Future<Map<String, dynamic>> createExpenseWithReceipt({
  required String description,
  required double amount,
  required String expenseDate,
  String? categoryId,
  String? hallId,
  String? filePath,
  String? notes,
}) async {
  final dio = ApiClient().dio;

  final formData = FormData.fromMap({
    'description': description,
    'amount': amount,
    'expense_date': expenseDate,
    if (categoryId != null) 'category_id': categoryId,
    if (hallId != null) 'hall_id': hallId,
    if (notes != null) 'notes': notes,
    if (filePath != null)
      'receipt': await MultipartFile.fromFile(
        filePath,
        filename: filePath.split('/').last,
      ),
  });

  final response = await dio.post(
    '/expenses',
    data: formData,
  );
  return response.data['data']; // يحتوي على بيانات المصروف ورابط receipt_url
}
```

#### ب. طريقة رفع الإيصال أولاً (Upload Receipt Endpoint):
- **المسار:** `POST /expenses/upload-receipt`
- **نوع المحتوى:** `multipart/form-data` مع حقل `file` (أو إرسال JSON يحتوي على `file_base64`).
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "receipt_path": "tenants/uuid/expenses/17000000_receipt.jpg",
    "receipt_url": "https://...signed-url-here..."
  }
}
```
ثم تمرير `receipt_path` المستلم في استدعاء `POST /expenses` العادي بصيغة JSON.

### 10.3 استخراج رابط صالح محدث لصورة إيصال مصروف
- **المسار:** `GET /expenses/:id/receipt-url`
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "receipt_path": "tenants/uuid/expenses/17000000_receipt.jpg",
    "receipt_url": "https://...signed-url..."
  }
}
```

### 10.3 تصنيفات المصروفات (Categories)
- `GET /expense-categories`
- `POST /expense-categories` `{"name": "ديكورات وتنسيق"}`

---

## 11. إدارة العاملين ومستحقاتهم (Workers)

### 11.1 قائمة العاملين
- `GET /workers?status=active`

### 11.2 إضافة عامل
- **المسار:** `POST /workers`
- **الطلب:**
```json
{
  "full_name": "سيد عبد الله",
  "phone": "01234567890",
  "job_title": "مشرف ضيافة",
  "salary_type": "fixed",
  "fixed_salary": 6000.00,
  "joining_date": "2026-01-01"
}
```

### 11.3 تسجيل دفعة / مستحق لعامل
- **المسار:** `POST /workers/:id/payments`
- **الطلب:**
```json
{
  "payment_type": "salary",
  "amount": 6000.00,
  "payment_date": "2026-11-01",
  "period_start": "2026-10-01",
  "period_end": "2026-10-31",
  "notes": "راتب شهر أكتوبر"
}
```

---

## 12. المخزون المركزي وحركاته (Inventory)

### 12.1 أصناف المخزون
- `GET /inventory`
- `POST /inventory` `{"name": "مناديل سفرة فاخرة", "unit": "باكت", "unit_cost": 25.00}`

### 12.2 حركات المخزون (Movements)
- `GET /inventory/movements`
- `POST /inventory/movements`
- **الطلب:**
```json
{
  "inventory_item_id": "uuid-item",
  "movement_type": "consumption",
  "quantity": 10,
  "unit_cost": 25.00,
  "booking_id": "uuid-booking",
  "notes": "صرف لحفل زفاف"
}
```

---

## 13. التنبيهات وإشعارات الدفع (Notifications & FCM)

### 13.1 جلب التنبيهات
- `GET /notifications?unread=true`
- `PATCH /notifications/:id/read`

### 13.2 تسجيل FCM Token للجهاز
- `POST /device-tokens`
- **الطلب:**
```json
{
  "token": "fcm_token_from_firebase_messaging...",
  "device_label": "Samsung Galaxy S24"
}
```

---

## 14. التقارير المالية وتحميل ملف Excel

### 14.1 التقرير الشهري / السنوي / الأرباح والخسائر
- `GET /reports/monthly?year=2026&month=11&hall_id=...`
- `GET /reports/yearly?year=2026&hall_id=...`
- `GET /reports/profit-loss?start_date=2026-11-01&end_date=2026-11-30&hall_id=...`
- `GET /reports/bookings?start_date=2026-11-01&end_date=2026-11-30`

### 14.2 تصدير تقرير Excel معتمد (.xlsx)
- **المسار:** `GET /reports/export/excel?year=2026&month=11&hall_id=...`
- **نوع المحتوى:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **كود التحميل بـ Dio في Flutter:**
```dart
Future<void> downloadMonthlyExcel(int year, int month, String savePath) async {
  final dio = ApiClient().dio;
  await dio.download(
    '/reports/export/excel?year=$year&month=$month',
    savePath,
    options: Options(
      responseType: ResponseType.bytes,
    ),
  );
}
```
*يحتوي الملف المصدر على 9 أوراق عمل منظمة باللغة العربية (الملخص الشهري، الحجوزات، المدفوعات، المصروفات، العمال، المشروبات والجاتوه، المخزون، الهالك، الأرباح والخسائر).*

---

## 15. جدول رموز الأخطاء (Error Codes)

| رمز الخطأ `code` | المعنى | رمز HTTP |
|---|---|---|
| `unauthorized` | يلزم تسجيل الدخول أو إرسال توكن صالح | 401 |
| `invalid_token` | التوكن غير صالح أو منتهي الصلاحية | 401 |
| `account_suspended` | حساب المنشأة موقوف من قبل المطور | 403 |
| `subscription_expired` | انتهى اشتراك المنشأة (يرجى التجديد) | 403 |
| `booking_conflict` | القاعة محجوزة بالفعل في هذا التوقيت | 409 |
| `payment_exceeds_balance` | قيمة الدفعة أكبر من الرصيد المتبقي | 409 |
| `insufficient_stock` | الكمية المراد صرفها أكبر من رصيد المخزون | 409 |
| `customer_has_bookings` | لا يمكن حذف العميل لوجود حجوزات سابقة | 409 |
| `validation_error` | خطأ في صيغة أو اكتمال البيانات المدخلة | 400 |
| `not_found` | العنصر المطلوب غير موجود | 404 |
| `forbidden` | لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء | 403 |

---

## 16. إدارة الحسابات الفرعية والصلاحيات (Sub-Accounts & Permissions)

تتيح هذه الواجهات للحساب الرئيسي للمنشأة (Primary Account) إنشاء وإدارة حسابات فرعية (Sub-Accounts) لموظفي القاعة، وتحديد صلاحيات دقيقة لكل موظف.

### 16.1 كائن الصلاحيات (User Permissions)
عند تسجيل الدخول أو استدعاء `/auth/me`، يرجع حقل `is_primary` وكائن `permissions`:
```json
{
  "id": "uuid-here",
  "username": "ahmed.elshora",
  "full_name": "أحمد الشورى",
  "role": "tenant_admin",
  "is_primary": true,
  "permissions": {
    "can_manage_bookings": true,
    "can_view_reports": true,
    "can_manage_expenses": true,
    "can_manage_inventory": true,
    "can_manage_workers": true,
    "can_manage_sub_accounts": true
  }
}
```

### 16.2 استعراض الحسابات الفرعية (خاص بالحساب الرئيسي)
- **المسار:** `GET /sub-accounts`
- **الصلاحية:** متاح فقط للحساب الرئيسي (`is_primary: true`).
- **الاستجابة:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sub-user-uuid",
        "username": "reception.staff",
        "full_name": "موظف الاستقبال",
        "phone": "01000000000",
        "is_active": true,
        "is_primary": false,
        "permissions": {
          "can_manage_bookings": true,
          "can_view_reports": false,
          "can_manage_expenses": false,
          "can_manage_inventory": false,
          "can_manage_workers": false,
          "can_manage_sub_accounts": false
        },
        "created_at": "2026-11-23T09:00:00Z"
      }
    ]
  }
}
```

### 16.3 إنشاء حساب فرعي جديد
- **المسار:** `POST /sub-accounts`
- **جسم الطلب (Body):**
```json
{
  "username": "reception.ahmed",
  "password": "Password123!",
  "full_name": "أحمد موظف الحجوزات",
  "phone": "01012345678",
  "permissions": {
    "can_manage_bookings": true,
    "can_view_reports": false,
    "can_manage_expenses": false,
    "can_manage_inventory": false,
    "can_manage_workers": false
  }
}
```

### 16.4 تعديل بيانات أو صلاحيات حساب فرعي
- **المسار:** `PATCH /sub-accounts/{id}`
- **جسم الطلب (Body):**
```json
{
  "full_name": "أحمد - مشرف عام",
  "is_active": true,
  "permissions": {
    "can_manage_expenses": true,
    "can_view_reports": false
  }
}
```

### 16.5 إعادة تعيين كلمة مرور حساب فرعي
- **المسار:** `POST /sub-accounts/{id}/reset-password`
- **جسم الطلب (Body):**
```json
{
  "new_password": "NewSecurePassword123!"
}
```

### 16.6 حذف حساب فرعي
- **المسار:** `DELETE /sub-accounts/{id}`

---

## 17. قواعد التسميع الفوري والإغلاق المتزامن للاشتراك

1. **الربط والتسميع الفوري (Realtime Data Sharing):**
   - الحساب الرئيسي وكافة الحسابات الفرعية يتبعون نفس المنشأة (`tenant_id`).
   - عند قيام أي حساب فرعي بإضافة أو تعديل حجز في أي قاعة، يظهر التعديل فوراً للحساب الرئيسي ولجميع الحسابات الفرعية الأخرى بدون أي تأخير.
2. **الإغلاق الشامل عند انتهاء الاشتراك (Simultaneous Subscription Lockout):**
   - فحص صلاحية الاشتراك يتم على مستوى `tenant_id`.
   - عند انتهاء مدة اشتراك المنشأة أو إيقافها من قبل المطور، يتم إيقاف الوصول فوراً لكافة الحسابات (الرئيسي والفرعية معاً) وتُرجع الـ APIs رمز الخطأ `subscription_expired` أو `account_suspended`.

---

## 18. إشعارات الهاتف عبر Firebase Cloud Messaging

يرسل الخادم تذكيرًا واحدًا صباحًا في كل يوم من الأيام الثلاثة السابقة للمناسبة (3 و2 و1 يومًا)، بشرط أن يكون الحجز مؤكدًا والرصيد لم يُسدّد بالكامل. مثال: لمناسبة يوم 20، تصل التذكيرات أيام 17 و18 و19. يُعاد فحص حالة الحجز والرصيد والاشتراك قبل الإرسال، وتُعاد محاولة الأعطال المؤقتة تلقائيًا. الإشعار يتضمن اسم العميل والقاعة وتاريخ المناسبة والرصيد المتبقي.

### 18.1 تسجيل هاتف المستخدم

يجب أن يطلب تطبيق Flutter إذن الإشعارات، ويحصل على رمز Firebase Messaging من الجهاز، ثم يرسله بعد تسجيل الدخول:

- **المسار:** `POST /device-tokens`
- **المصادقة:** `Authorization: Bearer <access_token>`
- **الطلب:**
```json
{
  "token": "<fcm_device_token>",
  "device_label": "Android phone"
}
```
- احفظ `data.id` من الاستجابة لاستخدامه في حذف الجهاز عند تسجيل الخروج.
- عند تغيّر الرمز، أرسل الرمز الجديد إلى المسار نفسه.
- **حذف الجهاز:** `DELETE /device-tokens/:id`

مثال Flutter باستخدام `firebase_messaging`:

```dart
await FirebaseMessaging.instance.requestPermission();
final token = await FirebaseMessaging.instance.getToken();
if (token != null) {
  final response = await api.dio.post('/device-tokens', data: {
    'token': token,
    'device_label': Platform.isIOS ? 'iPhone' : 'Android phone',
  });
  final deviceId = response.data['data']['id'];
}

FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  await api.dio.post('/device-tokens', data: {'token': newToken});
});
```

لإظهار التنبيهات أثناء فتح التطبيق، عالج `FirebaseMessaging.onMessage` داخل Flutter واعرض تنبيهًا محليًا؛ وعالج `FirebaseMessaging.onMessageOpenedApp` لفتح تفاصيل المناسبة عند ضغط المستخدم على التنبيه. أنشئ قناة Android باسم `qa3aty_reminders`، واضبط مفتاح APNs في مشروع Firebase لتصل الإشعارات إلى أجهزة iPhone. يجب أن يسمح المستخدم بالإشعارات من إعدادات الهاتف.

### 18.2 استجابة تسجيل الجهاز

```json
{
  "success": true,
  "data": {
    "id": "device-uuid",
    "provider": "fcm",
    "device_label": "Android phone",
    "last_seen_at": "2026-11-23T14:00:00Z"
  }
}
```

إذا لم يسجل التطبيق رمز جهاز صالحًا، أو لم يمنح المستخدم إذن الإشعارات، فلن يصل تنبيه للهاتف. لا تُرسل رموز الأجهزة إلى أي طرف آخر ولا تضع مفاتيح Firebase في تطبيق Flutter.
