/**
 * API client for the LLM Council backend.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
const AUTH_STORAGE_KEY = 'llm-council-access-token';

let accessToken = localStorage.getItem(AUTH_STORAGE_KEY);

function getAuthHeaders() {
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

async function parseError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload.detail || payload.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function request(path, options = {}, requiresAuth = true) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(requiresAuth ? getAuthHeaders() : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const message = await parseError(response, 'Request failed');
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function buildMessageFormData(payload = {}) {
  const formData = new FormData();
  const content = typeof payload.content === 'string' ? payload.content : '';
  formData.append('content', content);

  const isBinaryFile = (value) => {
    if (!value) return false;
    if (typeof File !== 'undefined' && value instanceof File) return true;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
    return false;
  };

  const files = Array.isArray(payload.files) ? payload.files : [];
  files.forEach((file, index) => {
    if (isBinaryFile(file)) {
      const fallbackName = `upload-${index + 1}`;
      const filename = typeof file.name === 'string' && file.name.trim()
        ? file.name
        : fallbackName;
      formData.append('files', file, filename);
    }
  });

  return formData;
}

export const api = {
  setAccessToken(token) {
    accessToken = token;
    if (token) {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
      return;
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  getAccessToken() {
    return accessToken;
  },

  clearAccessToken() {
    this.setAccessToken(null);
  },

  async register(email, password) {
    return request(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false
    );
  },

  async login(email, password) {
    return request(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false
    );
  },

  async getCurrentUser() {
    const data = await request('/api/auth/me');
    return data.user;
  },

  async getCredits() {
    return request('/api/account/credits');
  },

  async getAccountSummary() {
    return request('/api/account/summary');
  },

  async getAdminUsers() {
    return request('/api/admin/users');
  },

  async getAccountPayments(limit = 20) {
    return request(`/api/account/payments?limit=${encodeURIComponent(limit)}`);
  },

  async addCredits(amount) {
    return request('/api/account/credits/add', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  /**
   * Get billing configuration and plans.
   */
  async getBillingConfig() {
    return request('/api/billing/config');
  },

  /**
   * Create Stripe checkout session for Pro plan.
   */
  async createProCheckoutSession(successUrl, cancelUrl) {
    return request('/api/billing/checkout/pro', {
      method: 'POST',
      body: JSON.stringify({
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });
  },

  /**
   * Confirm Stripe checkout session and sync account plan.
   */
  async confirmCheckoutSession(sessionId) {
    return request('/api/billing/confirm', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  /**
   * List all conversations.
   */
  async listConversations(archived = false) {
    return request(`/api/conversations?archived=${archived ? 'true' : 'false'}`);
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    return request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    return request(`/api/conversations/${conversationId}`);
  },

  /**
   * Archive/unarchive a conversation.
   */
  async setConversationArchived(conversationId, archived = true) {
    return request(`/api/conversations/${conversationId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    });
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, payload) {
    return request(`/api/conversations/${conversationId}/message`, {
      method: 'POST',
      body: buildMessageFormData(
        typeof payload === 'string'
          ? { content: payload, files: [] }
          : payload
      ),
    });
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {{content: string, files?: File[]}|string} payload - Message payload
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, payload, onEvent, options = {}) {
    const { signal } = options;
    const normalizedPayload = typeof payload === 'string'
      ? { content: payload, files: [] }
      : payload;

    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: buildMessageFormData(normalizedPayload),
        signal,
      }
    );

    if (!response.ok) {
      const message = await parseError(response, 'Failed to send message');
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const parseEventBlock = (eventBlock) => {
      if (!eventBlock) return;

      const dataLines = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) return;

      const data = dataLines.join('\n');
      try {
        const event = JSON.parse(data);
        onEvent(event.type, event);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const eventBlock = buffer.slice(0, separatorIndex).trim();
        parseEventBlock(eventBlock);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const trailing = buffer.trim();
    if (trailing) {
      parseEventBlock(trailing);
    }
  },
};
