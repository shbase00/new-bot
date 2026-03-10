const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

const db = require('../db');
const fs = require('fs');

// ====== Communities ======
const TIERS = {
  T1: ['TropadaDrih','CelestialLab','ZaxWeb3','wazoogangg','Nasbelaeth','BlobaETH','word4zz_','AlphaEmpire','honeyratdao','imperial_alpha_','DreamersWeb3'],
  T2: ['casperllz','Mintopia_alpha','MummiesNeverDie','JOKER__NFTs','AK_MIINT','Worldnft','TwinkleNFTs','Basedking','alphanft_7','QuantumMint','AK_ALPHAA','CryptoArias','Soren','squapesonape','lil_lumi','nft_whale17','NFTS50_nfts','SloppyApeYC','Web3_lab_x','orbex','ThunderAlpha','VoofiOfficial','PerrysOnApe'],
  T3: ['metagems_nft','MythicMintDAO','MintropolisDAO','Iion_Mint','bazuka_Outlaws','MintFlowAlpha','Ace','Arya_00'],
};

// =====================================================
async function handleButton(interaction) {

// =====================================================
// EXPORT CSV
// =====================================================
if (interaction.isButton() && interaction.customId === 'export_csv') {

  const rows = db.prepare('SELECT id, name FROM collabs ORDER BY id DESC').all();

  if (!rows.length) {
    return interaction.reply({ content:'No collabs.', ephemeral:true });
  }

  const page = 0;
  const pageSize = 25;
  const maxPage = Math.floor((rows.length - 1) / pageSize);

  const pageItems = rows.slice(page * pageSize, (page + 1) * pageSize);

  const select = new StringSelectMenuBuilder()
  .setCustomId(`select_export_page_${page}`)
  .setPlaceholder('Choose a collab')
  .addOptions(
    pageItems.map(r => ({
      label: r.name,
      value: String(r.id)
    }))
  );

  const row1 = new ActionRowBuilder().addComponents(select);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`export_prev_${page}`)
      .setLabel('⬅ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId(`export_next_${page}`)
      .setLabel('Next ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(maxPage === 0)
  );

  return interaction.reply({
    content:'Choose collab to export:',
    components:[row1,row2],
    ephemeral:true
  });
}

// =====================================================
// PAGINATION
// =====================================================
if (interaction.isButton() && (interaction.customId.startsWith('export_next_') || interaction.customId.startsWith('export_prev_'))) {

  const rows = db.prepare('SELECT id, name FROM collabs ORDER BY id DESC').all();
  const pageSize = 25;

  let page = parseInt(interaction.customId.split('_').pop(),10);

  if (interaction.customId.startsWith('export_next_')) page++;
  else page--;

  if (page < 0) page = 0;

  const maxPage = Math.floor((rows.length - 1) / pageSize);
  if (page > maxPage) page = maxPage;

  const pageItems = rows.slice(page * pageSize, (page + 1) * pageSize);

  const select = new StringSelectMenuBuilder()
  .setCustomId(`select_export_page_${page}`)
  .setPlaceholder('Choose a collab')
  .addOptions(
    pageItems.map(r => ({
      label: r.name,
      value: String(r.id)
    }))
  );

  const row1 = new ActionRowBuilder().addComponents(select);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`export_prev_${page}`)
      .setLabel('⬅ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),

    new ButtonBuilder()
      .setCustomId(`export_next_${page}`)
      .setLabel('Next ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage)
  );

  return interaction.update({
    content:'Choose collab to export:',
    components:[row1,row2]
  });
}

// =====================================================
// EXPORT SELECT
// =====================================================
if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_export_page_')) {

  const collabId = interaction.values[0];

  const data = db.prepare(
    'SELECT * FROM submissions WHERE collab_id = ?'
  ).all(collabId);

  let csv = 'sheet_link,raffle_links,username,community\n';

  for (const r of data) {
    csv += `"${r.sheet_link || ''}","${r.contest_link || ''}","${r.username || ''}","${r.community || ''}"\n`;
  }

  const filePath = `export_${collabId}.csv`;

  fs.writeFileSync(filePath,csv);

  await interaction.reply({
    content:'Here is your CSV:',
    files:[new AttachmentBuilder(filePath)],
    ephemeral:true
  });

  fs.unlinkSync(filePath);

  return;
}

// =====================================================
// CLOSE COLLAB
// =====================================================
if (interaction.isStringSelectMenu() && interaction.customId === 'close_select') {

  const collabId = interaction.values[0];
  const collab = db.prepare('SELECT * FROM collabs WHERE id = ?').get(collabId);

  if (!collab || collab.status === 'closed') {
    return interaction.update({
      content:'❌ Collab not found or already closed.',
      components:[]
    });
  }

  const guild = interaction.guild;

  let closedCat = guild.channels.cache.find(
    c => c.name === 'collabs-closed' && c.type === ChannelType.GuildCategory
  );

  if (!closedCat) {
    closedCat = await guild.channels.create({
      name:'collabs-closed',
      type:ChannelType.GuildCategory
    });
  }

  let ch = null;

  if (collab.channel_id) {
    ch = await guild.channels.fetch(collab.channel_id).catch(()=>null);
  }

  if (ch) {

    let newName = ch.name.replace(/^🟢-/,'');
    if (!newName.startsWith('🔴-')) newName = `🔴-${newName}`;

    await ch.setName(newName).catch(()=>{});
    await ch.setParent(closedCat.id).catch(()=>{});
    await ch.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages:false }
    ).catch(()=>{});
  }

  db.prepare(
    'UPDATE collabs SET status = ? WHERE id = ?'
  ).run('closed',collabId);

  const logs = guild.channels.cache.find(c => c.name === 'logs');

  if (logs) {

    const contestCount = db.prepare(
      "SELECT COUNT(*) as n FROM submissions WHERE collab_id = ? AND contest_link IS NOT NULL AND contest_link != ''"
    ).get(collabId).n;

    const walletCount = db.prepare(
      "SELECT COUNT(*) as n FROM submissions WHERE collab_id = ? AND sheet_link IS NOT NULL AND sheet_link != ''"
    ).get(collabId).n;

    await logs.send(
      `🔴 Collab Closed: **${collab.name}**\n` +
      `📝 Contest submissions: **${contestCount}**\n` +
      `💼 Wallet sheets: **${walletCount}**`
    );
  }

  return interaction.update({
    content:`✅ Closed **${collab.name}** successfully.`,
    components:[]
  });
}

