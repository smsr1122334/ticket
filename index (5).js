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
const ADMIN_ROLE_ID      = process.env.ADMIN_ROLE_ID;       // الإدارة العليا — تستلم الـ DM
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
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function nextTicketNumber() { const d = loadData(); d.counter++; saveData(d); return d.counter; }
function saveTicket(cid, info) { const d = loadData(); d.tickets[cid] = info; saveData(d); }
function getTicket(cid) { return loadData().tickets[cid] || null; }
function deleteTicket(cid) { const d = loadData(); delete d.tickets[cid]; saveData(d); }

// ─── Role checks ───────────────────────────────────────────────────────────────
async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function hasRole(guild, userId, roleId) {
  if (!roleId) return false;
  const m = await fetchMember(guild, userId);
  if (!m) return false;
  return m.roles.cache.some(r => String(r.id) === String(roleId).trim());
}

// فريق الدعم
async function isSupport(guild, userId) {
  return hasRole(guild, userId, SUPPORT_ROLE_ID);
}

// الإدارة العليا
async function isAdmin(guild, userId) {
  return hasRole(guild, userId, ADMIN_ROLE_ID);
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

// ─── Upload transcript to archive channel & get CDN link ──────────────────────
// يرفع الملف في قناة الأرشيف ويرجع رابط CDN مباشر
async function uploadTranscript(buf, fileName, ticket, closedByUserId, closeReason, guild, usernames, msgCount, attCount) {
  if (!ARCHIVE_CHANNEL_ID) return null;
  try {
    const archiveCh = await client.channels.fetch(ARCHIVE_CHANNEL_ID);
    const fileSize  = `${(buf.length / 1024).toFixed(0)} KB`;

    const serverInfo =
      "```\n" +
      "<Server-Info>\n" +
      `    Server: ${guild.name} (${guild.id})\n` +
      `    Channel: ${ticket.channelName} (${ticket.channelId})\n` +
      `    Messages: ${msgCount}\n` +
      `    Attachments Saved: ${attCount}\n` +
      "```";

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: ticket.username })
      .addFields(
        { name: "Ticket Owner",          value: `<@${ticket.userId}>`,    inline: true },
        { name: "Ticket Name",           value: ticket.channelName,        inline: true },
        { name: "Panel Name",            value: "نظام التيكتات",           inline: true },
        { name: "Closed By",             value: `<@${closedByUserId}>`,    inline: true },
        { name: "Close Reason",          value: closeReason || "—",        inline: true },
        { name: "Direct Transcript",     value: "Use Button",              inline: true },
        {
          name:  "Users in transcript",
          value: usernames.map((u, i) => `${i + 1}- ${u}`).join("\n") || "—",
          inline: false,
        }
      )
      .setFooter({ text: `${guild.name} • ${fileName} • ${fileSize}` })
      .setTimestamp();

    // إرسال الملف وجيب الـ URL من CDN
    const sent = await archiveCh.send({
      content: serverInfo,
      embeds:  [embed],
      files:   [new AttachmentBuilder(buf, { name: fileName })],
    });

    // رابط CDN المباشر من أول مرفق
    const cdnUrl = sent.attachments.first()?.url ?? null;
    return { message: sent, cdnUrl };
  } catch (e) {
    console.log("[Archive Error]", e.message);
    return null;
  }
}

// ─── Send DM to admins only ───────────────────────────────────────────────────
async function dmAdmins(guild, embed, buf, fileName) {
  if (!ADMIN_ROLE_ID) return;
  try {
    const members = await guild.members.fetch();
    const admins  = members.filter(m => m.roles.cache.some(r => String(r.id) === String(ADMIN_ROLE_ID).trim()));
    for (const [, admin] of admins) {
      try {
        await admin.send({
          embeds: [embed],
          files:  [new AttachmentBuilder(buf, { name: fileName })],
        });
      } catch { /* DM مغلق */ }
    }
  } catch (e) {
    console.log("[DM Admin Error]", e.message);
  }
}

