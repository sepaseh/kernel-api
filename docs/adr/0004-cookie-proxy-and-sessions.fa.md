# ADR 0004: Session consumers and cookie boundary

[English](0004-cookie-proxy-and-sessions.md) · [فارسی](0004-cookie-proxy-and-sessions.fa.md)

وضعیت قرارداد HTTP/نشست پذیرفته است. مصرف‌کنندگان مستقل می‌توانند از bearer یا
پراکسی کوکی HttpOnly استفاده کنند. Set-Cookie رسمی و نام کوکی امن را حفظ کنید؛
پراکسی می‌تواند توکن اعتبارنامه را از JSON موفق auth حذف کند. refresh همان نشست opaque است و JWT
rotation نیست. تغییر/بازیابی موفق رمز تمام نشست‌ها را اتمیک باطل می‌کند؛ شکست
refresh کلاینت به‌تنهایی نشست را باطل نمی‌کند. خروج idempotent و پاک‌کنندهٔ کوکی
واقعی provider است. تغییر cross-origin مبدأ دقیق مجاز لازم دارد.
سمت API در [درگاه auth](../../src/infrastructure/auth/gateway.ts) و
[HTTP](../../src/presentation/http/routes/auth.ts) است و آداپتور frontend
در checkout دیگر می‌ماند.
