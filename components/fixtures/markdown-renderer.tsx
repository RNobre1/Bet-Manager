"use client";

import { Fragment, type ReactNode } from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Minimal markdown renderer — supports the subset the LLM actually emits:
 * paragraphs, **bold**, *italic*, `inline code`, unordered lists (`- ` /
 * `* `), ordered lists (`1. `), and headings (#..######). Anything else
 * passes through as plain text. We avoid pulling in react-markdown +
 * remark-gfm because (a) they're not a dependency in this codebase and
 * (b) the LLM responses are already constrained by the system prompt.
 *
 * Implementation is line-oriented: split into blocks (consecutive non-empty
 * lines = paragraph or list), then render each block.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = parseBlocks(content);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  function flushBuf() {
    if (buf.length > 0) {
      blocks.push({ type: "paragraph", lines: buf });
      buf = [];
    }
  }
  function flushList() {
    if (listKind && listItems.length > 0) {
      blocks.push({ type: listKind, items: listItems });
      listItems = [];
      listKind = null;
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim().length === 0) {
      flushBuf();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBuf();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushBuf();
      if (listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(ul[1]);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushBuf();
      if (listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(ol[1]);
      continue;
    }

    flushList();
    buf.push(line);
  }

  flushBuf();
  flushList();
  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.type === "heading") {
    const sizes: Record<number, string> = {
      1: "text-xl",
      2: "text-lg",
      3: "text-base",
      4: "text-sm",
      5: "text-xs",
      6: "text-xs",
    };
    return (
      <p
        key={key}
        className={`font-medium ${sizes[block.level] ?? "text-base"} text-[var(--color-ink-display)]`}
      >
        {renderInline(block.text)}
      </p>
    );
  }
  if (block.type === "paragraph") {
    return (
      <p key={key}>
        {block.lines.map((l, i) => (
          <Fragment key={i}>
            {renderInline(l)}
            {i < block.lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
  }
  if (block.type === "ul") {
    return (
      <ul key={key} className="ml-4 list-disc space-y-1">
        {block.items.map((it, i) => (
          <li key={i}>{renderInline(it)}</li>
        ))}
      </ul>
    );
  }
  return (
    <ol key={key} className="ml-4 list-decimal space-y-1">
      {block.items.map((it, i) => (
        <li key={i}>{renderInline(it)}</li>
      ))}
    </ol>
  );
}

/**
 * Inline tokens: **bold**, *italic*, `code`. Order matters — handle bold
 * before italic (so `**foo**` doesn't get half-eaten by the italic regex).
 */
function renderInline(text: string): ReactNode {
  const tokens: ReactNode[] = [];
  const inline = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = inline.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(
        <Fragment key={`t${i++}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const tok = match[0];
    if (tok.startsWith("**")) {
      tokens.push(
        <strong key={`b${i++}`} className="text-[var(--color-ink-display)]">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      tokens.push(
        <code
          key={`c${i++}`}
          className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[0.85em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      tokens.push(<em key={`i${i++}`}>{tok.slice(1, -1)}</em>);
    }
    lastIndex = inline.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push(<Fragment key={`t${i++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return tokens;
}
