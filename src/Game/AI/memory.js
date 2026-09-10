/*! Historia Web — campaign memory: dossiers, episodes, chronicle, territory
    (new work, AGPL-3.0-or-later).

Layered memory for AI coherence across long campaigns:

- Dossiers   — per-polity long-term record: government, ideology, religion,
  culture, leader history, treaty ledger, wars, relations.
- Episodes   — timestamped, tagged event records (one per generated event).
- Chronicle  — era-by-era compressed history (written by the consolidator).
- Territory  — ENGINE-DERIVED truth. The engine diffs real region ownership
  every turn and logs every change — AI conquests, player map edits, cheats —
  so the AI never has to "remember" borders. It reads the log. This is the fix
  for the classic Pax-Historia failure where the map and the story drift apart
  (gaps between territories, edits the AI never recognizes).

State persists as the `memory` runtime JSON key — same per-game store as
world/game/events, so persistence, tokens, and cache sweeping are free.

CONTEXT BUDGETING: prompts are assembled per task class. Utility tasks
(consolidation, stat sheets) get a stripped block; narrative tasks get the
full dossier + history + territory log. See CONTEXT_BUDGETS below.
*/

import { JSON_URLS, readJson, writeJson } from "../../runtime/assets.js";

export const MEMORY_DEFAULTS = Object.freeze({
    version: 1,
    dossiers: {},
    episodes: [],   // [{ id, date, tags, summary, detail, polities }]
    chronicle: [],  // [{ throughDate, summary }]
    territory: {
        snapshot: {}, // regionId -> ownerCode (engine-authoritative last known)
        log: [],      // [{ date, source, changes: [{ region, from, to }] }]
    },
    updatedAt: 0,
});

const MAX_EPISODES = 400;
const MAX_TERRITORY_LOG = 80;
const MAX_DOSSIER_NOTES = 24;

/**
 * Per-task-class context budgets. Utility models are usually smaller/cheaper
 * — give them less. Narrative models get everything. Chat sits in between.
 */
export const CONTEXT_BUDGETS = {
    narrative:  { dossierLimit: 24, episodeLimit: 16, territoryLimit: 8,  includeDetail: true },
    structured: { dossierLimit: 16, episodeLimit: 10, territoryLimit: 6,  includeDetail: false },
    chat:       { dossierLimit: 8,  episodeLimit: 8,  territoryLimit: 4,  includeDetail: false },
    utility:    { dossierLimit: 6,  episodeLimit: 5,  territoryLimit: 3,  includeDetail: false },
};

