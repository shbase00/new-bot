// commands/admin_panel.js
// Creates a permanent pinned admin dashboard in the current channel
// Usage: /admin_panel  (run once — it pins itself)

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin_panel')
    .setDescription('Post & pin the admin control panel in this channel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const embed = buildDashboardEmbed();
    const rows = buildDashboardButtons();

    const msg = await interaction.channel.send({
      embeds: [embed],
      components: rows,
    });

    // Pin the message
    await msg.pin().catch(() => {});

    await interaction.editReply('✅ Admin panel posted and pinned!');
  },
};

// ── Build the stats embed ─────────────────────────────────────────────────────
function buildDashboardEmbed() {
  let totalCollabs = 0, activeCollabs = 0, closedCollabs = 0;
  let totalSubmissions = 0, walletSheets = 0;

  try {
    totalCollabs     = db.prepare(`SELECT COUNT(*) as c FROM collabs`).get().c;
    activeCollabs    = db.prepare(`SELECT COUNT(*) as c FROM collabs WHERE status='active'`).get().c;
    closedCollabs    = db.prepare(`SELECT COUNT(*) as c FROM collabs WHERE status='closed'`).get().c;
    totalSubmissions = db.prepare(`SELECT COUNT(*) as c FROM submissions`).get().c;
    walletSheets     = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE sheet_link IS NOT NULL AND sheet_link != ''`).get().c;
  } catch (e) { /* db not ready yet */ }

  return new EmbedBuilder()
    .setTitle('⚙️ Admin Control Panel')
    .setColor(0x5865F2)
    .setDescription('Use the buttons below to manage all collabs from this panel.')
    .addFields(
      {
        name: '📊 Live Stats',
        value: [
          `> 📁 Total Collabs: **${totalCollabs}**`,
          `> 🟢 Active: **${activeCollabs}**`,
          `> 🔴 Closed: **${closedCollabs}**`,
          `> 📝 Submissions: **${totalSubmissions}**`,
          `> 💰 Wallet Sheets: **${walletSheets}**`,
        ].join('\n'),
        inline: false,
      }
    )
    .setFooter({ text: `Last updated` })
    .setTimestamp();
}

// ── Build the button rows ─────────────────────────────────────────────────────
function buildDashboardButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_add_collab')
      .setLabel('➕ Add Collab')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('dash_close_collab')
      .setLabel('🔴 Close Collab')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('dash_view_active')
      .setLabel('🟢 Active Collabs')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dash_view_closed')
      .setLabel('📋 Closed Collabs')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_stats')
      .setLabel('📊 Refresh Stats')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('dash_export_csv')
      .setLabel('📋 Export CSV')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dash_export_db')
      .setLabel('💾 Backup DB')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dash_collab_info')
      .setLabel('🔍 Collab Info')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

module.exports.buildDashboardEmbed = buildDashboardEmbed;
module.exports.buildDashboardButtons = buildDashboardButtons;
