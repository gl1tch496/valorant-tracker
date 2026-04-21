require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder,
} = require('discord.js');
const axios = require('axios');

const client   = new Client({ intents: [GatewayIntentBits.Guilds] });
const BASE_URL = 'https://api.henrikdev.xyz';
const API_KEY  = process.env.HENRIK_API_KEY;

const IS_V2 = 1 << 15;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: API_KEY },
  timeout: 15_000,
});

function container(accentColor, ...children) {
  return { type: 17, accent_color: accentColor, components: children.flat() };
}

function section(content, thumbnailUrl = null) {
  if (!thumbnailUrl) {
    return { type: 10, content };
  }
  return {
    type: 9,
    components: [{ type: 10, content }],
    accessory: { type: 11, media: { url: thumbnailUrl } },
  };
}

function separator() {
  return { type: 14, divider: true, spacing: 1 };
}

function actionRow(...buttons) {
  return { type: 1, components: buttons };
}

function linkButton(label, url) {
  return { type: 2, style: 5, label, url };
}

function secondaryButton(label, customId) {
  return { type: 2, style: 2, label, custom_id: customId };
}

const REGION_CHOICES = [
  { name: 'Europe (EU)',           value: 'eu'    },
  { name: 'North America (NA)',    value: 'na'    },
  { name: 'Asia Pacific (AP)',     value: 'ap'    },
  { name: 'Korea (KR)',            value: 'kr'    },
  { name: 'Latin America (LATAM)', value: 'latam' },
  { name: 'Brazil (BR)',           value: 'br'    },
];

