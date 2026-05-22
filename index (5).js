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

// ─── Config ────────────────────────────────────────────────────────────────────
const TOKEN            = process.env.TOKEN;
const SUPPORT_ROLE_ID  = process.env.SUPPORT_ROLE_ID;
const CATEGORY_ID      = process.env.CATEGORY_ID      || null;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
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

function nextTicketNumber() {
  const d = loadData();
  d.counter++;
  saveData(d);
  return d.counter;
}
function saveTicket(channelId, info) {
  const d = loadData();
  d.tickets[channelId] = info;
  saveData(d);
}
function getTicket(channelId) {
  return loadData().tickets[channelId] || null;
}
function deleteTicket(channelId) {
  const d = loadData();
  delete d.tickets[channelId];
  saveData(d);
}

// ─── Check support role (الرول فقط — بدون استثناء للأدمن) ────────────────────
async function checkSupport(guild, userId) {
  try {
    const m         = await guild.members.fetch(userId);
    const roleIdStr = String(SUPPORT_ROLE_ID).trim();
    const hasRole   = m.roles.cache.some(r => String(r.id).trim() === roleIdStr);
    console.log(`[checkSupport] user=${userId} | lookingFor=${roleIdStr} | hasRole=${hasRole} | roles=${m.roles.cache.map(r=>r.id).join(",")}`);
    return hasRole;
  } catch (e) {
    console.log(`[checkSupport ERROR] ${e.message}`);
    return false;
  }
}

