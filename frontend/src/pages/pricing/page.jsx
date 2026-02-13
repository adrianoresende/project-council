import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import './page.css';

function getBillingStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('billing');
}

function getBillingSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('session_id');
}

function formatBRL(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PricingPage() {
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
        setError(loadError.message || 'Failed to load pricing configuration.');
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadBillingConfig();
  }, []);

  useEffect(() => {
    const loadAccountSummary = async () => {
      setIsLoadingPlan(true);
      try {
        const summary = await api.getAccountSummary();
        const plan = String(summary?.plan || 'free').trim().toLowerCase();
        setCurrentPlan(plan === 'pro' ? 'pro' : 'free');
      } catch (loadError) {
        setError(loadError.message || 'Failed to load account plan.');
      } finally {
        setIsLoadingPlan(false);
      }
    };

    loadAccountSummary();
  }, []);

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
        setError(confirmError.message || 'Failed to confirm payment session.');
      }
    };

    confirmCheckout();
  }, [billingSessionId, billingStatus]);

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
        throw new Error('Checkout URL not returned.');
      }

      window.location.assign(session.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError.message || 'Failed to start checkout.');
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="pricing-page">
      <div className="pricing-container">
        <h1 className="pricing-title">Pricing</h1>
        <p className="pricing-subtitle">Choose the plan that fits your usage.</p>

        {billingStatus === 'success' && (
          <div className="pricing-notice success">
            Payment completed. Your Pro access will be activated after Stripe confirmation.
          </div>
        )}
        {billingStatus === 'cancel' && (
          <div className="pricing-notice warning">
            Checkout was canceled. You can try again at any time.
          </div>
        )}
        {error && <div className="pricing-notice error">{error}</div>}

        <div className="pricing-grid">
          <div className="plan-card">
            <div className="plan-name">Free</div>
            <div className="plan-price">{formatBRL(0)}</div>
            <div className="plan-interval">forever</div>
            <ul className="plan-features">
              <li>Core council chat</li>
              <li>Conversation history</li>
              <li>Manual credit top-ups</li>
            </ul>
            <button type="button" className="plan-btn ghost" disabled>
              Current baseline
            </button>
          </div>

          <div className="plan-card featured">
            <div className="plan-badge">Pro</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">
              {formatBRL(proPlan?.price_brl ?? 90)}
            </div>
            <div className="plan-interval">per month</div>
            <ul className="plan-features">
              <li>Pro plan on Stripe</li>
              <li>Priority billing support path</li>
              <li>Streamlined checkout flow</li>
            </ul>
            <button
              type="button"
              className={`plan-btn ${isCurrentPro ? 'ghost' : 'primary'}`}
              disabled={checkoutDisabled}
              onClick={handleCheckout}
            >
              {isCurrentPro
                ? 'Current plan'
                : isCheckoutLoading
                  ? 'Redirecting...'
                  : 'Upgrade to Pro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
