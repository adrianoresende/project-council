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
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

  async addCredits(amount) {
    return request('/api/account/credits/add', {
      method: 'POST',
      body: JSON.stringify({ amount }),
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
  async sendMessage(conversationId, content) {
    return request(`/api/conversations/${conversationId}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, onEvent) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ content }),
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        }
      }
    }
  },
};
