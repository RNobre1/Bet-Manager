"use client";

import { MarkdownRenderer } from "./markdown-renderer";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Initial "give me a pre-game analysis" pseudo-turn — kept in state so the
  // LLM sees a [user, assistant, user, ...] sequence in follow-ups, but
  // suppressed from the rendered chat so the UX stays a single block of
  // analysis followed by replies.
  hidden?: boolean;
}

interface ChatMessageProps {
  message: ChatMessage;
}

/**
 * Renders a single chat turn. User text is plain (no markdown — the user
 * doesn't get to inject HTML/markdown into their own bubble), assistant
 * replies are rendered via the minimal MarkdownRenderer.
 */
export function ChatMessageView({ message }: ChatMessageProps) {
  if (message.hidden) return null;
  const isUser = message.role === "user";
  const empty = !isUser && message.content.trim().length === 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <p
          className="card max-w-[80%] whitespace-pre-wrap rounded-[var(--radius)] px-4 py-3 text-sm text-[var(--color-ink-display)]"
          style={{ backgroundColor: "var(--color-surface-3)" }}
        >
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex">
      <div className="max-w-full text-sm leading-relaxed text-[var(--color-ink)]">
        {empty ? (
          <p className="text-[var(--color-ink-muted)] italic">Analisando…</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </div>
  );
}
