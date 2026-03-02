import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function normalizeStripeCustomerId(value) {
  if (typeof value !== 'string') return '-';
  const normalized = value.trim();
  return normalized || '-';
}

function normalizeModelList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function mergeUserIntoList(users, updatedUser) {
  if (!Array.isArray(users)) return [];
  if (!updatedUser || typeof updatedUser !== 'object') return users;

  const userId = typeof updatedUser.user_id === 'string' ? updatedUser.user_id.trim() : '';
  if (!userId) return users;

  let matched = false;
  const nextUsers = users.map((entry) => {
    const entryUserId = typeof entry?.user_id === 'string' ? entry.user_id.trim() : '';
    if (entryUserId !== userId) return entry;
    matched = true;
    return {
      ...entry,
      ...updatedUser,
      user_id: userId,
    };
  });

  return matched ? nextUsers : users;
}

function formatQuotaRenewedNotice(payload, t) {
  const credits = Number(payload?.credits);
  const hasCredits = Number.isFinite(credits) && credits >= 0;
  const unit = typeof payload?.unit === 'string' ? payload.unit.trim() : '';

  if (!hasCredits || !unit) {
    return t('admin.drawer.quotaRenewed');
  }

  return t('admin.drawer.quotaRenewedWithAmount', {
    credits,
    unit,
  });
}

