"use client";

const FADE_TAIL = 20; // characters wrapped in a fade-in span as they arrive

// Renders whatever text has actually streamed in — no artificial delay, no
// typewriter timer. The last ~20 characters get a brief fade so new tokens
// don't just pop in, and a blinking caret shows while `streaming` is true.
export default function AiStreamText({ text = "", streaming = false, as: Tag = "p", className = "" }) {
  const splitAt = Math.max(0, text.length - FADE_TAIL);
  const head = text.slice(0, splitAt);
  const tail = text.slice(splitAt);

  return (
    <Tag className={`ai-stream-text${className ? ` ${className}` : ""}`}>
      {head}
      <span className="ai-stream-tail" key={text.length}>{tail}</span>
      {streaming && <span className="ai-caret" aria-hidden="true" />}
    </Tag>
  );
}
