// Messages are written inline as t(english, spanish). English is the default;
// Spanish is used when the system language is Spanish. TGL_LANG=en|es overrides.
function detect() {
  const lang = process.env.TGL_LANG || Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  return /^es\b/i.test(lang) ? 'es' : 'en';
}

export const LANG = detect();

export function t(en, es) {
  return LANG === 'es' ? es : en;
}
