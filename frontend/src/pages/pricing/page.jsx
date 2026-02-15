import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';

function getBillingStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('billing');
}

function getBillingSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('session_id');
}

function formatBRL(value, locale) {
  return new Intl.NumberFormat(locale || undefined, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PricingPage() {
  const { language, t } = useI18n();
  const [billingConfig, setBillingConfig] = useState(null);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  const billingStatus = getBillingStatusFromUrl();
  const billingSessionId = getBillingSessionIdFromUrl();

  useEffect(() => {
    const loadBillingConfig = async () => {
      setIsLoadingConfig(true);
      setError('');
      try {
        const config = await api.getBillingConfig();
        setBillingConfig(config);
      } catch (loadError) {
        setError(loadError.message || t('pricing.failedLoadConfig'));
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadBillingConfig();
  }, [t]);

  useEffect(() => {
    const loadAccountSummary = async () => {
      setIsLoadingPlan(true);
      try {
        const summary = await api.getAccountSummary();
        const plan = String(summary?.plan || 'free').trim().toLowerCase();
        setCurrentPlan(plan === 'pro' ? 'pro' : 'free');
      } catch (loadError) {
        setError(loadError.message || t('pricing.failedLoadPlan'));
      } finally {
        setIsLoadingPlan(false);
      }
    };

    loadAccountSummary();
  }, [t]);

  useEffect(() => {
    const confirmCheckout = async () => {
      if (billingStatus !== 'success' || !billingSessionId) {
        return;
      }
      try {
        const result = await api.confirmCheckoutSession(billingSessionId);
        const plan = String(result?.plan || 'free').trim().toLowerCase();
        const normalizedPlan = plan === 'pro' ? 'pro' : 'free';
        setCurrentPlan(normalizedPlan);
        window.dispatchEvent(
          new CustomEvent('account-plan-updated', { detail: { plan: normalizedPlan } })
        );
      } catch (confirmError) {
        setError(confirmError.message || t('pricing.failedConfirmPayment'));
      }
    };

    confirmCheckout();
  }, [billingSessionId, billingStatus, t]);

  const proPlan = useMemo(() => {
    const plans = billingConfig?.plans || [];
    return plans.find((plan) => plan.id === 'pro') || null;
  }, [billingConfig]);

  const isCurrentPro = currentPlan === 'pro';

  const checkoutDisabled =
    isLoadingConfig ||
    isLoadingPlan ||
    isCheckoutLoading ||
    !billingConfig?.stripe_public_key ||
    !proPlan ||
    isCurrentPro;

  const handleCheckout = async () => {
    if (checkoutDisabled) return;
    setIsCheckoutLoading(true);
    setError('');
    try {
      const successUrl = `${window.location.origin}/pricing?billing=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/pricing?billing=cancel`;

      const session = await api.createProCheckoutSession(
        successUrl,
        cancelUrl
      );

      if (!session?.checkout_url) {
        throw new Error(t('pricing.checkoutUrlMissing'));
      }

      window.location.assign(session.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError.message || t('pricing.failedStartCheckout'));
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="h-screen flex-1 overflow-y-auto bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50">
      <div className="mx-auto max-w-[960px] px-6 pb-14 pt-10">
        <h1 className="text-[34px] text-slate-900">{t('pricing.title')}</h1>
        <p className="mb-6 mt-2 text-[15px] text-slate-600">{t('pricing.subtitle')}</p>

        {billingStatus === 'success' && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-800">
            {t('pricing.paymentCompleted')}
          </div>
        )}
        {billingStatus === 'cancel' && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
            {t('pricing.paymentCancelled')}
          </div>
        )}
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-800">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_20px_rgba(20,45,90,0.05)]">
            <div className="mb-2 text-sm text-slate-700">{t('pricing.freeName')}</div>
            <div className="text-[38px] leading-none font-extrabold text-slate-900">{formatBRL(0, language)}</div>
            <div className="mt-1.5 text-[13px] text-slate-500">{t('pricing.freeCycle')}</div>
            <ul className="my-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>{t('pricing.freeFeature1')}</li>
              <li>{t('pricing.freeFeature2')}</li>
              <li>{t('pricing.freeFeature3')}</li>
            </ul>
            <button
              type="button"
              className="btn w-full cursor-default rounded-xl border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600"
              disabled
            >
              {t('pricing.currentBaseline')}
            </button>
          </div>

          <div className="relative rounded-2xl border border-blue-300 bg-white p-6 shadow-[0_14px_28px_rgba(20,63,130,0.12)]">
            <div className="absolute right-3.5 top-3.5 rounded-full border border-blue-200 bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">
              {t('pricing.proBadge')}
            </div>
            <div className="mb-2 text-sm text-slate-700">{t('pricing.proName')}</div>
            <div className="text-[38px] leading-none font-extrabold text-slate-900">
              {formatBRL(proPlan?.price_brl ?? 90, language)}
            </div>
            <div className="mt-1.5 text-[13px] text-slate-500">{t('pricing.proCycle')}</div>
            <ul className="my-5 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>{t('pricing.proFeature1')}</li>
              <li>{t('pricing.proFeature2')}</li>
              <li>{t('pricing.proFeature3')}</li>
            </ul>
            <button
              type="button"
              className={`btn w-full rounded-xl px-3 py-2.5 text-sm font-bold ${
                isCurrentPro
                  ? 'cursor-default border-slate-300 bg-slate-50 text-slate-600'
                  : 'border-emerald-700 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white'
              } disabled:cursor-not-allowed disabled:opacity-65`}
              disabled={checkoutDisabled}
              onClick={handleCheckout}
            >
              {isCurrentPro
                ? t('pricing.currentPlan')
                : isCheckoutLoading
                  ? t('pricing.redirectingButton')
                  : t('pricing.upgradeToPro')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
