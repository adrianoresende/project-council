import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

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

function normalizeModelName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeModelCategory(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

function inferModelCategory(modelId) {
  if (typeof modelId !== 'string') return 'unknown';
  const normalized = modelId.trim();
  if (!normalized) return 'unknown';
  if (!normalized.includes('/')) return 'unknown';
  const provider = normalized.split('/', 1)[0]?.trim().toLowerCase() || '';
  return provider || 'unknown';
}

function normalizeAppModels(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const id = Number(row?.id);
      const model = normalizeModelName(row?.model);
      if (!Number.isInteger(id) || id <= 0 || !model) return null;
      return {
        id,
        title: normalizeModelName(row?.title) || model,
        model,
        category: normalizeModelCategory(row?.category),
        active: Boolean(row?.active),
      };
    })
    .filter(Boolean);
}

function normalizeOpenrouterRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const id = normalizeModelName(row?.id);
      if (!id) return null;
      return {
        id,
        name: normalizeModelName(row?.name) || id,
        category: normalizeModelCategory(row?.category || inferModelCategory(id)),
      };
    })
    .filter(Boolean);
}

function normalizeFeedbackRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const userEmail = typeof row?.user_email === 'string' ? row.user_email.trim() : '';
    const message = typeof row?.message === 'string' ? row.message : '';
    const dateSent = typeof row?.date_sent === 'string' ? row.date_sent.trim() : '';
    return {
      key: `${userEmail || 'unknown'}-${dateSent || 'unknown'}-${index}`,
      user_email: userEmail,
      message,
      date_sent: dateSent,
    };
  });
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
  const [feedbackMessages, setFeedbackMessages] = useState([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [hasLoadedFeedbackMessages, setHasLoadedFeedbackMessages] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [managedModels, setManagedModels] = useState([]);
  const [isManagedModelsLoading, setIsManagedModelsLoading] = useState(false);
  const [hasLoadedManagedModels, setHasLoadedManagedModels] = useState(false);
  const [managedModelsError, setManagedModelsError] = useState('');
  const [managedModelsNotice, setManagedModelsNotice] = useState('');
  const [managedModelsNoticeTone, setManagedModelsNoticeTone] = useState('success');
  const [openrouterQuery, setOpenrouterQuery] = useState('');
  const [openrouterResults, setOpenrouterResults] = useState([]);
  const [openrouterSearchError, setOpenrouterSearchError] = useState('');
  const [selectedOpenrouterModel, setSelectedOpenrouterModel] = useState('');
  const [isOpenrouterSearching, setIsOpenrouterSearching] = useState(false);
  const [isAddingManagedModel, setIsAddingManagedModel] = useState(false);
  const [actionModelId, setActionModelId] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [editCategoryDraft, setEditCategoryDraft] = useState('');
  const [isSavingManagedModel, setIsSavingManagedModel] = useState(false);
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
        chairman_model: normalizeModelName(payload?.chairman_model),
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

  const loadFeedbackMessages = useCallback(async () => {
    setIsFeedbackLoading(true);
    setFeedbackError('');
    try {
      const payload = await api.getAdminFeedback();
      setFeedbackMessages(normalizeFeedbackRows(payload));
    } catch (loadError) {
      setFeedbackError(loadError.message || t('admin.feedback.failedLoad'));
      setFeedbackMessages([]);
    } finally {
      setHasLoadedFeedbackMessages(true);
      setIsFeedbackLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== 'feedback') return;
    if (hasLoadedFeedbackMessages) return;
    if (isFeedbackLoading) return;
    loadFeedbackMessages();
  }, [activeTab, hasLoadedFeedbackMessages, isFeedbackLoading, loadFeedbackMessages]);

  const loadManagedModels = useCallback(async () => {
    setIsManagedModelsLoading(true);
    setManagedModelsError('');
    try {
      const payload = await api.getAdminModels();
      setManagedModels(normalizeAppModels(payload));
    } catch (loadError) {
      setManagedModelsError(loadError.message || t('admin.models.failedLoad'));
      setManagedModels([]);
    } finally {
      setHasLoadedManagedModels(true);
      setIsManagedModelsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== 'models') return;
    if (hasLoadedManagedModels) return;
    if (isManagedModelsLoading) return;
    loadManagedModels();
  }, [activeTab, hasLoadedManagedModels, isManagedModelsLoading, loadManagedModels]);

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

  const handleSearchOpenrouterModels = useCallback(
    async (event) => {
      event.preventDefault();
      const normalizedQuery = openrouterQuery.trim();

      setOpenrouterSearchError('');
      setManagedModelsNotice('');

      if (!normalizedQuery) {
        setOpenrouterResults([]);
        setSelectedOpenrouterModel('');
        setOpenrouterSearchError(t('admin.models.searchRequired'));
        return;
      }

      setIsOpenrouterSearching(true);
      try {
        const payload = await api.getAdminOpenrouterModels(normalizedQuery, 50);
        const rows = normalizeOpenrouterRows(payload);
        setOpenrouterResults(rows);
        setSelectedOpenrouterModel(rows[0]?.id || '');
      } catch (searchError) {
        setOpenrouterSearchError(searchError.message || t('admin.models.failedSearch'));
        setOpenrouterResults([]);
        setSelectedOpenrouterModel('');
      } finally {
        setIsOpenrouterSearching(false);
      }
    },
    [openrouterQuery, t]
  );

  const handleAddManagedModel = useCallback(async () => {
    if (!selectedOpenrouterModel) return;

    const candidate = openrouterResults.find((entry) => entry.id === selectedOpenrouterModel);
    if (!candidate) return;

    const payload = {
      title: candidate.name || candidate.id,
      model: candidate.id,
      category: normalizeModelCategory(candidate.category || inferModelCategory(candidate.id)),
      active: true,
    };

    setIsAddingManagedModel(true);
    setManagedModelsNotice('');

    try {
      await api.createAdminModel(payload);
      setManagedModelsNoticeTone('success');
      setManagedModelsNotice(
        t('admin.models.addedSuccess', {
          title: payload.title,
        })
      );
      await loadManagedModels();
    } catch (addError) {
      setManagedModelsNoticeTone('error');
      setManagedModelsNotice(addError.message || t('admin.models.failedAdd'));
    } finally {
      setIsAddingManagedModel(false);
    }
  }, [openrouterResults, selectedOpenrouterModel, loadManagedModels, t]);

  const handleOpenEditModelDialog = useCallback((model) => {
    if (!model || typeof model !== 'object') return;
    setEditingModel(model);
    setEditTitleDraft(normalizeModelName(model.title));
    setEditCategoryDraft(normalizeModelCategory(model.category));
    setIsEditDialogOpen(true);
  }, []);

  const handleCloseEditModelDialog = useCallback(() => {
    setIsEditDialogOpen(false);
    setEditingModel(null);
    setEditTitleDraft('');
    setEditCategoryDraft('');
    setIsSavingManagedModel(false);
  }, []);

  const handleSaveEditedModel = useCallback(async () => {
    if (!editingModel) return;

    const title = normalizeModelName(editTitleDraft);
    const category = normalizeModelCategory(editCategoryDraft);
    if (!title) {
      setManagedModelsNoticeTone('error');
      setManagedModelsNotice(t('admin.models.validationTitleRequired'));
      return;
    }

    setIsSavingManagedModel(true);
    setActionModelId(editingModel.id);
    setManagedModelsNotice('');

    try {
      await api.updateAdminModel(editingModel.id, {
        title,
        category,
      });
      setManagedModelsNoticeTone('success');
      setManagedModelsNotice(
        t('admin.models.updatedSuccess', {
          title,
        })
      );
      handleCloseEditModelDialog();
      await loadManagedModels();
    } catch (updateError) {
      setManagedModelsNoticeTone('error');
      setManagedModelsNotice(updateError.message || t('admin.models.failedUpdate'));
    } finally {
      setActionModelId(0);
      setIsSavingManagedModel(false);
    }
  }, [editingModel, editTitleDraft, editCategoryDraft, handleCloseEditModelDialog, loadManagedModels, t]);

  const handleToggleModelActive = useCallback(
    async (model) => {
      if (!model || typeof model !== 'object') return;
      const modelId = Number(model.id);
      if (!Number.isInteger(modelId) || modelId <= 0) return;

      setActionModelId(modelId);
      setManagedModelsNotice('');

      try {
        await api.updateAdminModel(modelId, {
          active: !model.active,
        });
        setManagedModelsNoticeTone('success');
        setManagedModelsNotice(
          t(model.active ? 'admin.models.deactivatedSuccess' : 'admin.models.activatedSuccess', {
            title: normalizeModelName(model.title) || model.model,
          })
        );
        await loadManagedModels();
      } catch (updateError) {
        setManagedModelsNoticeTone('error');
        setManagedModelsNotice(updateError.message || t('admin.models.failedUpdate'));
      } finally {
        setActionModelId(0);
      }
    },
    [loadManagedModels, t]
  );

  const handleDeleteModel = useCallback(
    async (model) => {
      if (!model || typeof model !== 'object') return;
      const modelId = Number(model.id);
      if (!Number.isInteger(modelId) || modelId <= 0) return;

      setActionModelId(modelId);
      setManagedModelsNotice('');

      try {
        await api.deleteAdminModel(modelId);
        setManagedModelsNoticeTone('success');
        setManagedModelsNotice(
          t('admin.models.deletedSuccess', {
            title: normalizeModelName(model.title) || model.model,
          })
        );
        if (editingModel && Number(editingModel.id) === modelId) {
          handleCloseEditModelDialog();
        }
        await loadManagedModels();
      } catch (deleteError) {
        setManagedModelsNoticeTone('error');
        setManagedModelsNotice(deleteError.message || t('admin.models.failedDelete'));
      } finally {
        setActionModelId(0);
      }
    },
    [editingModel, handleCloseEditModelDialog, loadManagedModels, t]
  );

  const drawerNoticeClass =
    drawerNoticeTone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  const managedModelsNoticeClass =
    managedModelsNoticeTone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  const renewButtonLabel = selectedPlan === 'pro' ? t('admin.drawer.renewTokens') : t('admin.drawer.renewQuota');
  const freePlanModels = normalizeModelList(systemModels?.free_models);
  const proPlanModels = normalizeModelList(systemModels?.pro_models);
  const chairmanModel = normalizeModelName(systemModels?.chairman_model);
  const selectedOpenrouterModelRow =
    openrouterResults.find((entry) => entry.id === selectedOpenrouterModel) || null;
  const isModelActionPending = actionModelId > 0;
  const modelActionDisabled = isModelActionPending || isSavingManagedModel || isManagedModelsLoading;
  const isRefreshing =
    activeTab === 'users'
      ? isLoading
      : activeTab === 'system'
        ? isSystemLoading
        : activeTab === 'feedback'
          ? isFeedbackLoading
          : isManagedModelsLoading || isOpenrouterSearching || isAddingManagedModel || isSavingManagedModel;

  const handleRefresh = useCallback(() => {
    if (activeTab === 'system') {
      loadSystemModels();
      return;
    }
    if (activeTab === 'feedback') {
      loadFeedbackMessages();
      return;
    }
    if (activeTab === 'models') {
      loadManagedModels();
      return;
    }
    loadUsers();
  }, [activeTab, loadFeedbackMessages, loadManagedModels, loadSystemModels, loadUsers]);

  return (
    <div className="relative h-full flex-1 overflow-y-auto bg-slate-50">
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
          <button
            type="button"
            className={`-mb-px ml-6 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold ${
              activeTab === 'feedback'
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            aria-current={activeTab === 'feedback' ? 'page' : undefined}
            onClick={() => handleSelectTab('feedback')}
          >
            {t('admin.tabs.feedback')}
          </button>
          <button
            type="button"
            className={`-mb-px ml-6 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold ${
              activeTab === 'models'
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            aria-current={activeTab === 'models' ? 'page' : undefined}
            onClick={() => handleSelectTab('models')}
          >
            {t('admin.tabs.models')}
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
        ) : activeTab === 'system' ? (
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
                  {freePlanModels.length > 0 || chairmanModel ? (
                    <ul className="mt-3 space-y-2">
                      {freePlanModels.map((model, index) => (
                        <li
                          key={`${model}-${index}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                        >
                          {model}
                        </li>
                      ))}
                      {chairmanModel && (
                        <li className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                          <span className="font-semibold text-sky-900">chairman</span>
                          <span className="font-mono">{chairmanModel}</span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{t('admin.system.noModels')}</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {t('admin.system.proTitle')}
                  </h2>
                  {proPlanModels.length > 0 || chairmanModel ? (
                    <ul className="mt-3 space-y-2">
                      {proPlanModels.map((model, index) => (
                        <li
                          key={`${model}-${index}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                        >
                          {model}
                        </li>
                      ))}
                      {chairmanModel && (
                        <li className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                          <span className="font-semibold text-sky-900">chairman</span>
                          <span className="font-mono">{chairmanModel}</span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">{t('admin.system.noModels')}</p>
                  )}
                </section>
              </div>
            )}
          </div>
        ) : activeTab === 'models' ? (
          <div className="space-y-4">
            {managedModelsError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {managedModelsError}
              </div>
            )}

            {managedModelsNotice && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${managedModelsNoticeClass}`}>
                {managedModelsNotice}
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{t('admin.models.searchTitle')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('admin.models.searchDescription')}</p>

              <form className="mt-3 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleSearchOpenrouterModels}>
                <label className="flex-1" htmlFor="admin-model-search-query">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('admin.models.searchLabel')}
                  </span>
                  <input
                    id="admin-model-search-query"
                    type="text"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    value={openrouterQuery}
                    onChange={(event) => setOpenrouterQuery(event.target.value)}
                    placeholder={t('admin.models.searchPlaceholder')}
                    disabled={isOpenrouterSearching || isAddingManagedModel}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isOpenrouterSearching || isAddingManagedModel}
                >
                  {isOpenrouterSearching ? t('admin.models.searching') : t('admin.models.searchButton')}
                </button>
              </form>

              {openrouterSearchError && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {openrouterSearchError}
                </div>
              )}

              {openrouterResults.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('admin.models.searchResultLabel')}
                    </p>
                    <Select
                      value={selectedOpenrouterModel || undefined}
                      onValueChange={setSelectedOpenrouterModel}
                      disabled={isAddingManagedModel}
                    >
                      <SelectTrigger
                        aria-label={t('admin.models.searchResultLabel')}
                        className="mt-1.5 h-10 w-full justify-between border-slate-300 bg-white text-sm text-slate-700"
                      >
                        <SelectValue placeholder={t('admin.models.searchResultPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {openrouterResults.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {`${row.name} (${row.category})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleAddManagedModel}
                    disabled={!selectedOpenrouterModelRow || isAddingManagedModel || isOpenrouterSearching}
                  >
                    {isAddingManagedModel ? t('admin.models.adding') : t('admin.models.addButton')}
                  </button>
                </div>
              ) : (
                !isOpenrouterSearching &&
                openrouterQuery.trim() &&
                !openrouterSearchError && (
                  <p className="mt-3 text-sm text-slate-500">{t('admin.models.noSearchResults')}</p>
                )
              )}
            </section>

            <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('admin.models.columns.title')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.models.columns.model')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.models.columns.category')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.models.columns.active')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.models.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {isManagedModelsLoading ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
                        {t('admin.models.loading')}
                      </td>
                    </tr>
                  ) : managedModels.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
                        {t('admin.models.empty')}
                      </td>
                    </tr>
                  ) : (
                    managedModels.map((model) => {
                      const rowBusy = actionModelId === model.id;
                      return (
                        <tr key={model.id}>
                          <td className="px-4 py-3 align-top font-medium text-slate-900">{model.title}</td>
                          <td className="px-4 py-3 align-top font-mono text-xs text-slate-700">{model.model}</td>
                          <td className="px-4 py-3 align-top text-slate-700">{model.category}</td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
                                model.active
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-300 bg-slate-100 text-slate-600'
                              }`}
                            >
                              {model.active ? t('admin.models.activeStatus') : t('admin.models.inactiveStatus')}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => handleOpenEditModelDialog(model)}
                                disabled={modelActionDisabled || rowBusy}
                              >
                                {t('admin.models.actions.edit')}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => handleToggleModelActive(model)}
                                disabled={modelActionDisabled || rowBusy}
                              >
                                {model.active ? t('admin.models.actions.disable') : t('admin.models.actions.activate')}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => handleDeleteModel(model)}
                                disabled={modelActionDisabled || rowBusy}
                              >
                                {t('admin.models.actions.remove')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbackError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {feedbackError}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('admin.columns.userEmail')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.columns.message')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.columns.dateSent')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {isFeedbackLoading ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={3}>
                        {t('admin.feedback.loading')}
                      </td>
                    </tr>
                  ) : feedbackMessages.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={3}>
                        {t('admin.feedback.empty')}
                      </td>
                    </tr>
                  ) : (
                    feedbackMessages.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-3 align-top font-medium text-slate-900">{row.user_email || '-'}</td>
                        <td className="px-4 py-3 align-top whitespace-pre-wrap text-slate-700">{row.message || '-'}</td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {formatDateTime(row.date_sent, language)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCloseEditModelDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.models.editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('admin.models.editDialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block" htmlFor="admin-model-edit-title">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('admin.models.columns.title')}
              </span>
              <input
                id="admin-model-edit-title"
                type="text"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                value={editTitleDraft}
                onChange={(event) => setEditTitleDraft(event.target.value)}
                disabled={isSavingManagedModel}
              />
            </label>
            <label className="block" htmlFor="admin-model-edit-category">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('admin.models.columns.category')}
              </span>
              <input
                id="admin-model-edit-category"
                type="text"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                value={editCategoryDraft}
                onChange={(event) => setEditCategoryDraft(event.target.value)}
                disabled={isSavingManagedModel}
              />
            </label>
          </div>

          <DialogFooter>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleCloseEditModelDialog}
              disabled={isSavingManagedModel}
            >
              {t('admin.models.actions.cancel')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSaveEditedModel}
              disabled={isSavingManagedModel}
            >
              {isSavingManagedModel ? t('admin.models.savingEdit') : t('admin.models.actions.save')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
