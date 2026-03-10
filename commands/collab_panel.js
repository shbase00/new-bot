// commands/collab_panel.js
// Improved collab panel with Active/Closed filter and pagination

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const DB_PATH = process.env.DB_PATH || '/data/collabs.db';
const PAGE_SIZE = 5; // collabs per page

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab_panel')
    .setDescription('View and manage collabs (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Which collabs to show')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Active Collabs', value: 'active' },
          { name: '🔴 Closed Collabs', value: 'closed' },
          { name: '📋 All Collabs', value: 'all' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const filter = interaction.options.getString('filter') || 'all';
    await sendCollabPanel(interaction, filter, 0, false);
  },
};

// ─── Shared function used by both command & button handler ──────────────────

async function sendCollabPanel(interaction, filter, page, isUpdate) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true });

    // Build query based on filter
    let rows;
    if (filter === 'active') {
      rows = db.prepare(`SELECT * FROM collabs WHERE status = 'active' ORDER BY id DESC`).all();
    } else if (filter === 'closed') {
      rows = db.prepare(`SELECT * FROM collabs WHERE status = 'closed' ORDER BY id DESC`).all();
    } else {
      rows = db.prepare(`SELECT * FROM collabs ORDER BY id DESC`).all();
    }

    db.close();

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    // Build embed
    const filterLabel = filter === 'active' ? '🟢 Active' : filter === 'closed' ? '🔴 Closed' : '📋 All';
    const embed = new EmbedBuilder()
      .setTitle(`${filterLabel} Collabs`)
      .setColor(filter === 'active' ? 0x57F287 : filter === 'closed' ? 0xED4245 : 0x5865F2)
      .setFooter({ text: `Page ${page + 1} of ${totalPages}  •  ${rows.length} total collabs` })
      .setTimestamp();

    if (pageRows.length === 0) {
      embed.setDescription('No collabs found.');
    } else {
      for (const collab of pageRows) {
        const emoji = collab.status === 'active' ? '🟢' : '🔴';
        const deadline = collab.deadline ? `⏰ <t:${toUnix(collab.deadline)}:R>` : '⏰ No deadline';
        embed.addFields({
          name: `${emoji} ${collab.name}`,
          value: `${deadline}  •  🎟️ Spots: ${collab.spots || 'N/A'}  •  ID: \`${collab.id}\``,
          inline: false,
        });
      }
    }

    // Buttons: Previous / Next / Switch filter
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_prev_${filter}_${page}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`panel_next_${filter}_${page}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );

    const filterRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_filter_active_0`)
        .setLabel('🟢 Active')
        .setStyle(filter === 'active' ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`panel_filter_closed_0`)
        .setLabel('🔴 Closed')
        .setStyle(filter === 'closed' ? ButtonStyle.Danger : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`panel_filter_all_0`)
        .setLabel('📋 All')
        .setStyle(filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );

    const payload = { embeds: [embed], components: [navRow, filterRow] };

    if (isUpdate) {
      await interaction.update(payload);
    } else {
      await interaction.editReply(payload);
    }

  } catch (error) {
    console.error('[collab_panel] Error:', error);
    const msg = { content: `❌ Error loading panel: ${error.message}`, embeds: [], components: [] };
    if (isUpdate) await interaction.update(msg).catch(() => {});
    else await interaction.editReply(msg).catch(() => {});
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────
function toUnix(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? 0 : Math.floor(d.getTime() / 1000);
}

// Export the shared function so buttonHandler can use it
module.exports.sendCollabPanel = sendCollabPanel;
