import type { Lang, SiteCopy } from '../types/content'

export const TELEGRAM_USERNAME = import.meta.env.VITE_TELEGRAM_USERNAME || 'v1u_0'
export const TELEGRAM_LINK = `https://t.me/${TELEGRAM_USERNAME}`

const arCopy: SiteCopy = {
  heroBadge: 'نسخة سطح المكتب متاحة الآن',
  heroTitleA: 'إدارة',
  heroTitleB: 'حسابات Bybit باحترافية',
  heroTitleC: 'من داخل مساحة عمل واحدة على جهازك.',
  heroDesc:
    'Saturn Workspace بتخليك تدير الحسابات بشكل منظم: تخزين حسابات Bybit، تخزين Gmail احترافي، جلسات سريعة، ومزامنة آمنة على Google Drive الشخصي للمستخدم.',
  ctaStart: 'ابدأ الآن',
  ctaExplore: 'استكشف المزايا',
  stats: [
    { label: 'حسابات Bybit مُدارة', value: '250k+', hint: 'أرشفة منظمة لكل الحسابات' },
    { label: 'مستخدمين فعّالين', value: '2,500+', hint: 'تشغيل يومي للأداة' },
    { label: 'بدء جلسة سريع', value: 'أقل من دقيقتين', hint: 'AdsPower ببروكسي أو بدون' },
  ],
  featuresTag: 'المزايا',
  featuresTitle: 'كل ما تحتاجه لإدارة الحسابات في أداة واحدة',
  featuresDesc: 'الموديولات مبنية للتنفيذ الفعلي وليس الحشو، وكل خطوة لها مكان واضح.',
  features: [
    {
      icon: 'vault',
      title: 'إدارة Vault',
      desc: 'تخزين احترافي لحسابات Bybit مع ملاحظات وحالة كل حساب بشكل مرتب.',
    },
    {
      icon: 'gmail',
      title: 'تخزين Gmail',
      desc: 'قاعدة بيانات Gmail منظمة مع بيانات الاسترداد وحالة الاستخدام.',
    },
    {
      icon: 'ip',
      title: 'تتبع IP ذكي',
      desc: 'منع تكرار IP في الجلسات المختلفة عبر سجل ذكي للتتبع.',
    },
    {
      icon: 'cloud',
      title: 'نسخ سحابي آمن',
      desc: 'مزامنة على Google Drive الشخصي للمستخدم فقط بدون أي طرف ثالث.',
    },
    {
      icon: 'session',
      title: 'جلسة سريعة',
      desc: 'تشغيل سريع على AdsPower ببروكسي أو بدون مع بروفايل جاهز.',
    },
    {
      icon: 'proxy',
      title: 'إدارة البروكسي',
      desc: 'سحب بروكسيات IPRoyal واستخدامها مباشرة داخل جلسات AdsPower.',
    },
  ],
  howTag: 'طريقة العمل',
  howTitle: '٣ خطوات واضحة',
  how: [
    {
      step: '01',
      title: 'جهز البيانات',
      desc: 'سجّل الحسابات والجيميلات والبيانات المطلوبة بشكل منظم.',
    },
    {
      step: '02',
      title: 'ابدأ الجلسة',
      desc: 'شغّل جلسة AdsPower سريعًا، أنشئ الحساب، واحفظ كل الملاحظات.',
    },
    {
      step: '03',
      title: 'راجع وامنح نسخة احتياطية',
      desc: 'حدّث الحالة والتذكيرات ثم فعّل المزامنة على Google Drive الخاص بك.',
    },
  ],
  faqTag: 'الأسئلة الشائعة',
  faqTitle: 'إجابات مباشرة',
  faq: [
    { q: 'هل الأداة تعمل محليًا؟', a: 'نعم. التشغيل الأساسي محلي بالكامل، والمزامنة السحابية اختيارية.' },
    { q: 'ما الأنظمة المدعومة؟', a: 'Windows 10 و Windows 11.' },
    { q: 'هل الترخيص لجهاز واحد؟', a: 'نعم، الترخيص لكل جهاز إلا في حالات الاتفاق الخاص.' },
    { q: 'ما المتصفحات المدعومة حاليًا؟', a: 'AdsPower و Brave، وقد تتم إضافة المزيد مستقبلًا.' },
    { q: 'كيف أستلم التفعيل؟', a: 'بعد تأكيد الطلب يتم إرسال بيانات التفعيل مباشرة.' },
  ],
  footerDesc: 'أداة سطح مكتب لإدارة حسابات Bybit وتخزين Gmail وIP ومزامنة سحابية آمنة.',
  footerPrivacy: 'الخصوصية',
  footerTerms: 'الشروط',
  footerRefund: 'الاسترجاع',
  footerUpdates: 'التحديثات',
}

