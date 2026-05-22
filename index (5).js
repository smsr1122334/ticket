const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");

const fs   = require("fs");
const path = require("path");

// ─── Config ────────────────────────────────────────────────────────────────────
const TOKEN              = process.env.TOKEN;
const SUPPORT_ROLE_ID    = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID        = process.env.CATEGORY_ID   || null;
const PANEL_CHANNEL_ID   = process.env.PANEL_CHANNEL_ID;
const ARCHIVE_CHANNEL_ID = process.env.ARCHIVE_CHANNEL_ID;

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
function loadData() {
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ counter: 0, tickets: {} }));
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function saveData(d)          { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function nextNum()            { const d = loadData(); d.counter++; saveData(d); return d.counter; }
function saveTicket(id, info) { const d = loadData(); d.tickets[id] = info; saveData(d); }
function getTicket(id)        { return loadData().tickets[id] || null; }
function delTicket(id)        { const d = loadData(); delete d.tickets[id]; saveData(d); }

// ─── Role check — فريق الدعم فقط ──────────────────────────────────────────────
async function isSupport(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m.roles.cache.some(r => String(r.id) === String(SUPPORT_ROLE_ID).trim());
  } catch { return false; }
}

// ─── Build HTML transcript ─────────────────────────────────────────────────────
async function buildTranscript(channel, ticket, guild) {
  const msgs = [];
  let lastId;
  while (true) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;
    msgs.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  msgs.reverse();

  const msgCount  = msgs.filter(m => !m.author.bot).length;
  const attCount  = msgs.reduce((n, m) => n + m.attachments.size, 0);
  const usernames = [...new Set(msgs.map(m => m.author.username))];

  const rows = msgs
    .filter(m => m.content || m.embeds.length || m.attachments.size)
    .map(m => {
      const t    = new Date(m.createdTimestamp).toLocaleString("ar-SA");
      const av   = `<img class="av" src="${m.author.displayAvatarURL({ size: 64 })}" onerror="this.style.display='none'">`;
      const embs = m.embeds.map(e =>
        `<div class="emb">${e.title?`<b>${e.title}</b><br>`:""}${(e.description||"").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`
      ).join("");
      const atts = [...m.attachments.values()].map(a =>
        a.contentType?.startsWith("image/")
          ? `<img class="att-img" src="${a.url}">`
          : `<a class="att-link" href="${a.url}" target="_blank">📎 ${a.name}</a>`
      ).join("");
      return `<div class="msg${m.author.bot?" bot":""}">
  ${av}
  <div class="body">
    <div class="top"><span class="name">${m.author.username}</span>${m.author.bot?`<span class="btag">BOT</span>`:""}<span class="ts">${t}</span></div>
    ${m.content?`<div class="txt">${m.content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`:""}${embs}${atts}
  </div>
</div>`;
    }).join("\n");

  const openedAt = new Date(ticket.createdAt).toLocaleString("ar-SA");
  const closedAt = new Date().toLocaleString("ar-SA");
  const duration = Math.round((Date.now() - ticket.createdAt) / 60000);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تيكت #${ticket.ticketNumber} — ${guild.name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#1a1b2e;color:#c9d1d9;padding:24px}
.hdr{background:linear-gradient(135deg,#1e3a5f,#0f2744);border:1px solid #30363d;border-radius:14px;padding:24px 28px;margin-bottom:18px}
.hdr h1{color:#fff;font-size:20px;font-weight:700;margin-bottom:12px}
.sinfo{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 16px;font-family:monospace;font-size:13px;color:#8b949e;line-height:1.9;margin-bottom:14px}
.sinfo .k{color:#58a6ff}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gi{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:9px 12px}
.gi .l{color:#8b949e;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.gi .v{color:#e6edf3;font-size:13px;font-weight:500}
.msgs{display:flex;flex-direction:column;gap:8px;margin-top:16px}
.msg{background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:12px 14px;display:flex;gap:10px}
.msg.bot{background:#161b22;border-color:#388bfd33}
.av{width:36px;height:36px;border-radius:50%;flex-shrink:0;object-fit:cover}
.body{flex:1;min-width:0}
.top{display:flex;gap:8px;align-items:center;margin-bottom:5px;flex-wrap:wrap}
.name{font-weight:700;color:#58a6ff;font-size:14px}
.btag{background:#388bfd;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:700}
.ts{color:#6e7681;font-size:11px;margin-right:auto}
.txt{font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.emb{border-right:4px solid #388bfd;background:#0d1117;border-radius:0 6px 6px 0;padding:8px 12px;margin-top:6px;font-size:13px;line-height:1.5}
.att-img{max-width:280px;max-height:200px;border-radius:6px;margin-top:6px;display:block}
.att-link{display:inline-flex;align-items:center;gap:5px;margin-top:6px;background:#21262d;border:1px solid #30363d;border-radius:5px;padding:4px 10px;color:#58a6ff;font-size:13px;text-decoration:none}
.ftr{text-align:center;color:#484f58;font-size:11px;margin-top:22px;padding-top:14px;border-top:1px solid #21262d}
</style></head>
<body>
<div class="hdr">
  <h1>🎫 سجل التيكت #${ticket.ticketNumber}</h1>
  <div class="sinfo">
    <span class="k">&lt;Server-Info&gt;</span><br>
    &nbsp;&nbsp;&nbsp;&nbsp;Server: ${guild.name} (${guild.id})<br>
    &nbsp;&nbsp;&nbsp;&nbsp;Channel: ${ticket.channelName} (${ticket.channelId})<br>
    &nbsp;&nbsp;&nbsp;&nbsp;Messages: ${msgCount}<br>
    &nbsp;&nbsp;&nbsp;&nbsp;Attachments Saved: ${attCount}
  </div>
  <div class="grid">
    <div class="gi"><div class="l">فاتح التيكت</div><div class="v">${ticket.username}</div></div>
    <div class="gi"><div class="l">رقم التيكت</div><div class="v">#${ticket.ticketNumber}</div></div>
    <div class="gi"><div class="l">المدة</div><div class="v">${duration} دقيقة</div></div>
    <div class="gi"><div class="l">وقت الفتح</div><div class="v">${openedAt}</div></div>
    <div class="gi"><div class="l">وقت الإغلاق</div><div class="v">${closedAt}</div></div>
    ${ticket.claimedByName?`<div class="gi"><div class="l">الكلايم</div><div class="v">${ticket.claimedByName}</div></div>`:""}
    ${ticket.closeReason?`<div class="gi" style="grid-column:1/-1"><div class="l">سبب الإغلاق</div><div class="v">${ticket.closeReason}</div></div>`:""}
  </div>
</div>
<div class="msgs">${rows||"<p style='color:#6e7681;text-align:center;padding:40px'>لا توجد رسائل.</p>"}</div>
<div class="ftr">تم إنشاؤه تلقائياً بواسطة نظام التيكتات • ${guild.name}</div>
</body></html>`;

  return { html, msgCount, attCount, usernames };
}

// ─── Upload to archive channel → return CDN URL ────────────────────────────────
async function archiveTranscript(buf, fileName, ticket, closedByUserId, closeReason, guild, usernames, msgCount, attCount) {
  if (!ARCHIVE_CHANNEL_ID) return null;
  try {
    const ch       = await client.channels.fetch(ARCHIVE_CHANNEL_ID);
    const fileSize = `${(buf.length / 1024).toFixed(0)} KB`;

    const serverInfo =
      "```\n<Server-Info>\n" +
      `    Server: ${guild.name} (${guild.id})\n` +
      `    Channel: ${ticket.channelName} (${ticket.channelId})\n` +
      `    Messages: ${msgCount}\n` +
      `    Attachments Saved: ${attCount}\n` +
      "```";

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: ticket.username })
      .addFields(
        { name: "Ticket Owner",      value: `<@${ticket.userId}>`,  inline: true },
        { name: "Ticket Name",       value: ticket.channelName,      inline: true },
        { name: "Panel Name",        value: "نظام التيكتات",         inline: true },
        { name: "Closed By",         value: `<@${closedByUserId}>`,  inline: true },
        { name: "Close Reason",      value: closeReason || "—",      inline: true },
        { name: "Direct Transcript", value: "Use Button",            inline: true },
        { name: "Users in transcript", value: usernames.map((u,i)=>`${i+1}- ${u}`).join("\n")||"—", inline: false }
      )
      .setFooter({ text: `${guild.name} • ${fileName} • ${fileSize}` })
      .setTimestamp();

    const sent = await ch.send({ content: serverInfo, embeds: [embed], files: [new AttachmentBuilder(buf, { name: fileName })] });
    return sent.attachments.first()?.url ?? null;
  } catch (e) {
    console.log("[Archive Error]", e.message);
    return null;
  }
}

// ─── Send DM to ticket opener with CDN link ────────────────────────────────────
async function dmOpener(ticket, guild, closedByUserId, closeReason, cdnUrl) {
  try {
    const user  = await client.users.fetch(ticket.userId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 سجل تيكتك #${ticket.ticketNumber}`)
      .setDescription(
        `تم إغلاق تيكتك في **${guild.name}**.\n\n` +
        (cdnUrl
          ? `> 🔗 **[اضغط هنا لعرض المحادثة الكاملة](${cdnUrl})**`
          : "> السجل غير متاح حالياً.")
      )
      .addFields(
        { name: "🏠 السيرفر",       value: guild.name,             inline: true  },
        { name: "👮 أُغلق بواسطة", value: `<@${closedByUserId}>`, inline: true  },
        { name: "📝 سبب الإغلاق",  value: closeReason || "—",      inline: false },
        { name: "⏱️ مدة التيكت",  value: `${Math.round((Date.now()-ticket.createdAt)/60000)} دقيقة`, inline: true }
      )
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch (e) {
    console.log("[DM Opener Error]", e.message);
  }
}

// ─── Shared close logic ────────────────────────────────────────────────────────
async function closeTicket(channel, ticket, guild, closedByUserId, closeReason, deleteChannel = true) {
  ticket.channelName = channel.name;
  ticket.closeReason = closeReason;

  const { html, msgCount, attCount, usernames } = await buildTranscript(channel, ticket, guild);
  const buf      = Buffer.from(html, "utf8");
  const fileName = `transcript-ticket-${String(ticket.ticketNumber).padStart(4,"0")}.html`;

  // 1) رفع في الأرشيف وجيب CDN URL
  const cdnUrl = await archiveTranscript(buf, fileName, ticket, closedByUserId, closeReason, guild, usernames, msgCount, attCount);

  // 2) DM للفاتح مع رابط CDN
  await dmOpener(ticket, guild, closedByUserId, closeReason, cdnUrl);

  delTicket(channel.id);

  if (deleteChannel) setTimeout(() => channel.delete().catch(()=>{}), 5000);
  return cdnUrl;
}

// ─── Rows ──────────────────────────────────────────────────────────────────────
// الأزرار العادية:
// الكل: 🔒 إغلاق التيكت (مع سبب)
// فريق الدعم: 🟡 كلايم + 🗑️ حذف التيكت
function normalRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(!!claimed),
    new ButtonBuilder().setCustomId("close_ticket_modal").setLabel("إغلاق التيكت").setEmoji("🔒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("delete_ticket").setLabel("حذف التيكت").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────
async function sendPanel(channel) {
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 نظام التيكتات")
        .setDescription("تحتاج مساعدة؟ اضغط على الزر أدناه لفتح تيكت.\nسيقوم فريق الدعم بالرد عليك في أقرب وقت.")
        .setColor(0x5865f2)
        .setFooter({ text: "نظام الدعم الفني" })
        .setTimestamp()
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_ticket").setLabel("فتح تيكت").setEmoji("🎫").setStyle(ButtonStyle.Primary)
      )
    ],
  });
}

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
  if (PANEL_CHANNEL_ID) {
    try {
      const ch   = await client.channels.fetch(PANEL_CHANNEL_ID);
      const msgs = await ch.messages.fetch({ limit: 10 });
      if (!msgs.some(m => m.author.id === client.user.id && m.components.length))
        await sendPanel(ch);
    } catch (e) { console.log("[Panel Error]", e.message); }
  }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  const { guild, channel } = interaction;
  const userId   = interaction.user.id;
  const username = interaction.user.username;

  // ══ Modal: إغلاق التيكت مع السبب ══════════════════════════════════════════════
  if (interaction.isModalSubmit() && interaction.customId === "close_ticket_modal_submit") {
    const reason = interaction.fields.getTextInputValue("close_reason").trim() || "لم يُذكر سبب";
    const ticket = getTicket(channel.id);

    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    // الكل يقدر يغلق (الفاتح أو أي عضو)
    await interaction.deferReply();

    const cdnUrl = await closeTicket(channel, ticket, guild, userId, reason, true);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 تم إغلاق التيكت")
          .setDescription(
            `**السبب:** ${reason}\n` +
            `**بواسطة:** <@${userId}>\n\n` +
            (cdnUrl ? `🔗 [عرض المحادثة](${cdnUrl})` : "") +
            `\n\n⏳ سيتم حذف القناة خلال 5 ثوانٍ...`
          )
          .setColor(0xed4245)
          .setTimestamp()
      ],
    });
    return;
  }

  // ══ Modal: تأكيد حذف التيكت (فريق الدعم) ══════════════════════════════════════
  if (interaction.isModalSubmit() && interaction.customId === "delete_ticket_modal_submit") {
    const reason = interaction.fields.getTextInputValue("delete_reason").trim() || "لم يُذكر سبب";
    const ticket = getTicket(channel.id);

    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه حذف التيكت.", flags: 64 });

    await interaction.deferReply();

    const cdnUrl = await closeTicket(channel, ticket, guild, userId, reason, true);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🗑️ تم حذف التيكت")
          .setDescription(
            `**السبب:** ${reason}\n` +
            `**بواسطة:** <@${userId}>\n\n` +
            (cdnUrl ? `🔗 [عرض المحادثة](${cdnUrl})` : "") +
            `\n\n⏳ سيتم حذف القناة خلال 5 ثوانٍ...`
          )
          .setColor(0xed4245)
          .setTimestamp()
      ],
    });
    return;
  }

  if (!interaction.isButton()) return;
  const { customId } = interaction;

  // ══ فتح تيكت ══════════════════════════════════════════════════════════════════
  if (customId === "open_ticket") {
    await interaction.deferReply({ flags: 64 });

    const data     = loadData();
    const existing = Object.values(data.tickets).find(t => t.userId === userId && t.guildId === guild.id && !t.closed);
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      return interaction.editReply({ content: `❌ لديك تيكت مفتوح: ${ch ?? `#ticket-${existing.ticketNumber}`}` });
    }

    const num    = nextNum();
    const catObj = CATEGORY_ID ? guild.channels.cache.get(CATEGORY_ID) : null;

    const tc = await guild.channels.create({
      name: `ticket-${num}`,
      type: ChannelType.GuildText,
      parent: catObj || null,
      permissionOverwrites: [
        { id: guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
        { id: userId,          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
      ],
    });

    const ticket = {
      channelId: tc.id, channelName: tc.name, userId, username,
      ticketNumber: num, guildId: guild.id, createdAt: Date.now(),
      claimed: false, claimedBy: null, claimedByName: null,
      locked: false, closed: false, closeReason: null,
    };
    saveTicket(tc.id, ticket);

    await tc.send({
      content: `<@${userId}> | <@&${SUPPORT_ROLE_ID}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle(`🎫 تيكت #${num}`)
          .setDescription(`أهلاً <@${userId}>!\n\nتم فتح تيكتك. سيتواصل معك فريق الدعم قريباً.\nاشرح مشكلتك بالتفصيل.`)
          .setColor(0x57f287)
          .addFields(
            { name: "👤 فاتح التيكت", value: `<@${userId}>`, inline: true },
            { name: "🔢 رقم التيكت",  value: `#${num}`,       inline: true },
            { name: "📅 وقت الفتح",   value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
          ).setTimestamp()
      ],
      components: [normalRow(false)],
    });

    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${tc}` });
  }

  // ══ كلايم ══════════════════════════════════════════════════════════════════════
  if (customId === "claim_ticket") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الكلايم.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)          return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });
    if (ticket.claimed)   return interaction.reply({ content: `❌ مكلايم بالفعل من <@${ticket.claimedBy}>.`, flags: 64 });

    ticket.claimed = true; ticket.claimedBy = userId; ticket.claimedByName = username;
    saveTicket(channel.id, ticket);

    const newName = `🟡-${username}-${ticket.ticketNumber}`;
    await channel.setName(newName);
    ticket.channelName = newName;
    saveTicket(channel.id, ticket);

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🟡 تم الكلايم من قِبل <@${userId}>`).setColor(0xfee75c)],
    });
  }

  // ══ إغلاق التيكت — الكل يقدر (Modal مع السبب) ════════════════════════════════
  if (customId === "close_ticket_modal") {
    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId("close_ticket_modal_submit")
      .setTitle("🔒 إغلاق التيكت");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("close_reason")
          .setLabel("سبب الإغلاق")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("مثال: تم حل المشكلة")
          .setRequired(false)
          .setMaxLength(500)
      )
    );

    await interaction.showModal(modal);
  }

  // ══ حذف التيكت — فريق الدعم فقط (Modal مع السبب) ════════════════════════════
  if (customId === "delete_ticket") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه حذف التيكت.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId("delete_ticket_modal_submit")
      .setTitle("🗑️ حذف التيكت");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("delete_reason")
          .setLabel("سبب الحذف")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("مثال: تيكت مكرر أو غير جدي")
          .setRequired(false)
          .setMaxLength(500)
      )
    );

    await interaction.showModal(modal);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
