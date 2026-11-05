"use client";

/* Lightweight markdown renderer for chat messages */

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const code = String(children).replace(/\n$/, "");
  const lang = match?.[1] ?? "text";

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="group/code relative my-2.5 overflow-hidden rounded-2xl ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.04] px-3.5 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {lang}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: "oklch(0.145 0.004 55)",
          fontSize: "12px",
          padding: "14px 16px",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-geist-mono), monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("ip-md text-[13.5px] text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { children, className, node, ...rest } = props;
            void node;
            void rest;
            const isBlock = /language-/.test(className || "") || String(children).includes("\n");
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code className={className}>{children}</code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          a(props) {
            const { children, href } = props;
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
