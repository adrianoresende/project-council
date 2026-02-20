import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';

function formatDateTime(value, locale) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function normalizePlan(value) {
  if (typeof value !== 'string') return 'free';
  return value.trim().toLowerCase() === 'pro' ? 'pro' : 'free';
}

export default function AdminPage() {
  const { language, t } = useI18n();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const payload = await api.getAdminUsers();
      setUsers(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError.message || t('admin.failedLoadUsers'));
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const first = String(a?.email || '').trim();
      const second = String(b?.email || '').trim();
      return first.localeCompare(second, language, { sensitivity: 'base' });
    });
  }, [users, language]);

  return (
    <div className="h-screen flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1100px] px-6 pb-12 pt-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[32px] text-slate-900">{t('admin.title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('admin.subtitle')}</p>
          </div>
          <button
            type="button"
            className="btn rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={loadUsers}
            disabled={isLoading}
          >
            {isLoading ? t('admin.refreshing') : t('admin.refresh')}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('admin.columns.email')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.columns.plan')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.columns.stripeCustomerId')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.columns.registrationDate')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.columns.lastLoginDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
                    {t('admin.loadingUsers')}
                  </td>
                </tr>
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
                    {t('admin.noUsers')}
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user, index) => {
                  const email = String(user?.email || '').trim() || '-';
                  const plan = normalizePlan(user?.plan);
                  const stripeCustomerId =
                    typeof user?.stripe_customer_id === 'string' && user.stripe_customer_id.trim()
                      ? user.stripe_customer_id.trim()
                      : typeof user?.stripe_payment_id === 'string' && user.stripe_payment_id.trim()
                        ? user.stripe_payment_id.trim()
                      : '-';

                  return (
                    <tr key={`${user?.user_id || email}-${user?.registration_date || 'none'}-${index}`}>
                      <td className="px-4 py-3 align-top font-medium text-slate-900">{email}</td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-bold ${
                            plan === 'pro'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-300 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {plan.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-slate-700">{stripeCustomerId}</td>
                      <td className="px-4 py-3 align-top text-slate-600">
                        {formatDateTime(user?.registration_date, language)}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600">
                        {formatDateTime(user?.last_login_date, language)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
