# Qa3aty Hall Management

Project: قاعتي (Qa3aty)



Multi-Tenant Wedding Halls Management SaaS – Backend & Developer Dashboard



أريد إنشاء نظام SaaS احترافي باسم قاعتي (Qa3aty) لإدارة قاعات الأفراح والمناسبات، مع إمكانية بيعه لأصحاب القاعات بنظام الاشتراكات.



IMPORTANT: READ BEFORE STARTING



هذا المشروع سيكون تطبيق Mobile Application يتم تطويره بالكامل باستخدام Flutter خارج Lovable.



أنت مسؤول عن بناء:



1. Backend كامل وقابل للاستخدام الفعلي.

2. REST API متكامل لاستخدامه من تطبيق Flutter.

3. PostgreSQL Database.

4. Authentication & Authorization.

5. Business Logic لجميع عمليات النظام.

6. Developer Super Admin Dashboard بسيطة وخاصة بمطور النظام فقط.



ممنوع بناء واجهة ويب للعميل صاحب القاعة.



لا تنشئ صفحات Dashboard خاصة بإدارة القاعات أو الحجوزات للويب؛ هذه الواجهات سيتم بناؤها لاحقًا باستخدام Flutter.



الواجهة الوحيدة المسموح ببنائها هي لوحة تحكم المطور لإدارة العملاء والاشتراكات.



---



PHASE 1 – SYSTEM ARCHITECTURE



استخدم Lovable Cloud أو Supabase حسب البنية المتاحة، مع:



- PostgreSQL.

- Supabase Authentication.

- Supabase Edge Functions.

- Row Level Security (RLS).

- REST API.

- Secure JWT Authentication.

- Database Migrations.

- Supabase Storage للمرفقات والصور عند الحاجة.



اجعل النظام Multi-Tenant من البداية.



هناك نوعان أساسيان من المستخدمين:



1. SUPER_ADMIN

مالك المنصة والمطور، وهو المسؤول عن إنشاء العملاء وإدارة اشتراكاتهم.



2. TENANT_ADMIN

صاحب القاعة الذي يستخدم تطبيق Flutter لإدارة نشاطه.



كل Tenant يمتلك بيانات مستقلة تمامًا عن بقية العملاء.



يمكن لكل Tenant امتلاك أكثر من قاعة، وإدارة حجوزات وعملاء ومصاريف وموظفين لكل قاعاته.



يجب أن تكون جميع العمليات مرتبطة بـ tenant_id، مع تطبيق RLS والتحقق من الصلاحيات من جهة السيرفر.



لا تسمح أبدًا لمستخدم بالوصول إلى بيانات Tenant آخر حتى لو حاول تغيير المعرفات في API Requests.



PHASE 2 – AUTHENTICATION



أريد نظام تسجيل دخول بسيط للغاية.



لا أريد:



- Google Login.

- Facebook Login.

- Apple Login.

- Public Registration.

- تسجيل دخول باستخدام حساب Lovable.



أريد فقط:



- Username.

- Password.



المطور وحده هو من ينشئ حسابات العملاء.



عند إنشاء حساب جديد من لوحة المطور، يتم إنشاء:



- Tenant.

- Tenant Administrator.

- Username.

- Password.

- Subscription.

- Default account settings.



استخدم Supabase Auth أو آلية مصادقة آمنة متوافقة معه.



إذا كان Supabase يتطلب Email داخليًا، نفّذ نظام Username-to-internal-identity mapping آمنًا، بحيث لا يحتاج العميل إلى معرفة أو إدخال أي بريد إلكتروني.



يجب أن تكون عملية تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور من Flutter.



وفّر:



- Login.

- Logout.

- Access Token.

- Refresh Token.

- Get Current User.

- Change Password.

- Reset Password بواسطة المطور.

- Account Activation.

- Account Suspension.



لا تحفظ كلمات المرور كنص صريح مطلقًا.



PHASE 3 – DEVELOPER SUPER ADMIN DASHBOARD



أنشئ لوحة تحكم ويب بسيطة وخاصة بي أنا كمطور النظام.



هذه اللوحة ليست جزءًا من تطبيق العميل.



التصميم:



- Arabic RTL.

- Professional UI.

- Dark Navy + Purple + Gold.

- Responsive.

- Lightweight.

- Simple Navigation.



لا تبالغ في تصميم هذه اللوحة؛ الأولوية للـ Backend.



Main Dashboard



اعرض:



- إجمالي العملاء.

- العملاء النشطون.

- الاشتراكات المنتهية.

- الحسابات الموقوفة.

