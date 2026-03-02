import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInterface from "./chat-interface";
import { I18nProvider } from "../../i18n";

vi.mock("../sidebar/sidebar-right", () => ({
  default: () => null,
}));

function renderChatInterface(props = {}) {
  const defaultProps = {
    conversation: { id: "conv-1", messages: [] },
    onSendMessage: vi.fn(),
    onCancelMessage: vi.fn(),
    canCancelMessage: false,
    isLoading: false,
    userPlan: "free",
  };

  return render(
    <I18nProvider>
      <ChatInterface {...defaultProps} {...props} />
    </I18nProvider>,
  );
}

describe("ChatInterface web search toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows web search description in the composer tools menu", async () => {
    const user = userEvent.setup();
    renderChatInterface({ userPlan: "free" });

    await user.click(screen.getByRole("button", { name: "Open file menu" }));

    expect(
      screen.getByText("Turn on search for the latest content or data"),
    ).toBeTruthy();
  });

  it("sends useWebSearch=true when toggle is enabled", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    renderChatInterface({ onSendMessage, userPlan: "pro" });

    await user.click(screen.getByRole("button", { name: "Open file menu" }));
    await user.click(screen.getByRole("button", { name: /Web search/i }));
    expect(
      screen.getByText("Turn on search for the latest content or data"),
    ).toBeTruthy();

    await user.type(screen.getByRole("textbox"), "Find latest AI updates");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      "Find latest AI updates",
      [],
      { useWebSearch: true },
    );
  });

  it("shows a green web icon next to the plus button when enabled", async () => {
    const user = userEvent.setup();
    renderChatInterface({ userPlan: "pro" });

    expect(screen.queryByRole("status")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open file menu" }));
    await user.click(screen.getByRole("button", { name: /Web search/i }));

    const webSearchIndicator = screen.getByRole("status", {
      name: /Web search/i,
    });
    expect(webSearchIndicator).toBeTruthy();
    expect(webSearchIndicator.className).toContain("text-emerald-600");
  });
});
