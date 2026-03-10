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
  };

  return render(
    <I18nProvider>
      <ChatInterface {...defaultProps} {...props} />
    </I18nProvider>,
  );
}

describe("ChatInterface composer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Search and Attach buttons in composer", () => {
    renderChatInterface();

    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach" })).toBeTruthy();
  });

  it("sends useWebSearch=true when toggle is enabled", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    renderChatInterface({ onSendMessage });

    await user.click(screen.getByRole("button", { name: "Search" }));

    await user.type(screen.getByRole("textbox"), "Find latest AI updates");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      "Find latest AI updates",
      [],
      { useWebSearch: true },
    );
  });

  it("shows active style on Search button when enabled", async () => {
    const user = userEvent.setup();
    renderChatInterface();

    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton.getAttribute("aria-pressed")).toBe("false");

    await user.click(searchButton);

    expect(searchButton.getAttribute("aria-pressed")).toBe("true");
    expect(searchButton.className).toContain("text-emerald-700");
  });

  it("keeps web search enabled when switching to a new conversation", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    const sharedProps = {
      onSendMessage,
      onCancelMessage: vi.fn(),
      canCancelMessage: false,
      isLoading: false,
    };

    const { rerender } = render(
      <I18nProvider>
        <ChatInterface
          {...sharedProps}
          conversation={{ id: "conv-1", messages: [] }}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(
      screen.getByRole("button", { name: "Search" }).getAttribute("aria-pressed"),
    ).toBe("true");

    rerender(
      <I18nProvider>
        <ChatInterface
          {...sharedProps}
          conversation={{ id: "conv-2", messages: [] }}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Search" }).getAttribute("aria-pressed"),
    ).toBe("true");

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
