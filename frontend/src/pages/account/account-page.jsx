import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

function getBillingStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('billing');
}

function getBillingSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('session_id');
}

function formatLocalDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatLocalDateOnly(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
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

function getQuotaLabel(plan, amount) {
  if (plan === 'pro') {
    return amount === 1 ? 'token left' : 'tokens left';
  }
  return amount === 1 ? 'query left' : 'queries left';
}

export default function AccountPage({ onGoToPricing }) {
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
              || 'Failed to load account.'
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
      setError('Failed to load account.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        setError(confirmError.message || 'Failed to confirm payment session.');
      }
    };

    confirmCheckout();
  }, [billingSessionId, billingStatus, loadSummary]);

  const handleUpgrade = async () => {
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
        throw new Error('Checkout URL not returned.');
      }
      window.location.assign(session.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError.message || 'Failed to start upgrade checkout.');
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="h-screen flex-1 overflow-y-auto bg-gradient-to-br from-blue-50 via-sky-50 to-teal-50">
      <div className="mx-auto my-10 w-[calc(100%-32px)] max-w-[720px] rounded-2xl border border-blue-100 bg-white px-6 py-7 shadow-[0_10px_28px_rgba(29,78,156,0.08)]">
        <h1 className="mb-5 text-3xl text-slate-900">Account</h1>

        {billingStatus === 'success' && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
            Payment completed. Plan updates after Stripe confirmation.
          </div>
        )}
        {billingStatus === 'cancel' && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
            Payment canceled. You can try again.
          </div>
        )}
        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</div>}

        {isLoading ? (
          <div className="text-sm text-slate-500">Loading account...</div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="mb-1 text-xs text-slate-500">email</div>
              <div className="text-[15px] font-semibold text-slate-900">{summary?.email || '-'}</div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">plan</div>
                  <div className="text-[15px] font-semibold tracking-[0.4px] text-slate-900">
                    {(summary?.plan || 'free').toUpperCase()}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">
                    {summary?.plan === 'pro' ? 'tokens left' : 'queries left'}
                  </div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {creditsLeft.toLocaleString()} {getQuotaLabel(summary?.plan || 'free', creditsLeft)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">payment date</div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {formatLocalDateTime(latestPayment?.paid_at || latestPayment?.processed_at)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs text-slate-500">next payment</div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {formatLocalDateOnly(
                      addOneMonth(latestPayment?.paid_at || latestPayment?.processed_at)
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
                {isCheckoutLoading ? 'Redirecting...' : 'Upgrade to Pro (R$90)'}
              </button>
            )}

            <button
              type="button"
              className="btn rounded-xl border-blue-200 bg-blue-100 px-3 py-2.5 text-left text-[13px] font-bold text-blue-800 hover:bg-blue-200"
              onClick={onGoToPricing}
            >
              View plans on pricing page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
