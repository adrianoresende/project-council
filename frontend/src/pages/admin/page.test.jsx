import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPage from './page';
import { I18nProvider } from '../../i18n';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getAdminUsers: vi.fn(),
    getAdminSystemModels: vi.fn(),
    getAdminUser: vi.fn(),
    updateAdminUserPlan: vi.fn(),
    resetAdminUserQuota: vi.fn(),
  },
}));

const baseUser = {
  user_id: 'user-1',
  email: 'alpha@example.com',
  role: 'user',
  plan: 'free',
  stripe_customer_id: 'cus_123',
  registration_date: '2026-02-20T10:00:00+00:00',
  last_login_date: '2026-02-20T11:00:00+00:00',
};

function renderPage() {
  return render(
    <I18nProvider>
      <AdminPage />
    </I18nProvider>
  );
}

describe('AdminPage drawer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminUsers.mockResolvedValue([baseUser]);
    api.getAdminSystemModels.mockResolvedValue({
      free_models: ['openai/gpt-5-nano', 'google/gemini-2.5-flash-lite'],
      pro_models: ['openai/gpt-5.1', 'anthropic/claude-sonnet-4.5'],
    });
    api.getAdminUser.mockResolvedValue(baseUser);
    api.updateAdminUserPlan.mockResolvedValue({
      ...baseUser,
      plan: 'pro',
    });
    api.resetAdminUserQuota.mockResolvedValue({
      user_id: 'user-1',
      plan: 'pro',
      unit: 'tokens',
      limit: 200000,
      credits: 200000,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('opens drawer on row click and loads user detail', async () => {
    const user = userEvent.setup();
    renderPage();

    const rowAction = await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(rowAction);

    await waitFor(() => {
      expect(api.getAdminUser).toHaveBeenCalledWith('user-1');
    });
    expect(await screen.findByText('User details')).toBeTruthy();
    expect(screen.getAllByText('cus_123').length).toBeGreaterThan(0);
  });

  it('shows system models in two plan cards when switching tabs', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });

    await user.click(screen.getByRole('button', { name: 'System' }));

    await waitFor(() => {
      expect(api.getAdminSystemModels).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Free plan models')).toBeTruthy();
    expect(screen.getByText('Pro plan models')).toBeTruthy();
    expect(screen.getByText('openai/gpt-5-nano')).toBeTruthy();
    expect(screen.getByText('anthropic/claude-sonnet-4.5')).toBeTruthy();
  });

  it('uses explicit save flow for plan changes', async () => {
    const user = userEvent.setup();
    renderPage();

    const rowAction = await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(rowAction);
    await screen.findByText('User details');

    const planSelect = screen.getByLabelText('Plan');
    await user.selectOptions(planSelect, 'pro');

    expect(api.updateAdminUserPlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.updateAdminUserPlan).toHaveBeenCalledWith('user-1', 'pro');
    });
    expect(await screen.findByText('Plan updated to PRO.')).toBeTruthy();
  });

  it('shows renew action error feedback without losing list state', async () => {
    const user = userEvent.setup();
    api.getAdminUser.mockResolvedValue({
      ...baseUser,
      plan: 'pro',
    });
    api.resetAdminUserQuota.mockRejectedValueOnce(new Error('reset failed'));

    renderPage();

    const rowAction = await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(rowAction);
    await screen.findByText('User details');

    await user.click(screen.getByRole('button', { name: 'Renew daily token quota' }));

    expect(await screen.findByText('reset failed')).toBeTruthy();
    expect(screen.getAllByText('alpha@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('User details')).toBeTruthy();
  });
});