// ─── Close ticket (shared logic) ──────────────────────────────────────────────
async function doClose(interaction, channel, ticket, guild, closedByUserId, closeReason) {
  ticket.channelName  = channel.name;
  ticket.closeReason  = closeReason;
  const { html, msgCount, attCount, usernames } = await buildTranscript(channel, ticket, guild);

  const buf      = Buffer.from(html, "utf8");
  const fileName = `transcript-ticket-${String(ticket.ticketNumber).padStart(4, "0")}.html`;
  const fileSize = `${(buf.length / 1024).toFixed(0)} KB`;

  // 1) رفع في الأرشيف وجيب رابط CDN
  const result = await uploadTranscript(buf, fileName, ticket, closedByUserId, closeReason, guild, usernames, msgCount, attCount);
  const cdnUrl = result?.cdnUrl;

  // 2) إمبد للـ DM يحتوي الرابط المباشر
  const dmEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 سجل تيكتك #${ticket.ticketNumber}`)
    .setDescription(
      `تم إغلاق تيكتك في **${guild.name}**.\n` +
      (cdnUrl ? `\n🔗 **[اضغط هنا لعرض المحادثة الكاملة](${cdnUrl})**` : "")
    )
    .addFields(
      { name: "🏠 السيرفر",       value: guild.name,              inline: true },
      { name: "👮 أُغلق بواسطة", value: `<@${closedByUserId}>`,  inline: true },
      { name: "📝 السبب",         value: closeReason || "—",       inline: true },
      { name: "⏱️ المدة",        value: `${Math.round((Date.now()-ticket.createdAt)/60000)} دقيقة`, inline: true }
    )
    .setTimestamp();

  // 3) DM للإدارة العليا فقط
  await dmAdmins(guild, dmEmbed, buf, fileName);

  ticket.closed = true;
  deleteTicket(channel.id);

  return cdnUrl;
}

// ─── Rows ──────────────────────────────────────────────────────────────────────
function normalRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(!!claimed),
    new ButtonBuilder().setCustomId("lock_ticket").setLabel("قفل التيكت").setEmoji("🔒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close_with_reason").setLabel("إغلاق مع السبب").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

function lockedRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(!!claimed),
    new ButtonBuilder().setCustomId("unlock_ticket").setLabel("فتح القفل").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("close_with_reason").setLabel("إغلاق مع السبب").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────