// =====================================================
// SUBMIT BUTTONS
// =====================================================
if (interaction.isButton()) {

  const [type,collabId] = interaction.customId.split('_');

  const collab = db.prepare(
    'SELECT * FROM collabs WHERE id = ?'
  ).get(collabId);

  if (!collab || collab.status !== 'active' || Date.now() > collab.deadline) {
    return interaction.reply({
      content:'❌ This collab is closed.',
      ephemeral:true
    });
  }

// ===== Contest
if (type === 'contest') {

  const tierSelect = new StringSelectMenuBuilder()
  .setCustomId(`chooseTier_${collabId}`)
  .setPlaceholder('Choose Tier')
  .addOptions(
    {label:'T1',value:'T1'},
    {label:'T2',value:'T2'},
    {label:'T3',value:'T3'}
  );

  return interaction.reply({
    content:'Choose your Tier:',
    components:[new ActionRowBuilder().addComponents(tierSelect)],
    ephemeral:true
  });
}

// ===== Wallet
if (type === 'wallet') {

  const rows = db.prepare(
    `SELECT id, community FROM submissions
     WHERE collab_id = ? AND user_id = ? AND sheet_link IS NULL`
  ).all(collabId,interaction.user.id);

  if (!rows.length) {
    return interaction.reply({
      content:'❌ You have no pending contest to attach a wallet to.',
      ephemeral:true
    });
  }

  if (rows.length === 1) {

    const rowId = rows[0].id;

    const modal = new ModalBuilder()
    .setCustomId(`walletModal_${rowId}`)
    .setTitle('Submit Wallet Sheet');

    const sheetInput = new TextInputBuilder()
    .setCustomId('sheet_link')
    .setLabel('Wallet Sheet Link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(sheetInput)
    );

    return interaction.showModal(modal);
  }

  const select = new StringSelectMenuBuilder()
  .setCustomId('chooseWalletRow')
  .setPlaceholder('Choose community to attach wallet')
  .addOptions(
    rows.map(r => ({
      label:r.community,
      value:String(r.id)
    }))
  );

  return interaction.reply({
    content:'Choose which community this wallet belongs to:',
    components:[new ActionRowBuilder().addComponents(select)],
    ephemeral:true
  });

}
}

// =====================================================
// CHOOSE TIER
// =====================================================
if (interaction.isStringSelectMenu() && interaction.customId.startsWith('chooseTier_')) {

  const collabId2 = interaction.customId.split('_')[1];
  const tier = interaction.values[0];

  const communities = TIERS[tier] || [];

  if (!communities.length) {
    return interaction.update({
      content:'❌ No communities for this tier.',
      components:[]
    });
  }

  const communitySelect = new StringSelectMenuBuilder()
  .setCustomId(`chooseCommunity_${collabId2}_${tier}`)
  .setPlaceholder('Choose Community')
  .addOptions(
    communities.map(c => ({
      label:c,
      value:c
    }))
  );

  return interaction.update({
    content:`Choose community for **${tier}**:`,
    components:[new ActionRowBuilder().addComponents(communitySelect)]
  });
}

// =====================================================
// COMMUNITY CHOSEN
// =====================================================
if (interaction.isStringSelectMenu() && interaction.customId.startsWith('chooseCommunity_')) {

  const parts = interaction.customId.split('_');

  const collabId3 = parts[1];
  const tier = parts[2];
  const community = interaction.values[0];

  const modal = new ModalBuilder()
  .setCustomId(`contestModal_${collabId3}_${tier}_${encodeURIComponent(community)}`)
  .setTitle('Submit Raffle / Contest Links');

  const contestInput = new TextInputBuilder()
  .setCustomId('contest_link')
  .setLabel('Raffle / Contest Links (you can add multiple)')
  .setStyle(TextInputStyle.Paragraph)
  .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(contestInput)
  );

  return interaction.showModal(modal);
}

// =====================================================
// WALLET SELECT
// =====================================================
if (interaction.isStringSelectMenu() && interaction.customId === 'chooseWalletRow') {

  const rowId = interaction.values[0];

  const modal = new ModalBuilder()
  .setCustomId(`walletModal_${rowId}`)
  .setTitle('Submit Wallet Sheet');

  const sheetInput = new TextInputBuilder()
  .setCustomId('sheet_link')
  .setLabel('Wallet Sheet Link')
  .setStyle(TextInputStyle.Short)
  .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(sheetInput)
  );

  return interaction.showModal(modal);
}

}

module.exports = { handleButton };