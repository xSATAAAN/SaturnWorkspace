export const CURRENT_TERMS_VERSION = '2026-07'

const legalTitles = {
  en: {
    terms: 'Terms of service',
    privacy: 'Privacy policy',
    refund: 'Refund policy',
    'acceptable-use': 'Acceptable use',
    cookies: 'Cookies policy',
  },
  ar: {
    terms: 'شروط الخدمة',
    privacy: 'سياسة الخصوصية',
    refund: 'سياسة الاسترداد',
    'acceptable-use': 'الاستخدام المقبول',
    cookies: 'سياسة ملفات الارتباط',
  },
} as const

const oneDeviceTerms = {
  en: 'A Saturn Workspace subscription may be used on one desktop device at a time. Changing that device requires a request submitted from the account, and Saturn Workspace may approve or reject the request.',
  ar: 'يمكن استخدام اشتراك Saturn Workspace على جهاز كمبيوتر واحد في الوقت نفسه. يتطلب تغيير هذا الجهاز تقديم طلب من الحساب، ويحق لـ Saturn Workspace قبول الطلب أو رفضه.',
} as const

const diagnosticPrivacy = {
  en: 'Saturn Workspace automatically records technical failures from startup through shutdown to help diagnose problems. Reports may include error messages and technical traces, application and operating-system versions, lifecycle phases, failure counts, and sanitized request context. Reports are linked to a Saturn user only through a verified session; startup reports without a verified session remain unattributed. Passwords, authentication secrets, access tokens, message contents, and notes are excluded. Reports are available only to authorized administrators and retained for 90 days, then deleted automatically. Reports saved while offline are retried when a connection is available. An abrupt shutdown can prevent an unsaved failure from being recorded.',
  ar: 'تسجّل Saturn Workspace الأعطال الفنية تلقائيًا من بدء التشغيل حتى الإغلاق للمساعدة في تشخيص المشكلات. قد تشمل التقارير رسائل الخطأ والتتبّع الفني، وإصدارات الأداة ونظام التشغيل، ومراحل التشغيل، وعدد مرات الفشل، وسياق الطلب بعد إزالة البيانات الحساسة. لا يُنسب التقرير لمستخدم Saturn إلا من خلال جلسة موثوقة؛ وتبقى تقارير بدء التشغيل التي لا تملك جلسة موثوقة غير منسوبة. لا تُرسل كلمات المرور أو مفاتيح المصادقة أو رموز الوصول أو محتوى الرسائل أو الملاحظات. يطّلع على التقارير المسؤولون المخوّلون فقط، وتُحفظ لمدة 90 يومًا ثم تُحذف تلقائيًا. تُعاد محاولة إرسال التقارير المحفوظة دون اتصال عند توفر الاتصال. قد يمنع الإغلاق المفاجئ تسجيل خطأ لم يُحفظ بعد.',
} as const

export function legalPageContent(page: string, locale: 'ar' | 'en', fallbackBody: string) {
  const titles = legalTitles[locale]
  const title = titles[page as keyof typeof titles] || titles.privacy
  return {
    title,
    body: page === 'terms' ? oneDeviceTerms[locale] : page === 'privacy' ? `${fallbackBody}\n\n${diagnosticPrivacy[locale]}` : fallbackBody,
  }
}
