"use client";

const FADE_TAIL = 20; 

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