const commands = [
  new SlashCommandBuilder()
    .setName('track')
    .setDescription('Track a Valorant player — region and tag detected automatically')
    .addStringOption(o =>
      o.setName('player')
        .setDescription('Riot ID — e.g. TenZ#NA1')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('matches')
    .setDescription('Last 10 matches for a player — region detected automatically')
    .addStringOption(o =>
      o.setName('player')
        .setDescription('Riot ID — e.g. TenZ#NA1')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 Radiant players in a region')
    .addStringOption(o =>
      o.setName('region')
        .setDescription('Server region')
        .setRequired(true)
        .addChoices(...REGION_CHOICES.slice(0, 4))
    ),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  console.log('Registering slash commands...');
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Slash commands registered.');
}

async function fetchAPI(endpoint) {
  try {
    const { data: json } = await api.get(endpoint);
    if (json.status && json.status >= 400) {
      const msg = json.errors?.[0]?.message || json.message || `API error ${json.status}`;
      throw new Error(msg);
    }
    return json;
  } catch (err) {
    if (err.response) {
      const json = err.response.data;
      const msg  = json?.errors?.[0]?.message || json?.message || `HTTP ${err.response.status}`;
      throw new Error(msg);
    }
    throw err;
  }
}

function parseRiotID(input) {
  const trimmed = input.trim();
  const hash    = trimmed.lastIndexOf('#');
  if (hash !== -1) {
    return { name: trimmed.slice(0, hash).trim(), tag: trimmed.slice(hash + 1).trim() };
  }
  return { name: trimmed, tag: '' };
}

async function resolvePlayer(name, tag) {
  if (!tag) throw new Error(`Please use the format **Name#Tag** (e.g. \`TenZ#NA1\`).`);

  const data = await fetchAPI(
    `/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
  );

  if (!data.data) throw new Error(`Player **${name}#${tag}** not found.`);

  const region = data.data.region?.toLowerCase();
  if (!region) throw new Error(`Could not auto-detect region for **${name}#${tag}**.`);

  return { acc: data.data, region };
}

function progressBar(value, max, length = 12) {
  const filled = Math.round((Math.min(value, max) / max) * length);
  return '[' + '|'.repeat(filled) + '-'.repeat(length - filled) + ']';
}

function winBar(wins, total, length = 12) {
  const filled = total > 0 ? Math.round((wins / total) * length) : 0;
  return '[' + '#'.repeat(filled) + '.'.repeat(length - filled) + ']';
}

const wl = won => (won ? 'WIN' : 'LOSS');

function extractCardUrl(card) {
  if (!card) return null;
  const url = typeof card === 'object' ? card.small : card;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

async function handleTrack(interaction) {
  const input = interaction.options.getString('player');
  await interaction.deferReply();

  try {
    const { name, tag } = parseRiotID(input);
    const { acc, region } = await resolvePlayer(name, tag);

    const [mmrData, matchesData] = await Promise.all([
      fetchAPI(`/valorant/v3/mmr/${region}/pc/${encodeURIComponent(acc.name)}/${encodeURIComponent(acc.tag)}`),
      fetchAPI(`/valorant/v3/matches/${region}/${encodeURIComponent(acc.name)}/${encodeURIComponent(acc.tag)}?size=5`),
    ]);

    const mmr     = mmrData.data;
    const matches = matchesData.data || [];

    const currentTier = mmr?.current?.tier?.name          ?? 'Unranked';
    const currentRR   = mmr?.current?.rr                   ?? 0;
    const currentElo  = mmr?.current?.elo                  ?? 0;
    const peakTier    = mmr?.highest_rank?.tier_name       ?? 'N/A';
    const peakSeason  = mmr?.highest_rank?.season          ?? 'N/A';
    const peakRR      = mmr?.highest_rank?.ranking_in_tier ?? 0;

    let wins = 0, losses = 0, kills = 0, deaths = 0, assists = 0;
    let totalHS = 0, totalShots = 0;
    const agentCounts = {};
    const mapCounts   = {};
    const matchLines  = [];

    for (const match of matches) {
      const me = match.players?.all_players?.find(
        p => p.name?.toLowerCase() === acc.name.toLowerCase()
          && p.tag?.toLowerCase()  === acc.tag.toLowerCase()
      );
      if (!me) continue;

      const won = match.teams?.[me.team?.toLowerCase()]?.has_won ?? false;
      if (won) wins++; else losses++;

      const k  = me.stats?.kills     || 0;
      const d  = me.stats?.deaths    || 0;
      const a  = me.stats?.assists   || 0;
      const hs = me.stats?.headshots || 0;
      const bs = me.stats?.bodyshots || 0;
      const ls = me.stats?.legshots  || 0;

      kills   += k;  deaths  += d;  assists += a;
      totalHS    += hs;
      totalShots += hs + bs + ls;

      const agent   = me.character         || 'Unknown';
      const mapName = match.metadata?.map  || 'Unknown';
      const mode    = match.metadata?.mode || 'Unknown';
      const rounds  = match.metadata?.rounds_played || 0;
      const acs     = rounds > 0 ? Math.round((me.stats?.score || 0) / rounds) : 0;
      const hsRate  = (hs + bs + ls) > 0 ? Math.round((hs / (hs + bs + ls)) * 100) : 0;

      agentCounts[agent]   = (agentCounts[agent]   || 0) + 1;
      mapCounts[mapName]   = (mapCounts[mapName]   || 0) + 1;

      matchLines.push(
        `**${wl(won)}** | ${mode} | ${agent} on ${mapName}\n` +
        `KDA: \`${k}/${d}/${a}\`  ACS: \`${acs}\`  HS%: \`${hsRate}%\`  Rounds: \`${rounds}\``
      );
    }

    const totalGames = wins + losses;
    const winRate    = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const kd         = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
    const avgK       = totalGames > 0 ? (kills   / totalGames).toFixed(1) : '0';
    const avgD       = totalGames > 0 ? (deaths  / totalGames).toFixed(1) : '0';
    const avgA       = totalGames > 0 ? (assists / totalGames).toFixed(1) : '0';
    const globalHS   = totalShots > 0 ? Math.round((totalHS / totalShots) * 100) : 0;
    const topAgent   = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const topMap     = Object.entries(mapCounts).sort((a, b)   => b[1] - a[1])[0]?.[0] || 'N/A';

    const rrBar   = progressBar(currentRR, 100);
    const wrBar   = winBar(wins, totalGames);
    const cardUrl = extractCardUrl(acc.card);

    const msg = container(
      0xFFFFFF,

      section(
        `## ${acc.name}#${acc.tag}\n` +
        `Region: **${region.toUpperCase()}** *(auto-detected)*\n` +
        `Account Level: **${acc.account_level}**\n` +
        `PUUID: \`${acc.puuid?.slice(0, 20)}...\``,
        cardUrl
      ),

      separator(),

      section(
        `**Current Rank**\n` +
        `Tier: **${currentTier}**\n` +
        `RR: **${currentRR} / 100**  \`${rrBar}\`\n` +
        `ELO: **${currentElo}**`
      ),

      separator(),

      section(
        `**Peak Rank**\n` +
        `Tier: **${peakTier}**\n` +
        `RR at peak: **${peakRR}**\n` +
        `Season: **${peakSeason}**`
      ),

      separator(),

      section(
        `**Win / Loss — Last ${totalGames} Games**\n` +
        `Wins: **${wins}**  |  Losses: **${losses}**\n` +
        `Win Rate: **${winRate}%**  \`${wrBar}\``
      ),

      separator(),

      section(
        `**Combat Statistics**\n` +
        `K/D Ratio: **${kd}**\n` +
        `Avg Kills: **${avgK}**  Avg Deaths: **${avgD}**  Avg Assists: **${avgA}**\n` +
        `Headshot Rate: **${globalHS}%**`
      ),

      separator(),

      section(
        `**Playstyle**\n` +
        `Most Played Agent: **${topAgent}**\n` +
        `Most Played Map: **${topMap}**`
      ),

      separator(),

      section(
        `**Recent Matches**\n\n` +
        (matchLines.length > 0 ? matchLines.join('\n\n') : '*No recent match data available*')
      ),

      separator(),

      section(`*powered by gl1tch*`),

      actionRow(
        linkButton(
          'View on Tracker.gg',
          `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(acc.name)}%23${acc.tag}/overview`
        ),
        linkButton(
          'VStats.gg',
          `https://vstats.gg/player/${encodeURIComponent(acc.name)}-${acc.tag}`
        ),
        secondaryButton('Refresh', `refresh_${acc.name}#${acc.tag}`)
      )
    );

    await interaction.editReply({ components: [msg], flags: IS_V2 });

  } catch (err) {
    console.error('[/track error]', err);
    await interaction.editReply({
      content:
        `Could not track **${input}**.\n` +
        `${err.message}\n\n` +
        `Make sure you use the format \`Name#Tag\` (e.g. \`TenZ#NA1\`) ` +
        `and that your \`HENRIK_API_KEY\` in \`.env\` is valid.`,
    });
  }
}

async function handleMatches(interaction) {
  const input = interaction.options.getString('player');
  await interaction.deferReply();

  try {
    const { name, tag }   = parseRiotID(input);
    const { acc, region } = await resolvePlayer(name, tag);

    const matchesData = await fetchAPI(
      `/valorant/v3/matches/${region}/${encodeURIComponent(acc.name)}/${encodeURIComponent(acc.tag)}?size=10`
    );
    const matches = matchesData.data;

    if (!matches?.length) {
      return interaction.editReply({ content: `No match data found for **${acc.name}#${acc.tag}**.` });
    }

    const children = [
      section(
        `## Match History — ${acc.name}#${acc.tag}\n` +
        `Last **${matches.length}** games  |  Region: **${region.toUpperCase()}** *(auto-detected)*`
      ),
    ];

    for (const [i, match] of matches.entries()) {
      const me = match.players?.all_players?.find(
        p => p.name?.toLowerCase() === acc.name.toLowerCase()
          && p.tag?.toLowerCase()  === acc.tag.toLowerCase()
      );
      if (!me) continue;

      const won    = match.teams?.[me.team?.toLowerCase()]?.has_won ?? false;
      const agent  = me.character         || 'Unknown';
      const mapN   = match.metadata?.map  || 'Unknown';
      const mode   = match.metadata?.mode || 'Unknown';
      const rounds = match.metadata?.rounds_played || 0;
      const k  = me.stats?.kills     || 0;
      const d  = me.stats?.deaths    || 0;
      const a  = me.stats?.assists   || 0;
      const hs = me.stats?.headshots || 0;
      const bs = me.stats?.bodyshots || 0;
      const ls = me.stats?.legshots  || 0;
      const acs    = rounds > 0 ? Math.round((me.stats?.score || 0) / rounds) : 0;
      const hsRate = (hs + bs + ls) > 0 ? Math.round((hs / (hs + bs + ls)) * 100) : 0;

      children.push(
        separator(),
        section(
          `**Match ${i + 1} — ${wl(won)}** | ${mode} | ${mapN}\n` +
          `Agent: **${agent}**\n` +
          `KDA: \`${k}/${d}/${a}\`  ACS: \`${acs}\`  HS%: \`${hsRate}%\`  Rounds: \`${rounds}\``
        )
      );
    }

    await interaction.editReply({
      components: [container(0xFFFFFF, ...children)],
      flags: IS_V2,
    });

  } catch (err) {
    console.error('[/matches error]', err);
    await interaction.editReply({ content: `Error: ${err.message}` });
  }
}

async function handleLeaderboard(interaction) {
  const region = interaction.options.getString('region');
  await interaction.deferReply();

  try {
    const data    = await fetchAPI(`/valorant/v1/leaderboard/${region}?start=0&end=10`);
    const players = data.data?.players || [];

    if (!players.length) {
      return interaction.editReply({ content: `No leaderboard data for **${region.toUpperCase()}**.` });
    }

    const children = [
      section(
        `## Ranked Leaderboard — ${region.toUpperCase()}\nTop 10 Radiant players this act`
      ),
    ];

    players.slice(0, 10).forEach((p, i) => {
      const rank = p.leaderboard_rank ?? i + 1;
      const name = p.is_anonymized ? '*Hidden*' : `${p.name}#${p.tag}`;

      children.push(
        separator(),
        section(
          `**#${rank}  ${name}**\n` +
          `RR: **${p.rr}**  |  Wins this act: **${p.wins}**`
        )
      );
    });

    await interaction.editReply({
      components: [container(0xFFFFFF, ...children)],
      flags: IS_V2,
    });

  } catch (err) {
    console.error('[/leaderboard error]', err);
    await interaction.editReply({ content: `Error fetching leaderboard: ${err.message}` });
  }
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'track')       return handleTrack(interaction);
    if (interaction.commandName === 'matches')     return handleMatches(interaction);
    if (interaction.commandName === 'leaderboard') return handleLeaderboard(interaction);
  }

  if (interaction.isButton() && interaction.customId.startsWith('refresh_')) {
    const riotId = interaction.customId.slice('refresh_'.length);
    interaction.options = { getString: () => riotId };
    return handleTrack(interaction);
  }
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('/track TenZ#NA1', { type: 3 });
  await registerCommands();
});

client.login(process.env.TOKEN);