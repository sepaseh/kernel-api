# راهنمای استقرار Docker برای API

[English](README.md) · [فارسی](README.fa.md)

قالب‌های استقرار به‌تنهایی آمادگی تولید را ثابت نمی‌کنند؛ ارسال واقعی OTP و
یکپارچگی محیط عملیاتی هنوز تأیید نشده‌اند.

از موتور Linux Docker و Compose دارای پشتیبانی env_file الزامی استفاده کنید.
تنظیمات API و میزبان را در فایل‌های محافظت‌شده بیرون Git فراهم کنید. این نسخهٔ
سورس قالب‌های نمونهٔ [API](api.env.example) و [میزبان](hosts.env.example) را دارد؛
آن‌ها را بیرون Git کپی و تنظیم کنید و secretهای واقعی را محافظت کنید. secret تصادفی، RELEASE_ID تغییرناپذیر، API_HOST،
API_PUBLIC_ORIGIN، SERVER_ALLOWED_ORIGINS خارجی دقیق و مسیر مطلق API_ENV_FILE و
TLS_CERT_DIRECTORY را تعیین کنید. پیش‌بررسی مقادیر placeholder را رد می‌کند.

پیش از شروع، DNS و گواهی واقعی API_HOST را فراهم کنید. پوشهٔ TLS باید فایل واقعی
fullchain.pem و privkey.pem داشته باشد؛ نبود فایل شروع gateway را متوقف می‌کند.
صدور اولیه را با DNS یا ACME مستقل در زمان آزادبودن پورت‌ها انجام دهید. این stack
گواهی صادر نمی‌کند و API را با HTTP بدون TLS جایگزین نمی‌کند. تمدید نیازمند انتشار
فایل جدید و اعتبارسنجی و reload Nginx است. پوشهٔ گواهی و env باید محافظت ریشه داشته باشند.

```sh
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml config --quiet
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml build
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml up -d --wait
```

image API فقط وابستگی اجرایی lock ریشهٔ همین پروژه را نصب و سورس محلی src و
migrationهای drizzle را کپی می‌کند. کاربر اجرا node است و پیش‌بررسی تولید قبل از
راه‌اندازی انجام می‌شود. فقط پورت gateway منتشر است و پورت 3000 API داخلی می‌ماند.
volume به‌نام api-data در /var/lib/kernel-api، DB و uploads پایدار را نگه می‌دارد.
هنگام تعویض انتشار همان نام پروژهٔ Compose را نگه دارید تا volume دوباره استفاده
شود. روی دادهٔ واقعی هرگز down --volumes اجرا نکنید. SQLite فقط یک replica API دارد.

مدیر اولیه را فقط یک‌بار روی نصب خالی بسازید. محیط API را اعتبارسنجی و JSON شامل
first_name، last_name، mobile، username و password را محافظت‌شده بیرون Git آماده
و با STDIN ارسال کنید:

```sh
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml exec -T api node scripts/validate-deployment-env.mjs api
docker compose --env-file /etc/kernel-api/hosts.env -f deploy/docker/compose.yaml exec -T api node src/bootstrap-admin.ts < /secure/path/initial-admin.json
```

bootstrap حساب قبلی را reset نمی‌کند و نشست یا توکن نمی‌سازد. ورودی موقت را طبق
سیاست secret حذف کنید. ثبت‌نام، بازیابی و تأیید ایمیل هنوز ارسال واقعی OTP می‌خواهند.
/health، ورود، مجوز، فایل عمومی/خصوصی و /_kernel/release را با انتشار مطلوب بسنجید.

gateway نشانی سرویس API را با DNS داخلی Docker هر ۱۰ ثانیه تازه می‌کند؛
تعویض container همچنان ممکن است وقفه‌ای کوتاه ایجاد کند.

برای ارتقا نوشتن را متوقف کنید، API را خاموش و پایان پاک آن را تأیید کنید،
سپس backup هماهنگ DB و فایل بگیرید. tag تغییرناپذیر جدید را بسازید/دریافت
کنید و up -d --wait اجرا کنید. tag قبلی و تنظیمات محافظت‌شده
را نگه دارید. image قدیمی مهاجرت را برنمی‌گرداند؛ در صورت ناسازگاری schema، DB و
فایل متناظر را restore کنید. [بازیابی](../../docs/backup-restore.fa.md) و
[عملیات انتشار](../../docs/release-operations.fa.md) بررسی‌ها را مشخص می‌کنند.
MinIO خارجی اختیاری است و TLS، اعتبارنامه، bucket و مبدأ عمومی دقیق می‌خواهد.
عوض‌کردن driver، metadata یا فایل قبلی را منتقل نمی‌کند.

npm run test:deploy:docker آزمون اختیاری HTTPS ساختگی محلی است؛ endpoint محلی
Docker را اجباری، secret و گواهی تصادفی، پروژهٔ یکتا و volume موقت ایجاد می‌کند
و bootstrap، نشست، رد Origin خارجی، فایل عمومی/خصوصی و دوام پس از تعویض container
را می‌سنجد. هر اجرا builder یکتای Buildx با driver نوع docker-container و
default-load=true دارد؛ انتخاب آن فقط در فرایند آزمون است و builder سراسری عوض
نمی‌شود. پس از موفقیت، شکست یا لغو مدیریت‌شدهٔ SIGINT/SIGTERM، کانتینرهای دقیق
آزمون، پروژه و volume و شبکهٔ Compose، دو tag تصویر، builder و cache ساخت آن و
فایل‌های TEMP حذف می‌شوند. گواهی با تصویر gateway خود آزمون ساخته می‌شود.
شکست یک مرحلهٔ پاک‌سازی، مراحل دیگر را متوقف نمی‌کند و شکست پاک‌سازی نتیجهٔ
فرمان را ناموفق می‌کند. نام یا tag از قبل موجود رد و دست‌نخورده باقی می‌ماند.
آزمون prune سراسری تصویر/cache ندارد؛ تصویر اجرایی مشترک BuildKit ابزار نصب‌شده
است و خروجی اختصاصی آزمون محسوب نمی‌شود.

نبود Docker شکست است، نه موفقیت آزمون. این ابزار هدف عملیاتی قبول نمی‌کند.
شناسهٔ منابع و مسیر TEMP را بدون اعتبارنامهٔ تولیدشده چاپ می‌کند. توقف اجباری
فرایند یا میزبان فرصت پاک‌سازی نمی‌دهد؛ پیش از اجرای بعد، فقط منابع ثبت‌شدهٔ همان
آزمون را پس از تأیید مالکیت حذف کنید.
