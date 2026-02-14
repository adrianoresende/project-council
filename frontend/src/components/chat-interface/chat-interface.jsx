import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from '../stage-1/stage-1';
import Stage2 from '../stage-2/stage-2';
import Stage3 from '../stage-3/stage-3';

function formatUsageSummary(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const totalCost = Number(usage.total_cost ?? usage.cost ?? 0);
  const modelCalls = Number(usage.model_calls ?? 0);
  const parts = [`${totalTokens.toLocaleString()} tokens`];

  if (Number.isFinite(totalCost) && totalCost > 0) {
    parts.push(`$${totalCost.toFixed(6)}`);
  }

  if (Number.isFinite(modelCalls) && modelCalls > 0) {
    parts.push(`${modelCalls} model calls`);
  }

  return parts.join(' · ');
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
}) {
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
    ? 'Continue this conversation... (Shift+Enter for new line, Enter to send)'
    : 'Ask your question... (Shift+Enter for new line, Enter to send)';

  if (!conversation) {
    return (
      <div className="flex h-screen flex-1 flex-col bg-white">
        <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-500">
          <h2 className="mb-2 text-2xl text-slate-800">Welcome to LLM Council</h2>
          <p className="text-base">Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col bg-white">
      <div className="flex-1 overflow-y-auto p-6">
        {conversation.usage && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-900">
            Conversation usage: {formatUsageSummary(conversation.usage)}
          </div>
        )}

        {conversation.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-500">
            <h2 className="mb-2 text-2xl text-slate-800">Start a conversation</h2>
            <p className="text-base">Ask a question to consult the LLM Council</p>
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="mb-8">
              {msg.role === 'user' ? (
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-slate-500">
                    You
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
                    LLM Council
                  </div>
                  {msg.metadata?.usage && (
                    <div className="mb-3 text-xs text-slate-500">
                      Turn usage: {formatUsageSummary(msg.metadata.usage)}
                    </div>
                  )}

                  {/* Stage 1 */}
                  {msg.loading?.stage1 && (
                    <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm italic text-slate-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
                      <span>Running Stage 1: Collecting individual responses...</span>
                    </div>
                  )}
                  {msg.stage1 && <Stage1 responses={msg.stage1} />}

                  {/* Stage 2 */}
                  {msg.loading?.stage2 && (
                    <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm italic text-slate-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
                      <span>Running Stage 2: Peer rankings...</span>
                    </div>
                  )}
                  {msg.stage2 && (
                    <Stage2
                      rankings={msg.stage2}
                      labelToModel={msg.metadata?.label_to_model}
                      aggregateRankings={msg.metadata?.aggregate_rankings}
                    />
                  )}

                  {/* Stage 3 */}
                  {msg.loading?.stage3 && (
                    <div className="my-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm italic text-slate-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
                      <span>Running Stage 3: Final synthesis...</span>
                    </div>
                  )}
                  {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-3 p-4 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
            <span>Consulting the council...</span>
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
          Send
        </button>
      </form>
    </div>
  );
}
