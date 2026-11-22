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

### 7.6 إلغاء حجز
- **المسار:** `DELETE /bookings/:id` (يغير الحالة إلى `cancelled`)

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

### 10.2 إضافة مصروف
- **المسار:** `POST /expenses`
- **الطلب:**
```json
{
  "category_id": "uuid-category",
  "description": "فاتورة كهرباء شهر نوفمبر",
  "amount": 4200.00,
  "expense_date": "2026-11-20",
  "hall_id": "uuid-hall",
  "notes": "تم السداد من الخزينة الرئيسية"
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
