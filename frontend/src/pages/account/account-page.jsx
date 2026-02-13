import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import './account-page.css';

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
      const [summaryData, creditsData, paymentsData] = await Promise.all([
        api.getAccountSummary(),
        api.getCredits(),
        api.getAccountPayments(1),
      ]);
      setSummary(summaryData);
      setCreditsLeft(creditsData?.credits ?? 0);
      setLatestPayment(Array.isArray(paymentsData) && paymentsData.length > 0 ? paymentsData[0] : null);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load account.');
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
    <div className="account-page">
      <div className="account-card">
        <h1 className="account-title">Account</h1>

        {billingStatus === 'success' && (
          <div className="account-notice success">
            Payment completed. Plan updates after Stripe confirmation.
          </div>
        )}
        {billingStatus === 'cancel' && (
          <div className="account-notice warning">
            Payment canceled. You can try again.
          </div>
        )}
        {error && <div className="account-notice error">{error}</div>}

        {isLoading ? (
          <div className="account-loading">Loading account...</div>
        ) : (
          <div className="account-content">
            <div className="account-row">
              <div className="account-label">email</div>
              <div className="account-value">{summary?.email || '-'}</div>
            </div>

            <div className="account-row account-row-split">
              <div className="account-cell">
                <div className="account-label">plan</div>
                <div className="account-value plan">
                  {(summary?.plan || 'free').toUpperCase()}
                </div>
              </div>
              <div className="account-cell">
                <div className="account-label">credits left</div>
                <div className="account-value">{creditsLeft}</div>
              </div>
            </div>

            <div className="account-row account-row-split">
              <div className="account-cell">
                <div className="account-label">payment date</div>
                <div className="account-value">
                  {formatLocalDateTime(latestPayment?.paid_at || latestPayment?.processed_at)}
                </div>
              </div>
              <div className="account-cell">
                <div className="account-label">next payment</div>
                <div className="account-value">
                  {formatLocalDateOnly(
                    addOneMonth(latestPayment?.paid_at || latestPayment?.processed_at)
                  )}
                </div>
              </div>
            </div>

            {summary?.plan === 'free' && (
              <button
                type="button"
                className="account-upgrade-btn"
                onClick={handleUpgrade}
                disabled={isCheckoutLoading}
              >
                {isCheckoutLoading ? 'Redirecting...' : 'Upgrade to Pro (R$90)'}
              </button>
            )}

            <button
              type="button"
              className="account-pricing-link"
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
