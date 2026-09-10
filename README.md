# Web Historia

**An AI-driven grand-strategy game that runs entirely in your browser.**

Web Historia is a web-native continuation of [Open Historia](https://github.com/Open-Historia/open-historia),
which itself is an open-source alternative to [Pax Historia](https://www.paxhistoria.co/games).
We are grateful to the Open Historia contributors — this project builds directly on
their map engine, editor, and game framework, and stays compatible with the
community scenario hub and map-data network.

There is no desktop app, no installer, and nothing to download. Web Historia
is a website: open it, pick a scenario — or build your own — and play.

## What Web Historia changes

- **Web only.** One build target: a static site (Cloudflare Pages) with all game
  state in your browser. Desktop and Android packaging from Open Historia is
  stripped out.
- **OpenRouter-first AI.** One API key from [openrouter.ai](https://openrouter.ai)
  unlocks ~400 models. Leave the model blank and OpenRouter picks the best
  model per request; or choose from curated suggestions. Per-task routing sends
  narrative turns to a strong model and utility work to a cheap one — with a
  live usage/cost log so you can see what each turn spends.
- **Deeper simulation (in progress).** Layered memory (nation dossiers, episodic
  history), then economy, diplomacy treaties, war exhaustion, technology,
  policies, and ideology — as real state the AI must respect, not just prose.
- **Preset authoring as a first-class workflow.** Reorganize the map, describe
  your era, set the AI's ground rules, publish it to the hub.

## Play

A hosted instance is coming. Meanwhile, run it locally:

```bash
git clone https://github.com/ikkihomes420-jpg/web-historia.git
cd web-historia
npm install
npm run dev            # http://localhost:5173
```

The world map (~106 MB of PMTiles) is downloaded on first run from the Open
Historia map-data release; the hosted build streams it from the content-node
network instead. All AI settings are bring-your-own-key: your key goes straight
from your browser to your provider and never touches any server.

## Scenarios

**Modern Day** is built in. Official era presets — *WWII 1939*, *Medieval 1200*,
*Rome 117*, *Mongol 1300*, *New World 1650*, *Bronze Age 1200 BC* — come from
the community [Scenario Hub](https://github.com/Open-Historia/Open-historia-scenarios),
importable in-game from the **Community** tab. Scenario bundles are
cross-compatible with Open Historia.

## License

Web Historia is free software under the **GNU Affero General Public License
v3.0 or later** (AGPL-3.0-or-later), same as Open Historia. This project is a
derivative work of Open Historia (© 2026 Open Historia contributors; portions
© 2026 Nicholas Krol); its modified source is available in this repository.
