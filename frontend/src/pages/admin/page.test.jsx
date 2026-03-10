import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPage from './page';
import { I18nProvider } from '../../i18n';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getAdminUsers: vi.fn(),
    getAdminSystemModels: vi.fn(),
    getAdminFeedback: vi.fn(),
    getAdminOpenrouterModels: vi.fn(),
    getAdminModels: vi.fn(),
    createAdminModel: vi.fn(),
    updateAdminModel: vi.fn(),
    deleteAdminModel: vi.fn(),
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

const baseFeedback = {
  user_email: 'member@example.com',
  message: 'A lot better after the latest update.',
  date_sent: '2026-03-01T09:30:00+00:00',
};

const baseManagedModels = [
  {
    id: 101,
    title: 'GPT-5.1',
    model: 'openai/gpt-5.1',
    category: 'openai',
    active: true,
  },
  {
    id: 202,
    title: 'Claude Sonnet 4.5',
    model: 'anthropic/claude-sonnet-4.5',
    category: 'anthropic',
    active: false,
  },
];

const openrouterSearchRows = [
  {
    id: 'openai/gpt-5.1',
    name: 'GPT-5.1',
    category: 'openai',
    context_length: 400000,
  },
  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    category: 'openai',
    context_length: 128000,
  },
];

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
      chairman_model: 'google/gemini-3-pro-preview',
    });
    api.getAdminFeedback.mockResolvedValue([]);
    api.getAdminOpenrouterModels.mockResolvedValue(openrouterSearchRows);
    api.getAdminModels.mockResolvedValue(baseManagedModels);
    api.createAdminModel.mockResolvedValue(baseManagedModels[0]);
    api.updateAdminModel.mockResolvedValue(baseManagedModels[0]);
    api.deleteAdminModel.mockResolvedValue({ id: 202, deleted: true });
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

    const freeHeading = await screen.findByText('Free plan models');
    const proHeading = screen.getByText('Pro plan models');
    expect(screen.getByText('openai/gpt-5-nano')).toBeTruthy();
    expect(screen.getByText('anthropic/claude-sonnet-4.5')).toBeTruthy();
    expect(screen.getAllByText('chairman').length).toBe(2);
    expect(screen.getAllByText('google/gemini-3-pro-preview').length).toBe(2);

    const freeCard = freeHeading.closest('section');
    const proCard = proHeading.closest('section');
    expect(freeCard).toBeTruthy();
    expect(proCard).toBeTruthy();

    const freeItems = within(freeCard).getAllByRole('listitem');
    const proItems = within(proCard).getAllByRole('listitem');
    const freeLast = freeItems[freeItems.length - 1];
    const proLast = proItems[proItems.length - 1];

    expect(freeLast.textContent).toContain('chairman');
    expect(freeLast.textContent).toContain('google/gemini-3-pro-preview');
    expect(proLast.textContent).toContain('chairman');
    expect(proLast.textContent).toContain('google/gemini-3-pro-preview');
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

  it('loads and renders feedback rows when switching to feedback tab', async () => {
    const user = userEvent.setup();
    api.getAdminFeedback.mockResolvedValueOnce([baseFeedback]);

    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Feedback' }));

    await waitFor(() => {
      expect(api.getAdminFeedback).toHaveBeenCalledTimes(1);
    });

    const expectedDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(baseFeedback.date_sent));

    expect(await screen.findByText('User (email)')).toBeTruthy();
    expect(screen.getByText('Message')).toBeTruthy();
    expect(screen.getByText('Date sent')).toBeTruthy();
    expect(screen.getByText(baseFeedback.user_email)).toBeTruthy();
    expect(screen.getByText(baseFeedback.message)).toBeTruthy();
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it('shows empty feedback state when there are no rows', async () => {
    const user = userEvent.setup();
    api.getAdminFeedback.mockResolvedValueOnce([]);

    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Feedback' }));

    await waitFor(() => {
      expect(api.getAdminFeedback).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('No feedback messages yet.')).toBeTruthy();
  });

  it('shows feedback load error message when request fails', async () => {
    const user = userEvent.setup();
    api.getAdminFeedback.mockRejectedValueOnce(new Error('feedback unavailable'));

    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Feedback' }));

    await waitFor(() => {
      expect(api.getAdminFeedback).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('feedback unavailable')).toBeTruthy();
  });

  it('loads managed models when switching to models tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Models' }));

    await waitFor(() => {
      expect(api.getAdminModels).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('OpenRouter model catalog')).toBeTruthy();
    expect(screen.getByText('openai/gpt-5.1')).toBeTruthy();
    expect(screen.getByText('anthropic/claude-sonnet-4.5')).toBeTruthy();
  });

  it('searches OpenRouter and adds a model to managed list', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => {
      expect(api.getAdminModels).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByLabelText('Search models');
    await user.type(searchInput, 'gpt-5');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(api.getAdminOpenrouterModels).toHaveBeenCalledWith('gpt-5', 50);
    });

    await user.click(await screen.findByRole('button', { name: 'Add model' }));

    await waitFor(() => {
      expect(api.createAdminModel).toHaveBeenCalledWith({
        title: 'GPT-5.1',
        model: 'openai/gpt-5.1',
        category: 'openai',
        active: true,
      });
    });
    expect(await screen.findByText('Model GPT-5.1 added.')).toBeTruthy();
    expect(api.getAdminModels).toHaveBeenCalledTimes(2);
  });

  it('edits managed model title and category', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => {
      expect(api.getAdminModels).toHaveBeenCalledTimes(1);
    });

    const modelRow = screen.getByText('openai/gpt-5.1').closest('tr');
    await user.click(within(modelRow).getByRole('button', { name: 'Edit' }));

    const titleInput = await screen.findByLabelText('Title');
    const categoryInput = screen.getByLabelText('Category');
    await user.clear(titleInput);
    await user.type(titleInput, 'GPT-5.1 Turbo');
    await user.clear(categoryInput);
    await user.type(categoryInput, 'openai-premium');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.updateAdminModel).toHaveBeenCalledWith(101, {
        title: 'GPT-5.1 Turbo',
        category: 'openai-premium',
      });
    });
    expect(await screen.findByText('Model GPT-5.1 Turbo updated.')).toBeTruthy();
  });

  it('disables and removes managed models from the table', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', {
      name: 'Open user details for alpha@example.com',
    });
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await waitFor(() => {
      expect(api.getAdminModels).toHaveBeenCalledTimes(1);
    });

    const activeRow = screen.getByText('openai/gpt-5.1').closest('tr');
    await user.click(within(activeRow).getByRole('button', { name: 'Disable' }));
    await waitFor(() => {
      expect(api.updateAdminModel).toHaveBeenCalledWith(101, { active: false });
    });
    expect(await screen.findByText('Model GPT-5.1 disabled.')).toBeTruthy();

    const inactiveRow = screen.getByText('anthropic/claude-sonnet-4.5').closest('tr');
    await user.click(within(inactiveRow).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(api.deleteAdminModel).toHaveBeenCalledWith(202);
    });
    expect(await screen.findByText('Model Claude Sonnet 4.5 removed.')).toBeTruthy();
  });
});
