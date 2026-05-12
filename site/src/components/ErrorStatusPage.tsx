import { useEffect, useMemo } from 'react'

type ErrorStatus = 403 | 404 | 429 | 500 | 503

type ErrorStatusPageProps = {
  lang: 'en' | 'ar'
  status: ErrorStatus
  path?: string
}

type ErrorCopy = {
  badge: string
  title: string
  description: string
  hint: string
  home: string
  account: string
  support: string
  pathLabel: string
}

const SUPPORT_MAIL = 'support@saturnws.com'

function getCopy(lang: 'en' | 'ar', status: ErrorStatus): ErrorCopy {
  const ar: Record<ErrorStatus, ErrorCopy> = {
    403: {
      badge: '403',
      title: 'الوصول إلى هذه الصفحة غير متاح',
      description: 'هذه الصفحة أو هذه المنطقة مخصصة لحسابات مصرح لها فقط.',
      hint: 'إذا كنت تتوقع أن يكون لديك صلاحية، سجّل الدخول بنفس حسابك أو تواصل مع الدعم.',
      home: 'العودة للرئيسية',
      account: 'صفحة الحساب',
      support: 'التواصل مع الدعم',
      pathLabel: 'المسار المطلوب',
    },
    404: {
      badge: '404',
      title: 'الصفحة غير موجودة',
      description: 'الرابط الذي فتحته لا يطابق أي صفحة حالية داخل Saturn Workspace.',
      hint: 'راجع كتابة الرابط أو ارجع إلى الصفحة الرئيسية أو صفحة الحساب.',
      home: 'العودة للرئيسية',
      account: 'صفحة الحساب',
      support: 'التواصل مع الدعم',
      pathLabel: 'المسار المطلوب',
    },
    429: {
      badge: '429',
      title: 'طلبات كثيرة جدًا',
      description: 'تم تنفيذ عدد كبير من الطلبات في وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
      hint: 'إذا تكرر ذلك باستمرار، تواصل مع الدعم واذكر ما كنت تفعله قبل ظهور الخطأ.',
      home: 'العودة للرئيسية',
      account: 'صفحة الحساب',
      support: 'التواصل مع الدعم',
      pathLabel: 'المسار المطلوب',
    },
    500: {
      badge: '500',
      title: 'حدث خطأ داخلي',
      description: 'حصل خطأ غير متوقع أثناء تجهيز هذه الصفحة.',
      hint: 'جرّب إعادة تحميل الصفحة. وإذا استمر الخطأ، أرسل تفاصيله إلى الدعم.',
      home: 'العودة للرئيسية',
      account: 'صفحة الحساب',
      support: 'التواصل مع الدعم',
      pathLabel: 'المسار المطلوب',
    },
    503: {
      badge: '503',
      title: 'الخدمة غير متاحة مؤقتًا',
      description: 'هذه الصفحة أو هذه الخدمة غير متاحة الآن، غالبًا بسبب صيانة أو تحديث.',
      hint: 'انتظر قليلًا ثم أعد المحاولة لاحقًا.',
      home: 'العودة للرئيسية',
      account: 'صفحة الحساب',
      support: 'التواصل مع الدعم',
      pathLabel: 'المسار المطلوب',
    },
  }

  const en: Record<ErrorStatus, ErrorCopy> = {
    403: {
      badge: '403',
      title: 'Access to this page is restricted',
      description: 'This page or area is limited to authorized accounts only.',
      hint: 'If you expected access, sign in with your account or contact support.',
      home: 'Back to home',
      account: 'Open account page',
      support: 'Contact support',
      pathLabel: 'Requested path',
    },
    404: {
      badge: '404',
      title: 'Page not found',
      description: 'The address you opened does not match any current Saturn Workspace page.',
      hint: 'Check the address or return to the home page or account page.',
      home: 'Back to home',
      account: 'Open account page',
      support: 'Contact support',
      pathLabel: 'Requested path',
    },
    429: {
      badge: '429',
      title: 'Too many requests',
      description: 'Too many requests were made in a short period. Wait a moment, then try again.',
      hint: 'If this keeps happening, contact support and mention what you were doing before the error appeared.',
      home: 'Back to home',
      account: 'Open account page',
      support: 'Contact support',
      pathLabel: 'Requested path',
    },
    500: {
      badge: '500',
      title: 'Something went wrong',
      description: 'An unexpected error happened while preparing this page.',
      hint: 'Try refreshing the page. If the error continues, send the details to support.',
      home: 'Back to home',
      account: 'Open account page',
      support: 'Contact support',
      pathLabel: 'Requested path',
    },
    503: {
      badge: '503',
      title: 'Service temporarily unavailable',
      description: 'This page or service is unavailable right now, usually because of maintenance or an update.',
      hint: 'Wait a little, then try again later.',
      home: 'Back to home',
      account: 'Open account page',
      support: 'Contact support',
      pathLabel: 'Requested path',
    },
  }

  return lang === 'ar' ? ar[status] : en[status]
}

export function ErrorStatusPage({ lang, status, path }: ErrorStatusPageProps) {
  const isAr = lang === 'ar'
  const copy = useMemo(() => getCopy(lang, status), [lang, status])
  const pageTitle = `Saturn Workspace | ${copy.badge} ${copy.title}`
  const safePath = path && path !== '/' ? path : ''

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-6xl items-center px-5 py-12">
      <section className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-sm font-semibold tracking-[0.28em] text-white/35">{copy.badge}</div>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">{copy.title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-white/72 sm:text-lg">{copy.description}</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/52">{copy.hint}</p>

          {safePath ? (
            <div className="mx-auto mt-6 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65">
              <span className="font-semibold text-white/50">{copy.pathLabel}</span>
              <code className="max-w-[60vw] truncate text-white/80" dir="ltr">
                {safePath}
              </code>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <a className="btn-primary inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold" href="/">
              {copy.home}
            </a>
            <a
              className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
              href="/account"
            >
              {copy.account}
            </a>
            <a
              className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
              href={`mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(`Saturn Workspace ${status}`)}`}
            >
              {copy.support}
            </a>
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius)] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/60">
            <div className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 ${isAr ? 'sm:flex-row-reverse' : ''}`}>
              <a className="hover:text-white" href="/release-notes/">
                Release Notes
              </a>
              <a className="hover:text-white" href="/privacy/">
                Privacy
              </a>
              <a className="hover:text-white" href="/terms/">
                Terms
              </a>
              <a className="hover:text-white" href="/refund/">
                Refund
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
