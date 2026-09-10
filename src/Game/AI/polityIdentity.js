/*! Historia Web — polity identity task: culture, religion, ideology, government
    (new work, AGPL-3.0-or-later).

A periodic AI pass that updates nation dossiers' identity fields based on
recent recorded history. Runs every few rounds (best-effort, never blocks a
turn) with its own code-defined prompt and schema — deliberately NOT a
prompt-pack task, so it reaches existing campaigns whose prompt packs are
frozen without the task.

Output writes REAL dossier fields via memory.upsertDossier; the fields then
flow into every subsequent [Campaign Memory] block, so drift the AI narrates
becomes state the AI must stay consistent with.
*/

import { callAI } from "./main.jsx";
import { readMemory, writeMemory, upsertDossier } from "./memory.js";
import { readWorldState } from "../../runtime/gameState.js";
import { readGameData } from "../../runtime/gameState.js";

const IDENTITY_TOOL = {
    name: "submit_identity_updates",
    description:
        "Report updated cultural/religious/ideological identity for polities whose recent history implies change. Only include polities with something to update; omit fields that did not change.",
    schema: {
        type: "object",
        properties: {
            updates: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        code: { type: "string", description: "Polity code the dossier uses (e.g. FRA, or a custom polity code)." },
                        ideology: { type: "string" },
                        religion: { type: "string" },
                        culture: { type: "string" },
                        government: { type: "string" },
                        leader: { type: "string" },
                        reason: { type: "string", description: "One sentence citing the recorded history that motivates the change." },
                    },
                    required: ["code"],
                },
            },
        },
        required: ["updates"],
    },
};

const SYSTEM_PROMPT = `You are the cultural-identity engine of a grand-strategy simulation. Given nation dossiers and recent recorded history, decide whether any polity's ideology, dominant religion, culture, government type, or leader has plausibly shifted — through revolutions, reformations, migrations, conquests, coups, succession, reform movements, or slow drift. Be conservative: most rounds nothing changes; only update what the history clearly motivates. Prefer short concrete labels ("Sunni Islam", "constitutional monarchy", "pan-Arabist") over prose. Cite the motivating history in one sentence.`;

function buildUserMessage({ dossiers, events, tags, playerCode, round }) {
    const dossierLines = Object.values(dossiers ?? {})
        .filter((d) => d && d.code)
        .slice(0, 40)
        .map((d) => `${d.code}: government=${d.government || "?"}; ideology=${d.ideology || "?"}; religion=${d.religion || "?"}; culture=${d.culture || "?"}; leader=${d.leader || "?"}`)
        .join("\n");
    const eventLines = (Array.isArray(events) ? events : [])
        .slice(-24)
        .map((e) => `${e.date || "?"} [${(e.tags ?? []).join(",") || "event"}] ${e.summary}`)
        .join("\n");
    return `Player polity: ${playerCode || "?"} (round ${round}).

Country tags (author-set + AI changes): ${JSON.stringify(tags ?? {}).slice(0, 2000)}

Current dossiers:
${dossierLines || "(none yet)"}

Recent recorded history:
${eventLines || "(no events yet)"}

Return identity updates as JSON only (via the tool).`;
}

/**
 * Periodic identity refresh. Fire-and-forget safe: resolves to a boolean,
 * never throws (all failures are logged and swallowed).
 */
export async function refreshPolityIdentities({ round = 1 } = {}) {
    try {
        const [memory, world, game] = await Promise.all([
            readMemory(),
            readWorldState().catch(() => null),
            readGameData().catch(() => null),
        ]);
        if (!memory || Object.keys(memory.dossiers).length === 0) return false;

        const baseTags = world?.countryTags ?? world?.tags ?? {};
        const response = await callAI(SYSTEM_PROMPT, [
            { role: "user", parts: [{ text: buildUserMessage({
                dossiers: memory.dossiers,
                events: memory.episodes,
                tags: baseTags,
                playerCode: game?.country,
                round,
            }) }] },
        ], {
            tool: IDENTITY_TOOL,
            maxTokens: 2048,
            taskKey: "polityIdentity",
            taskClass: "utility",
            timeoutMs: 90000,
        });

        const payload = response?.toolInput ?? null;
        const updates = Array.isArray(payload?.updates) ? payload.updates : [];
        if (updates.length === 0) return false;

        let next = memory;
        const valid = new Set([
            ...Object.keys(memory.dossiers),
            ...Object.keys(world?.polityOverrides ?? {}),
        ]);
        let applied = 0;
        for (const update of updates) {
            const code = String(update?.code ?? "").trim();
            if (!code || !valid.has(code)) continue;
            next = upsertDossier(next, code, update);
            applied += 1;
        }
        if (applied > 0) {
            await writeMemory(next);
            return true;
        }
        return false;
    } catch (error) {
        console.warn("[ai] identity refresh skipped:", error?.message ?? error);
        return false;
    }
}
