import { useState, useEffect, useRef } from "react";
import {
  IconCheck,
  IconFile,
  IconFileTypePdf,
  IconLoader2,
  IconPhoto,
  IconPlus,
  IconSearch,
  IconSend2,
  IconUpload,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import SidebarRight from "../sidebar/sidebar-right";
import Tooltip from "../tooltip/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../ui/sheet";
import { useI18n } from "../../i18n";

const SUPPORTED_FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
]);

function getFileExtension(filename) {
  if (typeof filename !== "string") return "";
  const parts = filename.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1];
}

function isSupportedUploadFile(file) {
  if (!(file instanceof File)) return false;
  const extension = getFileExtension(file.name);
  if (SUPPORTED_FILE_EXTENSIONS.has(extension)) {
    return true;
  }
  return typeof file.type === "string" && file.type.startsWith("image/");
}

function formatFileSize(bytes, language) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size.toLocaleString(language)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileTypeLabel(file) {
  if (!(file instanceof File)) return "FILE";

  if (typeof file.type === "string" && file.type.startsWith("image/")) {
    return "IMAGE";
  }

  const extension = getFileExtension(file.name);
  if (extension) return extension.toUpperCase();
  return "FILE";
}

function getMessageFileMetadata(file) {
  if (!(file && typeof file === "object")) {
    return {
      name: "",
      mimeType: "application/octet-stream",
      kind: "file",
      sizeBytes: 0,
    };
  }

  return {
    name: typeof file.name === "string" ? file.name : "",
    mimeType: typeof file.mime_type === "string" ? file.mime_type : "",
    kind: typeof file.kind === "string" ? file.kind : "file",
    sizeBytes: Number(file.size_bytes || 0),
  };
}

function FileIcon({ kind, mimeType }) {
  if (
    kind === "image" ||
    (typeof mimeType === "string" && mimeType.startsWith("image/"))
  ) {
    return <IconPhoto size={14} />;
  }

  if (kind === "pdf" || mimeType === "application/pdf") {
    return <IconFileTypePdf size={14} />;
  }

  return <IconFile size={14} />;
}

function formatUsageSummary(usage, t, language) {
  if (!usage || typeof usage !== "object") return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const modelCalls = Number(usage.model_calls ?? 0);
  const parts = [
    t("common.usageTokens", { count: totalTokens.toLocaleString(language) }),
  ];

  if (Number.isFinite(modelCalls) && modelCalls > 0) {
    parts.push(
      t("common.usageModelCalls", {
        count: modelCalls.toLocaleString(language),
      }),
    );
  }

  return parts.join(" · ");
}

function getShortModelName(model, t) {
  if (typeof model !== "string" || !model) {
    return t("stage.councilChairmanFallback");
  }
  return model.split("/")[1] || model;
}

function getLatestAssistantMessageIndex(messages) {
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "assistant") {
      return i;
    }
  }

  return null;
}

function isMessageProcessing(message) {
  return Boolean(
    message?.loading?.stage1 ||
    message?.loading?.stage2 ||
    message?.loading?.stage3,
  );
}

function getWebSearchMaxResultsForPlan(plan) {
  if (typeof plan === "string" && plan.trim().toLowerCase() === "pro") {
    return 5;
  }
  return 2;
}

