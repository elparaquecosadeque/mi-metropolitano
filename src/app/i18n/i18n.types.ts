export type Lang = 'es' | 'en' | 'pt' | 'fr' | 'zh';

export interface LanguageOption {
  code: Lang;
  flag: string;
  name: string;
}

/** Order they appear in the language switcher. */
export const LANGUAGES: LanguageOption[] = [
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'zh', flag: '🇨🇳', name: '中文' },
];

/** BCP-47 tag used for Date#toLocaleString-style formatting in each language. */
export const LOCALE_TAG: Record<Lang, string> = {
  es: 'es-PE',
  en: 'en-US',
  pt: 'pt-BR',
  fr: 'fr-FR',
  zh: 'zh-CN',
};
