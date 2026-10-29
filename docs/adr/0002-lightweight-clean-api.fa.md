# ADR 0002: Lightweight Clean API

[English](0002-lightweight-clean-api.md) · [فارسی](0002-lightweight-clean-api.fa.md)

وضعیت پذیرفته است. سرویس و درگاه برنامه مستقل از چارچوب، آداپتور واقعی مالک
DB/auth/storage و Hono در presentation/http می‌ماند و composition دستی آن‌ها را
متصل می‌کند. HTTP می‌تواند از آداپتور گزارش و ترجمه استفاده کند؛ برنامه هیچ زیرساختی
را وارد نمی‌کند و واژگان ترجمهٔ برنامه در این مرز فقط به صورت نوع محوشونده مصرف می‌شود. invariant زمان تراکنش در نوشتن واقعی
ماندگار است. generic repository، DDD، CQRS، mediator یا DI container اضافه نکنید.
[آزمون معماری](../../src/architecture.test.ts) و DB واقعی دغدغه‌های متفاوت
را پوشش می‌دهند.
