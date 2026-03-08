import { useEffect, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export default function FeedbackModal({ isOpen, onClose }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setMessage("");
    setIsSubmitting(false);
    setIsSuccess(false);
    setError("");
  }, [isOpen]);

  const normalizedMessage = message.trim();
  const isSubmitDisabled = isSubmitting || normalizedMessage.length === 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitDisabled) return;

    setIsSubmitting(true);
    setError("");
    try {
      await api.sendFeedback(normalizedMessage);
      setIsSuccess(true);
    } catch {
      setError(t("feedback.errorTryAgain"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_22px_45px_rgba(15,23,42,0.2)]"
      >
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("feedback.closeModal")}
          >
            <IconX size={16} />
          </button>
        </DialogClose>

        {isSuccess ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
              <IconCheck size={22} />
            </div>
            <DialogTitle className="mt-4 text-xl font-semibold text-slate-900">
              {t("feedback.successTitle")}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-600">
              {t("feedback.successDescription")}
            </DialogDescription>
            <DialogClose asChild>
              <button
                type="button"
                className="mt-6 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t("common.close")}
              </button>
            </DialogClose>
          </div>
        ) : (
          <>
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {t("feedback.title")}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-slate-600">
                {t("feedback.description")}
              </DialogDescription>
            </DialogHeader>

            <form className="mt-5" onSubmit={handleSubmit}>
              <label
                htmlFor="feedback-message"
                className="block text-sm font-semibold text-slate-700"
              >
                {t("feedback.messageLabel")}
              </label>
              <textarea
                id="feedback-message"
                className="mt-2 min-h-[140px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("feedback.messagePlaceholder")}
                disabled={isSubmitting}
              />
              {error && (
                <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>
              )}
              <button
                type="submit"
                className="mt-4 rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                disabled={isSubmitDisabled}
              >
                {isSubmitting
                  ? t("feedback.submittingButton")
                  : t("feedback.submitButton")}
              </button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
