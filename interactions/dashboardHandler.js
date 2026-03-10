// interactions/dashboardHandler.js

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

// Temporary in-memory store for multi-step flows
const pendingCollabs = {};

// ═══════════════════════════════════════════════════════════════════
// BUTTON HANDLER
// ═══════════════════════════════════════════════════════════════════
async function handleDashboard(interaction) {
  const id = interaction.customId;

  // ── Refresh Stats ──────────────────────────────────────────────
  if (id === 'dash_stats') {
    await interaction.deferUpdate();
    return interaction.editReply({
      embeds: [buildDashboardEmbed()],
      components: buildDashboardButtons(),
    });
  }

  // ── View Active / Closed ───────────────────────────────────────
  if (id === 'dash_view_active') return sendCollabList(interaction, 'active', 0);
  if (id === 'dash_view_closed') return sendCollabList(interaction, 'closed', 0);

  // ── List pagination ────────────────────────────────────────────
  if (id.startsWith('dashlist_prev_') || id.startsWith('dashlist_next_')) {
    const parts = id.split('_');
    const filter = parts[2];
    let page = parseInt(parts[3], 10);
    if (id.startsWith('dashlist_next_')) page++; else page--;
    return sendCollabList(interaction, filter, page, true);
  }

  // ── Add Collab → Step 1 modal ──────────────────────────────────
  if (id === 'dash_add_collab') {
    const modal = new ModalBuilder()
      .setCustomId('dashModal_addStep1')
      .setTitle('➕ New Collab — Step 1/3: Basic Info');

    modal.addComponents(
      row(inp('collab_name',   'Collab Name',   TextInputStyle.Short,     true)),
      row(inp('collab_desc',   'Description',   TextInputStyle.Paragraph, true)),
      row(inp('collab_supply', 'Supply',         TextInputStyle.Short,     true, 'e.g. 1000')),
      row(inp('collab_price',  'Price',          TextInputStyle.Short,     true, 'e.g. 0.05 ETH')),
      row(inp('collab_date',   'Mint Date',      TextInputStyle.Short,     true, 'e.g. Jan 2025')),
    );

    return interaction.showModal(modal);
  }

  // ── Step 2 button clicked → show Step 2 modal ─────────────────
  if (id.startsWith('dashBtn_step2_')) {
    const token = id.replace('dashBtn_step2_', '');
    if (!pendingCollabs[token]) {
      return interaction.reply({ content: '❌ Session expired. Please click ➕ Add Collab again.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_addStep2_${token}`)
      .setTitle('➕ New Collab — Step 2/3: Spots & Time');

    modal.addComponents(
      row(inp('spots_t1',       'Spots for T1 (optional)',        TextInputStyle.Short, false, 'e.g. 3')),
      row(inp('spots_t2',       'Spots for T2 (optional)',        TextInputStyle.Short, false, 'e.g. 2')),
      row(inp('spots_t3',       'Spots for T3 (optional)',        TextInputStyle.Short, false, 'e.g. 1')),
      row(inp('collab_hours',   'Hours until close',              TextInputStyle.Short, true,  'e.g. 24')),
      row(inp('collab_minutes', 'Minutes until close (optional)', TextInputStyle.Short, false, 'e.g. 30')),
    );

    return interaction.showModal(modal);
  }

  // ── Step 3 button clicked → show Step 3 modal ─────────────────
  if (id.startsWith('dashBtn_step3_')) {
    const token = id.replace('dashBtn_step3_', '');
    if (!pendingCollabs[token]) {
      return interaction.reply({ content: '❌ Session expired. Please click ➕ Add Collab again.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_addStep3_${token}`)
      .setTitle('➕ New Collab — Step 3/3: Requirements');

    modal.addComponents(
      row(inp('req_follow',  'Follow — X profile link(s)',               TextInputStyle.Paragraph, false, 'https://x.com/user1\nhttps://x.com/user2')),
      row(inp('req_like',    'Like & Repost — post link',                TextInputStyle.Short,     false, 'https://x.com/user/status/...')),
      row(inp('req_discord', 'Join Discord — invite link',               TextInputStyle.Short,     false, 'https://discord.gg/...')),
      row(inp('req_chain',   'Chain (ETH / Base / Monad / BTC / etc.)',  TextInputStyle.Short,     false, 'e.g. ETH')),
      row(inp('req_note',    'Note (optional)',                           TextInputStyle.Paragraph, false, 'Any extra info...')),
    );

    return interaction.showModal(modal);
  }

  // ── Confirm & Create collab ────────────────────────────────────
  if (id.startsWith('dashBtn_confirm_')) {
    const token = id.replace('dashBtn_confirm_', '');
    const data  = pendingCollabs[token];
    if (!data || !data.ready) {
      return interaction.reply({ content: '❌ Session expired. Please click ➕ Add Collab again.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    return createCollab(interaction, data, token);
  }

  // ── Cancel ────────────────────────────────────────────────────
  if (id.startsWith('dashBtn_cancel_')) {
    const token = id.replace('dashBtn_cancel_', '');
    delete pendingCollabs[token];
    return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
  }

  // ══════════════════════════════════════════════════════════════
  // EDIT COLLAB — Step 2: what to edit buttons
  // ══════════════════════════════════════════════════════════════

  // ── Open "Edit Basic Info" modal ───────────────────────────────
  if (id.startsWith('dashBtn_editBasic_')) {
    const collabId = id.replace('dashBtn_editBasic_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.reply({ content: '❌ Not found.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_editBasic_${collabId}`)
      .setTitle(`✏️ Edit Basic Info`);

    modal.addComponents(
      row(inp('edit_name',   'Collab Name',   TextInputStyle.Short,     true, collab.name        || '')),
      row(inp('edit_desc',   'Description',   TextInputStyle.Paragraph, true, collab.description || '')),
      row(inp('edit_supply', 'Supply',         TextInputStyle.Short,     false, collab.supply     || '')),
      row(inp('edit_price',  'Price',          TextInputStyle.Short,     false, collab.price      || '')),
      row(inp('edit_date',   'Mint Date',      TextInputStyle.Short,     false, collab.date       || '')),
    );

    return interaction.showModal(modal);
  }

  // ── Open "Edit Spots" modal ────────────────────────────────────
  if (id.startsWith('dashBtn_editSpots_')) {
    const collabId = id.replace('dashBtn_editSpots_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.reply({ content: '❌ Not found.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_editSpots_${collabId}`)
      .setTitle(`✏️ Edit Spots`);

    // Try to parse existing spots back into T1/T2/T3
    let t1 = '', t2 = '', t3 = '';
    if (collab.spots) {
      const m1 = collab.spots.match(/T1:\s*(\S+)/i);
      const m2 = collab.spots.match(/T2:\s*(\S+)/i);
      const m3 = collab.spots.match(/T3:\s*(\S+)/i);
      if (m1) t1 = m1[1];
      if (m2) t2 = m2[1];
      if (m3) t3 = m3[1];
      // if format is different, show full value in T1
      if (!m1 && !m2 && !m3) t1 = collab.spots;
    }

    modal.addComponents(
      row(inp('spots_t1', 'Spots for T1', TextInputStyle.Short, false, t1 || 'e.g. 3')),
      row(inp('spots_t2', 'Spots for T2', TextInputStyle.Short, false, t2 || 'e.g. 2')),
      row(inp('spots_t3', 'Spots for T3', TextInputStyle.Short, false, t3 || 'e.g. 1')),
    );

    return interaction.showModal(modal);
  }

  // ── Open "Extend Time" modal ───────────────────────────────────
  if (id.startsWith('dashBtn_editTime_')) {
    const collabId = id.replace('dashBtn_editTime_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.reply({ content: '❌ Not found.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_editTime_${collabId}`)
      .setTitle(`✏️ Extend / Set Deadline`);

    const currentDeadline = collab.deadline
      ? `Current: <t:${Math.floor(collab.deadline / 1000)}:F>`
      : 'No deadline set';

    modal.addComponents(
      row(inp('extend_hours',   'Add Hours (adds to current deadline)',   TextInputStyle.Short, false, 'e.g. 24  (enter 0 to skip)')),
      row(inp('extend_minutes', 'Add Minutes (adds to current deadline)', TextInputStyle.Short, false, 'e.g. 30  (enter 0 to skip)')),
      row(inp('new_deadline',   'OR set a brand new deadline (hours from NOW)', TextInputStyle.Short, false, 'e.g. 48  (overrides above if filled)')),
    );

    return interaction.showModal(modal);
  }

  // ── Open "Edit Requirements" modal ────────────────────────────
  if (id.startsWith('dashBtn_editReqs_')) {
    const collabId = id.replace('dashBtn_editReqs_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.reply({ content: '❌ Not found.', ephemeral: true });

    let ex = { follow: '', like_repost: '', discord: '', chain: '', note: '' };
    try { ex = { ...ex, ...JSON.parse(collab.requirements) }; } catch (e) {}

    const modal = new ModalBuilder()
      .setCustomId(`dashModal_editReqs_${collabId}`)
      .setTitle(`✏️ Edit Requirements`);

    modal.addComponents(
      row(inp('req_follow',  'Follow — X profile link(s)',               TextInputStyle.Paragraph, false, ex.follow      || '')),
      row(inp('req_like',    'Like & Repost — post link',                TextInputStyle.Short,     false, ex.like_repost || '')),
      row(inp('req_discord', 'Join Discord — invite link',               TextInputStyle.Short,     false, ex.discord     || '')),
      row(inp('req_chain',   'Chain (ETH / Base / Monad / BTC / etc.)',  TextInputStyle.Short,     false, ex.chain       || '')),
      row(inp('req_note',    'Note (optional)',                           TextInputStyle.Paragraph, false, ex.note        || '')),
    );

    return interaction.showModal(modal);
  }

  // ── Reactivate collab button ───────────────────────────────────
  if (id.startsWith('dashBtn_reactivate_')) {
    const collabId = id.replace('dashBtn_reactivate_', '');
    await interaction.deferReply({ ephemeral: true });
    return reactivateCollab(interaction, collabId);
  }

  // ── Close Collab ───────────────────────────────────────────────
  if (id === 'dash_close_collab') {
    const active = db.prepare(`SELECT id, name FROM collabs WHERE status='active' ORDER BY id DESC`).all();
    if (!active.length) return interaction.reply({ content: '✅ No active collabs to close.', ephemeral: true });

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

  // ── Edit Collab → pick collab ──────────────────────────────────
  if (id === 'dash_edit_collab') {
    const all = db.prepare(`SELECT id, name, status FROM collabs ORDER BY id DESC`).all();
    if (!all.length) return interaction.reply({ content: '❌ No collabs found.', ephemeral: true });

    const select = new StringSelectMenuBuilder()
      .setCustomId('dashSelect_editCollab')
      .setPlaceholder('Choose collab to edit')
      .addOptions(all.slice(0, 25).map(c => ({
        label: `${c.status === 'active' ? '🟢' : '🔴'} ${c.name}`,
        value: String(c.id),
      })));

    return interaction.reply({
      content: '✏️ Select a collab to edit:',
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  }

  // ── Collab Info ────────────────────────────────────────────────
  if (id === 'dash_collab_info') {
    const all = db.prepare(`SELECT id, name, status FROM collabs ORDER BY id DESC`).all();
    if (!all.length) return interaction.reply({ content: '❌ No collabs found.', ephemeral: true });

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

  // ── Export CSV ─────────────────────────────────────────────────
  if (id === 'dash_export_csv') {
    const all = db.prepare(`SELECT id, name, status FROM collabs ORDER BY id DESC`).all();
    if (!all.length) return interaction.reply({ content: '❌ No collabs found.', ephemeral: true });

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

  // ── Backup DB ──────────────────────────────────────────────────
  if (id === 'dash_export_db') {
    await interaction.deferReply({ ephemeral: true });
    const fs = require('fs');
    const DB_PATH = process.env.DB_PATH || '/data/collabs.db';
    if (!fs.existsSync(DB_PATH)) {
      return interaction.editReply({ content: `❌ Database file not found at: ${DB_PATH}` });
    }
    const buf = fs.readFileSync(DB_PATH);
    const attachment = new AttachmentBuilder(buf, { name: `collabs_backup_${dateStamp()}.db` });
    return interaction.editReply({
      content: `💾 Database backup — ${new Date().toUTCString()}`,
      files: [attachment],
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// SELECT MENU HANDLER
// ═══════════════════════════════════════════════════════════════════
async function handleDashboardSelect(interaction) {
  const id = interaction.customId;

  // ── Close Collab ───────────────────────────────────────────────
  if (id === 'dashSelect_closeCollab') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);

    if (!collab || collab.status === 'closed') {
      return interaction.editReply({ content: '❌ Already closed.', components: [] });
    }

    const guild = interaction.guild;
    let closedCat = guild.channels.cache.find(c => c.name === 'collabs-closed' && c.type === ChannelType.GuildCategory);
    if (!closedCat) closedCat = await guild.channels.create({ name: 'collabs-closed', type: ChannelType.GuildCategory });

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

    const contestCount = db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND contest_link IS NOT NULL AND contest_link!=''`).get(collabId).n;
    const walletCount  = db.prepare(`SELECT COUNT(*) as n FROM submissions WHERE collab_id=? AND sheet_link IS NOT NULL AND sheet_link!=''`).get(collabId).n;

    const logs = guild.channels.cache.find(c => c.name === 'logs');
    if (logs) await logs.send(`🔴 **Collab Closed:** ${collab.name}\n📝 Contest: **${contestCount}** | 💼 Wallets: **${walletCount}**`);

    return interaction.editReply({
      content: `✅ **${collab.name}** closed!\n📝 Submissions: **${contestCount}** | 💰 Wallets: **${walletCount}**`,
      components: [],
    });
  }

  // ── Edit Collab → show what-to-edit menu ───────────────────────
  if (id === 'dashSelect_editCollab') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply({ content: '❌ Not found.', components: [] });

    const statusEmoji  = collab.status === 'active' ? '🟢' : '🔴';
    const deadlineText = collab.deadline ? `<t:${Math.floor(collab.deadline / 1000)}:R>` : 'No deadline';

    // Build the what-to-edit buttons
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dashBtn_editBasic_${collabId}`)
        .setLabel('📋 Basic Info')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dashBtn_editSpots_${collabId}`)
        .setLabel('🎟️ Spots')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dashBtn_editTime_${collabId}`)
        .setLabel('⏰ Extend Time')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dashBtn_editReqs_${collabId}`)
        .setLabel('✅ Requirements')
        .setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      collab.status === 'closed'
        ? new ButtonBuilder()
            .setCustomId(`dashBtn_reactivate_${collabId}`)
            .setLabel('🟢 Reactivate Collab')
            .setStyle(ButtonStyle.Success)
        : new ButtonBuilder()
            .setCustomId(`dashSelect_closeCollab_${collabId}`)
            .setLabel('🔴 Close This Collab')
            .setStyle(ButtonStyle.Danger),
    );

    return interaction.editReply({
      content: [
        `**${statusEmoji} ${collab.name}**`,
        `⏰ Deadline: ${deadlineText}`,
        `🎟️ Spots: ${collab.spots || 'N/A'}`,
        `\nWhat do you want to edit?`,
      ].join('\n'),
      components: [row1, row2],
    });
  }

  // ── Collab Info ────────────────────────────────────────────────
  if (id === 'dashSelect_collabInfo') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply({ content: '❌ Not found.', components: [] });

    const subCount = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE collab_id=?`).get(collabId).c;
    const walCount = db.prepare(`SELECT COUNT(*) as c FROM submissions WHERE collab_id=? AND sheet_link IS NOT NULL AND sheet_link!=''`).get(collabId).c;

    const statusEmoji  = collab.status === 'active' ? '🟢' : '🔴';
    const deadlineText = collab.deadline ? `<t:${Math.floor(collab.deadline / 1000)}:F>` : 'N/A';

    let followText = '—', likeText = '—', discordText = '—', chainText = '—', noteText = '—';
    try {
      const r = JSON.parse(collab.requirements);
      if (r.follow)      followText  = r.follow;
      if (r.like_repost) likeText    = r.like_repost;
      if (r.discord)     discordText = r.discord;
      if (r.chain)       chainText   = r.chain;
      if (r.note)        noteText    = r.note;
    } catch (e) { noteText = collab.requirements || '—'; }

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} ${collab.name}`)
      .setColor(collab.status === 'active' ? 0x57F287 : 0xED4245)
      .setTimestamp()
      .addFields(
        { name: '📋 Description',   value: collab.description || '—', inline: false },
        { name: '🎯 Status',         value: `${statusEmoji} ${collab.status}`, inline: true },
        { name: '📦 Supply',         value: String(collab.supply || '—'), inline: true },
        { name: '💰 Price',          value: collab.price || '—', inline: true },
        { name: '🎟️ Spots',          value: String(collab.spots || '—'), inline: true },
        { name: '🗓 Mint Date',      value: collab.date || '—', inline: true },
        { name: '⛓️ Chain',          value: chainText, inline: true },
        { name: '⏰ Deadline',       value: deadlineText, inline: false },
        { name: '📝 Submissions',    value: String(subCount), inline: true },
        { name: '💰 Wallet Sheets',  value: String(walCount), inline: true },
        { name: '👤 Follow',         value: followText, inline: false },
        { name: '❤️ Like & Repost',  value: likeText, inline: false },
        { name: '💬 Join Discord',   value: discordText, inline: false },
        { name: '📌 Note',           value: noteText, inline: false },
      )
      .setFooter({ text: `ID: ${collab.id}` });

    if (collab.image) embed.setThumbnail(collab.image);
    return interaction.editReply({ embeds: [embed], components: [] });
  }

  // ── Export CSV ─────────────────────────────────────────────────
  if (id === 'dashSelect_exportCsv') {
    await interaction.deferUpdate();
    const collabId = interaction.values[0];
    const collab   = db.prepare(`SELECT name FROM collabs WHERE id=?`).get(collabId);
    const rows     = db.prepare(`SELECT * FROM submissions WHERE collab_id=?`).all(collabId);

    let csv = 'username,community,tier,contest_link,sheet_link\n';
    for (const r of rows) {
      csv += `"${r.username||''}","${r.community||''}","${r.tier||''}","${r.contest_link||''}","${r.sheet_link||''}"\n`;
    }

    const buf        = Buffer.from(csv, 'utf8');
    const attachment = new AttachmentBuilder(buf, { name: `${collab?.name || collabId}_${dateStamp()}.csv` });

    return interaction.editReply({
      content: `📋 Exported **${rows.length}** submissions for **${collab?.name}**`,
      files: [attachment],
      components: [],
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// MODAL HANDLER
// ═══════════════════════════════════════════════════════════════════
async function handleDashboardModal(interaction, client, ensureStructure) {
  const id = interaction.customId;

  // ══════════════════════════════════════════════════════════════
  // ADD COLLAB FLOW
  // ══════════════════════════════════════════════════════════════

  if (id === 'dashModal_addStep1') {
    await interaction.deferReply({ ephemeral: true });
    const token = String(Date.now()).slice(-8);
    pendingCollabs[token] = {
      name:   interaction.fields.getTextInputValue('collab_name').trim(),
      desc:   interaction.fields.getTextInputValue('collab_desc').trim(),
      supply: interaction.fields.getTextInputValue('collab_supply').trim(),
      price:  interaction.fields.getTextInputValue('collab_price').trim(),
      date:   interaction.fields.getTextInputValue('collab_date').trim(),
    };

    return interaction.editReply({
      content: `✅ **Step 1 saved!** — **${pendingCollabs[token].name}**\nClick below to continue:`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dashBtn_step2_${token}`).setLabel('➡️ Step 2: Spots & Time').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dashBtn_cancel_${token}`).setLabel('✖ Cancel').setStyle(ButtonStyle.Secondary),
      )],
    });
  }

  if (id.startsWith('dashModal_addStep2_')) {
    await interaction.deferReply({ ephemeral: true });
    const token = id.replace('dashModal_addStep2_', '');
    if (!pendingCollabs[token]) return interaction.editReply('❌ Session expired.');

    const hours   = parseInt(interaction.fields.getTextInputValue('collab_hours').trim(), 10) || 0;
    const minutes = parseInt(interaction.fields.getTextInputValue('collab_minutes').trim() || '0', 10) || 0;
    if (hours === 0 && minutes === 0) return interaction.editReply('❌ Hours and minutes cannot both be 0.');

    const t1 = interaction.fields.getTextInputValue('spots_t1').trim();
    const t2 = interaction.fields.getTextInputValue('spots_t2').trim();
    const t3 = interaction.fields.getTextInputValue('spots_t3').trim();
    const spotsParts = [];
    if (t1) spotsParts.push(`T1: ${t1}`);
    if (t2) spotsParts.push(`T2: ${t2}`);
    if (t3) spotsParts.push(`T3: ${t3}`);

    pendingCollabs[token].spots   = spotsParts.length ? spotsParts.join(' | ') : 'TBA';
    pendingCollabs[token].hours   = hours;
    pendingCollabs[token].minutes = minutes;

    const timeText = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ');

    return interaction.editReply({
      content: `✅ **Step 2 saved!** — 🎟️ ${pendingCollabs[token].spots} | ⏰ ${timeText}\nClick below to continue:`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dashBtn_step3_${token}`).setLabel('➡️ Step 3: Requirements').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dashBtn_confirm_${token}`).setLabel('✅ Skip & Create Now').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`dashBtn_cancel_${token}`).setLabel('✖ Cancel').setStyle(ButtonStyle.Secondary),
      )],
    });
  }

  if (id.startsWith('dashModal_addStep3_')) {
    await interaction.deferReply({ ephemeral: true });
    const token = id.replace('dashModal_addStep3_', '');
    if (!pendingCollabs[token]) return interaction.editReply('❌ Session expired.');

    pendingCollabs[token].follow  = interaction.fields.getTextInputValue('req_follow').trim();
    pendingCollabs[token].like    = interaction.fields.getTextInputValue('req_like').trim();
    pendingCollabs[token].discord = interaction.fields.getTextInputValue('req_discord').trim();
    pendingCollabs[token].chain   = interaction.fields.getTextInputValue('req_chain').trim();
    pendingCollabs[token].note    = interaction.fields.getTextInputValue('req_note').trim();
    pendingCollabs[token].ready   = true;

    const d = pendingCollabs[token];
    const summary = [
      `📋 **${d.name}**`,
      `📦 ${d.supply} | 💰 ${d.price} | 🗓 ${d.date}`,
      `🎟️ ${d.spots} | ⛓️ ${d.chain || '—'}`,
      d.follow  ? `👤 Follow: set` : '',
      d.like    ? `❤️ Like & Repost: set` : '',
      d.discord ? `💬 Discord: set` : '',
      d.note    ? `📌 Note: ${d.note.slice(0, 60)}` : '',
    ].filter(Boolean).join('\n');

    return interaction.editReply({
      content: `✅ **All steps done! Ready to create:**\n\n${summary}\n\nClick to finish:`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dashBtn_confirm_${token}`).setLabel('🚀 Create Collab').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`dashBtn_cancel_${token}`).setLabel('✖ Cancel').setStyle(ButtonStyle.Secondary),
      )],
    });
  }

  // ══════════════════════════════════════════════════════════════
  // EDIT MODALS — each saves only its own fields
  // ══════════════════════════════════════════════════════════════

  // ── Edit Basic Info ────────────────────────────────────────────
  if (id.startsWith('dashModal_editBasic_')) {
    await interaction.deferReply({ ephemeral: true });
    const collabId = id.replace('dashModal_editBasic_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply('❌ Collab not found.');

    const name   = interaction.fields.getTextInputValue('edit_name').trim()   || collab.name;
    const desc   = interaction.fields.getTextInputValue('edit_desc').trim()   || collab.description;
    const supply = interaction.fields.getTextInputValue('edit_supply').trim() || collab.supply;
    const price  = interaction.fields.getTextInputValue('edit_price').trim()  || collab.price;
    const date   = interaction.fields.getTextInputValue('edit_date').trim()   || collab.date;

    db.prepare(`UPDATE collabs SET name=?, description=?, supply=?, price=?, date=? WHERE id=?`)
      .run(name, desc, supply, price, date, collabId);

    // Rename channel if name changed
    if (name !== collab.name && collab.channel_id) {
      const ch = await interaction.guild.channels.fetch(collab.channel_id).catch(() => null);
      if (ch) {
        const prefix  = collab.status === 'active' ? '🟢-' : '🔴-';
        const newSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        await ch.setName(`${prefix}${newSlug}`).catch(() => {});
      }
    }

    log(interaction.guild, `✏️ Basic info edited: **${name}** (ID: ${collabId})`);
    return interaction.editReply(`✅ Basic info updated for **${name}**!`);
  }

  // ── Edit Spots ─────────────────────────────────────────────────
  if (id.startsWith('dashModal_editSpots_')) {
    await interaction.deferReply({ ephemeral: true });
    const collabId = id.replace('dashModal_editSpots_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply('❌ Collab not found.');

    const t1 = interaction.fields.getTextInputValue('spots_t1').trim();
    const t2 = interaction.fields.getTextInputValue('spots_t2').trim();
    const t3 = interaction.fields.getTextInputValue('spots_t3').trim();

    const spotsParts = [];
    if (t1) spotsParts.push(`T1: ${t1}`);
    if (t2) spotsParts.push(`T2: ${t2}`);
    if (t3) spotsParts.push(`T3: ${t3}`);
    const newSpots = spotsParts.length ? spotsParts.join(' | ') : collab.spots;

    db.prepare(`UPDATE collabs SET spots=? WHERE id=?`).run(newSpots, collabId);
    log(interaction.guild, `✏️ Spots edited: **${collab.name}** → ${newSpots}`);
    return interaction.editReply(`✅ Spots updated for **${collab.name}**!\n🎟️ ${newSpots}`);
  }

  // ── Extend / Set Time ──────────────────────────────────────────
  if (id.startsWith('dashModal_editTime_')) {
    await interaction.deferReply({ ephemeral: true });
    const collabId = id.replace('dashModal_editTime_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply('❌ Collab not found.');

    const extendHours   = parseInt(interaction.fields.getTextInputValue('extend_hours').trim()   || '0', 10) || 0;
    const extendMinutes = parseInt(interaction.fields.getTextInputValue('extend_minutes').trim()  || '0', 10) || 0;
    const newDeadlineH  = parseInt(interaction.fields.getTextInputValue('new_deadline').trim()    || '0', 10) || 0;

    let newDeadline;

    if (newDeadlineH > 0) {
      // Set brand new deadline from NOW
      newDeadline = Date.now() + (newDeadlineH * 3600000);
    } else if (extendHours > 0 || extendMinutes > 0) {
      // Add time to existing deadline (or from now if no deadline)
      const base  = collab.deadline && collab.deadline > Date.now() ? collab.deadline : Date.now();
      newDeadline = base + (extendHours * 3600000) + (extendMinutes * 60000);
    } else {
      return interaction.editReply('❌ Please enter at least one value.');
    }

    db.prepare(`UPDATE collabs SET deadline=?, status='active' WHERE id=?`).run(newDeadline, collabId);

    const newUnix = Math.floor(newDeadline / 1000);
    log(interaction.guild, `⏰ Deadline updated: **${collab.name}** → <t:${newUnix}:F>`);
    return interaction.editReply(
      `✅ Deadline updated for **${collab.name}**!\n⏰ New deadline: <t:${newUnix}:F> (<t:${newUnix}:R>)\n\n` +
      `ℹ️ If the collab was closed, it has been set back to active in the database. To move the channel back to collabs-active, use the 🟢 Reactivate button.`
    );
  }

  // ── Edit Requirements ──────────────────────────────────────────
  if (id.startsWith('dashModal_editReqs_')) {
    await interaction.deferReply({ ephemeral: true });
    const collabId = id.replace('dashModal_editReqs_', '');
    const collab   = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
    if (!collab) return interaction.editReply('❌ Collab not found.');

    const follow  = interaction.fields.getTextInputValue('req_follow').trim();
    const like    = interaction.fields.getTextInputValue('req_like').trim();
    const discord = interaction.fields.getTextInputValue('req_discord').trim();
    const chain   = interaction.fields.getTextInputValue('req_chain').trim();
    const note    = interaction.fields.getTextInputValue('req_note').trim();

    const requirements = JSON.stringify({
      follow:      follow  || null,
      like_repost: like    || null,
      discord:     discord || null,
      chain:       chain   || null,
      note:        note    || null,
    });

    db.prepare(`UPDATE collabs SET requirements=?, note=? WHERE id=?`).run(requirements, note || collab.note, collabId);
    log(interaction.guild, `✏️ Requirements edited: **${collab.name}** (ID: ${collabId})`);
    return interaction.editReply(`✅ Requirements updated for **${collab.name}**!`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// REACTIVATE COLLAB
// ═══════════════════════════════════════════════════════════════════
async function reactivateCollab(interaction, collabId) {
  const collab = db.prepare(`SELECT * FROM collabs WHERE id=?`).get(collabId);
  if (!collab) return interaction.editReply('❌ Collab not found.');
  if (collab.status === 'active') return interaction.editReply('ℹ️ This collab is already active.');

  const guild = interaction.guild;

  let activeCat = guild.channels.cache.find(c => c.name === 'collabs-active' && c.type === ChannelType.GuildCategory);
  if (!activeCat) activeCat = await guild.channels.create({ name: 'collabs-active', type: ChannelType.GuildCategory });

  if (collab.channel_id) {
    const ch = await guild.channels.fetch(collab.channel_id).catch(() => null);
    if (ch) {
      let newName = ch.name.replace(/^🔴-/, '');
      if (!newName.startsWith('🟢-')) newName = `🟢-${newName}`;
      await ch.setName(newName).catch(() => {});
      await ch.setParent(activeCat.id).catch(() => {});
      // Unlock channel for everyone
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
    }
  }

  db.prepare(`UPDATE collabs SET status='active' WHERE id=?`).run(collabId);
  log(guild, `🟢 Collab Reactivated: **${collab.name}** (ID: ${collabId})`);

  return interaction.editReply(
    `✅ **${collab.name}** reactivated!\n` +
    `The channel has been moved back to collabs-active.\n` +
    `⚠️ Make sure to also extend the deadline using ✏️ Edit Collab → ⏰ Extend Time.`
  );
}

// ═══════════════════════════════════════════════════════════════════
// CREATE COLLAB
// ═══════════════════════════════════════════════════════════════════
async function createCollab(interaction, data, token) {
  try {
    delete pendingCollabs[token];

    const requirements = JSON.stringify({
      follow:      data.follow  || null,
      like_repost: data.like    || null,
      discord:     data.discord || null,
      chain:       data.chain   || null,
      note:        data.note    || null,
    });

    const deadline     = Date.now() + ((data.hours || 0) * 3600000) + ((data.minutes || 0) * 60000);
    const deadlineUnix = Math.floor(deadline / 1000);
    const relativeTime = `<t:${deadlineUnix}:R>`;

    const guild = interaction.guild;
    let activeCat = guild.channels.cache.find(c => c.name === 'collabs-active' && c.type === ChannelType.GuildCategory);
    if (!activeCat) activeCat = await guild.channels.create({ name: 'collabs-active', type: ChannelType.GuildCategory });

    const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

    const channel = await guild.channels.create({
      name: `🟢-${slug}`,
      type: ChannelType.GuildText,
      parent: activeCat.id,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.SendMessages] }],
    });

    const result = db.prepare(
      `INSERT INTO collabs (name, description, supply, date, price, spots, requirements, note, image, deadline, channel_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.name, data.desc, data.supply, data.date, data.price, data.spots || 'TBA', requirements, data.note || '—', null, deadline, channel.id, 'active');

    const collabId = result.lastInsertRowid;

    const reqLines = [];
    if (data.follow)  reqLines.push(`👤 **Follow:**\n${data.follow}`);
    if (data.like)    reqLines.push(`❤️ **Like & Repost:** ${data.like}`);
    if (data.discord) reqLines.push(`💬 **Join Discord:** ${data.discord}`);
    if (data.chain)   reqLines.push(`⛓️ **Chain:** ${data.chain}`);

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`contest_${collabId}`).setLabel('🟢 Submit Contest Link').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wallet_${collabId}`).setLabel('📄 Submit Wallet Sheet').setStyle(ButtonStyle.Primary),
    );

    const embed = new EmbedBuilder()
      .setTitle(`🔥 ${data.name}`)
      .setDescription(data.desc)
      .addFields(
        { name: '⏳ Ends',         value: relativeTime,                  inline: true  },
        { name: '📦 Supply',       value: data.supply,                   inline: true  },
        { name: '💰 Price',        value: data.price,                    inline: true  },
        { name: '🗓 Date',         value: data.date,                     inline: true  },
        { name: '⛓️ Chain',        value: data.chain       || '—',       inline: true  },
        { name: '🎟️ Spots',        value: data.spots       || 'TBA',     inline: false },
        { name: '✅ Requirements', value: reqLines.join('\n') || '—',    inline: false },
      )
      .setTimestamp();

    if (data.note) embed.addFields({ name: '📌 Note', value: data.note, inline: false });

    await channel.send({ content: 'Use the buttons below to submit:', embeds: [embed], components: [btnRow] });

    const ann = guild.channels.cache.find(c => c.name === 'collabs-announcements');
    if (ann) await ann.send({ content: `📢 New Collab: **${data.name}** → ${channel}\n⏳ Ends ${relativeTime}`, embeds: [embed] });

    log(guild, `🟢 Collab Created: **${data.name}** | Channel: ${channel} | Ends ${relativeTime}`);

    await interaction.editReply(`✅ **${data.name}** created! → ${channel}\n🎟️ ${data.spots || 'TBA'} | ⛓️ ${data.chain || '—'}`);

  } catch (err) {
    console.error('[createCollab] Error:', err);
    await interaction.editReply(`❌ Error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// COLLAB LIST
// ═══════════════════════════════════════════════════════════════════
async function sendCollabList(interaction, filter, page, isUpdate = false) {
  await (isUpdate ? interaction.deferUpdate() : interaction.deferReply({ ephemeral: true }));

  const rows = filter === 'active'
    ? db.prepare(`SELECT * FROM collabs WHERE status='active' ORDER BY id DESC`).all()
    : db.prepare(`SELECT * FROM collabs WHERE status='closed' ORDER BY id DESC`).all();

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const label    = filter === 'active' ? '🟢 Active' : '🔴 Closed';

  const embed = new EmbedBuilder()
    .setTitle(`${label} Collabs`)
    .setColor(filter === 'active' ? 0x57F287 : 0xED4245)
    .setFooter({ text: `Page ${page + 1} of ${totalPages}  •  ${rows.length} total` })
    .setTimestamp();

  if (pageRows.length === 0) {
    embed.setDescription('No collabs found.');
  } else {
    for (const c of pageRows) {
      let chain = '';
      try { chain = JSON.parse(c.requirements)?.chain || ''; } catch (e) {}
      const dl = c.deadline ? `⏰ <t:${Math.floor(c.deadline / 1000)}:R>` : '⏰ No deadline';
      embed.addFields({
        name: `${filter === 'active' ? '🟢' : '🔴'} ${c.name}`,
        value: [dl, `🎟️ ${c.spots || 'N/A'}`, chain ? `⛓️ ${chain}` : '', `ID: \`${c.id}\``].filter(Boolean).join('  •  '),
        inline: false,
      });
    }
  }

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dashlist_prev_${filter}_${page}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`dashlist_next_${filter}_${page}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

  return interaction.editReply({ embeds: [embed], components: [navRow] });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function inp(customId, label, style, required, placeholder) {
  const t = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(!!required);
  if (placeholder) t.setPlaceholder(placeholder);
  return t;
}

function row(component) {
  return new ActionRowBuilder().addComponents(component);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function log(guild, message) {
  try {
    const logs = guild.channels.cache.find(c => c.name === 'logs');
    if (logs) await logs.send(message);
  } catch (e) { /* ignore log errors */ }
}

module.exports = { handleDashboard, handleDashboardSelect, handleDashboardModal };
