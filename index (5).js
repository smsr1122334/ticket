const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");

const fs   = require("fs");
const path = require("path");

// ─── Config (Railway env vars) ─────────────────────────────────────────────────
const config = {
  token:            process.env.TOKEN,
  supportRoleId:    process.env.SUPPORT_ROLE_ID,
  categoryId:       process.env.CATEGORY_ID || null,
  panelChannelId:   process.env.PANEL_CHANNEL_ID,
  archiveChannelId: process.env.ARCHIVE_CHANNEL_ID,
};

// ─── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Storage ───────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "tickets.json");

function load() {
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ counter: 0, tickets: {} }));
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function save(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function nextNumber() { const d = load(); d.counter++; save(d); return d.counter; }
function setTicket(id, info) { const d = load(); d.tickets[id] = info; save(d); }
function getTicket(id) { return load().tickets[id] || null; }
function removeTicket(id) { const d = load(); delete d.tickets[id]; save(d); }

// ─── HTML Transcript Builder ───────────────────────────────────────────────────
async function buildTranscript(channel, info, guild) {
  const all = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before && { before }) });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();

  const rows = all
    .filter((m) => m.content || m.embeds.length || m.attachments.size)
    .map((m) => {
      const time = new Date(m.createdTimestamp).toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const avatar = `<img class="av" src="${m.author.displayAvatarURL({ size: 64 })}" onerror="this.style.display='none'"/>`;
      const embeds = m.embeds.map((e) =>
        `<div class="emb">${e.title ? `<b>${e.title}</b><br>` : ""}${e.description ? e.description.replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""}</div>`
      ).join("");
      const attachments = [...m.attachments.values()].map((a) =>
        a.contentType?.startsWith("image/")
          ? `<img class="att-img" src="${a.url}" />`
          : `<a class="att-link" href="${a.url}" target="_blank">📎 ${a.name}</a>`
      ).join("");
      return `<div class="msg${m.author.bot ? " bot" : ""}">
        ${avatar}
        <div class="body">
          <div class="top">
            <span class="name">${m.author.username}</span>
            ${m.author.bot ? `<span class="btag">BOT</span>` : ""}
            <span class="ts">${time}</span>
          </div>
          ${m.content ? `<div class="txt">${m.content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>` : ""}
          ${embeds}
          ${attachments}
        </div>
      </div>`;
    }).join("");

  const openedAt = new Date(info.createdAt).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const closedAt = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const duration = Math.round((Date.now() - info.createdAt) / 60000);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ticket #${info.ticketNumber} — ${guild.name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#1a1b2e;color:#c9d1d9;padding:24px;min-height:100vh}
.header{background:linear-gradient(135deg,#1e3a5f 0%,#0f2744 50%,#1a1b2e 100%);border:1px solid #30363d;border-radius:16px;padding:28px 32px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px}
.header-left h1{color:#fff;font-size:22px;font-weight:700;margin-bottom:4px}
.header-left p{color:rgba(255,255,255,.55);font-size:13px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:280px}
.meta-item{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 14px}
.meta-item .label{color:#8b949e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.meta-item .val{color:#e6edf3;font-size:13px;font-weight:500}
.msgs{display:flex;flex-direction:column;gap:10px}
.msg{background:#0d1117;border:1px solid #21262d;border-radius:12px;padding:14px 16px;display:flex;gap:12px;transition:border-color .2s}
.msg:hover{border-color:#30363d}
.msg.bot{background:#161b22;border-color:#388bfd22}
.av{width:38px;height:38px;border-radius:50%;flex-shrink:0;object-fit:cover;background:#21262d}
.body{flex:1;min-width:0}
.top{display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
.name{font-weight:600;color:#58a6ff;font-size:14px}
.btag{background:#388bfd;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600}
.ts{color:#6e7681;font-size:12px;margin-left:auto}
.txt{font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word;color:#c9d1d9}
.emb{border-left:4px solid #388bfd;background:#0d1117;border-radius:0 6px 6px 0;padding:10px 14px;margin-top:8px;font-size:13px;line-height:1.5}
.att-img{max-width:320px;max-height:240px;border-radius:8px;margin-top:8px;display:block}
.att-link{display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:6px 12px;color:#58a6ff;font-size:13px;text-decoration:none}
.att-link:hover{background:#30363d}
.footer{text-align:center;color:#484f58;font-size:12px;margin-top:28px;padding-top:16px;border-top:1px solid #21262d}
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h1>🎫 Ticket #${info.ticketNumber}</h1>
    <p>${guild.name} — Ticket Transcript</p>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="label">Opened By</div><div class="val">${info.username}</div></div>
    <div class="meta-item"><div class="label">Ticket #</div><div class="val">#${info.ticketNumber}</div></div>
    <div class="meta-item"><div class="label">Opened At</div><div class="val">${openedAt}</div></div>
    <div class="meta-item"><div class="label">Closed At</div><div class="val">${closedAt}</div></div>
    <div class="meta-item"><div class="label">Duration</div><div class="val">${duration} min</div></div>
    ${info.claimedBy ? `<div class="meta-item"><div class="label">Claimed By</div><div class="val"><@${info.claimedBy}></div></div>` : ""}
  </div>
</div>
<div class="msgs">${rows || "<p style='color:#6e7681;text-align:center;padding:40px'>No messages found.</p>"}</div>
<div class="footer">Generated automatically by the Ticket System</div>
</body>
</html>`;
}

// ─── isSupport helper ──────────────────────────────────────────────────────────
function isSupport(member) {
  return (
    member.roles.cache.has(config.supportRoleId) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// ─── Archive helper ────────────────────────────────────────────────────────────
async function sendToArchive(htmlContent, info, member, guild, label) {
  if (!config.archiveChannelId) return;
  try {
    const archiveCh = await client.channels.fetch(config.archiveChannelId);
    const buf = Buffer.from(htmlContent, "utf8");
    const file = new AttachmentBuilder(buf, { name: `ticket-${info.ticketNumber}.html` });

    const embed = new EmbedBuilder()
      .setTitle(`${label} — Ticket #${info.ticketNumber}`)
      .setDescription(
        `**Opened by:** <@${info.userId}> (${info.username})\n` +
        `**Action by:** ${member}\n` +
        `**Duration:** ${Math.round((Date.now() - info.createdAt) / 60000)} min\n` +
        `**Channel:** ${info.channelName || "—"}`
      )
      .setColor(label.includes("Closed") ? 0xed4245 : 0xfee75c)
      .setTimestamp();

    await archiveCh.send({ embeds: [embed], files: [file] });
  } catch (e) {
    console.log("[Archive Error]", e.message);
  }
}

// ─── Panel ─────────────────────────────────────────────────────────────────────
async function sendPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 Support Tickets")
    .setDescription("Need help? Click the button below to open a ticket.\nOur support team will assist you as soon as possible.")
    .setColor(0x5865f2)
    .setFooter({ text: "Support System" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("Open a Ticket")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Online: ${client.user.tag}`);

  if (config.panelChannelId) {
    try {
      const ch = await client.channels.fetch(config.panelChannelId);
      const msgs = await ch.messages.fetch({ limit: 10 });
      const hasPanel = msgs.some((m) => m.author.id === client.user.id && m.components.length);
      if (!hasPanel) await sendPanel(ch);
    } catch (e) {
      console.log("[Panel Error]", e.message);
    }
  }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, channel, guild } = interaction;

  // ── Open Ticket ───────────────────────────────────────────────────────────────
  if (customId === "open_ticket") {
    await interaction.deferReply({ ephemeral: true });

    const d = load();
    const existing = Object.values(d.tickets).find(
      (t) => t.userId === member.id && t.guildId === guild.id && !t.closed
    );
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      return interaction.editReply({
        content: `❌ You already have an open ticket: ${ch ? ch : `ticket-${existing.ticketNumber}`}`,
      });
    }

    const num = nextNumber();
    const category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;

    const tc = await guild.channels.create({
      name: `ticket-${num}`,
      type: ChannelType.GuildText,
      parent: category || null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: config.supportRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    setTicket(tc.id, {
      channelId: tc.id,
      channelName: tc.name,
      userId: member.id,
      username: member.user.username,
      ticketNumber: num,
      guildId: guild.id,
      createdAt: Date.now(),
      claimed: false,
      claimedBy: null,
      locked: false,
      closed: false,
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${num}`)
      .setDescription(
        `Welcome ${member}!\n\nYour ticket has been created. A support member will be with you shortly.\n\nPlease describe your issue in detail.`
      )
      .setColor(0x57f287)
      .addFields(
        { name: "👤 Opened By", value: `${member}`, inline: true },
        { name: "🔢 Ticket", value: `#${num}`, inline: true },
        { name: "📅 Opened", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    // Only Claim + Lock buttons initially — Close only appears after locking
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Claim")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lock_ticket")
        .setLabel("Lock Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Primary)
    );

    await tc.send({
      content: `${member} | <@&${config.supportRoleId}>`,
      embeds: [embed],
      components: [row],
    });

    await interaction.editReply({ content: `✅ Your ticket has been opened: ${tc}` });
  }

  // ── Claim Ticket ──────────────────────────────────────────────────────────────
  if (customId === "claim_ticket") {
    // ONLY support role — no one else
    if (!isSupport(member))
      return interaction.reply({
        content: "❌ Only support team members can claim tickets.",
        ephemeral: true,
      });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });

    if (info.claimed)
      return interaction.reply({
        content: `❌ This ticket is already claimed by <@${info.claimedBy}>.`,
        ephemeral: true,
      });

    info.claimed   = true;
    info.claimedBy = member.id;
    setTicket(channel.id, info);

    // Rename: 🟡-(username)-(ticketNumber)
    await channel.setName(`🟡-${member.user.username}-${info.ticketNumber}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`🟡 Ticket claimed by ${member}`)
          .setColor(0xfee75c),
      ],
    });
  }

  // ── Lock Ticket ───────────────────────────────────────────────────────────────
  if (customId === "lock_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ Only support team members can lock tickets.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });
    if (info.locked) return interaction.reply({ content: "❌ This ticket is already locked.", ephemeral: true });

    // Confirmation prompt
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_lock")
        .setLabel("Yes, Lock It")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_lock")
        .setLabel("Cancel")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Confirm Lock")
          .setDescription(
            "Are you sure you want to **lock** this ticket?\n\n" +
            "• The ticket opener will **lose access** to the channel\n" +
            "• A transcript will be saved to the archive\n" +
            "• A **Close** button will appear after locking"
          )
          .setColor(0xfee75c),
      ],
      components: [confirmRow],
      ephemeral: true,
    });
  }

  // ── Confirm Lock ──────────────────────────────────────────────────────────────
  if (customId === "confirm_lock") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ Not authorised.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });

    await interaction.deferUpdate();

    // Remove ALL access from the ticket opener
    await channel.permissionOverwrites.edit(info.userId, {
      ViewChannel:      false,
      SendMessages:     false,
      ReadMessageHistory: false,
    }).catch(() => {});

    info.locked = true;
    info.channelName = channel.name;
    setTicket(channel.id, info);

    // Build transcript and send to archive
    const html = await buildTranscript(channel, info, guild);
    await sendToArchive(html, info, member, guild, "🔒 Locked");

    // Update channel controls — now shows Unlock + Close
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Claim")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(info.claimed),
      new ButtonBuilder()
        .setCustomId("unlock_ticket")
        .setLabel("Unlock")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close Ticket")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 Ticket Locked")
          .setDescription(
            `This ticket has been locked by ${member}.\n\n` +
            `• <@${info.userId}> no longer has access\n` +
            `• A transcript has been saved to the archive\n` +
            `• Use **Close Ticket** to permanently close`
          )
          .setColor(0xed4245)
          .setTimestamp(),
      ],
      components: [row],
    });
  }

  // ── Cancel Lock ───────────────────────────────────────────────────────────────
  if (customId === "cancel_lock") {
    await interaction.update({
      embeds: [
        new EmbedBuilder().setDescription("✅ Lock cancelled.").setColor(0x57f287),
      ],
      components: [],
    });
  }

  // ── Unlock Ticket ─────────────────────────────────────────────────────────────
  if (customId === "unlock_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ Only support team members can unlock tickets.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return;

    // Restore opener access
    await channel.permissionOverwrites.edit(info.userId, {
      ViewChannel:        true,
      SendMessages:       true,
      ReadMessageHistory: true,
      AttachFiles:        true,
    }).catch(() => {});

    info.locked = false;
    setTicket(channel.id, info);

    // Revert to standard controls (no Close button)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Claim")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(info.claimed),
      new ButtonBuilder()
        .setCustomId("lock_ticket")
        .setLabel("Lock Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`🔓 Ticket unlocked by ${member}. The opener has been given access back.`)
          .setColor(0x57f287),
      ],
      components: [row],
    });
  }

  // ── Close Ticket ──────────────────────────────────────────────────────────────
  if (customId === "close_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ Only support team members can close tickets.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true });

    // Must be locked first
    if (!info.locked)
      return interaction.reply({
        content: "❌ You must **lock** the ticket before closing it. Use the 🔒 Lock button first.",
        ephemeral: true,
      });

    await interaction.deferReply();

    info.channelName = channel.name;
    const html = await buildTranscript(channel, info, guild);
    const buf  = Buffer.from(html, "utf8");

    // DM the transcript to the ticket opener
    try {
      const opener = await client.users.fetch(info.userId);
      const file   = new AttachmentBuilder(buf, { name: `ticket-${info.ticketNumber}.html` });

      await opener.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋 Your Ticket #${info.ticketNumber} — Transcript`)
            .setDescription(
              `Your ticket in **${guild.name}** has been closed.\n` +
              `The full conversation transcript is attached below.\n\n` +
              `Open the HTML file in any browser to view it.`
            )
            .setColor(0x5865f2)
            .addFields(
              { name: "🏠 Server", value: guild.name, inline: true },
              { name: "👮 Closed By", value: member.user.username, inline: true },
              { name: "📅 Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
              { name: "⏱️ Duration", value: `${Math.round((Date.now() - info.createdAt) / 60000)} minutes`, inline: true }
            )
            .setTimestamp(),
        ],
        files: [file],
      });
    } catch {
      console.log("[DM] User has DMs disabled — skipping.");
    }

    // Save final transcript to archive
    await sendToArchive(html, info, member, guild, "📁 Closed");

    // Cleanup
    info.closed = true;
    removeTicket(channel.id);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription("✅ Transcript sent. This channel will be deleted in **5 seconds**.")
          .setColor(0xed4245),
      ],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(config.token);
