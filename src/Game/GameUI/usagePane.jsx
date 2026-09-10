/*! Historia Web — AI usage & cost pane (new work, AGPL-3.0-or-later). */
import React, { useEffect, useState } from "react";
import { clearUsage, getSessionStartTs, listUsage, summarizeUsage } from "../AI/usage.js";

const TASK_LABELS = {
    jumpForward: "Time jump",
    autoJumpForward: "Auto-jump",
    catalystCreation: "Catalyst creation",
    catalystExecutor: "Catalyst execution",
    catalystSummary: "Catalyst summary",
    pregameHistory: "Pregame history",
    actions: "Your actions",
    descriptionToAction: "Action parsing",
    nextSpeaker: "Next speaker",
    eventConsolidator: "Event consolidation",
    gameMaster: "GM commands",
    countryStatSheet: "Stat sheet",
    idleDiplomacy: "Auto-diplomacy",
    advisor: "Advisor chat",
};

const CLASS_LABELS = { narrative: "Narrative", structured: "Structured", chat: "Chat", utility: "Utility" };
const CLASS_COLORS = { narrative: "#a78bfa", structured: "#3b82f6", chat: "#22d3ee", utility: "#34d399" };

const sectionTitleStyle = {
    color: "rgba(255,255,255,0.45)",
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    margin: "1.1rem 0 0.6rem",
    textTransform: "uppercase",
};

const cardStyle = {
    backgroundColor: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "0.6rem 0.7rem",
};

const taskLabel = (key) =>
    TASK_LABELS[key] ||
    (key
        ? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim()
        : "Unknown task");

const timeLabel = (ts) => {
    try {
        return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
};

const formatCost = (cost) => {
    if (cost === null || cost === undefined || !Number.isFinite(Number(cost))) return "—";
    const value = Number(cost);
    return `$${value.toFixed(value >= 1 ? 2 : value >= 0.01 ? 3 : 4)}`;
};

const formatTokens = (n) => Number(n || 0).toLocaleString();

const StatCard = ({ label, value, sub, tone }) => (
    <div style={cardStyle}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "0.3rem", textTransform: "uppercase" }}>
            {label}
        </div>
        <div data-no-translate style={{ color: tone || "#e7e7e9", fontSize: "1.05rem", fontWeight: 800 }}>{value}</div>
        {sub && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.68rem", marginTop: "0.15rem" }}>{sub}</div>}
    </div>
);

// Width share of the widest bar in its group (for per-model cost bars).
const barShare = (value, max) => (max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0);

