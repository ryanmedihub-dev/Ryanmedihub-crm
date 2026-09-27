"use client";

import { useState } from "react";
import Modal from "@/components/owner/Modal";

function JsonNode({ label, value, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const isObj = value && typeof value === "object";

  if (!isObj) {
    return (
      <div className="ai-json-row" style={{ paddingLeft: depth * 14 }}>
        {label != null && <span className="ai-json-key">{label}:</span>}
        <span className="ai-json-value">{JSON.stringify(value)}</span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  if (entries.length === 0) {
    return (
      <div className="ai-json-row" style={{ paddingLeft: depth * 14 }}>
        {label != null && <span className="ai-json-key">{label}:</span>}
        <span className="ai-json-value">{Array.isArray(value) ? "[]" : "{}"}</span>
      </div>
    );
  }

  return (
    <div className="ai-json-node">
      <button type="button" className="ai-json-toggle" style={{ paddingLeft: depth * 14 }} onClick={() => setCollapsed((c) => !c)}>
        <span className="ai-json-caret">{collapsed ? "▸" : "▾"}</span>
        {label != null && <span className="ai-json-key">{label}</span>}
        <span className="ai-json-count">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {!collapsed && (
        <div>
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AiFactsDrawer({ open, onClose, facts, entities, meta }) {
  const entityList = Object.values(entities || {});

  return (
    <Modal open={open} onClose={onClose} variant="drawer" title="What AI saw" subtitle="The exact aggregated data sent to OpenAI for this analysis">
      {meta && (
        <div className="ai-facts-meta">
          {meta.model && <span>{meta.model}</span>}
          {meta.generatedAt && <span>{new Date(meta.generatedAt).toLocaleString()}</span>}
          {meta.promptTokens != null && <span>{meta.promptTokens + (meta.completionTokens || 0)} tokens</span>}
          {meta.costUsd != null && <span>${meta.costUsd.toFixed(4)}</span>}
          {meta.stageMs && <span>{Object.values(meta.stageMs).reduce((a, b) => a + (b || 0), 0)}ms total</span>}
        </div>
      )}

      {entityList.length > 0 && (
        <div className="ai-facts-legend">
          <h4>Alias legend <span className="ai-facts-legend-note">— visible only to you, not sent to AI</span></h4>
          <div className="ai-facts-legend-grid">
            {entityList.map((e) => (
              <span key={e.alias} className="ai-facts-legend-item">
                <span className="ai-facts-legend-alias">{e.alias}</span> {e.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="ai-json-tree">
        <JsonNode value={facts || {}} />
      </div>
    </Modal>
  );
}
