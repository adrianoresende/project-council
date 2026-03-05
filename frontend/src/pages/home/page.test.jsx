import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "./page";
import { I18nProvider } from "../../i18n";

function renderChatPage(props = {}) {
  const defaultProps = {
    mainView: "chat",
    onChangeMainView: vi.fn(),
    conversations: [
      {
        id: "conv-1",
        title: "Mobile conversation",
        created_at: "2026-03-03T12:00:00Z",
      },
    ],
    isConversationsLoading: false,
    conversationListTab: "chats",
    onChangeConversationTab: vi.fn(),
    onArchiveConversation: vi.fn(),
    currentConversationId: null,
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    canCreateConversation: true,
    createConversationDisabledReason: "",
    credits: 3,
    accountMessage: "",
    userEmail: "person@example.com",
    userPlan: "free",
    userRole: "user",
    onLogout: vi.fn(),
    conversation: { id: "conv-1", messages: [] },
    onSendMessage: vi.fn(),
    onCancelMessage: vi.fn(),
    canCancelMessage: false,
    isLoading: false,
  };

  const allProps = { ...defaultProps, ...props };

  return {
    ...render(
      <I18nProvider>
        <ChatPage {...allProps} />
      </I18nProvider>,
    ),
    props: allProps,
  };
}

describe("ChatPage mobile sidebar behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("closes mobile sidebar after selecting a conversation", async () => {
    const user = userEvent.setup();
    const onSelectConversation = vi.fn();
    const { props } = renderChatPage({ onSelectConversation });

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    const mobileSidebarCloseButton = closeButtons.find((button) =>
      Boolean(button.closest("aside")),
    );
    expect(mobileSidebarCloseButton).toBeTruthy();

    const mobileSidebar = mobileSidebarCloseButton.closest("aside");
    expect(mobileSidebar).toBeTruthy();

    await user.click(within(mobileSidebar).getByText("Mobile conversation"));

    expect(onSelectConversation).toHaveBeenCalledTimes(1);
    expect(onSelectConversation).toHaveBeenCalledWith(props.conversations[0].id);

    await waitFor(() => {
      const remainingCloseButtons = screen.queryAllByRole("button", {
        name: "Close",
      });
      const remainingMobileClose = remainingCloseButtons.find((button) =>
        Boolean(button.closest("aside")),
      );
      expect(remainingMobileClose).toBeUndefined();
    });
  });
});
