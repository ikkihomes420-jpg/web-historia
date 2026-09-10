/*! Historia Web — OpenRouter model catalog (new work, AGPL-3.0-or-later). */

/**
 * OpenRouter's own auto-router. When the player hasn't picked a model,
 * this is the default: OpenRouter picks the best available model for
 * each request, which is exactly the "recommended AI by default" behavior.
 */
export const OPENROUTER_AUTO_MODEL = "openrouter/auto";

/**
 * Curated suggestions for the settings UI, grouped by the role they play
 * in the game's AI routing. Ids verified against openrouter.ai model pages.
 * The client falls back down the chain if a call 404s/410s on a retired id.
 */
export const OPENROUTER_SUGGESTED_MODELS = [
    {
        id: OPENROUTER_AUTO_MODEL,
        label: "Auto (recommended)",
        role: "Let OpenRouter pick the best model per request",
        taskClass: "all",
    },
    {
        id: "anthropic/claude-sonnet-5",
        label: "Claude Sonnet 5",
        role: "Strong narrative + tool calling (events, catalysts, diplomacy)",
        taskClass: "narrative",
    },
    {
        id: "google/gemini-3.8-flash",
        label: "Gemini 3.8 Flash",
        role: "Fast and cheap — jumps, stat sheets, consolidation",
        taskClass: "utility",
    },
    {
        id: "openai/gpt-5-mini",
        label: "GPT-5 Mini",
        role: "Balanced structured output (GM commands, actions)",
        taskClass: "structured",
    },
    {
        id: "deepseek/deepseek-chat-v3.1",
        label: "DeepSeek V3.1",
        role: "Budget chat model (advisor, leader diplomacy)",
        taskClass: "chat",
    },
];

/**
 * Task-class -> preferred model chain. Used by per-task routing once the
 * AI layer is split by taskClass; until then callOpenRouter uses the
 * player's selected model (or auto).
 */
export const OPENROUTER_TASK_ROUTES = {
    narrative: [OPENROUTER_AUTO_MODEL, "anthropic/claude-sonnet-5", "deepseek/deepseek-chat-v3.1"],
    structured: [OPENROUTER_AUTO_MODEL, "openai/gpt-5-mini", "google/gemini-3.8-flash"],
    chat: [OPENROUTER_AUTO_MODEL, "google/gemini-3.8-flash", "deepseek/deepseek-chat-v3.1"],
    utility: [OPENROUTER_AUTO_MODEL, "google/gemini-3.8-flash"],
};

export function suggestedModelsForTask(taskClass = "all") {
    if (!taskClass || taskClass === "all") return OPENROUTER_SUGGESTED_MODELS;
    return OPENROUTER_SUGGESTED_MODELS.filter(
        (m) => m.taskClass === "all" || m.taskClass === taskClass,
    );
}

export function isSuggestedModel(modelId) {
    return OPENROUTER_SUGGESTED_MODELS.some((m) => m.id === modelId);
}
