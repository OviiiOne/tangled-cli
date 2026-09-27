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

const COMMON_WORDS = {
  es: new Set('el la los las de del que y en un una por para con no es se su al lo como más pero está este esta cuando hay sin'.split(' ')),
  en: new Set('the and to of a in is it for this that with on be not are as at when there without but from have'.split(' ')),
};

// Guesses whether a text is Spanish or English (tgl's two languages) by counting common
// words: "es", or "en" for anything else. Used to write public comments in the language
// of what they answer, not the user's.
export function textLanguage(text) {
  const score = { es: 0, en: 0 };
  for (const word of (text ?? '').toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (COMMON_WORDS.es.has(word)) score.es++;
    if (COMMON_WORDS.en.has(word)) score.en++;
  }
  if (/[ñ¿¡áéíóú]/i.test(text ?? '')) score.es++;
  return score.es > score.en ? 'es' : 'en';
}
