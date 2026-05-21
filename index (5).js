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
      const time = new Date(m.createdTimestamp).toLocaleString("ar-SA");
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

  const openedAt = new Date(info.createdAt).toLocaleString("ar-SA");
  const closedAt = new Date().toLocaleString("ar-SA");
  const duration = Math.round((Date.now() - info.createdAt) / 60000);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>تيكت #${info.ticketNumber} — ${guild.name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#1a1b2e;color:#c9d1d9;padding:24px;min-height:100vh}
.header{background:linear-gradient(135deg,#1e3a5f 0%,#0f2744 50%,#1a1b2e 100%);border:1px solid #30363d;border-radius:16px;padding:28px 32px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px}
.header-left h1{color:#fff;font-size:22px;font-weight:700;margin-bottom:4px}
.header-left p{color:rgba(255,255,255,.55);font-size:13px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:280px}
.meta-item{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 14px}
.meta-item .label{color:#8b949e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.meta-item .val{color:#e6edf3;font-size:13px;font-weight:500}
.msgs{display:flex;flex-direction:column;gap:10px}
.msg{background:#0d1117;border:1px solid #21262d;border-radius:12px;padding:14px 16px;display:flex;gap:12px}
.msg.bot{background:#161b22;border-color:#388bfd22}
.av{width:38px;height:38px;border-radius:50%;flex-shrink:0;object-fit:cover;background:#21262d}
.body{flex:1;min-width:0}
.top{display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
.name{font-weight:600;color:#58a6ff;font-size:14px}
.btag{background:#388bfd;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600}
.ts{color:#6e7681;font-size:12px;margin-right:auto}
.txt{font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word;color:#c9d1d9}
.emb{border-right:4px solid #388bfd;border-left:none;background:#0d1117;border-radius:6px 0 0 6px;padding:10px 14px;margin-top:8px;font-size:13px;line-height:1.5}
.att-img{max-width:320px;max-height:240px;border-radius:8px;margin-top:8px;display:block}
.att-link{display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:6px 12px;color:#58a6ff;font-size:13px;text-decoration:none}
.footer{text-align:center;color:#484f58;font-size:12px;margin-top:28px;padding-top:16px;border-top:1px solid #21262d}
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h1>🎫 تيكت #${info.ticketNumber}</h1>
    <p>${guild.name} — سجل التيكت</p>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="label">فاتح التيكت</div><div class="val">${info.username}</div></div>
    <div class="meta-item"><div class="label">رقم التيكت</div><div class="val">#${info.ticketNumber}</div></div>
    <div class="meta-item"><div class="label">وقت الفتح</div><div class="val">${openedAt}</div></div>
    <div class="meta-item"><div class="label">وقت الإغلاق</div><div class="val">${closedAt}</div></div>
    <div class="meta-item"><div class="label">المدة</div><div class="val">${duration} دقيقة</div></div>
    ${info.claimedBy ? `<div class="meta-item"><div class="label">الكلايم</div><div class="val"><@${info.claimedBy}></div></div>` : ""}
  </div>
</div>
<div class="msgs">${rows || "<p style='color:#6e7681;text-align:center;padding:40px'>لا توجد رسائل.</p>"}</div>
<div class="footer">تم إنشاؤه تلقائياً بواسطة نظام التيكتات</div>
</body>
</html>`;
}

// ─── isSupport ─────────────────────────────────────────────────────────────────
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
    const buf  = Buffer.from(htmlContent, "utf8");
    const file = new AttachmentBuilder(buf, { name: `ticket-${info.ticketNumber}.html` });

    const embed = new EmbedBuilder()
      .setTitle(`${label} — تيكت #${info.ticketNumber}`)
      .setDescription(
        `**فاتح التيكت:** <@${info.userId}> (${info.username})\n` +
        `**بواسطة:** ${member}\n` +
        `**المدة:** ${Math.round((Date.now() - info.createdAt) / 60000)} دقيقة\n` +
        `**القناة:** ${info.channelName || "—"}`
      )
      .setColor(label.includes("مغلق") ? 0xed4245 : 0xfee75c)
      .setTimestamp();

    await archiveCh.send({ embeds: [embed], files: [file] });
  } catch (e) {
    console.log("[Archive Error]", e.message);
  }
}

// ─── Panel ─────────────────────────────────────────────────────────────────────
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

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);

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

  // ── فتح تيكت ─────────────────────────────────────────────────────────────────
  if (customId === "open_ticket") {
    await interaction.deferReply({ ephemeral: true });

    const d = load();
    const existing = Object.values(d.tickets).find(
      (t) => t.userId === member.id && t.guildId === guild.id && !t.closed
    );
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      return interaction.editReply({
        content: `❌ لديك تيكت مفتوح بالفعل: ${ch ? ch : `ticket-${existing.ticketNumber}`}`,
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
      .setTitle(`🎫 تيكت #${num}`)
      .setDescription(
        `أهلاً ${member}!\n\nتم فتح تيكتك بنجاح. سيتواصل معك فريق الدعم قريباً.\n\nاشرح مشكلتك بالتفصيل وسنرد عليك في أقرب وقت.`
      )
      .setColor(0x57f287)
      .addFields(
        { name: "👤 فاتح التيكت", value: `${member}`, inline: true },
        { name: "🔢 رقم التيكت", value: `#${num}`, inline: true },
        { name: "📅 وقت الفتح", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    // فقط كلايم + قفل — الإغلاق يظهر بعد القفل فقط
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("كلايم")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lock_ticket")
        .setLabel("قفل التيكت")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Primary)
    );

    await tc.send({
      content: `${member} | <@&${config.supportRoleId}>`,
      embeds: [embed],
      components: [row],
    });

    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${tc}` });
  }

  // ── كلايم ─────────────────────────────────────────────────────────────────────
  if (customId === "claim_ticket") {
    if (!isSupport(member))
      return interaction.reply({
        content: "❌ فقط فريق الدعم يمكنه الكلايم.",
        ephemeral: true,
      });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", ephemeral: true });
    if (info.claimed)
      return interaction.reply({
        content: `❌ هذا التيكت مكلايم بالفعل من <@${info.claimedBy}>.`,
        ephemeral: true,
      });

    info.claimed   = true;
    info.claimedBy = member.id;
    setTicket(channel.id, info);

    await channel.setName(`🟡-${member.user.username}-${info.ticketNumber}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`🟡 تم الكلايم من قِبل ${member}`)
          .setColor(0xfee75c),
      ],
    });
  }

  // ── قفل التيكت ───────────────────────────────────────────────────────────────
  if (customId === "lock_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه القفل.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", ephemeral: true });
    if (info.locked) return interaction.reply({ content: "❌ التيكت مقفل بالفعل.", ephemeral: true });

    // رسالة تأكيد
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_lock")
        .setLabel("نعم، قفل التيكت")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_lock")
        .setLabel("إلغاء")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ تأكيد القفل")
          .setDescription(
            "هل أنت متأكد من قفل هذا التيكت؟\n\n" +
            "• سيفقد فاتح التيكت **الوصول الكامل** للقناة\n" +
            "• سيتم حفظ سجل المحادثة في الأرشيف\n" +
            "• سيظهر زر **الإغلاق النهائي** بعد القفل"
          )
          .setColor(0xfee75c),
      ],
      components: [confirmRow],
      ephemeral: true,
    });
  }

  // ── تأكيد القفل ──────────────────────────────────────────────────────────────
  if (customId === "confirm_lock") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ غير مصرح.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ التيكت غير موجود.", ephemeral: true });

    await interaction.deferUpdate();

    // سحب كامل الصلاحيات من فاتح التيكت
    await channel.permissionOverwrites.edit(info.userId, {
      ViewChannel:        false,
      SendMessages:       false,
      ReadMessageHistory: false,
    }).catch(() => {});

    info.locked      = true;
    info.channelName = channel.name;
    setTicket(channel.id, info);

    // بناء السجل وإرساله للأرشيف
    const html = await buildTranscript(channel, info, guild);
    await sendToArchive(html, info, member, guild, "🔒 مقفل");

    // تحديث الأزرار — يظهر الإغلاق الآن
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("كلايم")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(info.claimed),
      new ButtonBuilder()
        .setCustomId("unlock_ticket")
        .setLabel("فتح القفل")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("إغلاق التيكت")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 تم قفل التيكت")
          .setDescription(
            `تم قفل هذا التيكت من قِبل ${member}.\n\n` +
            `• <@${info.userId}> فقد الوصول للقناة\n` +
            `• تم حفظ سجل المحادثة في الأرشيف\n` +
            `• استخدم **إغلاق التيكت** للإغلاق النهائي وحذف القناة`
          )
          .setColor(0xed4245)
          .setTimestamp(),
      ],
      components: [row],
    });
  }

  // ── إلغاء القفل ──────────────────────────────────────────────────────────────
  if (customId === "cancel_lock") {
    await interaction.update({
      embeds: [new EmbedBuilder().setDescription("✅ تم إلغاء القفل.").setColor(0x57f287)],
      components: [],
    });
  }

  // ── فتح القفل ────────────────────────────────────────────────────────────────
  if (customId === "unlock_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه فتح القفل.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return;

    // إرجاع الصلاحيات لفاتح التيكت
    await channel.permissionOverwrites.edit(info.userId, {
      ViewChannel:        true,
      SendMessages:       true,
      ReadMessageHistory: true,
      AttachFiles:        true,
    }).catch(() => {});

    info.locked = false;
    setTicket(channel.id, info);

    // إرجاع الأزرار الأصلية بدون زر الإغلاق
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("كلايم")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(info.claimed),
      new ButtonBuilder()
        .setCustomId("lock_ticket")
        .setLabel("قفل التيكت")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`🔓 تم فتح القفل من قِبل ${member}. أُعيد وصول فاتح التيكت.`)
          .setColor(0x57f287),
      ],
      components: [row],
    });
  }

  // ── إغلاق التيكت ─────────────────────────────────────────────────────────────
  if (customId === "close_ticket") {
    if (!isSupport(member))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الإغلاق.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ هذه القناة ليست تيكتاً.", ephemeral: true });

    // يجب القفل أولاً
    if (!info.locked)
      return interaction.reply({
        content: "❌ يجب **قفل** التيكت أولاً قبل الإغلاق النهائي. استخدم زر 🔒 القفل.",
        ephemeral: true,
      });

    await interaction.deferReply();

    info.channelName = channel.name;
    const html = await buildTranscript(channel, info, guild);
    const buf  = Buffer.from(html, "utf8");

    // إرسال السجل للشخص الفاتح عبر DM
    try {
      const opener = await client.users.fetch(info.userId);
      const file   = new AttachmentBuilder(buf, { name: `ticket-${info.ticketNumber}.html` });

      await opener.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋 سجل تيكتك #${info.ticketNumber}`)
            .setDescription(
              `تم إغلاق تيكتك في **${guild.name}**.\n` +
              `سجل المحادثة الكامل مرفق أدناه.\n\n` +
              `افتح ملف HTML بأي متصفح لعرضه.`
            )
            .setColor(0x5865f2)
            .addFields(
              { name: "🏠 السيرفر", value: guild.name, inline: true },
              { name: "👮 أُغلق بواسطة", value: member.user.username, inline: true },
              { name: "📅 وقت الإغلاق", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
              { name: "⏱️ المدة", value: `${Math.round((Date.now() - info.createdAt) / 60000)} دقيقة`, inline: true }
            )
            .setTimestamp(),
        ],
        files: [file],
      });
    } catch {
      console.log("[DM] المستخدم أغلق الرسائل الخاصة.");
    }

    // حفظ السجل في الأرشيف
    await sendToArchive(html, info, member, guild, "📁 مغلق");

    info.closed = true;
    removeTicket(channel.id);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription("✅ تم إرسال السجل. سيتم حذف القناة خلال **5 ثوانٍ**.")
          .setColor(0xed4245),
      ],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(config.token);
