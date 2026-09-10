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
        id: "google/gemini-3.8-flash",
        label: "Gemini 3.8 Flash",
        role: "Fast and recommended — jumps, actions, stat sheets, consolidation (the default for every task class)",
        taskClass: "all",
    },
    {
        id: "anthropic/claude-sonnet-5",
        label: "Claude Sonnet 5",
        role: "Premium narrative — slower, best prose. Set as the narrative/story override for quality over speed",
        taskClass: "narrative",
    },
    {
        id: "openai/gpt-5-mini",
        label: "GPT-5 Mini",
        role: "Balanced structured output — fallback for actions/GM when Flash is unavailable",
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
 * Task-class -> preferred model chain. When the player leaves the model
 * blank ("Auto"), each task class routes to its concrete primary with
 * fallbacks; "openrouter/auto" is the last resort so a retired id can
 * never break a turn. Player-chosen models always win over routing.
 */
export const OPENROUTER_TASK_ROUTES = {
    // Fast-first: Gemini 3.8 Flash handles jumps and actions well and answers in
    // seconds; the frontier model is the fallback, and the per-class settings
    // override (modelNarrative / modelStructured) still lets a player choose
    // premium narrative quality over speed. Reasoning models as the DEFAULT made
    // every turn feel hung (thinking tokens on huge game-state prompts); the
    // frontier tier now has to be earned by an explicit pick.
    narrative: ["google/gemini-3.8-flash", "anthropic/claude-sonnet-5", OPENROUTER_AUTO_MODEL],
    structured: ["google/gemini-3.8-flash", "openai/gpt-5-mini", OPENROUTER_AUTO_MODEL],
    chat: ["google/gemini-3.8-flash", "deepseek/deepseek-chat-v3.1", OPENROUTER_AUTO_MODEL],
    utility: ["google/gemini-3.8-flash", OPENROUTER_AUTO_MODEL],
};

/** Which routing class a gameplay task belongs to. */
export const TASK_CLASS_MAP = {
    jumpForward: "narrative",
    autoJumpForward: "narrative",
    catalystCreation: "narrative",
    catalystExecutor: "narrative",
    catalystSummary: "utility",
    pregameHistory: "narrative",
    actions: "structured",
    descriptionToAction: "chat",
    nextSpeaker: "chat",
    eventConsolidator: "utility",
    gameMaster: "structured",
    countryStatSheet: "utility",
    idleDiplomacy: "chat",
};

export function taskClassForTask(taskKey) {
    return TASK_CLASS_MAP[taskKey] ?? "structured";
}

/** (model, models[]) for a call: player override > task route > auto. */
export function resolveRoutedModel(storedModel, taskClass) {
    const trimmed = (storedModel ?? "").trim();
    if (trimmed) return { model: trimmed, models: null };
    const route = OPENROUTER_TASK_ROUTES[taskClass] ?? null;
    if (route && route[0] !== OPENROUTER_AUTO_MODEL) {
        return { model: route[0], models: route.slice(1) };
    }
    return { model: OPENROUTER_AUTO_MODEL, models: null };
}

export function suggestedModelsForTask(taskClass = "all") {
    if (!taskClass || taskClass === "all") return OPENROUTER_SUGGESTED_MODELS;
    return OPENROUTER_SUGGESTED_MODELS.filter(
        (m) => m.taskClass === "all" || m.taskClass === taskClass,
    );
}

export function isSuggestedModel(modelId) {
    return OPENROUTER_SUGGESTED_MODELS.some((m) => m.id === modelId);
}
