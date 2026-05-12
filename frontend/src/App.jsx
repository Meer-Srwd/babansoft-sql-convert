import { useEffect, useState } from 'react';
import {
  deleteAccount as deleteAccountRequest,
  getAccount as getAccountRequest,
  loginAccount as loginAccountRequest,
  logoutAccount as logoutAccountRequest,
  requestAccountPasswordReset as requestAccountPasswordResetRequest,
  refreshAccountSession as refreshAccountSessionRequest,
  registerAccount as registerAccountRequest,
  resendAccountConfirmation as resendAccountConfirmationRequest,
  resetAccountPassword as resetAccountPasswordRequest,
  updateAccountProfile as updateAccountProfileRequest,
  updateAccountSettings as updateAccountSettingsRequest
} from './api/account.js';
import { convertSql } from './api/convertSql.js';
import { submitFeedback as submitFeedbackRequest } from './api/feedback.js';
import { languageOptions, rtlLanguages, translations } from './data/i18n.js';
import { sampleQueries } from './data/sampleQueries.js';

const FROM_DB = 'postgresql';
const TO_DB = 'sqlserver';
const BRAND_LOGO = '/BabanSoft_Logo.jpeg';
const SITE_URL = 'https://sqlconvert.babansoft.com';

const viewPaths = {
  home: '/',
  converter: '/converter',
  contact: '/contact',
  account: '/account'
};

const seoPages = {
  home: {
    title: 'SQL Converter and Migration Tool | BabanSoft SQL Convert',
    description:
      'BabanSoft SQL Convert is a SQL converter and migration platform for database teams. PostgreSQL to SQL Server is available now while broader SQL conversion routes are being prepared.',
    path: '/',
    robots: 'index, follow'
  },
  converter: {
    title: 'Online SQL Converter | BabanSoft SQL Convert',
    description:
      'Use BabanSoft SQL Convert as a browser-based SQL converter and migration tool. The live route currently converts PostgreSQL SQL to SQL Server while broader SQL paths are being prepared.',
    path: '/converter',
    robots: 'index, follow'
  },
  contact: {
    title: 'SQL Conversion Support and Feedback | BabanSoft SQL Convert',
    description:
      'Contact BabanSoft for SQL conversion support, migration questions, product feedback, and beta issue reports while the broader platform is being expanded.',
    path: '/contact',
    robots: 'index, follow'
  },
  account: {
    title: 'Account | BabanSoft SQL Convert',
    description: 'Sign in to manage your BabanSoft SQL Convert account, profile, and saved interface preferences.',
    path: '/account',
    robots: 'noindex, nofollow'
  }
};

const authSessionStorageKey = 'babanSoftAuthSession';
const uiPreferencesStorageKey = 'babanSoftUiPreferences';

const baseNavigationItems = [
  { id: 'home', labelKey: 'navHome' },
  { id: 'converter', labelKey: 'navConverter' },
  { id: 'contact', labelKey: 'navContact' }
];

const themeOptions = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' }
];

function createEmptyAuthForm() {
  return {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  };
}

function createEmptyPasswordResetForm() {
  return {
    password: '',
    confirmPassword: ''
  };
}

function createEmptyFeedbackForm() {
  return {
    fullName: '',
    email: '',
    category: 'general',
    message: ''
  };
}

function formatMessage(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? '');
}

function readStoredSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawSession = window.localStorage.getItem(authSessionStorageKey);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession);

    if (!parsedSession?.token) {
      return null;
    }

    return {
      token: parsedSession.token,
      refreshToken: String(parsedSession.refreshToken ?? '')
    };
  } catch (_error) {
    return null;
  }
}

function readStoredPreferences() {
  if (typeof window === 'undefined') {
    return {
      theme: 'light',
      language: 'en'
    };
  }

  const rawPreferences = window.localStorage.getItem(uiPreferencesStorageKey);

  if (!rawPreferences) {
    return {
      theme: 'light',
      language: 'en'
    };
  }

  try {
    const parsedPreferences = JSON.parse(rawPreferences);
    const hasLanguage = languageOptions.some((option) => option.code === parsedPreferences.language);

    return {
      theme: parsedPreferences.theme === 'dark' ? 'dark' : 'light',
      language: hasLanguage ? parsedPreferences.language : 'en'
    };
  } catch (_error) {
    return {
      theme: 'light',
      language: 'en'
    };
  }
}

function readAuthRedirectState() {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  const authState = url.searchParams.get('auth') ?? '';
  const hashValue = url.hash.startsWith('#') ? url.hash.slice(1) : '';

  if (!authState && !hashValue) {
    return null;
  }

  const hashParams = new URLSearchParams(hashValue);

  return {
    authState,
    token: String(hashParams.get('access_token') ?? '').trim(),
    refreshToken: String(hashParams.get('refresh_token') ?? '').trim(),
    error: String(hashParams.get('error_description') ?? hashParams.get('error') ?? '').trim()
  };
}

function clearAuthRedirectState() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.hash = '';
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function formatDate(dateValue, languageCode) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  try {
    const locale = languageCode === 'ku' ? 'tr' : languageCode === 'ckb' ? 'ar-IQ' : languageCode;

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium'
    }).format(date);
  } catch (_error) {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  }
}

function normalizeAppPathname(pathname = '/') {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}

function getViewFromPath(pathname) {
  switch (normalizeAppPathname(pathname)) {
    case '/converter':
      return 'converter';
    case '/contact':
      return 'contact';
    case '/account':
      return 'account';
    default:
      return 'home';
  }
}