const UsagePane = ({ active }) => {
    // Re-render on an interval so totals tick up while the pane is open and
    // turns/advisor replies land in the background. localStorage reads are cheap
    // (loadLog caches), so a 3s poll is invisible.
    const [, setRefresh] = useState(0);
    useEffect(() => {
        if (!active) return undefined;
        const id = window.setInterval(() => setRefresh((r) => r + 1), 3000);
        return () => window.clearInterval(id);
    }, [active]);

    const session = summarizeUsage({ sinceTs: getSessionStartTs() });
    const all = summarizeUsage();
    const recent = listUsage({ limit: 12 });

    const sessionTokens = session.promptTokens + session.completionTokens;
    const allTokens = all.promptTokens + all.completionTokens;
    // Cost bars compare models by spend; when no provider reported costs, fall
    // back to calls so the bars still mean something.
    const costKnown = all.byModel.some((m) => m.costKnown);
    const barValue = (m) => (costKnown ? m.cost : m.calls);
    const barMax = Math.max(1, ...all.byModel.map(barValue));

    return (
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem 0" }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.85rem", fontWeight: 700 }}>AI usage &amp; cost</span>
                <button
                    onClick={() => {
                        if (window.confirm("Clear the AI usage log? This resets the totals.")) {
                            clearUsage();
                            setRefresh((r) => r + 1);
                        }
                    }}
                    title="Clear the usage log"
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", padding: "0.2rem 0", textTransform: "uppercase" }}
                >Clear log</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0.6rem 1rem 1.25rem", scrollbarWidth: "none" }}>
                {all.calls === 0 && (
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
                    No AI calls recorded yet. Every turn, time jump, and advisor reply will show here — with the model used, token counts, and cost.
                    </p>
                )}

                {all.calls > 0 && (
                    <>
                    <div style={sectionTitleStyle}>This session</div>
                    <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "1fr 1fr" }}>
                    <StatCard label="AI calls" value={session.calls.toLocaleString()} tone="#93c5fd" />
                    <StatCard label="Cost" value={formatCost(session.cost)} tone={session.cost != null ? "#fbbf24" : undefined} sub={session.cost == null ? "provider reports tokens only" : undefined} />
                    <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "0.3rem", textTransform: "uppercase" }}>Tokens</div>
                    <div data-no-translate style={{ color: "#e7e7e9", fontSize: "1.05rem", fontWeight: 800 }}>
                    {formatTokens(sessionTokens)}
                    </div>
                    <div data-no-translate style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.68rem", marginTop: "0.15rem" }}>
                    {formatTokens(session.promptTokens)} in · {formatTokens(session.completionTokens)} out
                    </div>
                    </div>
                    </div>
                    <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem", margin: "0.6rem 0 0" }}>
                    All time: <span data-no-translate>{formatTokens(allTokens)} tokens</span> · <span data-no-translate>{all.calls.toLocaleString()} calls</span> · <span data-no-translate>{formatCost(all.cost)}</span>
                    </p>

                    <div style={sectionTitleStyle}>By model</div>
                    {all.byModel.map((m) => (
                        <div key={m.model} style={{ ...cardStyle, marginBottom: "0.5rem" }}>
                        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.35rem" }}>
                        <span data-no-translate style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.74rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.model}>
                        {m.model}
                        </span>
                        <span data-no-translate style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem", flexShrink: 0 }}>
                        {m.calls} calls · {formatTokens(m.promptTokens + m.completionTokens)} tok · {formatCost(m.cost)}
                        </span>
                        </div>
                        <div style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "999px", height: "5px", overflow: "hidden" }}>
                        <div data-no-translate style={{ backgroundColor: m.costKnown && costKnown ? "#fbbf24" : "#3b82f6", borderRadius: "999px", height: "100%", width: `${barShare(barValue(m), barMax)}%`, transition: "width 0.4s" }} />
                        </div>
                        </div>
                    ))}

                    <div style={sectionTitleStyle}>Recent calls</div>
                    {recent.length === 0 && <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.78rem" }}>Nothing yet.</p>}
                    {recent.map((entry, i) => (
                        <div key={`${entry.ts}-${i}`} style={{ ...cardStyle, alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.4rem" }}>
                        <span data-no-translate style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0, fontSize: "0.66rem", width: "2.6rem" }}>{timeLabel(entry.ts)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.74rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskLabel(entry.taskKey)}</div>
                        <div data-no-translate style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.64rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.model || entry.provider}</div>
                        </div>
                        {entry.taskClass && (
                            <span style={{ backgroundColor: `${CLASS_COLORS[entry.taskClass] || "#3b82f6"}22`, border: `1px solid ${CLASS_COLORS[entry.taskClass] || "#3b82f6"}55`, borderRadius: "999px", color: CLASS_COLORS[entry.taskClass] || "#93c5fd", flexShrink: 0, fontSize: "0.58rem", fontWeight: 700, padding: "0.1rem 0.4rem" }}>
                            {CLASS_LABELS[entry.taskClass] || entry.taskClass}
                            </span>
                        )}
                        <span data-no-translate style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0, fontSize: "0.68rem" }}>
                        {formatTokens((entry.promptTokens || 0) + (entry.completionTokens || 0))} tok
                        {entry.cost != null && <> · {formatCost(entry.cost)}</>}
                        </span>
                        </div>
                    ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default UsagePane;