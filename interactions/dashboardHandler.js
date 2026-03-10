// interactions/dashboardHandler.js
// Handles all button clicks from the admin_panel dashboard

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const db = require('../db');
const { buildDashboardEmbed, buildDashboardButtons } = require('../commands/admin_panel');

const PAGE_SIZE = 5;

async function handleDashboard(interaction) {
  const id = interaction.customId;

  // ── Refresh Stats ────────────────────────────────────────────────────────
  if (id === 'dash_stats') {
    await interaction.deferUpdate();
    const embed = buildDashboardEmbed();
    const rows = buildDashboardButtons();
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── View Active Collabs ──────────────────────────────────────────────────
  if (id === 'dash_view_active') {
    return sendCollabList(interaction, 'active', 0);
  }

  // ── View Closed Collabs ──────────────────────────────────────────────────
  if (id === 'dash_view_closed') {
    return sendCollabList(interaction, 'closed', 0);
  }

  // ── Collab list pagination ────────────────────────────────────────────────
  if (id.startsWith('dashlist_prev_') || id.startsWith('dashlist_next_')) {
    const parts = id.split('_');
    const filter = parts[2];
    let page = parseInt(parts[3], 10);
    if (id.startsWith('dashlist_next_')) page++;
    else page--;
    return sendCollabList(interaction, filter, page, true);
  }

  // ── Add Collab → show modal ──────────────────────────────────────────────
  if (id === 'dash_add_collab') {
    const modal = new ModalBuilder()
      .setCustomId('dashModal_addCollab')
      .setTitle('➕ Create New Collab');

    modal.addComponents(
      row(input('collab_name',     'Collab Name',        TextInputStyle.Short,     true)),
      row(input('collab_desc',     'Description',        TextInputStyle.Paragraph, true)),
      row(input('collab_details',  'Supply | Price | Spots | Mint Date', TextInputStyle.Short, true, 'e.g. 1000 | 0.05 ETH | 5 | Jan 2025')),
      row(input('collab_hours',    'Hours until close (enter 0 if using minutes)', TextInputStyle.Short, true, '24')),
      row(input('collab_req',      'Requirements (optional)',  TextInputStyle.Short, false, 'Follow @x | Join discord.gg/x')),
    );

    return interaction.showModal(modal);
  }

  // ── Close Collab → show select ───────────────────────────────────────────
  if (id === 'dash_close_collab') {
    const active = db.prepare(`SELECT id, name FROM collabs WHERE status='active' ORDER BY id DESC`).all();

    if (!active.length) {
      return interaction.reply({ content: '✅ No active collabs to close.', ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('dashSelect_closeCollab')
      .setPlaceholder('Choose collab to close')
      .addOptions(active.slice(0, 25).map(c => ({ label: c.name, value: String(c.id) })));

    return interaction.reply({
      content: '🔴 Select a collab to close:',
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  }

  // ── Close Collab confirmed ────────────────────────────────────────────────
  if (id === 'dashSelect_closeCollab' || interaction.customId === 'dashSelect_closeCollab') {
    return; // handled in select handler below
  }

  // ── Collab Info → show select ────────────────────────────────────────────
  if (id === 'dash_collab_info') {
    const all = db.prepare(`SELECT id, name, status FROM collabs ORDER BY id DESC`).all();

    if (!all.length) {
      return interaction.reply({ content: '❌ No collabs found.', ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('dashSelect_collabInfo')
      .setPlaceholder('Choose a collab to view')
      .addOptions(all.slice(0, 25).map(c => ({
        label: `${c.status === 'active' ? '🟢' : '🔴'} ${c.name}`,
        value: String(c.id),
      })));

    return interaction.reply({
      content: '🔍 Select a collab:',
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  }

  // ── Export CSV → show select ─────────────────────────────────────────────
  if (id === 'dash_export_csv') {
    const all = db.prepare(`SELECT id, name, status FROM collabs ORDER BY id DESC`).all();

    if (!all.length) {
      return interaction.reply({ content: '❌ No collabs found.', ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('dashSelect_exportCsv')
      .setPlaceholder('Choose collab to export')
      .addOptions(all.slice(0, 25).map(c => ({
        label: `${c.status === 'active' ? '🟢' : '🔴'} ${c.name}`,
        value: String(c.id),
      })));

    return interaction.reply({
      content: '📋 Select a collab to export submissions:',
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  }

  // ── Backup DB ─────────────────────────────────────────────────────────────
  if (id === 'dash_export_db') {
    await interaction.deferReply({ ephemeral: true });
    const fs = require('fs');
    const DB_PATH = process.env.DB_PATH || '/data/collabs.db';

    if (!fs.existsSync(DB_PATH)) {
      return interaction.editReply({ content: `❌ Database file not found at: ${DB_PATH}` });
    }

    const buf = fs.readFileSync(DB_PATH);
    const fileName = `collabs_backup_${dateStamp()}.db`;
    const attachment = new AttachmentBuilder(buf, { name: fileName });

    return interaction.editReply({
      content: `💾 Database backup — ${new Date().toUTCString()}`,
      files: [attachment],
    });
  }
}

// ── Handle select menus from dashboard ───────────────────────────────────────
async function handleDashboardSelect(interaction) {
  const id = interaction.customId;

  // ── Close collab confirmed ────────────────────────────────────────────────
  if (id === 'dashSelect_closeCollab') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab = db.prepare(`SELECT * FROM collabs WHERE id = ?`).get(collabId);

    if (!collab || collab.status === 'closed') {
      return interaction.editReply({ content: '❌ Already closed.', components: [] });
    }

    const guild = interaction.guild;

    let closedCat = guild.channels.cache.find(
      c => c.name === 'collabs-closed' && c.type === ChannelType.GuildCategory
    );
    if (!closedCat) {
      closedCat = await guild.channels.create({ name: 'collabs-closed', type: ChannelType.GuildCategory });
    }

    if (collab.channel_id) {
      const ch = await guild.channels.fetch(collab.channel_id).catch(() => null);
      if (ch) {
        let newName = ch.name.replace(/^🟢-/, '');
        if (!newName.startsWith('🔴-')) newName = `🔴-${newName}`;
        await ch.setName(newName).catch(() => {});
        await ch.setParent(closedCat.id).catch(() => {});
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
      }
    }

    db.prepare(`UPDATE collabs SET status='closed' WHERE id=?`).run(collabId);

    const contestCount = db.prepare(
      `SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND contest_link IS NOT NULL AND contest_link!=''`
    ).get(collabId).n;
    const walletCount = db.prepare(
      `SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND sheet_link IS NOT NULL AND sheet_link!=''`
    ).get(collabId).n;

    const logs = guild.channels.cache.find(c => c.name === 'logs');
    if (logs) {
      await logs.send(
        `🔴 **Collab Closed:** ${collab.name}\n` +
        `📝 Contest submissions: **${contestCount}**\n` +
        `💼 Wallet sheets: **${walletCount}**`
      );
    }

    return interaction.editReply({
      content: `✅ **${collab.name}** closed!\n📝 Submissions: **${contestCount}** | 💰 Wallets: **${walletCount}**`,
      components: [],
    });
  }

  // ── Collab info ───────────────────────────────────────────────────────────
  if (id === 'dashSelect_collabInfo') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);

    if (!collab) return interaction.editReply({ content: '❌ Not found.', components: [] });

    const subCount = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE collab_id=?`).get(collabId).c;
    const walCount = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE collab_id=? AND sheet_link IS NOT NULL AND sheet_link!=''`).get(collabId).c;

    const statusEmoji = collab.status === 'active' ? '🟢' : '🔴';
    const deadlineText = collab.deadline ? `<t:${Math.floor(collab.deadline / 1000)}:F>` : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} ${collab.name}`)
      .setColor(collab.status === 'active' ? 0x57F287 : 0xED4245)
      .setTimestamp()
      .addFields(
        { name: '📋 Description',   value: collab.description || 'None', inline: false },
        { name: '🎯 Status',         value: `${statusEmoji} ${collab.status}`, inline: true },
        { name: '🎟️ Spots',          value: String(collab.spots || 'N/A'), inline: true },
        { name: '💰 Price',          value: collab.price || 'N/A', inline: true },
        { name: '📦 Supply',         value: String(collab.supply || 'N/A'), inline: true },
        { name: '🗓 Mint Date',      value: collab.date || 'N/A', inline: true },
        { name: '⏰ Deadline',       value: deadlineText, inline: true },
        { name: '📝 Submissions',    value: String(subCount), inline: true },
        { name: '💰 Wallet Sheets',  value: String(walCount), inline: true },
      )
      .setFooter({ text: `ID: ${collab.id}` });

    if (collab.image) embed.setThumbnail(collab.image);

    return interaction.editReply({ embeds: [embed], components: [] });
  }

  // ── Export CSV for collab ─────────────────────────────────────────────────
  if (id === 'dashSelect_exportCsv') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab = db.prepare(`SELECT name FROM collabs WHERE id=?`).get(collabId);
    const rows = db.prepare(`SELECT * FROM submissions WHERE collab_id=?`).all(collabId);

    let csv = 'username,community,tier,contest_link,sheet_link\n';
    for (const r of rows) {
      csv += `"${r.username||''}","${r.community||''}","${r.tier||''}","${r.contest_link||''}","${r.sheet_link||''}"\n`;
    }

    const buf = Buffer.from(csv, 'utf8');
    const fileName = `${collab?.name || collabId}_${dateStamp()}.csv`;
    const attachment = new AttachmentBuilder(buf, { name: fileName });

    return interaction.editReply({
      content: `📋 Exported **${rows.length}** submissions for **${collab?.name}**`,
      files: [attachment],
      components: [],
    });
  }
}

// ── Handle modal submit from dashboard ───────────────────────────────────────
async function handleDashboardModal(interaction, client, ensureStructure) {
  const id = interaction.customId;

  // ── Add Collab modal submitted ────────────────────────────────────────────
  if (id === 'dashModal_addCollab') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const name    = interaction.fields.getTextInputValue('collab_name').trim();
      const desc    = interaction.fields.getTextInputValue('collab_desc').trim();
      const details = interaction.fields.getTextInputValue('collab_details').trim();
      const hoursRaw = interaction.fields.getTextInputValue('collab_hours').trim();
      const req     = interaction.fields.getTextInputValue('collab_req').trim();

      // Parse details: Supply | Price | Spots | Mint Date
      const detailParts = details.split('|').map(s => s.trim());
      const supply  = detailParts[0] || 'TBA';
      const price   = detailParts[1] || 'TBA';
      const spots   = detailParts[2] || 'TBA';
      const date    = detailParts[3] || 'TBA';

      const hours = parseInt(hoursRaw, 10) || 0;
      if (hours <= 0) {
        return interaction.editReply('❌ Hours must be a number greater than 0. Example: `24`');
      }

      const deadline = Date.now() + (hours * 3600000);
      const deadlineUnix = Math.floor(deadline / 1000);
      const relativeTime = `<t:${deadlineUnix}:R>`;

      const guild = interaction.guild;
      const { activeCat } = await ensureStructure(guild);

      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

      const channel = await guild.channels.create({
        name: `🟢-${slug}`,
        type: ChannelType.GuildText,
        parent: activeCat.id,
        permissionOverwrites: [{
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.SendMessages],
        }],
      });

      const result = db.prepare(
        `INSERT INTO collabs (name, description, supply, date, price, spots, requirements, note, image, deadline, channel_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(name, desc, supply, date, price, spots, req || '—', '—', null, deadline, channel.id, 'active');

      const collabId = result.lastInsertRowid;

      const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS, EmbedBuilder: EB } = require('discord.js');

      const btnRow = new AR().addComponents(
        new BB().setCustomId(`contest_${collabId}`).setLabel('🟢 Submit Contest Link').setStyle(BS.Success),
        new BB().setCustomId(`wallet_${collabId}`).setLabel('📄 Submit Wallet Sheet').setStyle(BS.Primary),
      );

      const embed = new EB()
        .setTitle(`🔥 ${name}`)
        .setDescription(desc)
        .addFields(
          { name: '⏳ Ends',      value: relativeTime, inline: true },
          { name: '📦 Supply',    value: supply,       inline: true },
          { name: '💰 Price',     value: price,        inline: true },
          { name: '🗓 Date',      value: date,         inline: true },
          { name: '🎟️ Spots',     value: spots,        inline: true },
          { name: '✅ Requirements', value: req || '—' },
        )
        .setTimestamp();

      await channel.send({ content: 'Use the buttons below to submit:', embeds: [embed], components: [btnRow] });

      const ann = guild.channels.cache.find(c => c.name === 'collabs-announcements');
      if (ann) await ann.send({ content: `📢 New Collab: **${name}** → ${channel}\n⏳ Ends ${relativeTime}`, embeds: [embed] });

      const logs = guild.channels.cache.find(c => c.name === 'logs');
      if (logs) await logs.send(`🟢 Collab Created: **${name}** | Channel: ${channel} | Ends ${relativeTime}`);

      await interaction.editReply(`✅ Collab **${name}** created! → ${channel}`);

    } catch (err) {
      console.error('[dashModal_addCollab] Error:', err);
      await interaction.editReply(`❌ Error creating collab: ${err.message}`);
    }
  }
}

// ── Collab list embed with pagination ────────────────────────────────────────
async function sendCollabList(interaction, filter, page, isUpdate = false) {
  await (isUpdate ? interaction.deferUpdate() : interaction.deferReply({ ephemeral: true }));

  const rows = filter === 'active'
    ? db.prepare(`SELECT * FROM collabs WHERE status='active' ORDER BY id DESC`).all()
    : db.prepare(`SELECT * FROM collabs WHERE status='closed' ORDER BY id DESC`).all();

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const label = filter === 'active' ? '🟢 Active' : '🔴 Closed';

  const embed = new EmbedBuilder()
    .setTitle(`${label} Collabs`)
    .setColor(filter === 'active' ? 0x57F287 : 0xED4245)
    .setFooter({ text: `Page ${page + 1} of ${totalPages}  •  ${rows.length} total` })
    .setTimestamp();

  if (pageRows.length === 0) {
    embed.setDescription('No collabs found.');
  } else {
    for (const c of pageRows) {
      const dl = c.deadline ? `⏰ <t:${Math.floor(c.deadline / 1000)}:R>` : '⏰ No deadline';
      embed.addFields({
        name: `${filter === 'active' ? '🟢' : '🔴'} ${c.name}`,
        value: `${dl}  •  🎟️ ${c.spots || 'N/A'} spots  •  ID: \`${c.id}\``,
        inline: false,
      });
    }
  }

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dashlist_prev_${filter}_${page}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`dashlist_next_${filter}_${page}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return interaction.editReply({ embeds: [embed], components: [navRow] });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function input(customId, label, style, required, placeholder) {
  const t = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
  if (placeholder) t.setPlaceholder(placeholder);
  return t;
}
function row(component) {
  return new ActionRowBuilder().addComponents(component);
}
function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { handleDashboard, handleDashboardSelect, handleDashboardModal };
