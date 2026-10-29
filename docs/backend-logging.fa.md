# Backend logging

[English](backend-logging.md) · [فارسی](backend-logging.fa.md)

Pino گزارش JSON ساختاریافته با زمان UTC، سطح، محیط و شناسهٔ انتشار می‌نویسد.
متغیرهای `LOG_LEVEL`، `SERVER_ENVIRONMENT` و `SERVER_RELEASE_ID` آن را تنظیم
می‌کنند و تولید شناسهٔ تغییرناپذیر می‌خواهد. نمایش خوانا فقط برای توسعه است.
Docker از stdout/stderr و سرویس بومی از journald استفاده می‌کند. داشبورد یا
جمع‌کنندهٔ خارجی به‌صورت خودکار فراهم نمی‌شود.

پاسخ‌های برنامهٔ HTTP پس از آماده‌شدن یک `X-Request-Id` محدود دارند؛ مقدار معتبر
منتقل و مقدار نامعتبر یا
شبیه دادهٔ حساس با UUID جایگزین می‌شود. دقیقاً یک رویداد نهایی نتیجه را ثبت
می‌کند و هویت کاربر فقط پس از احراز هویت افزوده می‌شود. serializer خطا محل
امن stack و زنجیرهٔ علت را بدون payload کتابخانه، SQL، اعتبارنامه یا متن دلخواه
کاربر نگه می‌دارد. پاک‌سازی شامل اعتبارنامهٔ تودرتو، کوکی، OTP و اطلاعات ذخیره‌سازی
و DB، از جمله logger فرزند و پیام provider است. گزارش آپلود فقط metadata امن
دارد؛ شکست حذف جبرانی جدا ثبت می‌شود و خطای اصلی metadata حفظ می‌شود. پاسخ ۵۰۳
هنگام شروع پیش از فعال‌شدن این میان‌افزار درخواست ارائه می‌شود.

آزمون‌های گزارش، درخواست و lifecycle با `npm run test:coverage` اجرا می‌شوند.
`npm run test:recovery` نیز [رخداد مصنوعی storage](recovery-drills.fa.md) را با
ارتباط واقعی درخواست HTTP، نسخهٔ انتشار و لاگ و سپس بازیابی می‌سنجد؛ مرورگر یا
collector راه نمی‌اندازد.
[بازبینی امنیت](security/authentication-review.fa.md) را ببینید.

## پیکربندی و رویداد

| متغیر              | پیش‌فرض / قید                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| NODE_ENV           | development؛ اجرای مستقر production است                                                          |
| LOG_LEVEL          | debug در توسعه و در غیر این صورت info؛ debug/info/warn/error                                     |
| SERVER_ENVIRONMENT | NODE_ENV؛ ۱ تا ۶۴ حرف ASCII، عدد، underscore، نقطه یا خط تیره                                    |
| SERVER_RELEASE_ID  | development بیرون تولید؛ تولید شناسهٔ انتشار ثابت با ۱ تا ۱۲۸ نویسهٔ مجاز از جمله @ و / می‌خواهد |

پیکربندی نامعتبر بدون چاپ ورودی خطا می‌دهد. اگر راه‌اندازی عادی شکست بخورد logger
اولیه environment=bootstrap و release=unknown دارد. هر رکورد time، level عددی،
service=kernel-api، environment و release دارد. رکورد درخواست requestId، method،
مسیر route تطبیق‌یافته، status، durationMs و در صورت احراز هویت userId دارد. query
خام URL و شناسه‌های شخصی در مسیر ثبت نمی‌شوند.

| رویداد                                                          | معنی                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| api.request.completed                                           | دقیقاً یک نتیجهٔ نهایی Hono؛ info/warn/error بر اساس status |
| auth.login.failed / auth.diagnostic                             | نتیجهٔ امن احراز هویت یا diagnostic ارائه‌دهنده             |
| file.upload.completed / file.upload.failed                      | اندازه/نوع/visibility امن یا مرحلهٔ شکست                    |
| storage.operation.failed / storage.cleanup.failed               | شکست عملیات و خطای جداگانهٔ حذف جبرانی                      |
| server.started / server.stopped                                 | چرخهٔ عمر فرایند                                            |
| server.startup.failed / server.shutdown.failed / server.crashed | شکست شروع/سقوط fatal یا خطای پایان محدودشده                 |

شناسهٔ درخواست ۱ تا ۱۲۸ حرف ASCII، عدد، underscore، خط تیره یا مساوی می‌پذیرد.
مقدار نامعتبر یا حساس‌نما با UUID جایگزین می‌شود. این شناسه metadata همبستگی نامطمئن
است و احراز هویت یا شناسهٔ audit تغییرناپذیر نیست.

درخواست، body، header، object احراز هویت/نشست/پیکربندی، SQL، بایت فایل و payload
SDK را خام ثبت نکنید. پیام رویداد ثابت و metadata انتخاب‌شده باشد. sanitization هر
راز ناشناس در نثر را تشخیص نمی‌دهد. متن خام خطا حذف و نوع/code امن، cause محدود و
نام فایل/سطر/ستون حفظ می‌شود. redaction در توسعه نیز فعال می‌ماند. نگهداری، رمزگذاری
و دسترسی log متعلق به بهره‌بردار است؛ log مخزن audit امنیتی تغییرناپذیر نیست.

پایان SIGINT/SIGTERM به ده ثانیه محدود است. exception/rejection مهارنشده رویداد fatal
ثبت می‌کند، حداکثر یک ثانیه برای flush فرصت می‌دهد و با 1 خارج می‌شود. kill سخت یا
stdout خراب تحویل log را تضمین نمی‌کند؛ supervisor مسئول راه‌اندازی دوباره است.
