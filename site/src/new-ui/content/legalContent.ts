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

export function legalPageContent(page: string, locale: 'ar' | 'en', fallbackBody: string) {
  const titles = legalTitles[locale]
  const title = titles[page as keyof typeof titles] || titles.privacy
  return {
    title,
    body: page === 'terms' ? oneDeviceTerms[locale] : fallbackBody,
  }
}