const enCopy: SiteCopy = {
  heroBadge: 'Desktop build available now',
  heroTitleA: 'Professional',
  heroTitleB: 'Bybit account operations',
  heroTitleC: 'in one local-first desktop workspace.',
  heroDesc:
    'Saturn Workspace helps you run Bybit account operations with discipline: account vault, professional Gmail storage, fast session tools, and private cloud backup to your own Google Drive account.',
  ctaStart: 'Start now',
  ctaExplore: 'Explore modules',
  stats: [
    { label: 'Bybit accounts managed', value: '250k+', hint: 'structured vault history' },
    { label: 'Operators using toolkit', value: '2,500+', hint: 'daily active workflows' },
    { label: 'Quick session start', value: '< 2 min', hint: 'AdsPower with/without proxy' },
  ],
  featuresTag: 'FEATURES',
  featuresTitle: 'Built for real Saturn Workspace workflows',
  featuresDesc: 'Every module serves actual execution: create, run, review, sync, and reopen accounts quickly.',
  features: [
    {
      icon: 'vault',
      title: 'Vault Manager',
      desc: 'Professional storage for Bybit accounts with notes, status, and organized tracking fields.',
    },
    {
      icon: 'gmail',
      title: 'Gmail Storage',
      desc: 'Clean Gmail database with recovery details and usage state ready for operational flow.',
    },
    {
      icon: 'ip',
      title: 'Smart IP Register',
      desc: 'Avoid IP reuse across sessions with smart tracking and duplicate prevention logic.',
    },
    {
      icon: 'cloud',
      title: 'Private Cloud Backup',
      desc: 'Sync to your personal Google Drive app-data only. Your data is not routed to third parties.',
    },
    {
      icon: 'session',
      title: 'Fast Session Start',
      desc: 'Launch quick AdsPower session with proxy or without, using prepared profile settings.',
    },
    {
      icon: 'proxy',
      title: 'Proxy Operations',
      desc: 'Pull IPRoyal proxies and use them directly in AdsPower profiles (requires active IPRoyal plan).',
    },
  ],
  howTag: 'HOW IT WORKS',
  howTitle: 'Workflow in three steps',
  how: [
    {
      step: '01',
      title: 'Prepare operation setup',
      desc: 'Store account + Gmail data in structured fields, then choose browser route.',
    },
    {
      step: '02',
      title: 'Start account session',
      desc: 'Run quick session on AdsPower (proxy/no proxy), create account, and save required notes.',
    },
    {
      step: '03',
      title: 'Review and sync securely',
      desc: 'Update account status/reminders and sync your dataset to personal Google Drive if enabled.',
    },
  ],
  faqTag: 'FAQ',
  faqTitle: 'Questions from real users',
  faq: [
    { q: 'Does Saturn Workspace work locally?', a: 'Yes. Core operations are local-first. Cloud sync is optional and user-controlled.' },
    { q: 'Which Windows versions are supported?', a: 'Windows 10 and Windows 11.' },
    { q: 'Is license per device?', a: 'Yes. Each license is bound to one device unless agreed otherwise.' },
    { q: 'Which browsers are supported now?', a: 'AdsPower and Brave are supported now. More browsers may be added later.' },
    { q: 'How do I receive activation?', a: 'After order confirmation, activation details are sent directly.' },
  ],
  footerDesc: 'Official desktop toolkit for Vault, Gmail, IP, and controlled cloud sync workflows.',
  footerPrivacy: 'Privacy',
  footerTerms: 'Terms',
  footerRefund: 'Refund',
  footerUpdates: 'Updates',
}

export function getSiteCopy(lang: Lang): SiteCopy {
  return lang === 'ar' ? arCopy : enCopy
}
