/*! Historia Web — campaign economy v1: treasury + per-round income
    (new work, AGPL-3.0-or-later).

Deterministic engine layer, persisted as the `economy` runtime JSON key.
The AI does NOT invent money: it reads the treasury in its prompt and its
event narration is expected to stay consistent with it (a bankrupt nation
does not fund an invasion without narrating the loan/crisis that paid for
it). Numeric depth (prices, trade, inflation) comes later; this slice is
the ledger the rest builds on.

Model: every tracked polity earns `baseIncome + perRegionIncome * regions`
per round and spends `perUnitExpense * units`. Era/preset knobs (a Bronze
Age economy is not a 1939 economy) arrive with the preset era-knobs work
as `ECONOMY_RULES` overrides on the scenario.
*/

import { JSON_URLS, readJson, writeJson } from "../../runtime/assets.js";

export const ECONOMY_DEFAULTS = Object.freeze({
    version: 1,
    nations: {},   // code -> { treasury, income, expenses, lastRound }
    rules: {       // scenario-overridable era knobs
        baseIncome: 2,
        perRegionIncome: 1,
        perUnitExpense: 0.5,
        startingTreasury: 20,
    },
    updatedAt: 0,
});

export function normalizeEconomy(raw) {
    const economy = raw && typeof raw === "object" ? raw : {};
    return {
        version: 1,
        nations: economy.nations && typeof economy.nations === "object" ? economy.nations : {},
        rules: { ...ECONOMY_DEFAULTS.rules, ...(economy.rules && typeof economy.rules === "object" ? economy.rules : {}) },
        updatedAt: Number(economy.updatedAt) || 0,
    };
}

export function readEconomy({ signal } = {}) {
    return readJson(JSON_URLS.economy, { defaultValue: ECONOMY_DEFAULTS, signal })
        .then(normalizeEconomy)
        .catch(() => normalizeEconomy(null));
}

export function writeEconomy(economy) {
    return writeJson(JSON_URLS.economy, { ...normalizeEconomy(economy), updatedAt: Date.now() })
        .catch((error) => console.warn("economy write failed", error));
}

function ownedRegionCounts(world) {
    const counts = {};
    for (const owner of Object.values(world?.regionOwnershipOverrides ?? {})) {
        const code = String(owner ?? "").trim();
        if (!code) continue;
        counts[code] = (counts[code] ?? 0) + 1;
    }
    return counts;
}

function unitCounts(world) {
    const counts = {};
    for (const unit of Array.isArray(world?.units) ? world.units : []) {
        const code = String(unit?.country ?? unit?.owner ?? "").trim();
        if (!code) continue;
        counts[code] = (counts[code] ?? 0) + (Number(unit?.count ?? unit?.size ?? 1) || 1);
    }
    return counts;
}

/**
 * Advance every tracked polity's ledger to `round` (idempotent per round:
 * nations are caught up, never double-paid). Newly seen polities (first
 * ownership override, first unit) open a ledger at the starting treasury.
 */
export function economyTick(world, round, { playerCode = "" } = {}) {
    const economy = normalizeEconomy(null);
    const rules = economy.rules;
    const regions = ownedRegionCounts(world);
    const units = unitCounts(world);
    const codes = new Set([...Object.keys(regions), ...Object.keys(units), playerCode].filter(Boolean));
    const now = Date.now();
    for (const code of codes) {
        const prev = economy.nations[code];
        const lastRound = Number(prev?.lastRound ?? 0);
        const entry = prev ?? { treasury: rules.startingTreasury, income: 0, expenses: 0, lastRound: 0 };
        let treasury = Number(entry.treasury) || 0;
        for (let r = lastRound + 1; r <= round; r += 1) {
            const income = rules.baseIncome + rules.perRegionIncome * (regions[code] ?? 0);
            const expenses = rules.perUnitExpense * (units[code] ?? 0);
            treasury += income - expenses;
            entry.income = income;
            entry.expenses = expenses;
            entry.lastRound = r;
        }
        economy.nations[code] = { ...entry, treasury: Math.round(treasury * 10) / 10, updated: now };
    }
    return economy;
}

/** Compact [Economy] prompt block for the focus polities. */
export function buildEconomyContextText(economy, { focusCodes = [], limit = 24 } = {}) {
    const normalized = normalizeEconomy(economy);
    const codes = (focusCodes.length > 0 ? focusCodes : Object.keys(normalized.nations)).slice(0, limit);
    const lines = codes
        .filter((code) => normalized.nations[code])
        .map((code) => {
            const n = normalized.nations[code];
            const balance = Number(n.income) - Number(n.expenses);
            return `- ${code}: treasury ${n.treasury} (income ${n.income}/round, expenses ${n.expenses}/round, balance ${balance > 0 ? "+" : ""}${balance})`;
        });
    if (lines.length === 0) return "";
    return `[Economy]\nEngine-tracked treasuries (authoritative numbers — narrate spending, war costs, and trade as consistent with these; a nation near zero cannot fund large operations without narrating how it pays):\n${lines.join("\n")}`;
}
