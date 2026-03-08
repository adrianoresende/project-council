import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    await user.click(screen.getByRole("menuitem", { name: /Web search/i }));
    expect(screen.getByRole("status", { name: /Web search/i })).toBeTruthy();

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
    await user.click(screen.getByRole("menuitem", { name: /Web search/i }));

    const webSearchIndicator = screen.getByRole("status", {
      name: /Web search/i,
    });
    expect(webSearchIndicator).toBeTruthy();
    expect(webSearchIndicator.className).toContain("text-emerald-600");
  });

  it("keeps web search enabled when switching to a new conversation", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const sharedProps = {
      onSendMessage,
      onCancelMessage: vi.fn(),
      canCancelMessage: false,
      isLoading: false,
      userPlan: "free",
    };

    const { rerender } = render(
      <I18nProvider>
        <ChatInterface
          {...sharedProps}
          conversation={{ id: "conv-1", messages: [] }}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open file menu" }));
    await user.click(screen.getByRole("menuitem", { name: /Web search/i }));
    expect(
      screen.getByRole("status", { name: /Web search/i }),
    ).toBeTruthy();

    rerender(
      <I18nProvider>
        <ChatInterface
          {...sharedProps}
          conversation={{ id: "conv-2", messages: [] }}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("status", { name: /Web search/i }),
    ).toBeTruthy();

    await user.type(screen.getByRole("textbox"), "Any updates?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSendMessage).toHaveBeenCalledWith("Any updates?", [], {
      useWebSearch: true,
    });
  });
});

describe("ChatInterface file drag and drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("adds dropped supported files to the composer and sends them", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    renderChatInterface({ onSendMessage });

    const conversationBody = screen.getByTestId("chat-conversation-body");
    const pdfFile = new File(["test"], "brief.pdf", {
      type: "application/pdf",
    });

    fireEvent.dragEnter(conversationBody, {
      dataTransfer: { types: ["Files"] },
    });
    expect(
      screen.getByText("Drop files to add them to this conversation"),
    ).toBeTruthy();

    fireEvent.drop(conversationBody, {
      dataTransfer: { types: ["Files"], files: [pdfFile] },
    });
    expect(screen.getByText("brief.pdf")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith("", [pdfFile], {
      useWebSearch: false,
    });
  });

  it("rejects unsupported dropped files and keeps send disabled", () => {
    renderChatInterface();

    const conversationBody = screen.getByTestId("chat-conversation-body");
    const unsupportedFile = new File(["test"], "notes.txt", {
      type: "text/plain",
    });

    fireEvent.drop(conversationBody, {
      dataTransfer: { types: ["Files"], files: [unsupportedFile] },
    });

    expect(
      screen.getByText(
        "Unsupported file selected. Use PDF, images, DOCX, XLSX or PPTX.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("notes.txt")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
