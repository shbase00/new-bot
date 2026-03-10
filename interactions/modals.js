const db = require('../db');

async function handleModal(interaction) {

await interaction.deferReply({ ephemeral: true });

const parts = interaction.customId.split('_');

// ===== contestModal_<collabId>_<tier>_<community> =====
if (parts[0] === 'contestModal') {

const collabId = parts[1];
const tier = parts[2];
const community = decodeURIComponent(parts.slice(3).join('_'));

let contestLinksRaw = interaction.fields.getTextInputValue('contest_link');

// clean links
const contestLink = contestLinksRaw
.split(/\r?\n/)
.map(l => l.trim())
.filter(l => l.length > 0)
.join(' | ');

db.prepare(
`INSERT INTO submissions
(collab_id, user_id, username, tier, community, contest_link, contest_time)
VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(
collabId,
interaction.user.id,
interaction.user.username,
tier,
community,
contestLink,
Date.now()
);

return interaction.editReply({
content:`✅ Raffle / Contest links submitted for **${community}**`
});

}

// ===== walletModal_<rowId> =====
if (parts[0] === 'walletModal') {

const rowId = parts[1];

const sheetLink = interaction
.fields
.getTextInputValue('sheet_link')
.trim();

db.prepare(
`UPDATE submissions
SET sheet_link = ?, sheet_time = ?
WHERE id = ?`
).run(
sheetLink,
Date.now(),
rowId
);

return interaction.editReply({
content:'✅ Wallet sheet added successfully!'
});

}

}

module.exports = { handleModal };
