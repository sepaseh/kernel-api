# Protected manual API checks

[English](staging.md) · [فارسی](staging.fa.md)

گردش‌کار staging و deployment-smoke فقط dispatch دستی دارند و بررسی فقط‌خواندنی
معنایی /health و /_kernel/release انجام می‌دهند. STAGING_ALLOWED_API_HOST یا
SMOKE_ALLOWED_API_HOST و EXPECTED_DEPLOYMENT_ID را محافظت‌شده تنظیم کنید؛ ورودی
اجرا نمی‌تواند allowlist یا انتشار مورد انتظار را بازتعریف کند. staging همچنین
PRODUCTION_HOST لازم دارد و همان host را رد می‌کند. URL باید مبدأ HTTPS دقیق
بدون اعتبارنامه، مسیر، query یا hash باشد. شناسهٔ مورد انتظار مستقل از تنظیم
محافظت‌شده می‌آید و از پاسخ remote پذیرفته نمی‌شود.

DAST قالب دستی جدا برای staging مجاز است و ممکن است ترافیک تغییردهنده بفرستد؛
بدون مجوز صریح هدف dispatch نکنید. قالب release، staging، smoke، DAST و Sonar
محیط ایجاد نمی‌کند و وجود فایل به‌معنی اجرای remote نیست. هنگام بازگردانی این
قابلیت‌ها سرویس عملیاتی فراخوانی نشده است.