async function sendPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 نظام التيكتات")
    .setDescription("تحتاج مساعدة؟ اضغط على الزر أدناه لفتح تيكت.\nسيقوم فريق الدعم بالرد عليك في أقرب وقت.")
    .setColor(0x5865f2)
    .setFooter({ text: "نظام الدعم الفني" })
    .setTimestamp();

  await channel.send({
    embeds: [embed],
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

  // ══ Modal submit ══════════════════════════════════════════════════════════════
  if (interaction.isModalSubmit() && interaction.customId === "close_reason_modal") {
    const reason = interaction.fields.getTextInputValue("reason_input").trim() || "لم يُذكر سبب";
    const ticket = getTicket(channel.id);

    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    // فريق الدعم أو الفاتح
    const support = await isSupport(guild, userId);
    if (!support && ticket.userId !== userId)
      return interaction.reply({ content: "❌ غير مصرح.", flags: 64 });

    // فريق الدعم يحتاج قفل أولاً — الفاتح لا يحتاج
    if (support && !ticket.locked)
      return interaction.reply({ content: "❌ يجب **قفل** التيكت أولاً.", flags: 64 });

    await interaction.deferReply();

    const cdnUrl = await doClose(interaction, channel, ticket, guild, userId, reason);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `✅ تم إغلاق التيكت.\n📝 السبب: **${reason}**\n` +
            (cdnUrl ? `\n🔗 [عرض المحادثة](${cdnUrl})` : "")
          )
          .setColor(0xed4245),
      ],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
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

    const num    = nextTicketNumber();
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

    const ticket = { channelId: tc.id, channelName: tc.name, userId, username, ticketNumber: num, guildId: guild.id, createdAt: Date.now(), claimed: false, claimedBy: null, claimedByName: null, locked: false, closed: false, closeReason: null };
    saveTicket(tc.id, ticket);

    const embed = new EmbedBuilder()
      .setTitle(`🎫 تيكت #${num}`)
      .setDescription(`أهلاً <@${userId}>!\n\nتم فتح تيكتك. سيتواصل معك فريق الدعم قريباً.\nاشرح مشكلتك بالتفصيل.`)
      .setColor(0x57f287)
      .addFields(
        { name: "👤 فاتح التيكت", value: `<@${userId}>`, inline: true },
        { name: "🔢 رقم التيكت",  value: `#${num}`,       inline: true },
        { name: "📅 وقت الفتح",   value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
      ).setTimestamp();

    await tc.send({ content: `<@${userId}> | <@&${SUPPORT_ROLE_ID}>`, embeds: [embed], components: [normalRow(false)] });
    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${tc}` });
  }

  // ══ كلايم ══════════════════════════════════════════════════════════════════════
  if (customId === "claim_ticket") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الكلايم.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });
    if (ticket.claimed) return interaction.reply({ content: `❌ مكلايم بالفعل من <@${ticket.claimedBy}>.`, flags: 64 });

    ticket.claimed = true; ticket.claimedBy = userId; ticket.claimedByName = username;
    saveTicket(channel.id, ticket);

    const newName = `🟡-${username}-${ticket.ticketNumber}`;
    await channel.setName(newName);
    ticket.channelName = newName;
    saveTicket(channel.id, ticket);

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🟡 تم الكلايم من قِبل <@${userId}>`).setColor(0xfee75c)] });
  }

  // ══ قفل التيكت ═════════════════════════════════════════════════════════════════
  if (customId === "lock_ticket") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه القفل.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });
    if (ticket.locked) return interaction.reply({ content: "❌ التيكت مقفل بالفعل.", flags: 64 });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("confirm_lock").setLabel("نعم، قفل التيكت").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cancel_lock").setLabel("إلغاء").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("⚠️ تأكيد القفل").setDescription("هل أنت متأكد من قفل هذا التيكت؟\n\n• فاتح التيكت **لن يرى القناة** حتى يفتح الإداري القفل\n• سيتم حفظ السجل في الأرشيف\n• سيظهر زر **الإغلاق** بعد القفل").setColor(0xfee75c)],
      components: [confirmRow],
      flags: 64,
    });
  }

  // ══ تأكيد القفل ════════════════════════════════════════════════════════════════
  if (customId === "confirm_lock") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ غير مصرح.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ التيكت غير موجود.", flags: 64 });

    await interaction.update({ embeds: [], components: [], content: "⏳ جاري القفل..." });

    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false, SendMessages: false, ReadMessageHistory: false,
    }).catch(e => console.log("[Perm Error]", e.message));

    ticket.locked = true; ticket.channelName = channel.name;
    saveTicket(channel.id, ticket);

    // أرشفة عند القفل
    const { html, msgCount, attCount, usernames } = await buildTranscript(channel, ticket, guild);
    const buf      = Buffer.from(html, "utf8");
    const fileName = `transcript-ticket-${String(ticket.ticketNumber).padStart(4, "0")}.html`;
    await uploadTranscript(buf, fileName, ticket, userId, "قفل التيكت", guild, usernames, msgCount, attCount);

    await channel.send({
      embeds: [new EmbedBuilder().setTitle("🔒 تم قفل التيكت").setDescription(`تم قفل هذا التيكت من قِبل <@${userId}>.\n\n• <@${ticket.userId}> لا يرى هذه القناة الآن\n• تم حفظ السجل في الأرشيف\n• استخدم **إغلاق مع السبب** للإغلاق النهائي`).setColor(0xed4245).setTimestamp()],
      components: [lockedRow(ticket.claimed)],
    });
  }

  // ══ إلغاء القفل ════════════════════════════════════════════════════════════════
  if (customId === "cancel_lock") {
    await interaction.update({ embeds: [new EmbedBuilder().setDescription("✅ تم إلغاء القفل.").setColor(0x57f287)], components: [] });
  }

  // ══ فتح القفل ══════════════════════════════════════════════════════════════════
  if (customId === "unlock_ticket") {
    if (!await isSupport(guild, userId))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه فتح القفل.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
    }).catch(e => console.log("[Perm Error]", e.message));

    ticket.locked = false;
    saveTicket(channel.id, ticket);

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🔓 تم فتح القفل من قِبل <@${userId}>.\n<@${ticket.userId}> يستطيع الآن رؤية القناة والكتابة.`).setColor(0x57f287)],
      components: [normalRow(ticket.claimed)],
    });
  }

  // ══ إغلاق مع السبب (modal) ════════════════════════════════════════════════════
  if (customId === "close_with_reason") {
    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    const support = await isSupport(guild, userId);

    // فريق الدعم يحتاج قفل أولاً
    if (support && !ticket.locked)
      return interaction.reply({ content: "❌ يجب **قفل** التيكت أولاً قبل الإغلاق. استخدم زر 🔒 القفل.", flags: 64 });

    // غير فريق الدعم — فقط الفاتح
    if (!support && ticket.userId !== userId)
      return interaction.reply({ content: "❌ فقط فاتح التيكت أو فريق الدعم يمكنهم الإغلاق.", flags: 64 });

    // فتح الـ Modal
    const modal = new ModalBuilder()
      .setCustomId("close_reason_modal")
      .setTitle("سبب إغلاق التيكت");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason_input")
      .setLabel("اذكر سبب الإغلاق")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("مثال: تم حل المشكلة بنجاح")
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