- إجمالي القاعات المسجلة.

- الاشتراكات التي ستنتهي قريبًا.

- أحدث العملاء المضافين.



Customer Management



أنشئ صفحة لإدارة العملاء.



أريد إمكانية:



- إضافة عميل جديد.

- تعديل بيانات العميل.

- عرض تفاصيل العميل.

- البحث عن عميل بالاسم أو Username أو الهاتف.

- تفعيل الحساب.

- إيقاف الحساب.

- إعادة تعيين كلمة المرور.

- تمديد الاشتراك.

- عرض تاريخ الاشتراكات.

- عرض عدد القاعات التابعة للعميل.



عند إضافة عميل جديد، تظهر الحقول:



1. الاسم الكامل.

2. اسم المنشأة أو القاعة الرئيسية.

3. Username.

4. Password.

5. رقم الهاتف.

6. نوع الاشتراك.

7. تاريخ بداية الاشتراك.

8. تاريخ نهاية الاشتراك.

9. حالة الحساب.

10. ملاحظات اختيارية.



عند الضغط على إنشاء العميل، يجب إنشاء حسابه وTenant الخاص به تلقائيًا.



لا تسمح بإنشاء حسابات عامة من التطبيق.



Subscription Management



ادعم:



- اشتراك شهري.

- اشتراك سنوي.

- مدة اشتراك مخصصة.

- تجديد الاشتراك.

- تمديد الاشتراك.

- إيقاف الاشتراك.

- سجل تاريخي للاشتراكات.



إذا انتهى اشتراك العميل:



- امنع استخدام العمليات المحمية في التطبيق.

- أرجع API Error واضحًا بأن الاشتراك منتهٍ.

- احتفظ بجميع بيانات العميل.

- لا تحذف الحجوزات أو المدفوعات أو المصروفات.

- اسمح للمطور بتمديد الاشتراك وإعادة تفعيله.



أنشئ Subscription Middleware أو آلية Server-side للتحقق من حالة الاشتراك في جميع العمليات المطلوبة.



PHASE 4 – HALLS MANAGEMENT



كل عميل يستطيع إضافة وإدارة أكثر من قاعة.



بيانات القاعة:



- Hall Name.

- Description.

- Address.

- Capacity.

- Contact Phone.

- Default Booking Price.

- Hall Image.

- Active / Inactive.



وفّر API لإضافة وتعديل وحذف وعرض القاعات.



يجب أن تكون كل قاعة تابعة إلى Tenant واحد فقط.



PHASE 5 – CUSTOMERS MANAGEMENT



أنشئ نظامًا لإدارة عملاء القاعات.



بيانات العميل:



- الاسم.

- رقم الهاتف.

- العنوان (اختياري).

- ملاحظات.

- تاريخ التسجيل.



يمكن ربط العميل بأكثر من مناسبة أو حجز.



لا تنشئ سجلات عملاء مكررة دون داعٍ؛ ادعم البحث برقم الهاتف وإمكانية إعادة استخدام العميل الموجود.



PHASE 6 – BOOKINGS MANAGEMENT



هذا أحد أهم أجزاء النظام.



كل حجز يجب أن يكون مرتبطًا بقاعة محددة وعميل محدد.



بيانات الحجز:



- Hall ID.

- Customer ID.

- Event Name.

- Event Type.

- Event Date.

- Start Time.

- End Time.

- Total Price.

- Advance Payment.

- Total Paid.

- Remaining Balance.

- Booking Status.

- Notes.



أنواع المناسبات:



- Wedding.

- Engagement.

- Birthday.

- Conference.

- Other.



حالات الحجز:



- Pending.

- Confirmed.

- Completed.

- Cancelled.



المطلوب:



- إضافة حجز.

- تعديل حجز.

- إلغاء حجز.

- عرض تفاصيل حجز.

- عرض حجوزات كل قاعة.

- البحث باسم العميل.

- البحث برقم الهاتف.

- فلترة بالتاريخ.

- فلترة بنوع المناسبة.

- عرض الحجوزات في Calendar API format.



مهم جدًا:



امنع وجود حجزين متعارضين لنفس القاعة في نفس التوقيت.



نفّذ التحقق من التعارض داخل قاعدة البيانات أو Transaction آمنة، وليس في Flutter فقط.



اسمح بوجود حجوزات في قاعات مختلفة في نفس التاريخ.



PHASE 7 – PAYMENTS MANAGEMENT



أنشئ نظامًا مستقلًا للمدفوعات.



كل عملية دفع عبارة عن Transaction مستقلة.



بيانات الدفع:



- Booking ID.

