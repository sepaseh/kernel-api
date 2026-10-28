# راهنمای استقرار بومی Linux برای API

[English](README.md) · [فارسی](README.fa.md)

از Linux دارای systemd، Nginx، Certbot و Node.js 24 مطابق .nvmrc استفاده کنید.
به‌دلیل احتمال باینری بومی، بسته را روی OS و CPU یکسان با محیط اجرا بسازید؛
وابستگی نصب‌شده در ویندوز انتشار Linux نیست.

این قالب‌ها آمادگی تولید را ثابت نمی‌کنند؛ ارسال واقعی OTP و یکپارچگی عملیاتی
هنوز تأیید نشده‌اند و فایل محیط نمونه در این نسخهٔ منتشرشده وجود ندارد.

در checkout مورد اعتماد npm ci، پروفایل بررسی مرتبط و
npm run deploy:package -- --release=RELEASE_ID را اجرا کنید. انتشار انحصاری است
و جایگزین نسخهٔ موجود نمی‌شود. خروجی کامل را پس از کنترل checksum به
/srv/kernel-api/releases/RELEASE_ID ببرید و از پوشهٔ api آن وابستگی اجرایی را نصب کنید:

```sh
npm ci --omit=dev
```

کد برای کاربر اجرا فقط‌خواندنی باشد. کاربر و گروه سیستمی kernel-api، پوشهٔ ریشه‌مالک
/srv/kernel-api/releases و /etc/kernel-api محافظت‌شده، و /var/lib/kernel-api و
uploads زیر آن با مالک kernel-api و مجوز 0700 بسازید. symlink به‌نام
/srv/kernel-api/current را به release انتخاب‌شده وصل کنید. فایل محافظت‌شدهٔ
/etc/kernel-api/api.env را با مالک root و مجوز 0600 ایجاد کنید: secret واقعی تصادفی،
شناسهٔ تغییرناپذیر، مبدأ عمومی HTTPS، مبدأ دقیق مصرف‌کننده و مسیر مطلق پایدار.
فایل محیط systemd فقط NAME=value و بدون export یا بسط shell است. unit عملیاتی
و bootstrap فایل env توسعهٔ checkout را بارگیری نمی‌کنند.

برای اجرای رندرکننده به checkout مورد اعتماد منبع برگردید؛ پوشهٔ `api` بسته‌شده
رندرکننده و قالب‌های Nginx را شامل نمی‌شود.
برای TLS اولیه، API_HOST را در فایل عمومی تعیین و قالب ثابت `bootstrap` را رندر
کنید. رندرکننده تنظیمات عمومی را از stdin می‌خواند و پیکربندی را به stdout می‌دهد.
از فایل موقت انحصاری استفاده کنید، موفقیت دستور را بررسی کنید و پیش از نصب خروجی
را بازبینی کنید؛ مستقیماً روی پیکربندی موجود تغییرمسیر ندهید. برای نمونه:

```sh
render_tmp=$(mktemp)
npm run --silent deploy:render -- --template bootstrap < /path/to/public-hosts.env > "$render_tmp"
```

اگر رندر ناموفق بود یا پس از نصب، فایل موقت را پاک کنید. سرور موقت HTTP مخصوص چالش ACME را در Nginx نصب، /var/www/letsencrypt را
ایجاد، nginx -t و reload کنید و سپس گواهی بگیرید:

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt -d api.example.com
sudo certbot renew --dry-run
```

تنظیمات عمومی میزبان شامل نام، مسیر گواهی و شناسهٔ انتشار را بدون اعتبارنامه فراهم کنید.
دستور را با `--template kernel` و فایل موقت انحصاری جدید تکرار و خروجی را بازبینی
کنید. خروجی در http context نصب شود و پس از nginx -t، reload
انجام شود. سرور موقت قبلی را جایگزین کنید تا block تکراری باقی نماند. تمدید
باید پس از انتشار گواهی، Nginx را reload کند:
certbot renew --deploy-hook 'systemctl reload nginx'. کلید گواهی داخل مخزن یا
release نیست. فقط Nginx پورت عمومی دارد؛ unit بدون توجه به HOST و PORT فایل
محیط، API را روی `127.0.0.1:3000` محدود می‌کند. سقف ingress پیش‌فرض
۶ مگابایت برای سقف ۵ مگابایتی برنامه است.

قالب کامل میزبان HTTP و نام TLS ناشناخته را رد می‌کند. هنگام ادغام چند برنامهٔ
مستقل در یک Nginx، برای هر آدرس شنود فقط یک جفت block پیش‌فرض رد میزبان نگه دارید
و blockهای نام‌دار برنامه‌ها را آگاهانه ادغام کنید.

پیش از شروع نصب تازه، محیط محافظت‌شده را اعتبارسنجی و فقط در نبود هر کاربر،
bootstrap کنید. اپراتور مجاز root می‌تواند سرویس موقت با هویت اجرا و محیط صریح بسازد:

```sh
systemd-run --unit=kernel-api-validate --collect --wait --pipe --property=User=kernel-api --property=WorkingDirectory=/srv/kernel-api/current/api --property=EnvironmentFile=/etc/kernel-api/api.env /usr/bin/node scripts/validate-deployment-env.mjs api
systemd-run --unit=kernel-api-bootstrap --collect --wait --pipe --property=User=kernel-api --property=WorkingDirectory=/srv/kernel-api/current/api --property=EnvironmentFile=/etc/kernel-api/api.env /usr/bin/node src/bootstrap-admin.ts < /secure/path/initial-admin.json
```

JSON محافظت‌شده شامل first_name، last_name، mobile با 09 و ۹ رقم دیگر، username
و رمز ۸ تا ۱۲۸ کاراکتری بدون فاصلهٔ ابتدا/انتها است. اعتبارنامه در آرگومان یا log
قرار نمی‌گیرد. bootstrap، seed را غیرفعال، مهاجرت را اجرا و یک مدیر و اعتبارنامه
را اتمیک ایجاد می‌کند، نشست نمی‌سازد و وجود هر کاربر قبلی را رد می‌کند. ورودی
موقت محافظت‌شده را طبق سیاست secret حذف کنید.

systemd/kernel-api.service را در /etc/systemd/system/kernel-api.service نصب و
systemctl daemon-reload و systemctl enable --now kernel-api را اجرا کنید.
ExecStartPre در هر شروع محیط را بررسی می‌کند. unit بدون امتیاز ویژه، با امکان
نوشتن محدود به /var/lib/kernel-api و گزارش journald اجرا می‌شود. پیش از بازکردن
ترافیک، systemctl status، journalctl -u kernel-api، deploy:health -- api، ورود و
فایل HTTPS عمومی و release marker را بررسی کنید.
[بازیابی](../../docs/backup-restore.fa.md) و [ارتقا/rollback](../../docs/release-operations.fa.md)
مراحل ضروری اپراتور هستند. این رویه provider واقعی OTP یا زمان‌بندی backup نصب نمی‌کند.
