import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { AVAILABLE_LANGUAGES, useI18n } from '../../i18n';

function getBillingStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('billing');
}

function getBillingSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('session_id');
}

function formatLocalDateTime(value, locale) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatLocalDateOnly(value, locale) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: 'medium',
  }).format(parsed);
}

function addOneMonth(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const shifted = new Date(parsed);
  shifted.setMonth(shifted.getMonth() + 1);
  return shifted;
}

function normalizePlan(value) {
  if (typeof value !== 'string') return 'free';
  return value.trim().toLowerCase() === 'pro' ? 'pro' : 'free';
}

function getQuotaLabel(plan, amount, t) {
  if (plan === 'pro') {
    return amount === 1 ? t('account.tokenLeftOne') : t('account.tokenLeftMany');
  }
  return amount === 1 ? t('account.queryLeftOne') : t('account.queryLeftMany');
}

export default function AccountPage({ onGoToPricing }) {
  const { language, setLanguage, t } = useI18n();
  const [summary, setSummary] = useState(null);
  const [creditsLeft, setCreditsLeft] = useState(0);
  const [latestPayment, setLatestPayment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  const billingStatus = getBillingStatusFromUrl();
  const billingSessionId = getBillingSessionIdFromUrl();

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [summaryResult, creditsResult, paymentsResult] = await Promise.allSettled([
        api.getAccountSummary(),
        api.getCredits(),
        api.getAccountPayments(1),
      ]);

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        // Fallback: account summary endpoint might be unavailable on older backend.
        try {
          const currentUser = await api.getCurrentUser();
          const fallbackPlan = normalizePlan(
            currentUser?.user_metadata?.plan
              || currentUser?.app_metadata?.billing?.plan
              || currentUser?.app_metadata?.plan
              || 'free'
          );
          setSummary({
            email: currentUser?.email || '-',
            plan: fallbackPlan,
          });
        } catch {
          setSummary({ email: '-', plan: 'free' });
          setError(
            summaryResult.reason?.message
              || t('account.failedToLoadAccount')
          );
        }
      }

      if (creditsResult.status === 'fulfilled') {
        setCreditsLeft(creditsResult.value?.credits ?? 0);
      } else {
        setCreditsLeft(0);
      }

      if (paymentsResult.status === 'fulfilled') {
        const payments = paymentsResult.value;
        setLatestPayment(Array.isArray(payments) && payments.length > 0 ? payments[0] : null);
      } else {
        setLatestPayment(null);
      }
    } catch {
      setSummary({ email: '-', plan: 'free' });
      setCreditsLeft(0);
      setLatestPayment(null);
      setError(t('account.failedToLoadAccount'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const confirmCheckout = async () => {
      if (billingStatus !== 'success' || !billingSessionId) {
        return;
      }
      try {
        const result = await api.confirmCheckoutSession(billingSessionId);
        const normalizedPlan =
          String(result?.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
        setSummary((prev) => ({
          ...(prev || {}),
          plan: normalizedPlan,
        }));
        window.dispatchEvent(
          new CustomEvent('account-plan-updated', { detail: { plan: normalizedPlan } })
        );
        await loadSummary();
      } catch (confirmError) {
        setError(confirmError.message || t('pricing.failedConfirmPayment'));
      }
    };

    confirmCheckout();
  }, [billingSessionId, billingStatus, loadSummary, t]);

  const handleUpgrade = useCallback(async () => {
    if (!summary || summary.plan !== 'free') return;
    setIsCheckoutLoading(true);
    setError('');
    try {
      const successUrl = `${window.location.origin}/account?billing=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/account?billing=cancel`;

      const session = await api.createProCheckoutSession(
        successUrl,
        cancelUrl
      );
      if (!session?.checkout_url) {
        throw new Error(t('pricing.checkoutUrlMissing'));
      }
      window.location.assign(session.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError.message || t('account.failedStartUpgradeCheckout'));
      setIsCheckoutLoading(false);
    }
  }, [summary, t]);

  return (
    <div className="h-screen flex-1 overflow-y-auto bg-gradient-to-br from-blue-50 via-sky-50 to-teal-50">
      <div className="mx-auto my-10 w-[calc(100%-32px)] max-w-[720px] rounded-2xl border border-blue-100 bg-white px-6 py-7 shadow-[0_10px_28px_rgba(29,78,156,0.08)]">
        <h1 className="mb-5 text-3xl text-slate-900">{t('account.title')}</h1>

        {billingStatus === 'success' && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
            {t('account.paymentCompleted')}
          </div>
        )}
        {billingStatus === 'cancel' && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
            {t('account.paymentCancelled')}
          </div>
        )}
        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</div>}

        {isLoading ? (
          <div className="text-sm text-slate-500">{t('account.loadingAccount')}</div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="mb-1 text-xs text-slate-500">{t('account.emailLabel')}</div>
              <div className="text-[15px] font-semibold text-slate-900">{summary?.email || '-'}</div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">{t('account.planLabel')}</div>
                  <div className="text-[15px] font-semibold tracking-[0.4px] text-slate-900">
                    {(summary?.plan || 'free').toUpperCase()}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">
                    {summary?.plan === 'pro'
                      ? t('account.tokensLeftLabel')
                      : t('account.queriesLeftLabel')}
                  </div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {creditsLeft.toLocaleString(language)} {getQuotaLabel(summary?.plan || 'free', creditsLeft, t)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="mb-1 text-xs text-slate-500">{t('account.languageLabel')}</div>
              <div className="flex flex-col gap-2">
                <select
                  className="max-w-[240px] rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  aria-label={t('account.languageLabel')}
                >
                  {AVAILABLE_LANGUAGES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.nativeLabel}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{t('account.languageDescription')}</p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">{t('account.paymentDateLabel')}</div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {formatLocalDateTime(
                      latestPayment?.paid_at || latestPayment?.processed_at,
                      language
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">{t('account.nextPaymentLabel')}</div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {formatLocalDateOnly(
                      addOneMonth(latestPayment?.paid_at || latestPayment?.processed_at),
                      language
                    )}
                  </div>
                </div>
              </div>
            </div>

            {summary?.plan === 'free' && (
              <button
                type="button"
                className="btn mt-1.5 rounded-xl border-emerald-700 bg-gradient-to-b from-emerald-600 to-emerald-700 px-3.5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-95"
                onClick={handleUpgrade}
                disabled={isCheckoutLoading}
              >
                {isCheckoutLoading
                  ? t('account.redirectingButton')
                  : t('account.upgradeToProPrice')}
              </button>
            )}

            <button
              type="button"
              className="btn rounded-xl border-blue-200 bg-blue-100 px-3 py-2.5 text-left text-[13px] font-bold text-blue-800 hover:bg-blue-200"
              onClick={onGoToPricing}
            >
              {t('account.viewPlansButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
