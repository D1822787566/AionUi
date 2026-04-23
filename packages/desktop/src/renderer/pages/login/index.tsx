/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import loginLogo from '@renderer/assets/logos/brand/app.png';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '../../hooks/context/AuthContext';
import './LoginPage.css';

type LoginPhase = 'idle' | 'verifying' | 'entering';

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login } = useAuth();

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoginPhase>('idle');

  const accountRef = useRef<HTMLInputElement | null>(null);
  const accountInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const loading = phase !== 'idle';

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    window.setTimeout(() => {
      accountRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate('/guid', { replace: true });
    }
  }, [navigate, status]);

  const supportedLanguages = useMemo<{ code: string; label: string }[]>(
    () => [
      { code: 'zh-CN', label: '简体中文' },
      { code: 'zh-TW', label: '繁體中文' },
      { code: 'ja-JP', label: '日本語' },
      { code: 'ko-KR', label: '한국어' },
      { code: 'tr-TR', label: 'Türkçe' },
      { code: 'uk-UA', label: 'Українська' },
      { code: 'pt-BR', label: 'Português (BR)' },
      { code: 'de-DE', label: 'Deutsch' },
      { code: 'es-ES', label: 'Español' },
      { code: 'fa-IR', label: 'فارسی' },
      { code: 'en-US', label: 'English' },
    ],
    []
  );

  const handleLanguageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;
    changeLanguage(nextLanguage).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  /**
   * Missing-field errors point at the field that is missing instead of one
   * generic message, and keep everything the user already typed.
   */
  const validate = useCallback((): string | null => {
    if (!account.trim()) {
      accountInputRef.current?.focus();
      return t('login.errors.accountRequired');
    }
    if (!password) {
      passwordInputRef.current?.focus();
      return t('login.errors.passwordRequired');
    }
    return null;
  }, [account, password, t]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (loading) return;

      const validationError = validate();
      if (validationError) {
        setErrorText(validationError);
        return;
      }

      setErrorText(null);
      setPhase('verifying');

      const result = await login({ username: account.trim(), password, remember: true });

      if (result.success) {
        setPhase('entering');
        return;
      }

      setPhase('idle');
      setErrorText(
        (() => {
          switch (result.code) {
            case 'invalidCredentials':
              return t('login.errors.invalidCredentials');
            case 'networkError':
              return t('login.errors.networkError');
            case 'adapterUnavailable':
              return t('login.errors.adapterUnavailable');
            case 'credentialsRequired':
              return t('login.errors.credentialsRequired');
            case 'unknown':
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })()
      );
    },
    [account, loading, login, password, t, validate]
  );

  if (status === 'checking') {
    return <AppLoader />;
  }

  const phaseLabel =
    phase === 'verifying' ? t('login.progressVerify') : phase === 'entering' ? t('login.progressEnter') : '';

  return (
    <div className='login-page'>
      <div className='login-page__card'>
        <div className='login-page__top'>
          <div className='login-page__brand'>
            <img className='login-page__logo' src={loginLogo} alt='' aria-hidden='true' />
            <div className='login-page__brand-text'>
              <b>{t('login.brand')}</b>
              <span>{t('login.brandSubtitle')}</span>
            </div>
          </div>
          <label className='login-page__lang' htmlFor='login-lang-select'>
            <span className='login-page__sr-only'>{t('login.languageLabel')}</span>
            <select
              id='login-lang-select'
              className='login-page__lang-select'
              value={i18n.language}
              onChange={handleLanguageChange}
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h1 className='login-page__title'>{t('login.title')}</h1>
        <p className='login-page__subtitle'>{t('login.description')}</p>

        <form className='login-page__form' onSubmit={handleSubmit} noValidate>
          <div className='login-page__field'>
            <label className='login-page__label' htmlFor='login-account'>
              {t('login.account')}
            </label>
            <input
              ref={(node) => {
                accountRef.current = node;
                accountInputRef.current = node;
              }}
              id='login-account'
              name='account'
              className='login-page__input'
              type='text'
              autoComplete='username'
              placeholder={t('login.accountPlaceholder')}
              value={account}
              disabled={loading}
              aria-invalid={errorText ? true : undefined}
              onChange={(event) => setAccount(event.target.value)}
            />
          </div>

          <div className='login-page__field'>
            <label className='login-page__label' htmlFor='login-password'>
              {t('login.password')}
            </label>
            <div className='login-page__password'>
              <input
                ref={passwordInputRef}
                id='login-password'
                name='password'
                className='login-page__input login-page__input--password'
                type={passwordVisible ? 'text' : 'password'}
                autoComplete='current-password'
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                disabled={loading}
                aria-invalid={errorText ? true : undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type='button'
                className='login-page__reveal'
                onClick={() => setPasswordVisible((prev) => !prev)}
                aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
              >
                {passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
              </button>
            </div>
          </div>

          <div
            role='alert'
            aria-live='polite'
            className={`login-page__message ${errorText ? 'login-page__message--visible' : ''}`}
            hidden={!errorText}
          >
            {errorText}
          </div>

          <button type='submit' className='login-page__submit' disabled={loading}>
            {loading && <span className='login-page__spinner' aria-hidden='true' />}
            <span>{loading ? t('login.submitting') : t('login.submit')}</span>
          </button>

          {loading && (
            <div className='login-page__progress'>
              <div className='login-page__progress-bar'>
                <i className='login-page__progress-step login-page__progress-step--done' />
                <i
                  className={`login-page__progress-step ${
                    phase === 'verifying' ? 'login-page__progress-step--active' : ''
                  } ${phase === 'entering' ? 'login-page__progress-step--done' : ''}`}
                />
              </div>
              <span className='login-page__progress-label'>{phaseLabel}</span>
            </div>
          )}
        </form>

        <div className='login-page__footer'>
          <p>
            <b>{t('login.keepSignedInTitle')}</b>
            {t('login.keepSignedInBody')}
          </p>
          <p>{t('login.credentialNote')}</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