- Amount.

- Payment Date.

- Payment Method.

- Notes.

- Created By.



طرق الدفع:



- Cash.

- Bank Transfer.

- Other.



الحسابات:



Total Paid = مجموع الدفعات المؤكدة.



Remaining Balance = Total Booking Price - Total Paid.



يجب تحديث المبلغ المتبقي تلقائيًا عند تسجيل أي دفعة.



لا تسمح بتسجيل دفعات غير صحيحة أو تجاوز المبلغ المستحق إلا إذا كانت هناك آلية واضحة لتسجيل المبالغ الزائدة.



احتفظ بسجل كامل لكل دفعة وتعديل أو إلغاء معاملة مالية، ولا تسمح بتغيير تاريخ المدفوعات دون تسجيل ذلك في Audit Log.



PHASE 8 – DRINKS, CAKE & EVENT INVENTORY



أريد قسمًا للمشروبات والجاتوه لكل مناسبة.



لكل حجز يمكن تحديد:



- القاعة مسؤولة عن المشروبات والجاتوه.

- العميل مسؤول عن توفير المشروبات والجاتوه.



إذا كانت القاعة مسؤولة:



يتم تسجيل:



- اسم المنتج.

- الكمية المشتراة.

- سعر الشراء.

- الكمية المستهلكة.

- الكمية المتبقية.

- كمية الهالك.

- تكلفة الهالك.

- ملاحظات.



إذا كان العميل مسؤولًا عن توفيرها:



لا تُسجل هذه المشتريات ضمن مصروفات القاعة.



ادعم نوعين من الإدارة:



1. مخزن مركزي للمشروبات والمنتجات.

2. مشتريات خاصة بمناسبة معينة.



يجب أن يدعم النظام خصم الكميات المستهلكة من المخزن، وتسجيل الهالك بدقة، ومنع الكميات السالبة.



احتفظ بتاريخ حركات المخزون.



PHASE 9 – EXPENSES MANAGEMENT



أنشئ قسمًا لإدارة المصروفات.



التصنيفات الافتراضية:



- Electricity.

- Water.

- Fuel.

- Transportation.

- Maintenance.

- Cleaning.

- Supplies.

- Other.



اسمح بإضافة تصنيفات جديدة.



بيانات المصروف:



- Category.

- Description.

- Amount.

- Date.

- Hall ID (Optional).

- Booking ID (Optional).

- Receipt Image (Optional).

- Notes.



ادعم رفع صورة الفاتورة أو الإيصال باستخدام Storage آمن.



يجب أن يستطيع العميل معرفة مصروفاته اليومية والشهرية والسنوية.



PHASE 10 – WORKERS MANAGEMENT



أنشئ قسمًا لإدارة العمال.



بيانات العامل:



- Full Name.

- Phone.

- Job Title.

- Salary Type.

- Fixed Salary / Daily Wage.

- Joining Date.

- Status.



المطلوب:



- إضافة عامل.

- تعديل بيانات عامل.

- تسجيل راتب.

- تسجيل أجرة يومية.

- مكافآت.

- خصومات.

- مستحقات غير مدفوعة.

- سجل كامل للمدفوعات.



اربط مصروفات العمال بالتقارير المالية.



PHASE 11 – NOTIFICATIONS & AUTOMATED REMINDERS



هذا الجزء مهم جدًا.



أريد نظام تنبيهات تلقائي قبل موعد المناسبة.



إذا كان هناك حجز مؤكد ولدى العميل مبلغ متبقٍ، أنشئ إشعارات في المواعيد التالية:



- قبل المناسبة بثلاثة أيام.

- قبل المناسبة بيومين.

- قبل المناسبة بيوم واحد.



يجب أن تحتوي الإشعارات على:



- اسم العميل.

- اسم القاعة.

- تاريخ المناسبة.

- المبلغ المتبقي.

- عدد الأيام المتبقية.

- تاريخ الإشعار.



قواعد مهمة:



1. افحص المبلغ المتبقي قبل كل إشعار.

2. إذا دفع العميل المبلغ بالكامل، ألغِ جميع التنبيهات المستقبلية.

3. لا ترسل إشعارًا مكررًا.

4. لا تنشئ إشعارات للحجوزات الملغاة.

5. احتفظ بسجل الإشعارات.



استخدم Scheduled Server-side Jobs أو آلية جدولة موثوقة.



جهّز تكامل Firebase Cloud Messaging (FCM) لإرسال Push Notifications إلى تطبيق Flutter.



يجب أن يدعم النظام تسجيل Device Tokens لكل مستخدم، مع إمكانية تحديثها وحذفها.



