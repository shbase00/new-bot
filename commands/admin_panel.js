// commands/admin_panel.js
// Run /admin_panel once in your admin channel — it posts and pins the dashboard

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

    const msg = await interaction.channel.send({
      embeds: [buildDashboardEmbed()],
      components: buildDashboardButtons(),
    });

    await msg.pin().catch(() => {});
    await interaction.editReply('✅ Admin panel posted and pinned!');
  },
};

// ── Stats Embed ───────────────────────────────────────────────────
function buildDashboardEmbed() {
  let total = 0, active = 0, closed = 0, subs = 0, wallets = 0;

  try {
    total   = db.prepare(`SELECT COUNT(*) as c FROM collabs`).get().c;
    active  = db.prepare(`SELECT COUNT(*) as c FROM collabs WHERE status='active'`).get().c;
    closed  = db.prepare(`SELECT COUNT(*) as c FROM collabs WHERE status='closed'`).get().c;
    subs    = db.prepare(`SELECT COUNT(*) as c FROM submissions`).get().c;
    wallets = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE sheet_link IS NOT NULL AND sheet_link!=''`).get().c;
  } catch (e) { /* db not ready */ }

  return new EmbedBuilder()
    .setTitle('⚙️ Admin Control Panel')
    .setColor(0x5865F2)
    .setDescription('Manage all collabs from this panel. Use the buttons below.')
    .addFields({
      name: '📊 Live Stats',
      value: [
        `> 📁 Total Collabs: **${total}**`,
        `> 🟢 Active: **${active}**  🔴 Closed: **${closed}**`,
        `> 📝 Submissions: **${subs}**`,
        `> 💰 Wallet Sheets: **${wallets}**`,
      ].join('\n'),
    })
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

// ── Button Rows ───────────────────────────────────────────────────
function buildDashboardButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_add_collab')
      .setLabel('➕ Add Collab')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('dash_edit_collab')
      .setLabel('✏️ Edit Collab')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('dash_close_collab')
      .setLabel('🔴 Close Collab')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_view_active')
      .setLabel('🟢 Active Collabs')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dash_view_closed')
      .setLabel('📋 Closed Collabs')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dash_collab_info')
      .setLabel('🔍 Collab Info')
      .setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
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
  );

  return [row1, row2, row3];
}

module.exports.buildDashboardEmbed  = buildDashboardEmbed;
module.exports.buildDashboardButtons = buildDashboardButtons;