// ─── Build HTML transcript ─────────────────────────────────────────────────────
async function buildTranscript(channel, ticket, guild) {
  // جيب كل الرسائل
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

  // إحصائيات
  const msgCount  = msgs.filter(m => !m.author.bot).length;
  const attCount  = msgs.reduce((n, m) => n + m.attachments.size, 0);
  const usernames = [...new Set(msgs.map(m => m.author.username))];

  // بناء صفوف الرسائل
  const rows = msgs
    .filter(m => m.content || m.embeds.length || m.attachments.size)
    .map(m => {
      const t = new Date(m.createdTimestamp).toLocaleString("ar-SA");
      const av = `<img class="av" src="${m.author.displayAvatarURL({ size: 64 })}" onerror="this.style.display='none'">`;
      const embs = m.embeds.map(e =>
        `<div class="emb">${e.title ? `<b>${e.title}</b><br>` : ""}${(e.description || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`
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
  </div>
</div>
<div class="msgs">${rows||"<p style='color:#6e7681;text-align:center;padding:40px'>لا توجد رسائل.</p>"}</div>
<div class="ftr">تم إنشاؤه تلقائياً بواسطة نظام التيكتات • ${guild.name}</div>
</body></html>`;

  return { html, msgCount, attCount, usernames };
}

// ─── Send transcript to DM and/or archive ─────────────────────────────────────
async function sendTranscript(transcriptData, ticket, closedByUsername, closedById, guild, { dm = true, archive = true } = {}) {
  const { html, msgCount, attCount, usernames } = transcriptData;
  const buf      = Buffer.from(html, "utf8");
  const fileName = `transcript-ticket-${String(ticket.ticketNumber).padStart(4, "0")}.html`;
  const fileSize = `${(buf.length / 1024).toFixed(0)} KB`;

  // نص Server-Info
  const serverInfo =
    "```\n" +
    "<Server-Info>\n" +
    `    Server: ${guild.name} (${guild.id})\n` +
    `    Channel: ${ticket.channelName} (${ticket.channelId})\n` +
    `    Messages: ${msgCount}\n` +
    `    Attachments Saved: ${attCount}\n` +
    "```";

  // بناء الإمبد — بالضبط مثل Ticket Tool
  function makeEmbed(avatarURL) {
    const eb = new EmbedBuilder()
      .setColor(0x5865f2)
      .addFields(
        { name: "Ticket Owner", value: `<@${ticket.userId}>`,  inline: true },
        { name: "Ticket Name",  value: ticket.channelName,      inline: true },
        { name: "Panel Name",   value: "نظام التيكتات",         inline: true },
        { name: "Direct Transcript", value: "Use Button",       inline: true },
        { name: "Users in transcript", value: usernames.map((u, i) => `${i+1}- ${u}`).join("\n") || "—", inline: true }
      )
      .setFooter({ text: `${guild.name} • ${fileName} • ${fileSize}` })
      .setTimestamp();
    if (avatarURL) eb.setAuthor({ name: ticket.username, iconURL: avatarURL });
    else           eb.setAuthor({ name: ticket.username });
    return eb;
  }

  // ── DM ──
  if (dm) {
    try {
      const user = await client.users.fetch(ticket.userId);
      await user.send({
        content: serverInfo,
        embeds:  [makeEmbed(user.displayAvatarURL())],
        files:   [new AttachmentBuilder(buf, { name: fileName })],
      });
    } catch (e) {
      console.log("[DM Error]", e.message);
    }
  }

  // ── Archive ──
  if (archive && ARCHIVE_CHANNEL_ID) {
    try {
      const ch = await client.channels.fetch(ARCHIVE_CHANNEL_ID);
      await ch.send({
        content: serverInfo,
        embeds:  [makeEmbed(null)],
        files:   [new AttachmentBuilder(buf, { name: fileName })],
      });
    } catch (e) {
      console.log("[Archive Error]", e.message);
    }
  }
}

// ─── Send ticket panel ─────────────────────────────────────────────────────────
async function sendPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 نظام التيكتات")
    .setDescription("تحتاج مساعدة؟ اضغط على الزر أدناه لفتح تيكت.\nسيقوم فريق الدعم بالرد عليك في أقرب وقت.")
    .setColor(0x5865f2)
    .setFooter({ text: "نظام الدعم الفني" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("فتح تيكت")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ─── زر controls بعد القفل ────────────────────────────────────────────────────
function lockedRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(!!claimed),
    new ButtonBuilder().setCustomId("unlock_ticket").setLabel("فتح القفل").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("close_ticket").setLabel("إغلاق التيكت").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

// ─── زر controls عادي (قبل القفل) ────────────────────────────────────────────
// الفاتح يشوف زر الإغلاق — فريق الدعم يشوف كلايم + قفل
function normalRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(!!claimed),
    new ButtonBuilder().setCustomId("lock_ticket").setLabel("قفل التيكت").setEmoji("🔒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("opener_close_ticket").setLabel("إغلاق التيكت").setEmoji("🔐").setStyle(ButtonStyle.Danger)
  );
}

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
  if (PANEL_CHANNEL_ID) {
    try {
      const ch   = await client.channels.fetch(PANEL_CHANNEL_ID);
      const msgs = await ch.messages.fetch({ limit: 10 });
      const has  = msgs.some(m => m.author.id === client.user.id && m.components.length > 0);
      if (!has) await sendPanel(ch);
    } catch (e) { console.log("[Panel Error]", e.message); }
  }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, guild, channel } = interaction;
  const userId   = interaction.user.id;
  const username = interaction.user.username;

  // ══════════════════════════════════════════════════════════════════════════════
  // فتح تيكت
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "open_ticket") {
    await interaction.deferReply({ flags: 64 });

    // تحقق من تيكت موجود
    const data = loadData();
    const existing = Object.values(data.tickets).find(
      t => t.userId === userId && t.guildId === guild.id && !t.closed
    );
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      return interaction.editReply({
        content: `❌ لديك تيكت مفتوح بالفعل: ${ch ?? `#ticket-${existing.ticketNumber}`}`,
      });
    }

    const num      = nextTicketNumber();
    const catObj   = CATEGORY_ID ? guild.channels.cache.get(CATEGORY_ID) : null;

    const tc = await guild.channels.create({
      name: `ticket-${num}`,
      type: ChannelType.GuildText,
      parent: catObj || null,
      permissionOverwrites: [
        { id: guild.id,         deny:  [PermissionFlagsBits.ViewChannel] },
        { id: userId,           allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: SUPPORT_ROLE_ID,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
      ],
    });

    const ticket = {
      channelId:     tc.id,
      channelName:   tc.name,
      userId,
      username,
      ticketNumber:  num,
      guildId:       guild.id,
      createdAt:     Date.now(),
      claimed:       false,
      claimedBy:     null,
      claimedByName: null,
      locked:        false,
      closed:        false,
    };
    saveTicket(tc.id, ticket);

    const embed = new EmbedBuilder()
      .setTitle(`🎫 تيكت #${num}`)
      .setDescription(`أهلاً <@${userId}>!\n\nتم فتح تيكتك بنجاح. سيتواصل معك فريق الدعم قريباً.\nاشرح مشكلتك بالتفصيل.`)
      .setColor(0x57f287)
      .addFields(
        { name: "👤 فاتح التيكت", value: `<@${userId}>`, inline: true },
        { name: "🔢 رقم التيكت",  value: `#${num}`,       inline: true },
        { name: "📅 وقت الفتح",   value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
      )
      .setTimestamp();

    await tc.send({
      content: `<@${userId}> | <@&${SUPPORT_ROLE_ID}>`,
      embeds:  [embed],
      components: [normalRow(false)],
    });

    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${tc}` });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // كلايم
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "claim_ticket") {
    // ✅ تحقق من الرول بعد fetch جديد
    const allowed = await checkSupport(guild, userId);
    if (!allowed)
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الكلايم.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });
    if (ticket.claimed)
      return interaction.reply({ content: `❌ مكلايم بالفعل من <@${ticket.claimedBy}>.`, flags: 64 });

    ticket.claimed       = true;
    ticket.claimedBy     = userId;
    ticket.claimedByName = username;
    saveTicket(channel.id, ticket);

    const newName = `🟡-${username}-${ticket.ticketNumber}`;
    await channel.setName(newName);
    ticket.channelName = newName;
    saveTicket(channel.id, ticket);

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🟡 تم الكلايم من قِبل <@${userId}>`).setColor(0xfee75c)],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // قفل التيكت — رسالة تأكيد
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "lock_ticket") {
    const allowed = await checkSupport(guild, userId);
    if (!allowed)
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه القفل.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });
    if (ticket.locked)
      return interaction.reply({ content: "❌ التيكت مقفل بالفعل.", flags: 64 });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("confirm_lock").setLabel("نعم، قفل التيكت").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cancel_lock").setLabel("إلغاء").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ تأكيد القفل")
          .setDescription(
            "هل أنت متأكد من قفل هذا التيكت؟\n\n" +
            "• فاتح التيكت **لن يرى القناة** حتى يفتح الإداري القفل\n" +
            "• سيتم حفظ السجل في الأرشيف\n" +
            "• سيظهر زر **الإغلاق النهائي** بعد القفل"
          )
          .setColor(0xfee75c),
      ],
      components: [confirmRow],
      flags: 64,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // تأكيد القفل
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "confirm_lock") {
    const allowed = await checkSupport(guild, userId);
    if (!allowed)
      return interaction.reply({ content: "❌ غير مصرح.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)
      return interaction.reply({ content: "❌ التيكت غير موجود.", flags: 64 });

    // أغلق الـ ephemeral confirmation أولاً
    await interaction.update({ embeds: [], components: [], content: "⏳ جاري القفل..." });

    // ✅ سحب ViewChannel كاملاً من فاتح التيكت — deny صريح يتجاوز حتى الأدمن
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel:        false,
      SendMessages:       false,
      ReadMessageHistory: false,
      Administrator:      false,
    }).catch(e => console.log("[Perm Error]", e.message));

    ticket.locked      = true;
    ticket.channelName = channel.name;
    saveTicket(channel.id, ticket);

    // بناء وإرسال الترانسكريبت للأرشيف فقط
    const transcriptData = await buildTranscript(channel, ticket, guild);
    await sendTranscript(transcriptData, ticket, username, userId, guild, { dm: false, archive: true });

    // إرسال رسالة القفل في القناة مع الأزرار الجديدة
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 تم قفل التيكت")
          .setDescription(
            `تم قفل هذا التيكت من قِبل <@${userId}>.\n\n` +
            `• <@${ticket.userId}> لا يرى هذه القناة الآن\n` +
            `• تم حفظ السجل في الأرشيف\n` +
            `• استخدم **إغلاق التيكت** للإغلاق النهائي`
          )
          .setColor(0xed4245)
          .setTimestamp(),
      ],
      components: [lockedRow(ticket.claimed)],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // إلغاء القفل
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "cancel_lock") {
    await interaction.update({
      embeds:     [new EmbedBuilder().setDescription("✅ تم إلغاء القفل.").setColor(0x57f287)],
      components: [],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // فتح القفل
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "unlock_ticket") {
    const allowed = await checkSupport(guild, userId);
    if (!allowed)
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه فتح القفل.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    // ✅ إرجاع ViewChannel لفاتح التيكت
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel:        true,
      SendMessages:       true,
      ReadMessageHistory: true,
      AttachFiles:        true,
    }).catch(e => console.log("[Perm Error]", e.message));

    ticket.locked = false;
    saveTicket(channel.id, ticket);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`🔓 تم فتح القفل من قِبل <@${userId}>.\n<@${ticket.userId}> يستطيع الآن رؤية القناة والكتابة.`)
          .setColor(0x57f287),
      ],
      components: [normalRow(ticket.claimed)],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // إغلاق التيكت من قِبل الفاتح
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "opener_close_ticket") {
    const ticket = getTicket(channel.id);
    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    // فقط الفاتح يقدر يضغطه
    if (ticket.userId !== userId)
      return interaction.reply({ content: "❌ فقط فاتح التيكت يمكنه إغلاقه.", flags: 64 });

    if (ticket.locked)
      return interaction.reply({ content: "❌ التيكت مقفل من قِبل الإدارة ولا يمكن إغلاقه.", flags: 64 });

    // رسالة تأكيد
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("opener_confirm_close").setLabel("نعم، أغلق التيكت").setEmoji("🔐").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("opener_cancel_close").setLabel("إلغاء").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ تأكيد الإغلاق")
          .setDescription("هل تريد إغلاق هذا التيكت؟\n\nسيتم إرسال سجل المحادثة إليك على الخاص وحذف القناة.")
          .setColor(0xfee75c),
      ],
      components: [confirmRow],
      flags: 64,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // تأكيد إغلاق الفاتح
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "opener_confirm_close") {
    const ticket = getTicket(channel.id);
    if (!ticket || ticket.userId !== userId)
      return interaction.update({ embeds: [], components: [], content: "❌ غير مصرح." });

    await interaction.update({ embeds: [], components: [], content: "⏳ جاري الإغلاق..." });

    ticket.channelName = channel.name;
    const transcriptData = await buildTranscript(channel, ticket, guild);
    await sendTranscript(transcriptData, ticket, username, userId, guild, { dm: true, archive: true });

    ticket.closed = true;
    deleteTicket(channel.id);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setDescription("✅ تم إرسال السجل للفاتح والأرشيف. سيتم حذف القناة خلال **5 ثوانٍ**.")
          .setColor(0xed4245),
      ],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // إلغاء إغلاق الفاتح
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "opener_cancel_close") {
    await interaction.update({
      embeds: [new EmbedBuilder().setDescription("✅ تم إلغاء الإغلاق.").setColor(0x57f287)],
      components: [],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // إغلاق التيكت (نهائي - فريق الدعم)
  // ══════════════════════════════════════════════════════════════════════════════
  if (customId === "close_ticket") {
    const allowed = await checkSupport(guild, userId);
    if (!allowed)
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الإغلاق.", flags: 64 });

    const ticket = getTicket(channel.id);
    if (!ticket)
      return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", flags: 64 });

    if (!ticket.locked)
      return interaction.reply({
        content: "❌ يجب **قفل** التيكت أولاً قبل الإغلاق النهائي. استخدم زر 🔒 القفل.",
        flags: 64,
      });

    await interaction.deferReply();

    ticket.channelName = channel.name;
    const transcriptData = await buildTranscript(channel, ticket, guild);
    await sendTranscript(transcriptData, ticket, username, userId, guild, { dm: true, archive: true });

    ticket.closed = true;
    deleteTicket(channel.id);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription("✅ تم إرسال السجل للفاتح والأرشيف. سيتم حذف القناة خلال **5 ثوانٍ**.")
          .setColor(0xed4245),
      ],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