export default function AdminPage() {
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [systemModels, setSystemModels] = useState(null);
  const [isSystemLoading, setIsSystemLoading] = useState(false);
  const [hasLoadedSystemModels, setHasLoadedSystemModels] = useState(false);
  const [systemError, setSystemError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [drawerNotice, setDrawerNotice] = useState('');
  const [drawerNoticeTone, setDrawerNoticeTone] = useState('success');
  const [planDraft, setPlanDraft] = useState('free');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isRenewingQuota, setIsRenewingQuota] = useState(false);
  const drawerRequestIdRef = useRef(0);

  const isDrawerOpen = selectedUserId.length > 0;

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

  const loadSystemModels = useCallback(async () => {
    setIsSystemLoading(true);
    setSystemError('');
    try {
      const payload = await api.getAdminSystemModels();
      setSystemModels({
        free_models: normalizeModelList(payload?.free_models),
        pro_models: normalizeModelList(payload?.pro_models),
      });
    } catch (loadError) {
      setSystemError(loadError.message || t('admin.system.failedLoad'));
    } finally {
      setHasLoadedSystemModels(true);
      setIsSystemLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== 'system') return;
    if (hasLoadedSystemModels) return;
    if (isSystemLoading) return;
    loadSystemModels();
  }, [activeTab, hasLoadedSystemModels, isSystemLoading, loadSystemModels]);

  const handleCloseDrawer = useCallback(() => {
    drawerRequestIdRef.current += 1;
    setSelectedUserId('');
    setSelectedUser(null);
    setIsDrawerLoading(false);
    setDrawerError('');
    setDrawerNotice('');
    setDrawerNoticeTone('success');
    setPlanDraft('free');
    setIsSavingPlan(false);
    setIsRenewingQuota(false);
  }, []);

  const handleSelectTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      if (tab !== 'users') {
        handleCloseDrawer();
      }
    },
    [handleCloseDrawer]
  );

  const handleOpenUserDrawer = useCallback(
    async (user) => {
      const normalizedUserId = typeof user?.user_id === 'string' ? user.user_id.trim() : '';
      if (!normalizedUserId) return;

      drawerRequestIdRef.current += 1;
      const requestId = drawerRequestIdRef.current;

      setSelectedUserId(normalizedUserId);
      setSelectedUser(user || null);
      setPlanDraft(normalizePlan(user?.plan));
      setDrawerError('');
      setDrawerNotice('');
      setDrawerNoticeTone('success');
      setIsDrawerLoading(true);

      try {
        const payload = await api.getAdminUser(normalizedUserId);
        if (drawerRequestIdRef.current !== requestId) return;

        if (payload && typeof payload === 'object') {
          setSelectedUser(payload);
          setPlanDraft(normalizePlan(payload.plan));
          setUsers((previousUsers) => mergeUserIntoList(previousUsers, payload));
        }
      } catch (loadError) {
        if (drawerRequestIdRef.current !== requestId) return;
        setDrawerError(loadError.message || t('admin.drawer.failedLoadUser'));
      } finally {
        if (drawerRequestIdRef.current === requestId) {
          setIsDrawerLoading(false);
        }
      }
    },
    [t]
  );

  const selectedPlan = normalizePlan(selectedUser?.plan);
  const hasPlanChanges = planDraft !== selectedPlan;

  const handleSavePlan = useCallback(async () => {
    if (!selectedUserId || !hasPlanChanges) return;

    const requestId = drawerRequestIdRef.current;
    setIsSavingPlan(true);
    setDrawerNotice('');

    try {
      const updatedUser = await api.updateAdminUserPlan(selectedUserId, planDraft);
      if (drawerRequestIdRef.current !== requestId) return;

      if (updatedUser && typeof updatedUser === 'object') {
        setSelectedUser(updatedUser);
        setPlanDraft(normalizePlan(updatedUser.plan));
        setUsers((previousUsers) => mergeUserIntoList(previousUsers, updatedUser));
      }

      setDrawerNoticeTone('success');
      setDrawerNotice(
        t('admin.drawer.planSavedSuccess', {
          plan: normalizePlan(updatedUser?.plan || planDraft).toUpperCase(),
        })
      );
    } catch (saveError) {
      if (drawerRequestIdRef.current !== requestId) return;
      setDrawerNoticeTone('error');
      setDrawerNotice(saveError.message || t('admin.drawer.failedSavePlan'));
    } finally {
      if (drawerRequestIdRef.current === requestId) {
        setIsSavingPlan(false);
      }
    }
  }, [selectedUserId, hasPlanChanges, planDraft, t]);

  const handleRenewQuota = useCallback(async () => {
    if (!selectedUserId) return;

    const requestId = drawerRequestIdRef.current;
    setIsRenewingQuota(true);
    setDrawerNotice('');

    try {
      const payload = await api.resetAdminUserQuota(selectedUserId);
      if (drawerRequestIdRef.current !== requestId) return;

      setDrawerNoticeTone('success');
      setDrawerNotice(formatQuotaRenewedNotice(payload, t));

      if (selectedUser) {
        const patchedUser = {
          ...selectedUser,
          plan: normalizePlan(payload?.plan || selectedUser.plan),
        };
        setSelectedUser(patchedUser);
        setPlanDraft(normalizePlan(patchedUser.plan));
        setUsers((previousUsers) => mergeUserIntoList(previousUsers, patchedUser));
      }
    } catch (renewError) {
      if (drawerRequestIdRef.current !== requestId) return;
      setDrawerNoticeTone('error');
      setDrawerNotice(renewError.message || t('admin.drawer.failedRenewQuota'));
    } finally {
      if (drawerRequestIdRef.current === requestId) {
        setIsRenewingQuota(false);
      }
    }
  }, [selectedUserId, selectedUser, t]);

  const drawerNoticeClass =
    drawerNoticeTone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  const renewButtonLabel = selectedPlan === 'pro' ? t('admin.drawer.renewTokens') : t('admin.drawer.renewQuota');
  const freePlanModels = normalizeModelList(systemModels?.free_models);
  const proPlanModels = normalizeModelList(systemModels?.pro_models);
  const isRefreshing = activeTab === 'users' ? isLoading : isSystemLoading;

  const handleRefresh = useCallback(() => {
    if (activeTab === 'system') {
      loadSystemModels();
      return;
    }
    loadUsers();
  }, [activeTab, loadSystemModels, loadUsers]);

  return (
    <div className="relative h-screen flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1100px] px-6 pb-12 pt-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[32px] text-slate-900">{t('admin.title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('admin.subtitle')}</p>
          </div>
          <button
            type="button"
            className="btn rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? t('admin.refreshing') : t('admin.refresh')}
          </button>
        </div>

        <div className="mb-4 border-b border-slate-200">
          <button
            type="button"
            className={`-mb-px border-b-2 px-1 pb-3 pt-1 text-sm font-semibold ${
              activeTab === 'users'
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            aria-current={activeTab === 'users' ? 'page' : undefined}
            onClick={() => handleSelectTab('users')}
          >
            {t('admin.tabs.users')}
          </button>
          <button
            type="button"
            className={`-mb-px ml-6 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold ${
              activeTab === 'system'
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            aria-current={activeTab === 'system' ? 'page' : undefined}
            onClick={() => handleSelectTab('system')}
          >
            {t('admin.tabs.system')}
          </button>
        </div>

        {activeTab === 'users' ? (
          <>
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
                      const userId = typeof user?.user_id === 'string' ? user.user_id.trim() : '';
                      const email = String(user?.email || '').trim() || '-';
                      const plan = normalizePlan(user?.plan);
                      const stripeCustomerId = normalizeStripeCustomerId(user?.stripe_customer_id);
                      const isSelected = Boolean(userId) && selectedUserId === userId;

                      return (
                        <tr
                          key={`${userId || email}-${user?.registration_date || 'none'}-${index}`}
                          className={`transition-colors ${
                            userId ? 'cursor-pointer hover:bg-slate-50 focus-within:bg-sky-50' : ''
                          } ${isSelected ? 'bg-sky-50' : ''}`}
                          role={userId ? 'button' : undefined}
                          tabIndex={userId ? 0 : undefined}
                          aria-label={userId ? t('admin.openUserDrawer', { email }) : undefined}
                          onClick={userId ? () => handleOpenUserDrawer(user) : undefined}
                          onKeyDown={
                            userId
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleOpenUserDrawer(user);
                                  }
                                }
                              : undefined
                          }
                        >
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
          </>
        ) : (
          <div className="space-y-4">
            {systemError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {systemError}
              </div>
            )}

            {isSystemLoading && !systemModels ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                {t('admin.system.loading')}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {t('admin.system.freeTitle')}
                  </h2>
                  {freePlanModels.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {freePlanModels.map((model, index) => (
                        <li
                          key={`${model}-${index}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                        >
                          {model}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{t('admin.system.noModels')}</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {t('admin.system.proTitle')}
                  </h2>
                  {proPlanModels.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {proPlanModels.map((model, index) => (
                        <li
                          key={`${model}-${index}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                        >
                          {model}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{t('admin.system.noModels')}</p>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-200 ${
            isDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={handleCloseDrawer}
          aria-label={t('common.close')}
          tabIndex={isDrawerOpen ? 0 : -1}
        />

        <aside
          className={`absolute left-0 top-0 flex h-full w-full max-w-md flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-hidden={!isDrawerOpen}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t('admin.drawer.title')}</h2>
              {selectedUser?.email && (
                <p className="mt-1 text-sm text-slate-600">{selectedUser.email}</p>
              )}
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              onClick={handleCloseDrawer}
            >
              {t('common.close')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {isDrawerLoading && (
              <p className="text-sm text-slate-600">{t('admin.drawer.loadingUser')}</p>
            )}

            {drawerError && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {drawerError}
              </div>
            )}

            {drawerNotice && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${drawerNoticeClass}`}>
                {drawerNotice}
              </div>
            )}

            {selectedUser && (
              <div className="space-y-5">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.columns.email')}
                    </dt>
                    <dd className="mt-1 text-slate-900">{selectedUser.email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.drawer.role')}
                    </dt>
                    <dd className="mt-1 text-slate-900">{String(selectedUser.role || 'user').toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.columns.stripeCustomerId')}
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                      {normalizeStripeCustomerId(selectedUser.stripe_customer_id)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.columns.registrationDate')}
                    </dt>
                    <dd className="mt-1 text-slate-900">
                      {formatDateTime(selectedUser.registration_date, language)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.columns.lastLoginDate')}
                    </dt>
                    <dd className="mt-1 text-slate-900">
                      {formatDateTime(selectedUser.last_login_date, language)}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{t('admin.drawer.actionsTitle')}</h3>

                  <div className="mt-3">
                    <label htmlFor="admin-user-plan" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.columns.plan')}
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <select
                        id="admin-user-plan"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                        value={planDraft}
                        onChange={(event) => setPlanDraft(normalizePlan(event.target.value))}
                        disabled={isSavingPlan || isRenewingQuota}
                      >
                        <option value="free">{t('admin.drawer.planFree')}</option>
                        <option value="pro">{t('admin.drawer.planPro')}</option>
                      </select>
                      <button
                        type="button"
                        className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleSavePlan}
                        disabled={isSavingPlan || isRenewingQuota || !hasPlanChanges}
                      >
                        {isSavingPlan ? t('admin.drawer.savingPlan') : t('admin.drawer.savePlan')}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-4 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRenewQuota}
                    disabled={isRenewingQuota || isSavingPlan}
                  >
                    {isRenewingQuota ? t('admin.drawer.renewingQuota') : renewButtonLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
