export const DEFAULT_THEME = 'light';
export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_THEMES = ['light', 'dark'];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ku', label: 'Kurdish (Kurmanji)' },
  { code: 'ckb', label: 'Kurdish (Sorani)' }
];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(({ code }) => code);

export function createDefaultSettings() {
  return {
    theme: DEFAULT_THEME,
    language: DEFAULT_LANGUAGE
  };
}