/*! Historia Web — campaign memory: dossiers, episodes, chronicle
    (new work, AGPL-3.0-or-later).

Layered memory for AI coherence across long campaigns:

- Dossiers  — per-polity long-term record: government, ideology, religion,
  culture, leader history, treaty ledger, wars, relations. What makes an
  AI nation behave consistently 100+ turns in.
- Episodes  — timestamped, tagged event records (one per generated event)
  queryable by recency, replacing "one prose blob" summaries.
- Chronicle — era-by-era compressed history (written by the existing event
  consolidator going forward).

State persists as the `memory` runtime JSON key — same per-game store as
world/game/events, so persistence, tokens, and cache sweeping are free.
*/

import { JSON_URLS, readJson, writeJson } from "../../runtime/assets.js";

export const MEMORY_DEFAULTS = Object.freeze({
    version: 1,
    dossiers: {},   // code -> dossier
    episodes: [],   // [{ id, date, tags, summary, polities }]
    chronicle: [],  // [{ throughDate, summary }] (consolidator-written)
    updatedAt: 0,
});

const MAX_EPISODES = 400;
const MAX_DOSSIER_NOTES = 24;

export function normalizeMemory(raw) {
    const memory = raw && typeof raw === "object" ? raw : {};
    return {
        version: 1,
        dossiers: memory.dossiers && typeof memory.dossiers === "object" ? memory.dossiers : {},
        episodes: Array.isArray(memory.episodes) ? memory.episodes : [],
        chronicle: Array.isArray(memory.chronicle) ? memory.chronicle : [],
        updatedAt: Number(memory.updatedAt) || 0,
    };
}

export function readMemory({ signal } = {}) {
    return readJson(JSON_URLS.memory, { defaultValue: MEMORY_DEFAULTS, signal })
        .then(normalizeMemory)
        .catch(() => normalizeMemory(null));
}

export function writeMemory(memory) {
    return writeJson(JSON_URLS.memory, { ...normalizeMemory(memory), updatedAt: Date.now() })
        .catch((error) => console.warn("memory write failed", error));
}

// ---------------------------------------------------------------------------
// Episode + dossier extraction from generated events
// ---------------------------------------------------------------------------

const TAG_RULES = [
    ["war", /\b(war|invasion|inva(?:des|ded)|offensive|battle|siege|campaign|annex(?:es|ed|ation)?|occupied|capture[sd]?|seize[sd]?)\b/i],
    ["treaty", /\b(treaty|pact|armistice|ceasefire|peace (?:deal|agreement|terms)|signed|accord)\b/i],
    ["alliance", /\b(alliance|allied|joins? the war|coalition|entente|defensive pact)\b/i],
    ["politics", /\b(election|parliament|cabinet|resigns?|coup|referendum|constitution|reform(?:s)?)\b/i],
    ["succession", /\b(succeed(?:s|ed|ion)|heir|throne|abdica(?:tes?|tion)|dies?|death of|assassinat(?:es?|ed|ion))\b/i],
    ["economy", /\b(economy|economic|trade|tariff|inflation|depression|recession|market(?:s)?|sanction(?:s)?|embargo)\b/i],
    ["religion", /\b(church|pope|caliph|religious|faith|temple|cathedral|mosque|sect|reformation|crusade|jihad|pilgrim)\b/i],
    ["culture", /\b(culture|cultural|language|unrest|revolt|rebellion|riot|nationalis[mt]|separatis[mt])\b/i],
    ["technology", /\b(invention|technology|technological|discovery|breakthrough|industr(?:y|ial)|railway|telegraph|weapon(?:ry)?)\b/i],
    ["diplomacy", /\b(ambassador|embassy|summit|summons|ultimatum|demand(?:s)?|negotiat(?:es?|ions?))\b/i],
];