مهم: لا تعتمد على أن التطبيق مفتوح حتى تعمل التنبيهات.



احتفظ بمفاتيح Firebase في Server Secrets فقط.



PHASE 12 – FINANCIAL REPORTS



أنشئ نظام تقارير مالية دقيق.



التقارير المطلوبة:



- Monthly Report.

- Yearly Report.

- Per Hall Report.

- Bookings Report.

- Payments Report.

- Expenses Report.

- Workers Report.

- Inventory Report.

- Waste Report.

- Profit & Loss Report.



كل تقرير يجب أن يدعم تحديد الفترة الزمنية والقاعة عند الحاجة.



اعرض:



- إجمالي قيمة الحجوزات.

- إجمالي المبالغ المحصلة.

- إجمالي المبالغ المستحقة.

- إجمالي المصروفات.

- أجور العمال.

- تكاليف المشروبات والجاتوه.

- قيمة الهالك.

- صافي الربح.



IMPORTANT ACCOUNTING RULES:



لا تخلط بين الإيرادات والمبالغ المحصلة.



يجب التمييز بين:



- Booking Revenue.

- Collected Payments.

- Outstanding Receivables.

- Operating Expenses.

- Inventory Costs.

- Actual Waste Costs.

- Net Profit.



لا تحسب الدفعة المقدمة مرة ثانية كإيراد عند دفع باقي المبلغ.



اجعل الحسابات المالية Server-side وموحدة في جميع التقارير.



PHASE 13 – EXCEL EXPORT



وفّر إمكانية تصدير التقارير إلى Excel (.xlsx).



الملف الشهري يحتوي على أوراق:



1. Monthly Summary.

2. Bookings.

3. Payments.

4. Expenses.

5. Workers.

6. Drinks & Cake.

7. Inventory.

8. Waste.

9. Profit & Loss.



استخدم أسماء أعمدة واضحة، وأرقامًا مالية منسقة، وتواريخ صحيحة.



جهّز الملفات لتكون قابلة للتحميل من Flutter.



PHASE 14 – DATABASE DESIGN



صمم Database منظمة وقابلة للتوسع.



الجداول المقترحة:



- profiles

- tenants

- tenant_settings

- subscriptions

- subscription_history

- halls

- customers

- bookings

- booking_payments

- expense_categories

- expenses

- workers

- worker_payments

- inventory_items

- inventory_movements

- booking_items

- notifications

- notification_logs

- device_tokens

- audit_logs



أضف:



- UUID Primary Keys.

- Foreign Keys.

- Tenant ID Relationships.

- Created At.

- Updated At.

- Indexes.

- Database Constraints.

- RLS Policies.



استخدم Decimal أو Numeric للقيم المالية، ولا تستخدم Floating Point للحسابات المالية.



استخدم التوقيت المحلي المناسب للنظام، مع تخزين التواريخ بطريقة متوافقة مع UTC وإرجاعها لتطبيق Flutter بالشكل المناسب.



PHASE 15 – REST API FOR FLUTTER



أنشئ API واضحة ومنظمة.



Base API Prefix:



/api/v1



Authentication:



- POST /api/v1/auth/login

- POST /api/v1/auth/refresh

- POST /api/v1/auth/logout

- GET /api/v1/auth/me

- POST /api/v1/auth/change-password



Dashboard:



- GET /api/v1/dashboard/summary



Halls:



- GET /api/v1/halls

- POST /api/v1/halls

- GET /api/v1/halls/:id

- PUT /api/v1/halls/:id

- DELETE /api/v1/halls/:id



Customers:



- GET /api/v1/customers

- POST /api/v1/customers

- GET /api/v1/customers/:id

- PUT /api/v1/customers/:id



Bookings:



- GET /api/v1/bookings

- POST /api/v1/bookings

- GET /api/v1/bookings/:id

- PUT /api/v1/bookings/:id

- DELETE /api/v1/bookings/:id



Payments:



- GET /api/v1/bookings/:id/payments

- POST /api/v1/bookings/:id/payments



Expenses:



- GET /api/v1/expenses

- POST /api/v1/expenses

- PUT /api/v1/expenses/:id

- DELETE /api/v1/expenses/:id



Workers:



- GET /api/v1/workers

- POST /api/v1/workers

- GET /api/v1/workers/:id

- POST /api/v1/workers/:id/payments



Inventory:



- GET /api/v1/inventory

- POST /api/v1/inventory

- GET /api/v1/inventory/movements

- POST /api/v1/inventory/movements



Notifications:



- GET /api/v1/notifications