export function normalizeMemory(raw) {
    const memory = raw && typeof raw === "object" ? raw : {};
    return {
        version: 1,
        dossiers: memory.dossiers && typeof memory.dossiers === "object" ? memory.dossiers : {},
        episodes: Array.isArray(memory.episodes) ? memory.episodes : [],
        chronicle: Array.isArray(memory.chronicle) ? memory.chronicle : [],
        territory: {
            snapshot: memory.territory?.snapshot && typeof memory.territory.snapshot === "object"
                ? memory.territory.snapshot : {},
            log: Array.isArray(memory.territory?.log) ? memory.territory.log : [],
        },
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

function collectTransferRegionIds(events = []) {
    const ids = new Set();
    for (const event of events) {
        const transfers = event?.impacts?.regionTransfers ?? event?.regionTransfers ?? [];
        for (const transfer of Array.isArray(transfers) ? transfers : []) {
            const id = String(transfer?.regionId ?? transfer?.region ?? "").trim();
            if (id) ids.add(id);
        }
    }
    return ids;
}

/**
 * ENGINE MAP TRUTH. Diff the world's actual region ownership against the
 * last-known snapshot. Changes the AI made this turn come through
 * `turnRegionIds` (regions named in generated regionTransfers) — everything
 * else changed hands OUTSIDE the narrative: player edits, cheats, scenario
 * tooling. Both get logged, with the source labeled, so the model reads a
 * truthful, attributed border history instead of guessing.
 */
export function diffTerritory(previousMemory, world, { turnRegionIds = new Set(), date = "" } = {}) {
    const memory = normalizeMemory(previousMemory);
    const ownership = world?.regionOwnershipOverrides ?? {};
    const prev = memory.territory.snapshot;
    const changes = [];
    for (const [regionId, owner] of Object.entries(ownership)) {
        const before = prev[regionId];
        if (before === owner) continue;
        if (before === undefined && !turnRegionIds.has(regionId)) {
            // Region never tracked before — first snapshot pass, not a change.
            continue;
        }
        changes.push({
            region: regionId,
            from: before ?? "(unowned/base map)",
            to: owner,
        });
    }
    for (const regionId of Object.keys(prev)) {
        if (!(regionId in ownership)) {
            changes.push({ region: regionId, from: prev[regionId], to: "(removed/reset)" });
        }
    }
    if (changes.length === 0) {
        return { memory, changed: false };
    }
    const entry = {
        date,
        source: [...turnRegionIds].some((id) => changes.some((c) => c.region === id))
            ? "turn (war/conquest)"
            : "external edit (player/cheat/tooling)",
        changes: changes.slice(0, 100),
    };
    memory.territory.log = [...memory.territory.log, entry].slice(-MAX_TERRITORY_LOG);
    memory.territory.snapshot = { ...ownership };
    return { memory, changed: true };
}

/**
 * Merge a turn's data into memory: episodes, dossier touches, territory diff.
 * `turnRegionIds` = region ids named in this turn's generated regionTransfers.
 */
export function mergeTurnMemory(memory, {
    events = [],
    polityCodes = [],
    date = "",
    world = null,
    turnRegionIds = null,
} = {}) {
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

    if (world) {
        const { memory: withTerritory } = diffTerritory(
            next,
            world,
            { turnRegionIds: turnRegionIds ?? collectTransferRegionIds(events), date },
        );
        next.territory = withTerritory.territory;
    }

    // Chronicle: roll very old episodes into era summaries.
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
 * AI-facing dossier update (future dossier task / GM command / preset):
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
// Prompt rendering (budgeted per task class)
// ---------------------------------------------------------------------------

function dossierLine(dossier, { includeDetail = false } = {}) {
    const parts = [dossier.name || dossier.code];
    if (dossier.government) parts.push(`government: ${dossier.government}`);
    if (dossier.ideology) parts.push(`ideology: ${dossier.ideology}`);
    if (dossier.religion) parts.push(`religion: ${dossier.religion}`);
    if (dossier.culture) parts.push(`culture: ${dossier.culture}`);
    if (dossier.leader) parts.push(`leader: ${dossier.leader}`);
    if (dossier.treatyLedger?.length > 0) parts.push(`treaties: ${dossier.treatyLedger.slice(-4).join("; ")}`);
    if (dossier.wars?.length > 0) parts.push(`wars: ${dossier.wars.slice(-3).join("; ")}`);
    if (includeDetail && dossier.leaderHistory?.length > 0) {
        parts.push(`recent leadership: ${dossier.leaderHistory.slice(-3).join("; ")}`);
    }
    return `- ${dossier.code}: ${parts.join(" | ")}`;
}

function territoryLines(memory, { limit = 6 } = {}) {
    const entries = memory.territory.log.slice(-limit);
    if (entries.length === 0) return "";
    return entries.map((entry) => {
        const changes = entry.changes.slice(0, 12)
            .map((c) => `${c.region}: ${c.from} -> ${c.to}`)
            .join("; ");
        const more = entry.changes.length > 12 ? ` (+${entry.changes.length - 12} more)` : "";
        return `${entry.date || "?"} [${entry.source}] ${changes}${more}`;
    }).join("\n");
}

/**
 * Compact [Campaign Memory] prompt block, budgeted for the calling task
 * class. `focusCodes` (player + in-play polities) get full dossier lines.
 */
export function buildMemoryContextText(memory, { focusCodes = [], taskClass = "structured" } = {}) {
    const normalized = normalizeMemory(memory);
    const budget = CONTEXT_BUDGETS[taskClass] ?? CONTEXT_BUDGETS.structured;
    const blocks = [];

    const focus = focusCodes
        .map((code) => normalized.dossiers[code])
        .filter(Boolean)
        .slice(0, budget.dossierLimit);
    if (focus.length > 0) {
        blocks.push(
            `Nation dossiers (long-term record — stay consistent with it):\n${focus.map((d) => dossierLine(d, budget)).join("\n")}`,
        );
    }

    const territory = territoryLines(normalized, { limit: budget.territoryLimit });
    if (territory) {
        blocks.push(
            `Verified border changes (engine-recorded — the map is AUTHORITATIVE. Narrate these as established facts, never contradict or re-litigate them, whether they came from war, the player, or editing tools):\n${territory}`,
        );
    }

    const recent = normalized.episodes.slice(-budget.episodeLimit);
    if (recent.length > 0) {
        const lines = recent.map((e) =>
            `${e.date || "?"} [${e.tags.join(",") || "event"}] ${e.summary}${budget.includeDetail && e.detail ? ` — ${e.detail}` : ""}`);
        blocks.push(`Recent recorded history (oldest first):\n${lines.join("\n")}`);
    }

    if (normalized.chronicle.length > 0) {
        const lines = normalized.chronicle.slice(-6).map((c) => `Through ${c.throughDate || "?"}: ${c.summary}`);
        blocks.push(`Earlier eras (consolidated):\n${lines.join("\n")}`);
    }

    if (blocks.length === 0) return "";
    return `[Campaign Memory]\n${blocks.join("\n\n")}`;
}
