# لوحة المشاهد — تسليم إلى Claude Code

## الملفات
- `Index.dc.html` — فهرس كل الشاشات والحالات (فاتح/داكن) + أيقونة التطبيق.
- `Scene Board.dc.html` — تطبيق اللابتوب كاملاً. الحالة تُفتح عبر الـ hash: `#screen=board|storyboard|present|equipment|trash|settings|login|export|projects|newProject&state=…&theme=light|dark`.
- `Scene Board Mobile.dc.html` — الجوال (390×844): `#tab=list|capture&group=location&detail=<shotId>&offline=1`.
- `logic/sb-core.js` — الثوابت (الأحجام، الزوايا، الحركات، القوالب، الحالات) + كل الأفعال: mutate/undo/redo، الحفظ، FLIP، السحب والإفلات، السلة، التصدير، العرض.
- `logic/sb-view.js` — بناء بيانات العرض لكل مكوّن.
- `data/seed.json` — البيانات التجريبية بالبنية في القسم 4 (مشاريع → مشاهد → لقطات، مكتبة، ملاحظات، بطاقات اللوحة، سلة).
- `data/equipment.json` — معداتي مع `id` ثابت لكل قطعة، و`motions` للحركات المقترحة، و`lensIds/builtinLenses/fixedLens/zoomOnly` للكاميرات.
- `theme/dark.css` — طبقة semantic للوضع الداكن عبر `[data-sb-theme="dark"]` على `<html>` + قواعد الطباعة.

## خريطة المكوّنات (data-component في القالب)
TopBar · ModeSwitch · SaveIndicator · LibraryPanel · BoardCanvas · SceneCard · NoteCard · CharacterCard · LocationCard · MoodboardCard · StoryboardView · RhythmBar · StoryboardRow · ShotCard · TemplateDock · ZoomControls · FilterBanner · ShotEditor · SceneEditor · CharacterEditor · LocationEditor · MoodboardEditor · NoteEditor · ImageGallery · EquipmentPicker · ProjectSwitcher · NewProjectDialog · ExportDialog · PresentationMode · ConfirmDialog · EquipmentPage · TrashPage · SettingsPage · LoginScreen · OfflineBanner · MobileShotList · MobileShotDetail · MobileCapture · AppIcon.

## قواعد مهمة مطبّقة
- البطاقة على اللوحة عرض فقط: `board.cards[] = {kind, refId, x, y}`؛ الشخصيات والمواقع ولوحات المزاج في `library`، والملاحظات في `notes`.
- رقم المشهد/اللقطة = ترتيبه في المصفوفة (لا يُخزَّن).
- المشهد الجديد على اللوحة يُضاف لنهاية الترتيب.
- الحذف ينقل إلى `trash[]` مع `payload` كامل لاستعادته (المشهد بلقطاته).
- القوائم: معداتي أولاً، ثم القائمة العامة، ثم «اكتب قيمة جديدة…» (تُخزَّن كنص).
- حقل العدسة حسب الكاميرا: ZV-E10 ← `lensIds` (Sigma افتراضية)، iPhone ← `builtinLenses`، الدرون بلا عدسة، البريدج بالبعد البؤري فقط.

## ملاحظات للبناء الحقيقي
- الحفظ حالياً في localStorage (`sb-data-v3`) مع مؤشر الحفظ؛ استبدله بـ API مع نفس حالات «محفوظ / يحفظ… / فشل الحفظ».
- الصور التجريبية إطارات متدرّجة من `frame {x,y,v}` ولون المزاج؛ الصور الحقيقية `src`.
- ملف `equipment-icons.svg` لم يُرفق؛ الأيقونات حالياً من مجموعة نظام التصميم عبر `C.EQ_ICON` — استبدلها بالملف الأصلي.
- تصدير Excel حالياً CSV بترميز UTF-8 يفتح في Excel.
