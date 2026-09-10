/*! Historia Web — per-call AI usage/cost tracking (new work, AGPL-3.0-or-later). */

const LOG_KEY = "ai_usage_log";
const MAX_ENTRIES = 500;

let log = null;

function loadLog() {
    if (log) return log;
    try {
        const raw = localStorage.getItem(LOG_KEY);
        log = raw ? JSON.parse(raw) : [];
    } catch {
        log = [];
    }
    if (!Array.isArray(log)) log = [];
    return log;
}

function saveLog() {
    try {
        localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
    } catch {
        // Storage full / disabled — tracking stays in-memory for the session.
    }
}

/**
 * Record one AI call. Safe to call with partial data — every field is
 * optional except ts. OpenRouter returns cost when the request asked for
 * usage.include=true; other providers report token counts only.
 */
export function recordUsage({
    provider = "",
    model = "",
    taskKey = "",
    taskClass = "",
    promptTokens = 0,
    completionTokens = 0,
    cost = null,
    source = "",
}) {
    const entries = loadLog();
    entries.push({
        ts: Date.now(),
        provider,
        model,
        taskKey,
        taskClass,
        promptTokens: Number(promptTokens) || 0,
        completionTokens: Number(completionTokens) || 0,
        cost: Number.isFinite(Number(cost)) ? Number(cost) : null,
        source,
    });
    saveLog();
}

/**
 * Hook for the OpenAI-style chat-completions caller: pulls the standard
 * usage block out of a parsed response body and records it. OpenRouter's
 * extended usage (cost) rides inside data.usage when requested.
 */
export function recordOpenAIUsage(data, meta = {}) {
    const usage = data?.usage;
    if (!usage) return;
    recordUsage({
        provider: meta.provider ?? "",
        model: data?.model ?? meta.model ?? "",
        taskKey: meta.taskKey ?? "",
        taskClass: meta.taskClass ?? "",
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cost: usage.cost ?? null,
        source: meta.source ?? "chat-completions",
    });
}

/** Aggregates for the spend HUD: totals per model and grand totals. */
export function summarizeUsage({ sinceTs = 0 } = {}) {
    const entries = loadLog().filter((e) => e.ts >= sinceTs);
    const byModel = new Map();
    let promptTokens = 0;
    let completionTokens = 0;
    let cost = 0;
    let costKnown = false;
    for (const e of entries) {
        promptTokens += e.promptTokens;
        completionTokens += e.completionTokens;
        if (e.cost != null) {
            cost += e.cost;
            costKnown = true;
        }
        const key = e.model || "(unknown)";
        const m = byModel.get(key) ?? { model: key, promptTokens: 0, completionTokens: 0, cost: 0, costKnown: false, calls: 0 };
        m.promptTokens += e.promptTokens;
        m.completionTokens += e.completionTokens;
        m.calls += 1;
        if (e.cost != null) {
            m.cost += e.cost;
            m.costKnown = true;
        }
        byModel.set(key, m);
    }
    return {
        calls: entries.length,
        promptTokens,
        completionTokens,
        cost: costKnown ? cost : null,
        byModel: [...byModel.values()].sort((a, b) => b.calls - a.calls),
    };
}
