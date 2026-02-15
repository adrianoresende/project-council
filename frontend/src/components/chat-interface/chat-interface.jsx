import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from '../stage-1/stage-1';
import Stage2 from '../stage-2/stage-2';
import Stage3 from '../stage-3/stage-3';
import { useI18n } from '../../i18n';

function formatUsageSummary(usage, t, language) {
  if (!usage || typeof usage !== 'object') return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const totalCost = Number(usage.total_cost ?? usage.cost ?? 0);
  const modelCalls = Number(usage.model_calls ?? 0);
  const parts = [
    t('common.usageTokens', { count: totalTokens.toLocaleString(language) }),
  ];

  if (Number.isFinite(totalCost) && totalCost > 0) {
    parts.push(`$${totalCost.toFixed(6)}`);
  }

  if (Number.isFinite(modelCalls) && modelCalls > 0) {
    parts.push(
      t('common.usageModelCalls', { count: modelCalls.toLocaleString(language) })
    );
  }

  return parts.join(' · ');
}

function getShortModelName(model, t) {
  if (typeof model !== 'string' || !model) {
    return t('stage.councilChairmanFallback');
  }
  return model.split('/')[1] || model;
}

function getLatestAssistantMessage(messages) {
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant') {
      return message;
    }
  }

  return null;
}

function getStageStatus(message, key) {
  if (message?.loading?.[key]) return 'running';
  if (message?.[key]) return 'completed';
  return 'pending';
}

function getStageDetail(message, key, t, language) {
  if (!message) return null;

  if (key === 'stage1' && Array.isArray(message.stage1)) {
    return t('chat.stage1ModelResponses', {
      count: message.stage1.length.toLocaleString(language),
    });
  }

  if (key === 'stage2' && Array.isArray(message.stage2)) {
    return t('chat.stage2PeerEvaluations', {
      count: message.stage2.length.toLocaleString(language),
    });
  }

  if (key === 'stage3' && message.stage3?.response) {
    return t('chat.finalAnswerGenerated');
  }

  return null;
}

