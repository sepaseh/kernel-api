# نقشهٔ کار API

[English](source-navigation.md) · [فارسی](source-navigation.fa.md)

.agents/navigation.json نقشهٔ ماشینی مرجع است. از AGENTS ریشه و قواعد مرتبط آغاز کنید و
فقط مالک‌ها، قراردادها و آزمون همان کار را باز کنید. جریان واقعی را از transport به
application، adapter و تراکنش دنبال کنید؛ یافتن symbol یا typecheck کافی نیست.

نقشهٔ کار به فایل‌های سورس و آزمون ارجاع می‌دهد. هر بررسی مرتبط را پیش از
گزارش موفقیت اجرا کنید؛ وجود فایل به‌تنهایی نشانهٔ اجرای بررسی نیست.

سورس اجرایی در src/ است. قرارداد خالص HTTP در ماژول مالک قابلیت زیر src/contracts
قرار دارد و مستقیماً import می‌شود. contracts/locales.ts تنها مرجع خالص مشخصات زبان
برای تنظیمات و نوع کد کاتالوگ است. واژگان نوعی پیام در
src/application/localization.ts و کاتالوگ اجرایی در src/infrastructure/localization/catalogs
قرار دارند. Hono، DB، auth و storage فقط متعلق به API هستند؛ فرانت‌اندهای مستقل از
HTTP استفاده می‌کنند و به سورس این مخزن وابسته نیستند. Bruno، DTO و آزمون HTTP شاهد رفتارند.

برای احراز هویت و نشست، [آداپتورها](auth-adapters.fa.md) و
[فهرست امنیت](security/authentication-review.fa.md) را ببینید. برای ذخیره‌سازی و
حذف، [ذخیره‌سازی](object-storage.fa.md)، [محدودیت‌های پایگاه داده](database-schema.fa.md)
و [انتقال HTTP](http-transport.fa.md) را بخوانید. برای استقرار و بازیابی از
[استقرار](deployment.fa.md) و [پشتیبان و بازیابی](backup-restore.fa.md) شروع کنید.
برای چرخهٔ آزمون استقرار بومی، کد بسته‌سازی و پاک‌سازی و آزمون‌های مصنوعی خطا را
در کار استقرار بررسی کنید. آزمون‌های پاک‌سازی fixture نیز مالکیت و خطاهای منابع
موقت پایگاه داده را پوشش می‌دهند.

کار قابلیت و قرارداد API برای تغییر حذف/status/انتساب،
[قاعدهٔ چرخهٔ داده](../.agents/rules/data-lifecycle.md) را هم دارد. کار issue، شاخه،
کامیت و بازبینی از [روند Git](../.agents/rules/git.md) به قاعده و skill مرتبط می‌رسد.
وضعیت شاخه و مبنا را بررسی و تغییر نامرتبط را حفظ کنید؛ پیش از کامیت یا PR مجاز،
manifest کامل اعتبارسنجی همچنان الزامی است.

برای برنامهٔ صفحهٔ متصل به API، کار `http-contract` را انتخاب و
[تحویل قرارداد صفحهٔ کلاینت](collection-guide.fa.md#تحویل-قرارداد-صفحهٔ-کلاینت)
را کامل کنید. اگر صفحه از نشست، زبان یا فایل استفاده می‌کند، کار `auth-session`،
`active-language` یا `media-storage` را هم دنبال کنید. API قرارداد و شاهد مجوز/خطا
را می‌دهد؛ انتخاب مؤلفه، چیدمان و بررسی ظاهر متعلق به فرانت‌اند مصرف‌کننده است.
برای دنبال‌کردن رفتار از [آزمون قرارداد](testing.md#http-contract-tests)،
[اعتبارسنجی ورودی](input-validation.fa.md)، [توالی درخواست‌ها](sequences.fa.md)
و [ثبت رویداد](backend-logging.fa.md) استفاده کنید.

کار استقرار شامل Docker/native مخصوص API، release تغییرناپذیر، preflight، state پایدار،
health/bootstrap و بازیابی هماهنگ است. راهنما و ارزیابی فقط همین پروژه را مصرف می‌کنند.
[اعتبارسنجی](validation.fa.md)، [معماری](architecture.fa.md)، [استقرار](deployment.fa.md) و
[ارزیابی](../.agents/evaluation/README.md) محدودیت شواهد را توضیح می‌دهند. env واقعی،
server/data نادیده‌گرفته‌شده یا production ورودی آزمون و ارزیابی نیستند.