function tagsForText(...texts) {
    const text = texts.filter(Boolean).join(" ");
    return TAG_RULES.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

function eventDate(event) {
    return event?.date || event?.endDate || "";
}

export function episodesFromEvents(events = []) {
    return (Array.isArray(events) ? events : [])
        .map((event) => {
            const title = String(event?.title ?? "").trim();
            const description = String(event?.description ?? "").trim();
            if (!title && !description) return null;
            return {
                id: String(event?.id ?? `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                date: eventDate(event),
                tags: tagsForText(title, description),
                summary: title,
                detail: description.slice(0, 400),
                polities: Array.isArray(event?.polities) ? event.polities : [],
            };
        })
        .filter(Boolean);
}

function emptyDossier(code, name = "") {
    return {
        code,
        name,
        government: "",
        ideology: "",
        religion: "",
        culture: "",
        leader: "",
        leaderHistory: [],
        treatyLedger: [],
        wars: [],
        relations: {},
        updated: 0,
    };
}

/**
 * Merge a jump's events into memory: append episodes (capped) and touch a
 * dossier for every polity that appears in events or ownership changes.
 * Never overwrites authored dossier fields — only appends history.
 */
export function mergeTurnMemory(memory, { events = [], polityCodes = [], date = "" } = {}) {
    const next = normalizeMemory(memory);

    const newEpisodes = episodesFromEvents(events);
    next.episodes = [...next.episodes, ...newEpisodes].slice(-MAX_EPISODES);

    const mentioned = new Set(
        [...polityCodes, ...newEpisodes.flatMap((e) => e.polities)]
            .map((code) => String(code ?? "").trim())
            .filter(Boolean),
    );
    const now = Date.now();
    for (const code of mentioned) {
        const dossier = next.dossiers[code] ?? emptyDossier(code);
        next.dossiers[code] = { ...dossier, code, updated: now };
    }

    // Chronicle: roll very old episodes into era summaries so the prompt block
    // stays bounded. Keep the newest 120 episodes verbatim; summarize the rest
    // into one chronicle entry per consolidation pass.
    if (next.episodes.length > MAX_EPISODES - 40) {
        const old = next.episodes.slice(0, next.episodes.length - 120);
        if (old.length > 0) {
            const summary = old.map((e) => `${e.date || "?"}: ${e.summary}`).join("; ").slice(0, 4000);
            next.chronicle = [
                ...next.chronicle,
                { throughDate: old[old.length - 1]?.date || date || "", summary },
            ].slice(-40);
            next.episodes = next.episodes.slice(-120);
        }
    }

    return next;
}

/**
 * AI-facing dossier update (e.g. from a future dossier task or GM command):
 * sets descriptive fields on a polity's dossier.
 */
export function upsertDossier(memory, code, patch = {}) {
    const next = normalizeMemory(memory);
    const current = next.dossiers[code] ?? emptyDossier(code, patch.name ?? "");
    const merged = {
        ...current,
        ...["name", "government", "ideology", "religion", "culture", "leader"]
            .reduce((acc, field) => (patch[field] != null ? { ...acc, [field]: String(patch[field]).slice(0, 300) } : acc), {}),
    };
    if (Array.isArray(patch.leaderEntry) && patch.leaderEntry.length > 0) {
        merged.leaderHistory = [...current.leaderHistory, ...patch.leaderEntry].slice(-MAX_DOSSIER_NOTES);
    }
    if (Array.isArray(patch.treatyEntry) && patch.treatyEntry.length > 0) {
        merged.treatyLedger = [...current.treatyLedger, ...patch.treatyEntry].slice(-MAX_DOSSIER_NOTES);
    }
    if (patch.warEntry) {
        merged.wars = [...current.wars, patch.warEntry].slice(-MAX_DOSSIER_NOTES);
    }
    merged.updated = Date.now();
    next.dossiers[code] = merged;
    return next;
}

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

function dossierLine(dossier) {
    const parts = [dossier.name || dossier.code];
    if (dossier.government) parts.push(`government: ${dossier.government}`);
    if (dossier.ideology) parts.push(`ideology: ${dossier.ideology}`);
    if (dossier.religion) parts.push(`religion: ${dossier.religion}`);
    if (dossier.culture) parts.push(`culture: ${dossier.culture}`);
    if (dossier.leader) parts.push(`leader: ${dossier.leader}`);
    if (dossier.treatyLedger?.length > 0) parts.push(`treaties: ${dossier.treatyLedger.slice(-4).join("; ")}`);
    if (dossier.wars?.length > 0) parts.push(`wars: ${dossier.wars.slice(-3).join("; ")}`);
    return `- ${dossier.code}: ${parts.join(" | ")}`;
}

/**
 * Compact [Campaign Memory] prompt block. `focusCodes` (player + in-play
 * polities) get full dossier lines; other known polities are name-only.
 */
export function buildMemoryContextText(memory, { focusCodes = [], episodeLimit = 14 } = {}) {
    const normalized = normalizeMemory(memory);
    const blocks = [];

    const dossierCodes = Object.keys(normalized.dossiers);
    const focus = focusCodes
        .map((code) => normalized.dossiers[code])
        .filter(Boolean);
    if (focus.length > 0) {
        blocks.push(`Nation dossiers (long-term record — stay consistent with it):\n${focus.map(dossierLine).join("\n")}`);
    } else if (dossierCodes.length > 0) {
        blocks.push(`Known polities with dossiers: ${dossierCodes.slice(0, 40).join(", ")}`);
    }

    const recent = normalized.episodes.slice(-episodeLimit);
    if (recent.length > 0) {
        const lines = recent.map((e) => `${e.date || "?"} [${e.tags.join(",") || "event"}] ${e.summary}`);
        blocks.push(`Recent recorded history (oldest first):\n${lines.join("\n")}`);
    }

    if (normalized.chronicle.length > 0) {
        const lines = normalized.chronicle.slice(-6).map((c) => `Through ${c.throughDate || "?"}: ${c.summary}`);
        blocks.push(`Earlier eras (consolidated):\n${lines.join("\n")}`);
    }

    if (blocks.length === 0) return "";
    return `[Campaign Memory]\n${blocks.join("\n\n")}`;
}