function ComposerToolsMenuItem({
  icon,
  title,
  description,
  onSelect,
  isActive = false,
  badge = null,
  className = "",
}) {
  return (
    <DropdownMenuItem
      className={`cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-slate-50 data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-900 ${className}`.trim()}
      onSelect={onSelect}
    >
      <span className={`mt-0.5 ${isActive ? "text-emerald-600" : "text-slate-500"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">
          {title}
        </span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      {badge}
    </DropdownMenuItem>
  );
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  onCancelMessage,
  canCancelMessage,
  isLoading,
  userPlan = "free",
}) {
  const { language, t } = useI18n();
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [fileValidationError, setFileValidationError] = useState("");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isProcessDetailsSidebarOpen, setIsProcessDetailsSidebarOpen] =
    useState(false);
  const [processDetailsMessageIndex, setProcessDetailsMessageIndex] =
    useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const conversationMessages = Array.isArray(conversation?.messages)
    ? conversation.messages
    : [];
  const composerDisabled = isLoading || !conversation?.id;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  useEffect(() => {
    setInput("");
    setSelectedFiles([]);
    setFileValidationError("");
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    setIsProcessDetailsSidebarOpen(false);
    setProcessDetailsMessageIndex(null);
  }, [conversation?.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      (input.trim() || selectedFiles.length > 0) &&
      !isLoading &&
      conversation?.id
    ) {
      onSendMessage(input, selectedFiles, {
        useWebSearch: isWebSearchEnabled,
      });
      setInput("");
      setSelectedFiles([]);
      setFileValidationError("");
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleOpenFileDialog = () => {
    if (isLoading) return;
    fileInputRef.current?.click();
  };

  const addFilesToSelection = (incomingFiles) => {
    if (incomingFiles.length === 0) return;

    const acceptedFiles = incomingFiles.filter(isSupportedUploadFile);
    if (acceptedFiles.length !== incomingFiles.length) {
      setFileValidationError(t("chat.unsupportedFileTypeError"));
    } else {
      setFileValidationError("");
    }

    setSelectedFiles((previous) => {
      const merged = [...previous];
      acceptedFiles.forEach((file) => {
        const alreadyIncluded = merged.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        );
        if (!alreadyIncluded) {
          merged.push(file);
        }
      });
      return merged;
    });
  };

  const hasDraggedFiles = (event) => {
    const dataTransferTypes = event.dataTransfer?.types;
    if (!dataTransferTypes) return false;
    return Array.from(dataTransferTypes).includes("Files");
  };

  const handleFileSelection = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    addFilesToSelection(incomingFiles);
    event.target.value = "";
  };

  const handleDragEnter = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (composerDisabled) return;

    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    if (composerDisabled) return;

    if (!isDraggingFiles) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragLeave = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (composerDisabled) return;

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (composerDisabled) return;

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    addFilesToSelection(droppedFiles);
  };

  const handleRemoveSelectedFile = (indexToRemove) => {
    setSelectedFiles((previous) =>
      previous.filter((_, index) => index !== indexToRemove),
    );
  };

  const inputPlaceholder = conversationMessages.length
    ? t("chat.continuePlaceholder")
    : t("chat.askPlaceholder");
  const composerPlaceholder =
    selectedFiles.length > 0
      ? t("chat.filesMessagePlaceholder")
      : inputPlaceholder;
  const webSearchMaxResults = getWebSearchMaxResultsForPlan(userPlan);
  const contextPercent = Math.min(100, Math.max(10, selectedFiles.length * 10));
  const latestAssistantMessageIndex =
    getLatestAssistantMessageIndex(conversationMessages);
  const latestAssistantMessage =
    latestAssistantMessageIndex !== null
      ? conversationMessages[latestAssistantMessageIndex]
      : null;
  const isProcessingRunning =
    isLoading || isMessageProcessing(latestAssistantMessage);
  const selectedProcessDetailsMessage =
    processDetailsMessageIndex !== null
      ? conversationMessages[processDetailsMessageIndex]
      : null;
  const processDetailsMessage =
    selectedProcessDetailsMessage?.role === "assistant"
      ? selectedProcessDetailsMessage
      : null;

  useEffect(() => {
    if (!isProcessingRunning || latestAssistantMessageIndex === null) return;
    setProcessDetailsMessageIndex(latestAssistantMessageIndex);
    setIsProcessDetailsSidebarOpen(true);
  }, [isProcessingRunning, latestAssistantMessageIndex]);

  useEffect(() => {
    if (processDetailsMessageIndex === null) return;
    if (!conversationMessages[processDetailsMessageIndex]) {
      setProcessDetailsMessageIndex(null);
      setIsProcessDetailsSidebarOpen(false);
    }
  }, [conversationMessages, processDetailsMessageIndex]);

  const handleOpenProcessDetails = (messageIndex) => {
    setProcessDetailsMessageIndex(messageIndex);
    setIsProcessDetailsSidebarOpen(true);
  };

  return (
    <div
      data-testid="chat-conversation-body"
      className="relative flex h-full flex-1 bg-white"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && !composerDisabled && (
        <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/70 px-5 text-center text-sm font-semibold text-sky-700">
          <div className="flex flex-col items-center gap-3">
            <IconUpload size={42} />
            <span>{t("chat.dropFilesPrompt")}</span>
          </div>
        </div>
      )}
      <div className="mx-auto flex min-w-0 max-w-4xl flex-1 flex-col px-[1.5em] sm:px-6">
        <div className="flex-1 overflow-y-auto px-0 py-6 sm:px-6 lg:px-12">
          {conversationMessages.map((msg, index) => {
            const finalResponse = msg.stage3?.response || msg.content || "";
            const userFiles = Array.isArray(msg.files) ? msg.files : [];
            const hasUserText =
              typeof msg.content === "string" && msg.content.trim().length > 0;
            const isTurnStillProcessing = isMessageProcessing(msg);
            const isCancelledTurn = Boolean(msg.stage3?.cancelled);
            const hasAnyDeliberationData = Boolean(
              (Array.isArray(msg.stage1) && msg.stage1.length > 0) ||
              (Array.isArray(msg.stage2) && msg.stage2.length > 0) ||
              msg.stage3,
            );
            const shouldShowDeliberation = Boolean(
              !isTurnStillProcessing &&
              (hasAnyDeliberationData || isCancelledTurn),
            );

            return (
              <div key={index} className="mb-8">
                {msg.role === "user" ? (
                  <div className="mb-4 text-right flex flex-col items-end">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-slate-500">
                      {t("chat.youLabel")}
                    </div>
                    <div className="bg-slate-100 py-2.5 px-4 rounded-lg max-w-full sm:max-w-[80%]">
                      {userFiles.length > 0 && (
                        <div className="mb-2 rounded-lg border border-blue-200 bg-white p-2.5">
                          <div className="flex flex-wrap gap-2">
                            {userFiles.map((file, fileIndex) => {
                              const metadata = getMessageFileMetadata(file);
                              const sizeLabel = formatFileSize(
                                metadata.sizeBytes,
                                language,
                              );
                              return (
                                <div
                                  key={`${metadata.name}-${fileIndex}`}
                                  className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                                >
                                  <span className="text-slate-500">
                                    <FileIcon
                                      kind={metadata.kind}
                                      mimeType={metadata.mimeType}
                                    />
                                  </span>
                                  <span className="truncate">
                                    {metadata.name}
                                  </span>
                                  {sizeLabel && (
                                    <span className="shrink-0 text-slate-400">
                                      {sizeLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {hasUserText && (
                        <div className="leading-relaxed whitespace-pre-wrap markdown-content">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-slate-500">
                      {t("chat.councilAnswerLabel")}
                    </div>

                    {finalResponse ? (
                      <div className="markdown-content text-[15px] leading-relaxed text-slate-800">
                        <ReactMarkdown>{finalResponse}</ReactMarkdown>
                      </div>
                    ) : isTurnStillProcessing ? (
                      <div className="my-3 flex items-center gap-3 text-sm italic text-slate-500">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
                        <span>{t("chat.draftingFinalAnswer")}</span>
                      </div>
                    ) : (
                      <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {t("chat.stage3NotAvailable")}
                      </div>
                    )}

                    {shouldShowDeliberation && (
                      <div className="mt-4 text-right">
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-semibold text-slate-400 rounded-md hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          onClick={() => handleOpenProcessDetails(index)}
                        >
                          {t("chat.viewProcessDetails")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3 p-4 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
              <span>{t("chat.consultingCouncil")}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="pb-6 relative" onSubmit={handleSubmit}>
          <div className="absolute top-[-32px] left-0 w-full h-[32px] bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
          <div className="p-3 mx-auto w-full rounded-2xl border border-slate-200 focus-within:border-slate-400 transition-colors shadow-lg/10 shadow-slate-700 focus-within:shadow-slate-500">
            {selectedFiles.length > 0 && (
              <div className="border-b border-slate-300 px-4 pb-4 pt-3">
                <div className="mb-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-medium">{t("chat.contextLabel")}</span>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-300">
                    <span
                      className="block h-full rounded-full bg-slate-500"
                      style={{ width: `${contextPercent}%` }}
                    />
                  </span>
                  <span className="font-semibold text-slate-600">
                    {contextPercent}%
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {selectedFiles.map((file, index) => {
                    const sizeLabel = formatFileSize(file.size, language);
                    const typeLabel = formatFileTypeLabel(file);
                    return (
                      <div
                        key={`${file.name}-${file.lastModified}-${index}`}
                        className="flex max-w-full min-w-[220px] items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                          <FileIcon
                            kind={
                              file.type.startsWith("image/") ? "image" : "file"
                            }
                            mimeType={file.type}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {file.name}
                          </span>
                          <span className="block text-xs uppercase tracking-[0.3px] text-slate-500">
                            {typeLabel}
                            {sizeLabel ? ` · ${sizeLabel}` : ""}
                          </span>
                        </span>
                        {!isLoading && (
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => handleRemoveSelectedFile(index)}
                            aria-label={t("common.remove")}
                          >
                            <IconX size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {fileValidationError && (
              <div className="px-4 pt-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {fileValidationError}
                </div>
              </div>
            )}

            <textarea
              className="max-h-[200px] min-h-[80px] w-full resize-y bg-transparent px-1 py-1 leading-relaxed text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              placeholder={composerPlaceholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={composerDisabled}
              rows={3}
            />

            <div className="pt-2 flex items-center justify-between">
              <div className="relative flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex p-2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      disabled={composerDisabled}
                      aria-label={t("chat.openUploadMenu")}
                    >
                      <IconPlus size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  {!composerDisabled && (
                    <DropdownMenuContent
                      align="start"
                      side="top"
                      sideOffset={10}
                      className="w-[300px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg/10 shadow-slate-400"
                    >
                      <ComposerToolsMenuItem
                        icon={<IconUpload size={16} />}
                        title={t("chat.uploadFileAction")}
                        description={t("chat.uploadFileDescription")}
                        onSelect={handleOpenFileDialog}
                      />
                      <ComposerToolsMenuItem
                        className="mt-1"
                        icon={<IconSearch size={16} />}
                        title={t("chat.webSearchAction")}
                        description={t("chat.webSearchDescription", {
                          count: webSearchMaxResults,
                        })}
                        isActive={isWebSearchEnabled}
                        onSelect={() => {
                          setIsWebSearchEnabled((previous) => !previous);
                        }}
                        badge={
                          isWebSearchEnabled ? (
                            <span className="ml-auto mt-0.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3px] text-emerald-700">
                              <IconCheck size={11} />
                              {t("chat.webSearchEnabled")}
                            </span>
                          ) : null
                        }
                      />
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>

                {isWebSearchEnabled && (
                  <Tooltip content={t("chat.webSearchEnabledTooltip")}>
                    <span
                      role="status"
                      aria-label={t("chat.webSearchAction")}
                      className="inline-flex p-2 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600"
                      title={t("chat.webSearchEnabledTooltip")}
                    >
                      <IconWorld size={16} />
                    </span>
                  </Tooltip>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*"
                  onChange={handleFileSelection}
                />
              </div>

              {!isLoading && (
                <button
                  type="submit"
                  className="inline-flex p-2 items-center justify-center rounded-full border border-black bg-black text-white transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                  disabled={
                    composerDisabled ||
                    (!input.trim() && selectedFiles.length === 0)
                  }
                  aria-label={t("common.send")}
                >
                  <IconSend2 size={18} />
                </button>
              )}

              {isLoading && canCancelMessage && (
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:border-black hover:bg-black"
                  onClick={onCancelMessage}
                >
                  <IconLoader2 size={14} className="animate-spin" />
                  {t("common.stop")}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {isProcessDetailsSidebarOpen && processDetailsMessage && (
        <Sheet
          open={isProcessDetailsSidebarOpen}
          onOpenChange={(open) => setIsProcessDetailsSidebarOpen(open)}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            overlayClassName="bg-slate-950/25 backdrop-blur-none"
            className="w-full max-w-none gap-0 border-l border-slate-200 bg-slate-50 p-0 sm:w-[min(92vw,540px)] lg:w-[380px]"
          >
            <SheetTitle className="sr-only">
              {t("chat.processDetailsTitle")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("chat.viewProcessDetails")}
            </SheetDescription>
            <SidebarRight
              message={processDetailsMessage}
              language={language}
              t={t}
              onClose={() => setIsProcessDetailsSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {!isProcessDetailsSidebarOpen &&
        isProcessingRunning &&
        latestAssistantMessage && (
          <button
            type="button"
            className="fixed bottom-24 right-6 z-20 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:border-black hover:bg-black"
            onClick={() => {
              setProcessDetailsMessageIndex(latestAssistantMessageIndex);
              setIsProcessDetailsSidebarOpen(true);
            }}
          >
            {t("chat.viewProcessDetails")}
          </button>
        )}
    </div>
  );
}