- PATCH /api/v1/notifications/:id/read

- POST /api/v1/device-tokens



Reports:



- GET /api/v1/reports/monthly

- GET /api/v1/reports/yearly

- GET /api/v1/reports/profit-loss

- GET /api/v1/reports/bookings

- GET /api/v1/reports/export/excel



هذه قائمة مبدئية؛ أضف أي Endpoints أخرى ضرورية لتشغيل النظام بالكامل.



جميع الـ APIs يجب أن تستخدم:



- Consistent JSON Responses.

- Correct HTTP Status Codes.

- Pagination.

- Search.

- Filtering.

- Server-side Validation.

- Authentication.

- Tenant Authorization.

- Subscription Validation.



لا تضع مفاتيح Service Role في تطبيق Flutter.



PHASE 16 – FLUTTER INTEGRATION



تذكر أن تطبيق قاعتي سيتم تطويره باستخدام Flutter.



لذلك يجب أن يكون Backend سهل الربط باستخدام Dio.



أنشئ ملف توثيق API يحتوي على:



- Base URL.

- Authentication Flow.

- Headers.

- Request Examples.

- Response Examples.

- Error Codes.

- Pagination.

- File Upload.

- Token Refresh.

- Notification Integration.

- Excel Download.

- Database Schema.



استخدم أسماء JSON واضحة وثابتة بصيغة snake_case.



أعد جميع البيانات التي تحتاجها شاشات Flutter دون الحاجة إلى حسابات مالية حساسة داخل التطبيق.



PHASE 17 – DEVELOPER AUDIT & CONTROL



أريد أن أتمكن من متابعة كل العمليات الإدارية المهمة.



سجل:



- إنشاء عميل.

- تعديل حساب.

- تفعيل أو إيقاف حساب.

- تمديد اشتراك.

- إعادة تعيين كلمة المرور.

- العمليات المالية المهمة.

- التغييرات الحساسة.



يجب أن يحتوي Audit Log على المستخدم المنفذ والوقت ونوع العملية والبيانات المرتبطة بها.



PHASE 18 – TESTING



قبل إعلان انتهاء المشروع، اختبر السيناريوهات التالية:



1. إنشاء عميل جديد من Super Admin.

2. تسجيل دخول العميل باستخدام Username وPassword.

3. إنشاء أكثر من قاعة للعميل.

4. إنشاء حجز.

5. محاولة إنشاء حجز متعارض لنفس القاعة.

6. تسجيل أكثر من دفعة للحجز.

7. التأكد من صحة المبلغ المتبقي.

8. إضافة مصروف.

9. تسجيل أجور العمال.

10. إضافة مشتريات وهالك.

11. التأكد من صحة صافي الربح.

12. إنشاء الإشعارات التلقائية.

13. إلغاء الإشعارات بعد سداد كامل المبلغ.

14. انتهاء اشتراك العميل.

15. محاولة دخول عميل منتهي الاشتراك.

16. التأكد من عدم حذف بياناته.

17. اختبار عزل بيانات عميل عن عميل آخر.

18. تصدير تقرير Excel.



FINAL DELIVERY REQUIREMENTS



أريد مشروعًا فعليًا وليس مجرد تصميم أو Prototype.



الأولوية بالترتيب:



1. Database.

2. Authentication.

3. Multi-Tenant Security.

4. Developer Super Admin Dashboard.

5. REST API.

6. Business Logic.

7. Notifications.

8. Reports and Excel.

9. Documentation.



لا تستخدم Mock Data بدلًا من قاعدة بيانات حقيقية.



لا تترك الوظائف الأساسية كـ TODO أو Placeholder.



لا تنشئ واجهة ويب للعميل.



لا تنشئ تطبيق Flutter.



لا تسمح بالتسجيل العام.



لا تعرض بيانات عميل لعميل آخر.



لا تجعل انتهاء الاشتراك يحذف بيانات العميل.



ابدأ بفحص قدرات Lovable Cloud، ثم أنشئ قاعدة البيانات والبنية الأمنية أولًا، وبعدها نفّذ باقي المراحل بشكل منظم.



بعد كل مرحلة تحقق من عملها قبل الانتقال إلى المرحلة التالية.



اسم المنتج في جميع الوثائق ولوحة المطور هو: قاعتي | Qa3aty



النتيجة النهائية المطلوبة: Backend SaaS حقيقي ومستقر، ولوحة Developer Dashboard خاصة بي، وREST API جاهزة للربط المباشر مع تطبيق Flutter.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eb9dc814-36bf-4270-92d5-23cc353bba18).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
