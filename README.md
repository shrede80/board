# لوحة المشاهد

برنامج ويب لتخطيط التصوير: لوحة أفكار حرة، وستوري بورد، وقائمة لقطات على الجوال. يعمل على Cloudflare (Workers + D1 + R2).

## التشغيل على جهازك (للمطوّر)
```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev          # يفتح على http://localhost:5173
```

## الاختبارات
```bash
npm run typecheck
npm test             # اختبارات الخادم والمنطق
npm run test:e2e     # اختبارات المتصفح (لابتوب وجوال)
```

## النشر
تُكتب خطواته بالتفصيل في المرحلة 6 (النشر)، ومعها: كيف تُسترجع نسخة احتياطية، وD1 Time Travel.