function ProcessingSidebar({ message, language, t }) {
  const stages = [
    {
      key: 'stage1',
      title: t('chat.stage1Title'),
      description: t('chat.stage1Description'),
    },
    {
      key: 'stage2',
      title: t('chat.stage2Title'),
      description: t('chat.stage2Description'),
    },
    {
      key: 'stage3',
      title: t('chat.stage3Title'),
      description: t('chat.stage3Description'),
    },
  ].map((stage) => {
    const status = getStageStatus(message, stage.key);
    return {
      ...stage,
      status,
      detail: getStageDetail(message, stage.key, t, language),
    };
  });

  const completedCount = stages.filter((stage) => stage.status === 'completed').length;

  return (
    <aside className="hidden h-screen w-[320px] shrink-0 border-l border-slate-200 bg-slate-50 lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.4px] text-slate-500">{t('chat.progressTitle')}</div>
        <p className="mt-2 text-sm text-slate-600">
          {t('chat.stageProgress', {
            completed: completedCount.toLocaleString(language),
            total: stages.length.toLocaleString(language),
          })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ol className="flex flex-col gap-3">
          {stages.map((stage) => (
            <li key={stage.key} className="rounded-lg border border-slate-200 bg-white p-3.5">
              <div className="flex items-start gap-3">
                {stage.status === 'running' ? (
                  <span className="mt-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
                ) : (
                  <span
                    className={`mt-1 h-3.5 w-3.5 rounded-full ${
                      stage.status === 'completed' ? 'bg-slate-900' : 'bg-slate-300'
                    }`}
                  />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{stage.title}</div>
                  <div className="text-xs leading-relaxed text-slate-500">{stage.description}</div>
                  {stage.detail && (
                    <div className="mt-1 text-xs font-medium text-slate-700">{stage.detail}</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function StagePlaceholder({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
      {text}
    </div>
  );
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
}) {
  const { language, t } = useI18n();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const inputPlaceholder = conversation?.messages?.length
    ? t('chat.continuePlaceholder')
    : t('chat.askPlaceholder');

  if (!conversation) {
    return (
      <div className="flex h-screen flex-1 flex-col bg-white">
        <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-500">
          <h2 className="mb-2 text-2xl text-slate-800">{t('chat.welcomeTitle')}</h2>
          <p className="text-base">{t('chat.welcomeDescription')}</p>
        </div>
      </div>
    );
  }

  const processingMessage = isLoading
    ? getLatestAssistantMessage(conversation.messages)
    : null;

  return (
    <div className="flex h-screen flex-1 bg-white">
      <div className="min-w-0 flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          {conversation.usage && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-900">
              {t('chat.conversationUsage', {
                value: formatUsageSummary(conversation.usage, t, language),
              })}
            </div>
          )}

          {conversation.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-500">
              <h2 className="mb-2 text-2xl text-slate-800">{t('chat.startConversationTitle')}</h2>
              <p className="text-base">{t('chat.startConversationDescription')}</p>
            </div>
          ) : (
            conversation.messages.map((msg, index) => {
              const finalResponse = msg.stage3?.response || msg.content || '';
              const shouldShowDeliberation = Boolean(
                msg.stage1
                || msg.stage2
                || msg.stage3
                || msg.loading?.stage1
                || msg.loading?.stage2
                || msg.loading?.stage3
              );

              return (
                <div key={index} className="mb-8">
                  {msg.role === 'user' ? (
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-slate-500">
                        {t('chat.youLabel')}
                      </div>
                      <div className="max-w-[80%] rounded-lg border border-blue-200 bg-blue-50 p-4 leading-relaxed whitespace-pre-wrap text-slate-800">
                        <div className="markdown-content">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-slate-500">
                        {t('chat.councilAnswerLabel')}
                      </div>
                      {msg.metadata?.usage && (
                        <div className="mb-3 text-xs text-slate-500">
                          {t('chat.turnUsage', {
                            value: formatUsageSummary(msg.metadata.usage, t, language),
                          })}
                        </div>
                      )}

                      {finalResponse ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-5">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-mono text-xs font-semibold text-slate-600">
                              {t('stage.chairmanLabel')}: {getShortModelName(msg.stage3?.model, t)}
                            </div>
                            {msg.stage3?.usage && (
                              <div className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900">
                                {formatUsageSummary(msg.stage3.usage, t, language)}
                              </div>
                            )}
                          </div>
                          <div className="markdown-content text-[15px] leading-relaxed text-slate-800">
                            <ReactMarkdown>{finalResponse}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm italic text-slate-500">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
                          <span>{t('chat.draftingFinalAnswer')}</span>
                        </div>
                      )}

                      {shouldShowDeliberation && (
                        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                            {t('chat.viewDeliberation')}
                          </summary>
                          <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                            {msg.stage1 ? (
                              <Stage1 responses={msg.stage1} className="my-0" />
                            ) : (
                              <StagePlaceholder
                                text={msg.loading?.stage1
                                  ? t('chat.stage1Processing')
                                  : t('chat.stage1NotAvailable')}
                              />
                            )}

                            {msg.stage2 ? (
                              <Stage2
                                rankings={msg.stage2}
                                labelToModel={msg.metadata?.label_to_model}
                                aggregateRankings={msg.metadata?.aggregate_rankings}
                                className="my-0"
                              />
                            ) : (
                              <StagePlaceholder
                                text={msg.loading?.stage2
                                  ? t('chat.stage2Processing')
                                  : t('chat.stage2NotAvailable')}
                              />
                            )}

                            {msg.stage3 ? (
                              <Stage3 finalResponse={msg.stage3} className="my-0" />
                            ) : (
                              <StagePlaceholder
                                text={msg.loading?.stage3
                                  ? t('chat.stage3Processing')
                                  : t('chat.stage3NotAvailable')}
                              />
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex items-center gap-3 p-4 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
              <span>{t('chat.consultingCouncil')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="flex items-end gap-3 border-t border-slate-200 bg-slate-50 p-6" onSubmit={handleSubmit}>
          <textarea
            className="min-h-20 max-h-[300px] flex-1 resize-y rounded-lg border border-slate-300 bg-white p-3.5 text-[15px] leading-relaxed text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
            placeholder={inputPlaceholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={3}
          />
          <button
            type="submit"
            className="btn self-end whitespace-nowrap border-sky-500 bg-sky-500 px-7 py-3.5 text-[15px] font-semibold text-white hover:border-sky-600 hover:bg-sky-600 disabled:border-slate-300 disabled:bg-slate-300 disabled:opacity-50"
            disabled={!input.trim() || isLoading}
          >
            {t('common.send')}
          </button>
        </form>
      </div>

      {processingMessage && (
        <ProcessingSidebar message={processingMessage} language={language} t={t} />
      )}
    </div>
  );
}
