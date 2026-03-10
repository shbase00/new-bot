require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('./db');

// ====== Helpers ======
const { startAutoBackup }  = require('./utils/autoBackup');
const { setupErrorHandlers } = require('./utils/errorHandler');
const buttonHandler        = require('./interactions/buttonHandler');
const { handleDashboard, handleDashboardSelect, handleDashboardModal } = require('./interactions/dashboardHandler');

// ====== Create Client ======
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ====== Load Commands ======
client.commands = new Collection();
const commandsPath  = path.join(__dirname, 'commands');
const commandFiles  = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// ====== Ensure Categories & Channels ======
async function ensureStructure(guild) {
  let activeCat = guild.channels.cache.find(c => c.name === 'collabs-active' && c.type === ChannelType.GuildCategory);
  let closedCat = guild.channels.cache.find(c => c.name === 'collabs-closed' && c.type === ChannelType.GuildCategory);

  if (!activeCat) activeCat = await guild.channels.create({ name: 'collabs-active', type: ChannelType.GuildCategory });
  if (!closedCat) closedCat = await guild.channels.create({ name: 'collabs-closed', type: ChannelType.GuildCategory });

  let ann = guild.channels.cache.find(c => c.name === 'collabs-announcements' && c.type === ChannelType.GuildText);
  if (!ann) ann = await guild.channels.create({
    name: 'collabs-announcements', type: ChannelType.GuildText,
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.SendMessages] }],
  });

  let logs = guild.channels.cache.find(c => c.name === 'logs' && c.type === ChannelType.GuildText);
  if (!logs) logs = await guild.channels.create({
    name: 'logs', type: ChannelType.GuildText,
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.SendMessages] }],
  });

  return { activeCat, closedCat, ann, logs };
}

// ====== Interaction Handlers ======
const { handleButton } = require('./interactions/buttons');
const { handleModal }  = require('./interactions/modals');

// ====== Auto Close ======
async function autoCloseExpiredCollabs() {
  try {
    const now     = Date.now();
    const expired = db.prepare("SELECT * FROM collabs WHERE status='active' AND deadline <= ?").all(now);

    for (const collab of expired) {
      try {
        if (!collab.channel_id) continue;
        const channel = await client.channels.fetch(collab.channel_id).catch(() => null);
        if (!channel || !channel.guild) continue;

        const guild = channel.guild;
        const { closedCat, logs } = await ensureStructure(guild);

        let newName = channel.name;
        if (!newName.startsWith('🔴')) newName = `🔴-${newName.replace(/^🟢-/, '')}`;

        await channel.setName(newName).catch(() => {});
        await channel.setParent(closedCat.id).catch(() => {});
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});

        db.prepare("UPDATE collabs SET status='closed' WHERE id=?").run(collab.id);

        const contestCount = db.prepare("SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND contest_link IS NOT NULL AND contest_link!=''").get(collab.id).n;
        const walletCount  = db.prepare("SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND sheet_link IS NOT NULL AND sheet_link!=''").get(collab.id).n;

        if (logs) await logs.send(
          `🔴 **Auto Closed:** ${collab.name}\n📝 Contest: **${contestCount}** | 💼 Wallets: **${walletCount}**`
        );
      } catch (e) { console.error('Auto-close error:', collab.id, e); }
    }
  } catch (err) { console.error('Auto-close loop error:', err); }
}

// ====== Ready ======
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setupErrorHandlers(client);
  startAutoBackup(client);
  autoCloseExpiredCollabs();
  setInterval(() => autoCloseExpiredCollabs(), 10 * 60 * 1000);
});

client.on(buttonHandler.name, (...args) => buttonHandler.execute(...args));

// ====== Interaction Create ======
client.on('interactionCreate', async interaction => {
  try {

    // ── Slash Commands ─────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client, ensureStructure);
      return;
    }

    // ── Buttons ────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;

      // All dashboard buttons
      if (
        id.startsWith('dash_')       ||
        id.startsWith('dashlist_')   ||
        id.startsWith('dashBtn_')
      ) {
        await handleDashboard(interaction);
        return;
      }

      // collab_panel pagination
      if (id.startsWith('panel_')) {
        await buttonHandler.execute(interaction);
        return;
      }

      // Original submit buttons (contest / wallet)
      await handleButton(interaction);
      return;
    }

    // ── Select Menus ───────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id.startsWith('dashSelect_')) {
        await handleDashboardSelect(interaction);
        return;
      }

      await handleButton(interaction);
      return;
    }

    // ── Modals ─────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('dashModal_')) {
        await handleDashboardModal(interaction, client, ensureStructure);
        return;
      }

      await handleModal(interaction);
      return;
    }

  } catch (err) {
    console.error(err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Error happened.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Error happened.', ephemeral: true });
      }
    } catch (e) { console.error('Failed to send error reply:', e); }
  }
});

// ====== Login ======
client.login(process.env.TOKEN);