function getPathForView(viewId) {
  return viewPaths[viewId] ?? viewPaths.home;
}

function readInitialView() {
  if (typeof window === 'undefined') {
    return 'home';
  }

  return getViewFromPath(window.location.pathname);
}

function upsertMetaTag(attribute, key, content) {
  if (typeof document === 'undefined') {
    return;
  }

  let metaTag = document.head.querySelector(`meta[${attribute}="${key}"]`);

  if (!metaTag) {
    metaTag = document.createElement('meta');
    metaTag.setAttribute(attribute, key);
    document.head.appendChild(metaTag);
  }

  metaTag.setAttribute('content', content);
}

function upsertCanonicalLink(href) {
  if (typeof document === 'undefined') {
    return;
  }

  let canonicalLink = document.head.querySelector('link[rel="canonical"]');

  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalLink);
  }

  canonicalLink.setAttribute('href', href);
}

export default function App() {
  const [activeView, setActiveView] = useState(readInitialView);
  const [query, setQuery] = useState('');
  const [targetDatabaseName, setTargetDatabaseName] = useState('');
  const [convertedQuery, setConvertedQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const [authSession, setAuthSession] = useState(() => readStoredSession());
  const [account, setAccount] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(() => Boolean(readStoredSession()?.token));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(createEmptyAuthForm);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [passwordResetForm, setPasswordResetForm] = useState(createEmptyPasswordResetForm);
  const [passwordResetSession, setPasswordResetSession] = useState(null);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: '', email: '' });
  const [settingsForm, setSettingsForm] = useState(() => readStoredPreferences());
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [isAccountDeleting, setIsAccountDeleting] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');
  const [feedbackForm, setFeedbackForm] = useState(createEmptyFeedbackForm);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [isFeedbackSending, setIsFeedbackSending] = useState(false);

  const activeSamples = sampleQueries[FROM_DB];
  const currentLanguage = settingsForm.language || account?.settings?.language || 'en';
  const currentTheme = settingsForm.theme || account?.settings?.theme || 'light';
  const translationSet = translations[currentLanguage] ?? {};
  const trimmedTargetDatabaseName = targetDatabaseName.trim();
  const showsSqlServerInsertNote = /\binsert\s+into\b/i.test(query);
  const outputLineCount = convertedQuery ? convertedQuery.split(/\r?\n/).length : 0;
  const showsLargeOutputNote = convertedQuery.length > 1400 || outputLineCount > 20;
  const navigationItems = account
    ? [...baseNavigationItems, { id: 'account', labelKey: 'navAccount' }]
    : baseNavigationItems;
  const trustHighlights = [
    {
      title: t('highlightFocusedTitle'),
      body: t('highlightFocusedBody')
    },
    {
      title: t('highlightPracticalTitle'),
      body: t('highlightPracticalBody')
    }
  ];
  const workflowSteps = [
    {
      number: '01',
      title: t('stepOneTitle'),
      body: t('stepOneBody')
    },
    {
      number: '02',
      title: t('stepTwoTitle'),
      body: t('stepTwoBody')
    },
    {
      number: '03',
      title: t('stepThreeTitle'),
      body: t('stepThreeBody')
    }
  ];
  const contactCards = [
    {
      label: t('salesEmailLabel'),
      value: t('salesEmailValue'),
      note: t('salesEmailNote')
    },
    {
      label: t('phoneLabel'),
      value: t('phoneValue'),
      note: t('phoneNote')
    },
    {
      label: t('addressLabel'),
      value: t('addressValue'),
      note: t('addressNote')
    },
    {
      label: t('hoursLabel'),
      value: t('hoursValue'),
      note: t('hoursNote')
    }
  ];
  const accountButtonLabel = account ? account.fullName.split(' ')[0] : t('headerLogin');
  const memberSinceText = account?.createdAt
    ? t('memberSince', { date: formatDate(account.createdAt, currentLanguage) })
    : '';

  function t(key, values) {
    const template = translationSet[key] ?? translations.en[key] ?? key;
    return formatMessage(template, values);
  }

  async function refreshSession(currentSession) {
    if (!currentSession?.refreshToken) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const result = await refreshAccountSessionRequest({
      refreshToken: currentSession.refreshToken
    });
    const nextSession = {
      token: result.token,
      refreshToken: result.refreshToken || currentSession.refreshToken
    };

    setAuthSession(nextSession);

    if (result.account) {
      setAccount(result.account);
    }

    return nextSession;
  }

  async function runWithSessionRetry(requestHandler) {
    if (!authSession?.token) {
      throw new Error('Authentication is required.');
    }

    try {
      return await requestHandler(authSession.token);
    } catch (requestError) {
      if (!authSession.refreshToken) {
        throw requestError;
      }

      if (!/session|expired|authentication is required/i.test(requestError.message)) {
        throw requestError;
      }

      const nextSession = await refreshSession(authSession);
      return requestHandler(nextSession.token);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (authSession?.token) {
      window.localStorage.setItem(authSessionStorageKey, JSON.stringify(authSession));
      return;
    }

    window.localStorage.removeItem(authSessionStorageKey);
  }, [authSession]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      uiPreferencesStorageKey,
      JSON.stringify({
        theme: settingsForm.theme || 'light',
        language: settingsForm.language || 'en'
      })
    );
  }, [settingsForm.language, settingsForm.theme]);

  useEffect(() => {
    let isCancelled = false;

    if (!authSession?.token) {
      setAccount(null);
      setIsSessionLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsSessionLoading(true);

    (async () => {
      try {
        const result = await getAccountRequest(authSession.token);

        if (!isCancelled) {
          setAccount(result.account);
        }
      } catch (requestError) {
        if (isCancelled) {
          return;
        }

        try {
          const nextSession = await refreshSession(authSession);
          const result = await getAccountRequest(nextSession.token);

          if (!isCancelled) {
            setAccount(result.account);
          }
        } catch (refreshError) {
          if (isCancelled) {
            return;
          }

          setAuthSession(null);
          setAccount(null);
          setAuthError(refreshError.message);
        }
      } finally {
        if (!isCancelled) {
          setIsSessionLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [authSession]);

  useEffect(() => {
    if (!account) {
      return;
    }

    const storedPreferences = readStoredPreferences();

    setProfileForm({
      fullName: account.fullName,
      email: account.email
    });
    setSettingsForm({
      theme: storedPreferences.theme || account.settings?.theme || 'light',
      language: storedPreferences.language || account.settings?.language || 'en'
    });
  }, [account]);

  useEffect(() => {
    if (!account) {
      return;
    }

    setFeedbackForm((currentForm) => ({
      ...currentForm,
      fullName: currentForm.fullName || account.fullName,
      email: currentForm.email || account.email
    }));
  }, [account]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = rtlLanguages.includes(currentLanguage) ? 'rtl' : 'ltr';
  }, [currentLanguage, currentTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = normalizeAppPathname(window.location.pathname);

    if (getViewFromPath(currentPath) === 'home' && currentPath !== viewPaths.home) {
      window.history.replaceState({}, document.title, viewPaths.home);
    }

    function handlePopState() {
      setActiveView(getViewFromPath(window.location.pathname));
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const pageSeo = seoPages[activeView] ?? seoPages.home;
    const canonicalUrl = `${SITE_URL}${pageSeo.path === '/' ? '/' : pageSeo.path}`;

    document.title = pageSeo.title;
    upsertMetaTag('name', 'description', pageSeo.description);
    upsertMetaTag('name', 'robots', pageSeo.robots);
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag('property', 'og:site_name', 'BabanSoft SQL Convert');
    upsertMetaTag('property', 'og:title', pageSeo.title);
    upsertMetaTag('property', 'og:description', pageSeo.description);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', `${SITE_URL}/BabanSoft_L.png`);
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', pageSeo.title);
    upsertMetaTag('name', 'twitter:description', pageSeo.description);
    upsertMetaTag('name', 'twitter:image', `${SITE_URL}/BabanSoft_L.png`);
    upsertCanonicalLink(canonicalUrl);
  }, [activeView]);

  useEffect(() => {
    setAuthError('');
  }, [authMode]);

  useEffect(() => {
    const redirectState = readAuthRedirectState();

    if (!redirectState) {
      return;
    }

    clearAuthRedirectState();
  navigateTo('account', { replaceHistory: true, scrollBehavior: 'auto' });
    setAuthMode('login');
    setAuthError('');

    if (redirectState.error) {
      setPasswordResetSession(null);
      setPasswordResetForm(createEmptyPasswordResetForm());
      setAuthNotice('');
      setAuthError(
        redirectState.authState === 'reset-password' ? t('resetPasswordLinkInvalid') : t('confirmationLinkInvalid')
      );
      return;
    }

    if (redirectState.authState === 'reset-password') {
      if (!redirectState.token) {
        setAuthNotice('');
        setAuthError(t('resetPasswordLinkInvalid'));
        return;
      }

      setPasswordResetSession({
        token: redirectState.token,
        refreshToken: redirectState.refreshToken
      });
      setPasswordResetForm(createEmptyPasswordResetForm());
      setAuthNotice(t('resetPasswordReady'));
      return;
    }

    if (redirectState.authState === 'confirm') {
      setPasswordResetSession(null);
      setPasswordResetForm(createEmptyPasswordResetForm());

      if (redirectState.token) {
        setAuthSession({
          token: redirectState.token,
          refreshToken: redirectState.refreshToken
        });
      }

      setAuthNotice(t('emailConfirmedNotice'));
    }
  }, []);

  function navigateTo(viewId, options = {}) {
    const { replaceHistory = false, scrollBehavior = 'smooth' } = options;

    setActiveView(viewId);

    if (typeof window !== 'undefined') {
      const nextPath = getPathForView(viewId);

      if (normalizeAppPathname(window.location.pathname) !== nextPath) {
        if (replaceHistory) {
          window.history.replaceState({}, document.title, nextPath);
        } else {
          window.history.pushState({}, document.title, nextPath);
        }
      }

      window.scrollTo({ top: 0, behavior: scrollBehavior });
    }
  }

  async function handleConvert(event) {
    event.preventDefault();

    setIsLoading(true);
    setError('');
    setCopyState('idle');

    try {
      const result = await convertSql({
        query,
        fromDb: FROM_DB,
        toDb: TO_DB,
        targetDatabaseName
      });

      setConvertedQuery(result.convertedQuery);
    } catch (requestError) {
      setConvertedQuery('');
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyOutput() {
    if (!convertedQuery) {
      return;
    }

    try {
      await navigator.clipboard.writeText(convertedQuery);
      setCopyState('copied');
      window.setTimeout(() => {
        setCopyState('idle');
      }, 1800);
    } catch (_error) {
      setCopyState('unavailable');
    }
  }

  function handleTargetDatabaseNameChange(event) {
    setTargetDatabaseName(event.target.value);
    setConvertedQuery('');
    setError('');
    setCopyState('idle');
  }

  function handleSampleSelect(sampleQuery) {
    setQuery(sampleQuery);
    setConvertedQuery('');
    setError('');
    setCopyState('idle');
    navigateTo('converter');
  }

  function handleAuthFieldChange(event) {
    const { name, value } = event.target;

    setAuthForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  function handleAuthModeToggle(nextMode) {
    setAuthError('');
    setAuthNotice('');
    setAuthMode(nextMode);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (authMode === 'register' && authForm.password !== authForm.confirmPassword) {
      setAuthError(t('passwordMismatch'));
      return;
    }

    setIsAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const result =
        authMode === 'login'
          ? await loginAccountRequest({
              email: authForm.email,
              password: authForm.password
            })
          : await registerAccountRequest({
              fullName: authForm.fullName,
              email: authForm.email,
              password: authForm.password
            });

      if (authMode === 'register' && result.requiresEmailConfirmation) {
        setPasswordResetSession(null);
        setPasswordResetForm(createEmptyPasswordResetForm());
        setAuthMode('login');
        setAuthForm({
          fullName: '',
          email: authForm.email,
          password: '',
          confirmPassword: ''
        });
        setAuthNotice(result.message || t('authRegisterSuccess'));
        return;
      }

      setPasswordResetSession(null);
      setPasswordResetForm(createEmptyPasswordResetForm());
      setAccount(result.account);
      setAuthSession({
        token: result.token,
        refreshToken: result.refreshToken ?? ''
      });
      setAuthForm(createEmptyAuthForm());
      setAuthNotice(t(authMode === 'login' ? 'authLoginSuccess' : 'authRegisterSuccess'));
      navigateTo('account');
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleForgotPassword() {
    const email = authForm.email.trim();

    if (!email) {
      setAuthError(t('authEmailHelpMissing'));
      return;
    }

    setIsAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const result = await requestAccountPasswordResetRequest({ email });
      setAuthNotice(result.message);
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleResendConfirmation() {
    const email = authForm.email.trim();

    if (!email) {
      setAuthError(t('authEmailHelpMissing'));
      return;
    }

    setIsAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const result = await resendAccountConfirmationRequest({ email });
      setAuthNotice(result.message);
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsAuthLoading(false);
    }
  }

  function handlePasswordResetFieldChange(event) {
    const { name, value } = event.target;

    setPasswordResetForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
    setAuthError('');
  }

  async function handlePasswordResetSubmit(event) {
    event.preventDefault();

    if (!passwordResetSession?.token) {
      return;
    }

    if (passwordResetForm.password !== passwordResetForm.confirmPassword) {
      setAuthError(t('passwordMismatch'));
      return;
    }

    setIsPasswordResetLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const result = await resetAccountPasswordRequest(passwordResetSession.token, {
        password: passwordResetForm.password
      });

      setAuthSession({
        token: passwordResetSession.token,
        refreshToken: passwordResetSession.refreshToken ?? ''
      });

      if (result.account) {
        setAccount(result.account);
      }

      setPasswordResetSession(null);
      setPasswordResetForm(createEmptyPasswordResetForm());
      setAuthNotice(result.message);
      navigateTo('account');
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsPasswordResetLoading(false);
    }
  }

  function handleProfileFieldChange(event) {
    const { name, value } = event.target;

    setProfileForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();

    if (!authSession?.token) {
      return;
    }

    setIsProfileSaving(true);
    setProfileError('');
    setProfileNotice('');

    try {
      const result = await runWithSessionRetry((token) => updateAccountProfileRequest(token, profileForm));
      setAccount(result.account);
      setProfileNotice(t('profileSaved'));
    } catch (requestError) {
      setProfileError(requestError.message);
    } finally {
      setIsProfileSaving(false);
    }
  }

  function handleSettingsFieldChange(event) {
    const { name, value } = event.target;

    setSettingsForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
    setSettingsError('');
    setSettingsNotice('');
  }

  function handleFeedbackFieldChange(event) {
    const { name, value } = event.target;

    setFeedbackForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
    setFeedbackError('');
    setFeedbackNotice('');
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();

    if (!authSession?.token) {
      return;
    }

    setIsSettingsSaving(true);
    setSettingsError('');
    setSettingsNotice('');

    try {
      const result = await runWithSessionRetry((token) => updateAccountSettingsRequest(token, settingsForm));
      setAccount(result.account);
      setSettingsNotice(t('settingsSaved'));
    } catch (requestError) {
      if (/sorani|saved on this device|user_settings_language_check/i.test(requestError.message)) {
        setSettingsNotice(t('settingsLocalOnlyNotice'));
        return;
      }

      setSettingsError(requestError.message);
    } finally {
      setIsSettingsSaving(false);
    }
  }

  async function handleDeleteAccountSubmit(event) {
    event.preventDefault();

    if (!authSession?.token) {
      return;
    }

    if (deleteConfirmValue.trim().toUpperCase() !== 'DELETE') {
      setSecurityError(t('deleteAccountMismatch'));
      return;
    }

    setIsAccountDeleting(true);
    setSecurityError('');
    setAuthError('');
    setAuthNotice('');

    try {
      const result = await runWithSessionRetry((token) => deleteAccountRequest(token));

      setAuthSession(null);
      setAccount(null);
      navigateTo('account', { replaceHistory: true });
      setAuthMode('login');
      setAuthForm(createEmptyAuthForm());
      setPasswordResetSession(null);
      setPasswordResetForm(createEmptyPasswordResetForm());
      setProfileNotice('');
      setSettingsNotice('');
      setFeedbackError('');
      setFeedbackNotice('');
      setDeleteConfirmValue('');
      setAuthNotice(result.message);
    } catch (requestError) {
      setSecurityError(requestError.message);
    } finally {
      setIsAccountDeleting(false);
    }
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();

    setIsFeedbackSending(true);
    setFeedbackError('');
    setFeedbackNotice('');

    try {
      await submitFeedbackRequest(
        {
          ...feedbackForm,
          page: activeView
        },
        authSession?.token ?? ''
      );

      setFeedbackForm((currentForm) => ({
        ...currentForm,
        category: 'general',
        message: ''
      }));
      setFeedbackNotice(t('feedbackSuccess'));
    } catch (requestError) {
      setFeedbackError(requestError.message);
    } finally {
      setIsFeedbackSending(false);
    }
  }

  async function handleLogout() {
    if (authSession?.token) {
      try {
        await logoutAccountRequest(authSession.token);
      } catch (_error) {
        // Ignore logout failures and clear the local session anyway.
      }
    }

    setAuthSession(null);
    setAccount(null);
    setAuthMode('login');
    setAuthForm(createEmptyAuthForm());
    setAuthError('');
    setAuthNotice('');
    setPasswordResetSession(null);
    setPasswordResetForm(createEmptyPasswordResetForm());
    setProfileNotice('');
    setSettingsNotice('');
    setSecurityError('');
    setDeleteConfirmValue('');
    setFeedbackError('');
    setFeedbackNotice('');
    navigateTo('home', { replaceHistory: true });
  }

  function renderAuthView() {
    if (passwordResetSession) {
      return (
        <section className="page-view account-view">
          <section className="view-shell auth-shell">
            <div className="view-heading">
              <div>
                <p className="eyebrow">{t('authEyebrow')}</p>
                <h1>{t('resetPasswordTitle')}</h1>
                <p>{t('resetPasswordCopy')}</p>
              </div>
            </div>

            <div className="auth-layout">
              <aside className="auth-card auth-card-accent">
                <p className="panel-kicker">{t('authEyebrow')}</p>
                <h2>{t('resetPasswordTitle')}</h2>
                <p>{t('resetPasswordCopy')}</p>
              </aside>

              <form className="auth-card auth-form" onSubmit={handlePasswordResetSubmit}>
                <label className="form-field">
                  <span>{t('newPasswordLabel')}</span>
                  <input
                    name="password"
                    type="password"
                    value={passwordResetForm.password}
                    onChange={handlePasswordResetFieldChange}
                    autoComplete="new-password"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>{t('confirmPasswordLabel')}</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={passwordResetForm.confirmPassword}
                    onChange={handlePasswordResetFieldChange}
                    autoComplete="new-password"
                    required
                  />
                </label>

                {authError ? <p className="form-status is-error">{authError}</p> : null}
                {authNotice ? <p className="form-status is-success">{authNotice}</p> : null}

                <button className="primary-button" type="submit" disabled={isPasswordResetLoading}>
                  {t('resetPasswordAction')}
                </button>
              </form>
            </div>
          </section>
        </section>
      );
    }

    return (
      <section className="page-view account-view">
        <section className="view-shell auth-shell">
          <div className="view-heading">
            <div>
              <p className="eyebrow">{t('authEyebrow')}</p>
              <h1>{authMode === 'login' ? t('authLoginTitle') : t('authRegisterTitle')}</h1>
              <p>{t('authIntroCopy')}</p>
            </div>
          </div>

          <div className="auth-layout">
            <aside className="auth-card auth-card-accent">
              <p className="panel-kicker">{t('authEyebrow')}</p>
              <h2>{t('authIntroTitle')}</h2>
              <p>{t('authIntroCopy')}</p>

              <ul className="feature-list">
                <li>{t('authIntroFeatureOne')}</li>
                <li>{t('authIntroFeatureTwo')}</li>
                <li>{t('authIntroFeatureThree')}</li>
              </ul>
            </aside>

            <form className="auth-card auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'register' ? (
                <label className="form-field">
                  <span>{t('fullNameLabel')}</span>
                  <input
                    name="fullName"
                    type="text"
                    value={authForm.fullName}
                    onChange={handleAuthFieldChange}
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}

              <label className="form-field">
                <span>{t('emailLabel')}</span>
                <input
                  name="email"
                  type="email"
                  value={authForm.email}
                  onChange={handleAuthFieldChange}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="form-field">
                <span>{t('passwordLabel')}</span>
                <input
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthFieldChange}
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </label>

              {authMode === 'login' ? (
                <div className="auth-utility-row">
                  <button
                    className="auth-utility-button"
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isAuthLoading}
                  >
                    {t('forgotPasswordAction')}
                  </button>
                  <button
                    className="auth-utility-button"
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={isAuthLoading}
                  >
                    {t('resendConfirmationAction')}
                  </button>
                </div>
              ) : null}

              {authMode === 'register' ? (
                <label className="form-field">
                  <span>{t('confirmPasswordLabel')}</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={authForm.confirmPassword}
                    onChange={handleAuthFieldChange}
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : null}

              {authError ? <p className="form-status is-error">{authError}</p> : null}
              {authNotice ? <p className="form-status is-success">{authNotice}</p> : null}

              <button className="primary-button" type="submit" disabled={isAuthLoading}>
                {isAuthLoading
                  ? authMode === 'login'
                    ? t('signInAction')
                    : t('createAccountAction')
                  : authMode === 'login'
                    ? t('signInAction')
                    : t('createAccountAction')}
              </button>

              <p className="auth-switch">
                {authMode === 'login' ? t('switchToRegisterPrompt') : t('switchToLoginPrompt')}{' '}
                <button
                  className="auth-switch-button"
                  type="button"
                  onClick={() => handleAuthModeToggle(authMode === 'login' ? 'register' : 'login')}
                >
                  {authMode === 'login' ? t('switchToRegisterAction') : t('switchToLoginAction')}
                </button>
              </p>
            </form>
          </div>
        </section>
      </section>
    );
  }

  function renderAccountView() {
    if (!account) {
      return renderAuthView();
    }

    return (
      <section className="page-view account-view">
        <section className="view-shell account-shell">
          <div className="view-heading">
            <div>
              <p className="eyebrow">{t('authEyebrow')}</p>
              <h1>{t('accountTitle')}</h1>
              <p>{t('accountCopy')}</p>
            </div>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              {t('signOutAction')}
            </button>
          </div>

          {authNotice ? <p className="form-status is-success">{authNotice}</p> : null}

          <div className="account-layout">
            <aside className="account-summary-card">
              <p className="panel-kicker">{t('accountSummaryLabel')}</p>
              <h2>{account.fullName}</h2>
              <p>{account.email}</p>
              <p>{t('accountSignedIn')}</p>
              {memberSinceText ? <p>{memberSinceText}</p> : null}
            </aside>

            <section className="settings-card">
              <div className="settings-card-header">
                <div>
                  <p className="panel-kicker">{t('profileSectionTitle')}</p>
                  <h2>{t('profileSectionTitle')}</h2>
                </div>
                <p>{t('profileSectionCopy')}</p>
              </div>

              <form className="settings-form" onSubmit={handleProfileSubmit}>
                <div className="settings-grid">
                  <label className="form-field">
                    <span>{t('fullNameLabel')}</span>
                    <input
                      name="fullName"
                      type="text"
                      value={profileForm.fullName}
                      onChange={handleProfileFieldChange}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>{t('emailLabel')}</span>
                    <input
                      name="email"
                      type="email"
                      value={profileForm.email}
                      onChange={handleProfileFieldChange}
                      autoComplete="email"
                      required
                    />
                  </label>
                </div>

                {profileError ? <p className="form-status is-error">{profileError}</p> : null}
                {profileNotice ? <p className="form-status is-success">{profileNotice}</p> : null}

                <button className="primary-button" type="submit" disabled={isProfileSaving}>
                  {t('saveProfileAction')}
                </button>
              </form>
            </section>

            <section className="settings-card">
              <div className="settings-card-header">
                <div>
                  <p className="panel-kicker">{t('preferencesSectionTitle')}</p>
                  <h2>{t('preferencesSectionTitle')}</h2>
                </div>
                <p>{t('preferencesSectionCopy')}</p>
              </div>

              <form className="settings-form" onSubmit={handleSettingsSubmit}>
                <div className="settings-grid">
                  <label className="form-field">
                    <span>{t('themeLabel')}</span>
                    <select name="theme" value={settingsForm.theme} onChange={handleSettingsFieldChange}>
                      {themeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>{t('languageLabel')}</span>
                    <select
                      name="language"
                      value={settingsForm.language}
                      onChange={handleSettingsFieldChange}
                    >
                      {languageOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {settingsError ? <p className="form-status is-error">{settingsError}</p> : null}
                {settingsNotice ? <p className="form-status is-success">{settingsNotice}</p> : null}

                <button className="primary-button" type="submit" disabled={isSettingsSaving}>
                  {t('savePreferencesAction')}
                </button>
              </form>
            </section>

            <section className="settings-card security-card">
              <p className="panel-kicker">{t('securitySectionTitle')}</p>
              <h2>{t('securitySectionTitle')}</h2>
              <p>{t('securitySectionCopy')}</p>

              <div className="security-stack">
                <div className="security-panel">
                  <h3>{t('deleteAccountTitle')}</h3>
                  <p>{t('deleteAccountCopy')}</p>

                  <form className="delete-account-form" onSubmit={handleDeleteAccountSubmit}>
                    <label className="form-field confirm-delete-field">
                      <span>{t('deleteAccountConfirmLabel')}</span>
                      <input
                        type="text"
                        value={deleteConfirmValue}
                        onChange={(event) => {
                          setDeleteConfirmValue(event.target.value);
                          setSecurityError('');
                        }}
                        placeholder={t('deleteAccountConfirmPlaceholder')}
                        autoComplete="off"
                        required
                      />
                    </label>

                    {securityError ? <p className="form-status is-error">{securityError}</p> : null}

                    <button
                      className="danger-button"
                      type="submit"
                      disabled={isAccountDeleting || deleteConfirmValue.trim().toUpperCase() !== 'DELETE'}
                    >
                      {t('deleteAccountAction')}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>
    );
  }

  function renderHomeView() {
    return (
      <section className="page-view home-view">
        <section className="hero-grid hero-grid-simple">
          <article className="hero-card">
            <div className="hero-layout">
              <div className="hero-main">
                <p className="eyebrow">BabanSoft SQL Convert</p>
                <h1>{t('heroTitle')}</h1>
                <p className="hero-copy">{t('heroCopy')}</p>

                <div className="hero-actions">
                  <button className="primary-button" type="button" onClick={() => navigateTo('converter')}>
                    {t('heroOpenConverter')}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => navigateTo('contact')}>
                    {t('heroViewContact')}
                  </button>
                </div>
              </div>

              <aside className="hero-spotlight">
                <p className="hero-spotlight-label">{t('heroSpotlightLabel')}</p>
                <strong>PostgreSQL {'->'} SQL Server</strong>
                <p>{t('heroSpotlightText')}</p>

                <div className="hero-spotlight-list">
                  <span>{t('heroBadgeSchema')}</span>
                  <span>{t('heroBadgeTimestamps')}</span>
                  <span>{t('heroBadgeBatching')}</span>
                </div>
              </aside>
            </div>
          </article>
        </section>

        <section className="content-block content-block-simple">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('homeWhyLabel')}</p>
              <h2>{t('homeWhyTitle')}</h2>
            </div>
          </div>

          <div className="overview-grid overview-grid-simple">
            {trustHighlights.map((card) => (
              <article key={card.title} className="info-card">
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-block content-block-simple">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('homeStepsLabel')}</p>
              <h2>{t('homeStepsTitle')}</h2>
            </div>
          </div>

          <div className="steps-grid">
            {workflowSteps.map((step) => (
              <article key={step.number} className="step-card">
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    );
  }

  function renderConverterView() {
    return (
      <section className="page-view converter-view">
        <section className="view-shell view-shell-minimal">
          <div className="view-heading view-heading-minimal">
            <div>
              <p className="eyebrow">{t('converterEyebrow')}</p>
              <h1>{t('converterTitle')}</h1>
              <p>{t('converterCopy')}</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => navigateTo('home')}>
              {t('backHome')}
            </button>
          </div>

          <form className="workspace workspace-minimal" onSubmit={handleConvert}>
            <section className="panel panel-input panel-minimal">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">{t('inputLabel')}</p>
                  <h2>{t('sourceSqlTitle')}</h2>
                </div>
                <button className="primary-button" type="submit" disabled={isLoading || !query.trim()}>
                  {isLoading ? t('convertingAction') : t('convertAction')}
                </button>
              </div>

              <p className="minimal-route">{t('routeTitle')}</p>

              <label className="database-name-field">
                <span>{t('targetDatabaseLabel')}</span>
                <input
                  type="text"
                  value={targetDatabaseName}
                  onChange={handleTargetDatabaseNameChange}
                  placeholder={t('targetDatabasePlaceholder')}
                />
              </label>

              <div className="sample-row sample-row-compact">
                {activeSamples.map((sample) => (
                  <button
                    key={sample.label}
                    className="sample-chip"
                    onClick={() => handleSampleSelect(sample.query)}
                    type="button"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>

              <textarea
                className="query-field"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('pasteSqlPlaceholder')}
                spellCheck="false"
              />

              <div className="panel-footer panel-footer-minimal">
                {error ? (
                  <p className="error-message">{error}</p>
                ) : (
                  <p className="minimal-help">{t('pasteSqlHelp')}</p>
                )}
              </div>
            </section>

            <section className="panel panel-output panel-minimal">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">{t('outputLabel')}</p>
                  <h2>{t('outputTitle')}</h2>
                </div>
                <button
                  className="secondary-button"
                  onClick={handleCopyOutput}
                  type="button"
                  disabled={!convertedQuery}
                >
                  {copyState === 'copied'
                    ? t('copiedAction')
                    : copyState === 'unavailable'
                      ? t('clipboardUnavailable')
                      : t('copyOutputAction')}
                </button>
              </div>

              <p className="minimal-help minimal-output-help">
                {trimmedTargetDatabaseName
                  ? t('targetDatabaseNote', { name: trimmedTargetDatabaseName })
                  : showsSqlServerInsertNote
                    ? t('insertSafetyNote')
                    : t('outputDefaultNote')}
              </p>

              {showsLargeOutputNote ? (
                <p className="minimal-help minimal-output-help output-wrap-note">
                  {t('outputWrapNote')}
                </p>
              ) : null}

              <pre className={`output-field ${convertedQuery ? '' : 'is-placeholder'}`}>
                {convertedQuery || t('outputPlaceholder')}
              </pre>
            </section>
          </form>
        </section>
      </section>
    );
  }

  function renderContactView() {
    return (
      <section className="page-view contact-view">
        <section className="view-shell contact-shell">
          <div className="view-heading">
            <div>
              <p className="eyebrow">{t('contactEyebrow')}</p>
              <h1>{t('contactTitle')}</h1>
              <p>{t('contactCopy')}</p>
            </div>
            <button className="primary-button" type="button" onClick={() => navigateTo('converter')}>
              {t('goConverter')}
            </button>
          </div>

          <div className="contact-layout">
            <div className="contact-grid">
              {contactCards.map((contact) => (
                <article key={contact.label} className="contact-card">
                  <p className="panel-kicker">{contact.label}</p>
                  <h2>{contact.value}</h2>
                  <p>{contact.note}</p>
                </article>
              ))}
            </div>

            <form className="feedback-card" onSubmit={handleFeedbackSubmit}>
              <div className="settings-card-header">
                <div>
                  <p className="panel-kicker">{t('contactEyebrow')}</p>
                  <h2>{t('feedbackSectionTitle')}</h2>
                </div>
                <p>{t('feedbackSectionCopy')}</p>
              </div>

              <div className="feedback-grid">
                <label className="form-field">
                  <span>{t('feedbackNameLabel')}</span>
                  <input
                    name="fullName"
                    type="text"
                    value={feedbackForm.fullName}
                    onChange={handleFeedbackFieldChange}
                    autoComplete="name"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>{t('feedbackEmailLabel')}</span>
                  <input
                    name="email"
                    type="email"
                    value={feedbackForm.email}
                    onChange={handleFeedbackFieldChange}
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="form-field feedback-category-field">
                  <span>{t('feedbackCategoryLabel')}</span>
                  <select name="category" value={feedbackForm.category} onChange={handleFeedbackFieldChange}>
                    <option value="general">{t('feedbackCategoryGeneral')}</option>
                    <option value="bug">{t('feedbackCategoryBug')}</option>
                    <option value="feature">{t('feedbackCategoryFeature')}</option>
                    <option value="ux">{t('feedbackCategoryUx')}</option>
                    <option value="support">{t('feedbackCategorySupport')}</option>
                  </select>
                </label>
              </div>

              <label className="form-field feedback-message-field">
                <span>{t('feedbackMessageLabel')}</span>
                <textarea
                  name="message"
                  value={feedbackForm.message}
                  onChange={handleFeedbackFieldChange}
                  placeholder={t('feedbackMessagePlaceholder')}
                  rows="8"
                  minLength="12"
                  required
                />
              </label>

              {feedbackError ? <p className="form-status is-error">{feedbackError}</p> : null}
              {feedbackNotice ? <p className="form-status is-success">{feedbackNotice}</p> : null}

              <div className="feedback-form-footer">
                <p className="minimal-help">
                  {account ? t('feedbackSignedInHelp') : t('feedbackPublicHelp')}
                </p>

                <button className="primary-button" type="submit" disabled={isFeedbackSending}>
                  {isFeedbackSending ? t('feedbackSubmittingAction') : t('feedbackSubmitAction')}
                </button>
              </div>
            </form>
          </div>

          <div className="contact-note-box">
            <strong>{t('launchNoteTitle')}</strong>
            <p>{t('launchNoteBody')}</p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <div className="site-shell">
      <main className="site-frame">
        <header className="site-header">
          <button className="brand-lockup brand-button" type="button" onClick={() => navigateTo('home')}>
            <span className="brand-logo-frame">
              <img className="brand-logo" src={BRAND_LOGO} alt="BabanSoft logo" />
            </span>
            <span className="brand-copy">
              <strong className="brand-title">BabanSoft</strong>
              <span className="brand-subtitle">SQL Convert</span>
            </span>
            <span className="brand-beta-tag">BETA</span>
          </button>

          <nav className="site-nav" aria-label="Primary navigation">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                className={`nav-button ${activeView === item.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => navigateTo(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>

          <div className="header-tools">
            <div className="header-badge">
              <span>{t('headerAvailableNow')}</span>
              <strong>SQL conversion platform</strong>
            </div>

            <button className="header-login" type="button" onClick={() => navigateTo('account')}>
              {accountButtonLabel}
            </button>

            <button className="header-cta" type="button" onClick={() => navigateTo('converter')}>
              {t('headerStartConversion')}
            </button>
          </div>
        </header>

        {!authSession?.token ? (
          <section className="public-preferences-bar" aria-label={t('preferencesSectionTitle')}>
            <div className="public-preferences-copy">
              <p className="panel-kicker">{t('preferencesSectionTitle')}</p>
              <p>{t('preferencesSectionCopy')}</p>
            </div>

            <div className="public-preferences-controls">
              <label className="public-preferences-field">
                <span>{t('themeLabel')}</span>
                <select name="theme" value={settingsForm.theme} onChange={handleSettingsFieldChange}>
                  {themeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="public-preferences-field">
                <span>{t('languageLabel')}</span>
                <select name="language" value={settingsForm.language} onChange={handleSettingsFieldChange}>
                  {languageOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        ) : null}

        {activeView === 'home' ? renderHomeView() : null}
        {activeView === 'converter' ? renderConverterView() : null}
        {activeView === 'contact' ? renderContactView() : null}
        {activeView === 'account'
          ? isSessionLoading && authSession?.token
            ? (
              <section className="page-view account-view">
                <section className="view-shell auth-shell">
                  <p className="minimal-help">{t('loadingAccount')}</p>
                </section>
              </section>
            )
            : renderAccountView()
          : null}

        <footer className="site-footer">
          <div className="footer-brand">
            <span className="footer-logo-frame">
              <img className="footer-logo" src={BRAND_LOGO} alt="BabanSoft logo" />
            </span>
            <div className="footer-brand-copy">
              <strong>{t('footerTitle')}</strong>
              <p>{t('footerCopy')}</p>
            </div>
          </div>

          <div className="footer-grid">
            <section>
              <p className="footer-label">{t('footerCurrentFocus')}</p>
              <p>{t('footerCurrentFocusBody')}</p>
            </section>

            <section>
              <p className="footer-label">{t('footerContactPlaceholders')}</p>
              <ul className="footer-list">
                {contactCards.map((contact) => (
                  <li key={contact.label}>
                    <strong>{contact.label}:</strong> {contact.value}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="footer-label">{t('footerNavigate')}</p>
              <div className="footer-nav">
                {navigationItems.map((item) => (
                  <button
                    key={item.id}
                    className="footer-nav-button"
                    type="button"
                    onClick={() => navigateTo(item.id)}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </footer>
      </main>
    </div>
  );
}