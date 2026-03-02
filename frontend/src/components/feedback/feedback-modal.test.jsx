import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackModal from "./feedback-modal";
import { I18nProvider } from "../../i18n";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: {
    sendFeedback: vi.fn(),
  },
}));

function renderModal(props = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  return render(
    <I18nProvider>
      <FeedbackModal {...defaultProps} {...props} />
    </I18nProvider>,
  );
}

describe("FeedbackModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits feedback and shows success state", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    api.sendFeedback.mockResolvedValue({
      user_email: "person@example.com",
      message: "Great app!",
      date_sent: "2026-03-02T20:00:00Z",
    });

    renderModal({ onClose });

    await user.type(screen.getByLabelText("Your message."), "Great app!");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => {
      expect(api.sendFeedback).toHaveBeenCalledWith("Great app!");
    });
    expect(await screen.findByText("Thank you for your feedback!")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an inline error when submission fails", async () => {
    const user = userEvent.setup();
    api.sendFeedback.mockRejectedValue(new Error("Network unavailable"));

    renderModal();

    await user.type(screen.getByLabelText("Your message."), "Need dark mode");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(
      await screen.findByText(
        "Could not send feedback. Please try again now or later.",
      ),
    ).toBeTruthy();
  });

  it("supports close via top-right x and success close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    api.sendFeedback.mockResolvedValue({
      user_email: "person@example.com",
      message: "Great app!",
      date_sent: "2026-03-02T20:00:00Z",
    });

    const { rerender } = render(
      <I18nProvider>
        <FeedbackModal isOpen onClose={onClose} />
      </I18nProvider>,
    );

    const closeButtons = screen.getAllByRole("button", {
      name: "Close feedback modal",
    });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <FeedbackModal isOpen onClose={onClose} />
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText("Your message."), "Thanks!");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Thank you for your feedback!");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
