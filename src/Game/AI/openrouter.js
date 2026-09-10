/*! Historia Web — OpenRouter client (new work, AGPL-3.0-or-later). */

import {
    OPENROUTER_AUTO_MODEL,
    OPENROUTER_SUGGESTED_MODELS,
} from "./openrouterModels.js";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";

const MODELS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
let modelsCache = null;
let modelsCacheAt = 0;

/**
 * Live catalog from OpenRouter's public /models endpoint (no key needed).
 * Populates the settings suggestions with up-to-date ids; falls back to the
 * curated list offline.
 */
export async function fetchOpenRouterCatalog(signal) {
    if (modelsCache && Date.now() - modelsCacheAt < MODELS_CACHE_TTL) {
        return modelsCache;
    }
    const response = await fetch(`${OPENROUTER_ENDPOINT}/models`, { signal });
    if (!response.ok) {
        throw new Error(`OpenRouter /models failed: ${response.status}`);
    }
    const data = await response.json();
    modelsCache = (data?.data ?? []).map((m) => ({
        id: m.id,
        label: m.name,
        role: m.description?.slice(0, 140) ?? "",
        contextLength: m.context_length,
        pricing: m.pricing,
    }));
    modelsCacheAt = Date.now();
    return modelsCache;
}

export function resolveOpenRouterModel(storedModel) {
    const trimmed = (storedModel ?? "").trim();
    // Blank = "recommended": OpenRouter's auto-router picks per request.
    return trimmed || OPENROUTER_AUTO_MODEL;
}

/**
 * True when the stored model id no longer resolves against the live catalog
 * (retired upstream). The settings UI offers the curated list when this fires.
 */
export async function isModelRetired(storedModel, signal) {
    const model = resolveOpenRouterModel(storedModel);
    if (model === OPENROUTER_AUTO_MODEL) return false;
    try {
        const catalog = await fetchOpenRouterCatalog(signal);
        return catalog.length > 0 && !catalog.some((m) => m.id === model);
    } catch {
        return false; // offline: never nag about a model we cannot check
    }
}

export { OPENROUTER_SUGGESTED_MODELS };
