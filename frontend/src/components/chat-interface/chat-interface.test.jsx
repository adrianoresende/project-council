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
    availableModels: [],
    isModelOptionsLoading: false,
    conversationModelSelection: {
      model_mode: "council",
      selected_model: null,
      selected_model_title: null,
    },
    isUpdatingConversationModel: false,
    conversationModelError: "",
    onChangeConversationModel: vi.fn(),
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
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {};
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => {};
    }
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

  it("calls model selection callback when a managed model is selected", async () => {
    const onChangeConversationModel = vi.fn();

    const { container } = renderChatInterface({
      availableModels: [
        {
          id: 1,
          title: "GPT-5.1",
          model: "openai/gpt-5.1",
          category: "openai",
        },
      ],
      onChangeConversationModel,
    });

    const hiddenSelect = container.querySelector("select[aria-hidden='true']");
    expect(hiddenSelect).toBeTruthy();
    fireEvent.change(hiddenSelect, {
      target: { value: "openai/gpt-5.1" },
    });

    expect(onChangeConversationModel).toHaveBeenCalledTimes(1);
    expect(onChangeConversationModel).toHaveBeenCalledWith("openai/gpt-5.1");
  });

  it("renders single-mode assistant turns without process details actions", () => {
    renderChatInterface({
      conversation: {
        id: "conv-1",
        messages: [
          { role: "user", content: "Tell me a quick summary" },
          {
            role: "assistant",
            stage1: [],
            stage2: [],
            stage3: {
              model: "openai/gpt-5.1",
              response: "Here is a direct response.",
              workflow_mode: "single",
            },
            metadata: { workflow_mode: "single" },
          },
        ],
      },
      conversationModelSelection: {
        model_mode: "single",
        selected_model: "openai/gpt-5.1",
        selected_model_title: "GPT-5.1",
      },
    });

    expect(screen.getByText("Model Answer")).toBeTruthy();
    expect(screen.queryByText("View process details")).toBeNull();
  });

  it("keeps process details sidebar closed by default for council turns in progress", () => {
    renderChatInterface({
      conversation: {
        id: "conv-1",
        messages: [
          { role: "user", content: "Analyze this topic" },
          {
            role: "assistant",
            stage1: null,
            stage2: null,
            stage3: null,
            metadata: { workflow_mode: "council" },
            loading: {
              stage1: true,
              stage2: false,
              stage3: false,
            },
          },
        ],
      },
      conversationModelSelection: {
        model_mode: "council",
        selected_model: null,
        selected_model_title: null,
      },
      isLoading: true,
    });

    const processDetailsButton = screen.getByRole("button", {
      name: "View process details",
    });
    expect(processDetailsButton).toBeTruthy();
    expect(processDetailsButton.className).not.toContain("fixed");
    expect(screen.getByText("Models are processing...")).toBeTruthy();
    expect(screen.queryByText("Consulting the council...")).toBeNull();
  });

  it("does not show stage 3 feedback while single-mode response is processing", () => {
    renderChatInterface({
      conversation: {
        id: "conv-1",
        messages: [
          { role: "user", content: "Quick answer please" },
          {
            role: "assistant",
            stage1: null,
            stage2: null,
            stage3: null,
            metadata: { workflow_mode: "single" },
            loading: {
              stage1: false,
              stage2: false,
              stage3: true,
            },
          },
        ],
      },
      conversationModelSelection: {
        model_mode: "single",
        selected_model: "openai/gpt-5.1",
        selected_model_title: "GPT-5.1",
      },
      isLoading: true,
    });

    expect(screen.queryByText("Drafting final answer...")).toBeNull();
    expect(
      screen.queryByText("Stage 3 data is not available for this message."),
    ).toBeNull();
    expect(screen.queryByText("Consulting the selected model...")).toBeNull();
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
