<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=ff4655&height=200&section=header&text=Valorant%20Tracker&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=A%20Discord%20bot%20to%20track%20your%20Valorant%20stats%20in%20real%20time&descAlignY=55&descAlign=50" />

<br/>

<img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" />
<img src="https://img.shields.io/badge/Valorant-Tracker-ff4655?style=for-the-badge&logo=riot-games&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=open-source-initiative&logoColor=white" />
<img src="https://img.shields.io/github/stars/gl1tch496/valorant-tracker?style=for-the-badge&logo=github&logoColor=white&color=gold" />

<br/><br/>

**A clean, fast, and feature-rich Discord bot that pulls live Valorant stats, match history, and ranked leaderboards — all directly inside your server.**

Built with love by [**gl1tch Master**](https://github.com/gl1tch496)

</div>

---

Overview

**Valorant Tracker** is a Discord bot powered by the [HenrikDev Unofficial Valorant API](https://henrikdev.xyz/). It lets you look up any player by their Riot ID — no region guessing needed, the bot figures it out automatically. You get their current rank, peak rank, recent match results, combat stats, win rate, and more — all formatted cleanly using Discord's Components V2 system.

It was built to be straightforward, reliable, and easy to self-host. No database, no dashboard, no overcomplicated setup. Clone it, fill in your `.env`, run it.

---

Features

- **`/track`** — Full player profile: rank, RR, peak rank, win/loss, K/D, headshot %, top agent, top map, and last 5 matches
- **`/matches`** — Detailed breakdown of the last 10 games with per-match KDA, ACS, and HS%
- **`/leaderboard`** — Top 10 Radiant players for any supported region
- Region is **auto-detected** — you never have to specify it manually
- Beautiful **Components V2** Discord UI with containers, sections, and separators
- **Refresh button** on every profile card to re-pull live data on demand
- Direct links to **Tracker.gg** and **VStats.gg** for each player
- Graceful error handling — bad inputs, API timeouts, and missing data all return helpful messages

---

Prerequisites

Before you do anything, make sure you have these ready:

- <img src="https://img.icons8.com/color/20/nodejs.png"/> **Node.js** v18 or higher — [Download here](https://nodejs.org)
- <img src="https://img.icons8.com/fluency/20/discord-logo.png"/> A **Discord Bot** with slash command permissions
- <img src="https://img.icons8.com/fluency/20/riot-games.png"/> A **HenrikDev API key** (free tier works fine for personal use)

---

Getting Your API Keys

## 1 — Discord Bot Token

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name, and hit **Create**
3. Head to the **Bot** tab on the left sidebar
4. Click **Reset Token**, copy it — this goes into `TOKEN` in your `.env`
5. While you are there, scroll down and enable **Applications Commands** under **Privileged Gateway Intents** if it is not already on
6. Go to **OAuth2 > URL Generator**, check `bot` and `applications.commands`, copy the generated URL and use it to invite the bot to your server
7. Under **General Information**, copy your **Application ID** — this goes into `CLIENT_ID` in your `.env`

> **Important:** Never share your bot token with anyone. If it leaks, reset it immediately from the developer portal.

## 2 — HenrikDev API Key

1. Join the [HenrikDev Discord server](https://discord.gg/henrikdev)
2. Follow the instructions in the `#get-api-key` channel to request your key
3. Copy the key — it goes into `HENRIK_API_KEY` in your `.env`

> The free tier is enough for personal or small-server use. If you run a larger community, check their rate limit tiers.

---

Installation

```bash
# Clone the repository
git clone https://github.com/gl1tch496/valorant-tracker.git

# Move into the project folder
cd valorant-tracker

# Install dependencies
npm install
```

---

Configuration

Create a file called `.env` in the root of the project:

```env
TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_id_here
HENRIK_API_KEY=your_henrikdev_api_key_here
```

Make sure this file is **never committed to Git**. The `.gitignore` should already cover it, but double-check.

---

Running the Bot

```bash
node index.js
```

On first run, it will register all slash commands globally with Discord and then log in. You should see something like:

```
Registering slash commands...
Slash commands registered.
Logged in as YourBot#1234
```

Slash commands can take up to an hour to propagate globally on Discord's end, but usually show up within a few minutes.

---

Commands

| Command | Description | Example |
|---|---|---|
| `/track` | Full stats profile for a player | `/track player:TenZ#NA1` |
| `/matches` | Last 10 matches with full details | `/matches player:TenZ#NA1` |
| `/leaderboard` | Top 10 Radiant in a region | `/leaderboard region:na` |

**Supported regions for `/leaderboard`:** `eu` `na` `ap` `kr`

**Supported regions for `/track` and `/matches`:** All regions are auto-detected from the player's account — you just paste the Riot ID.

---

How the Code Works

The bot is a single-file Node.js application (`index.js`) built on top of **discord.js v14** and **axios**.

**Structure overview:**

- **API layer** — All requests go through a single `fetchAPI()` function that wraps axios and handles both HTTP errors and HenrikDev's in-body error format cleanly
- **Player resolution** — `resolvePlayer()` uses the HenrikDev v2 account endpoint to validate the Riot ID and auto-detect the player's region, so you never need to pass a region manually
- **Components V2** — Instead of embeds, the bot uses Discord's newer Components V2 system (message flag `1 << 15`). This means containers, sections, separators, thumbnails, and buttons are all raw JSON — Discord renders them as a structured card-style layout
- **`/track`** — Fires two parallel API calls (MMR v3 + matches v3), then calculates aggregate stats across the last 5 games before building the full card
- **`/matches`** — Pulls the last 10 matches and renders each one as its own section with KDA, ACS, headshot %, and round count
- **`/leaderboard`** — Hits the v1 leaderboard endpoint and formats the top 10 players including anonymized accounts
- **Refresh button** — The button stores the player's Riot ID in its custom ID and re-runs `/track` when pressed, pulling fresh data without any database

**Dependencies:**

```json
{
  "discord.js": "^14.x",
  "axios": "^1.x",
  "dotenv": "^16.x"
}
```

---

Support the Project

If this bot saved you time or you just think it is cool, drop a star on the repo — it genuinely helps and takes two seconds.

<div align="center">

![Star the repo](https://i.imgur.com/KJBeFop.gif)

[![Star this repo](https://img.shields.io/badge/Give%20a%20Star-%E2%AD%90-gold?style=for-the-badge&logo=github)](https://github.com/gl1tch496/valorant-tracker)

</div>

---

Troubleshooting

**Commands not showing up in Discord?**
Wait a few minutes after first run. If they still don't appear, check that your `CLIENT_ID` is correct and the bot has `applications.commands` scope in its invite URL.

**Getting API errors?**
Make sure your `HENRIK_API_KEY` is valid and not expired. Also confirm the player exists by searching them on [tracker.gg](https://tracker.gg/valorant) first.

**Bot not responding?**
Check that `TOKEN` in `.env` is correct and that the bot is online in your server with the right permissions.

**Region not detected?**
This should not happen often, but if it does, it means the HenrikDev account endpoint returned a null region for that account. The player may have never played on their region before.

---

# Author

<div align="center">

<img src="https://github.com/gl1tch496.png" width="120" style="border-radius: 50%;" />

<br/>

**gl1tch Master**

<img src="https://img.shields.io/badge/GitHub-gl1tch496-181717?style=for-the-badge&logo=github&logoColor=white" />

[https://github.com/gl1tch496](https://github.com/gl1tch496)

*Built for the community — use it, fork it, make it yours.*

</div>

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=ff4655&height=100&section=footer" />

**powered by gl1tch**

</div>
