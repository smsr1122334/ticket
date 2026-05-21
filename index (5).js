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
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ─── Config من Environment Variables (Railway) ─────────────────────────────────
const config = {
  token:            process.env.TOKEN,
  supportRoleId:    process.env.SUPPORT_ROLE_ID,
  categoryId:       process.env.CATEGORY_ID       || null,
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

// ─── Ticket Storage ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "tickets.json");

function load() {
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ counter: 0, tickets: {} }));
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function nextNumber() {
  const d = load();
  d.counter++;
  save(d);
  return d.counter;
}

function setTicket(id, info) {
  const d = load();
  d.tickets[id] = info;
  save(d);
}

function getTicket(id) {
  return load().tickets[id] || null;
}

function removeTicket(id) {
  const d = load();
  delete d.tickets[id];
  save(d);
}

// ─── HTML Transcript ───────────────────────────────────────────────────────────
async function buildTranscript(channel) {
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
    .filter((m) => m.content || m.embeds.length)
    .map((m) => {
      const time = new Date(m.createdTimestamp).toLocaleString("ar-SA");
      const avatar = `<img class="av" src="${m.author.displayAvatarURL({ size: 64 })}" onerror="this.style.display='none'"/>`;
      const embeds = m.embeds.map((e) => `<div class="emb">${e.title ? `<b>${e.title}</b><br>` : ""}${e.description || ""}</div>`).join("");
      return `<div class="msg${m.author.bot ? " bot" : ""}">
        ${avatar}
        <div class="body">
          <div class="top"><span class="name">${m.author.username}</span>${m.author.bot ? `<span class="btag">BOT</span>` : ""}<span class="ts">${time}</span></div>
          ${m.content ? `<div class="txt">${m.content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>` : ""}
          ${embeds}
        </div>
      </div>`;
    }).join("");

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/>
<title>تيكت - ${channel.name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#1a1b2e;color:#c9d1d9;padding:20px}
.hdr{background:linear-gradient(135deg,#2d1b69,#11998e);border-radius:12px;padding:24px;margin-bottom:20px;text-align:center}
.hdr h1{color:#fff;font-size:20px}.hdr p{color:rgba(255,255,255,.7);font-size:13px}
.msgs{display:flex;flex-direction:column;gap:10px}
.msg{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:12px 14px;display:flex;gap:10px}
.msg.bot{background:#161b22;border-color:#388bfd44}
.av{width:36px;height:36px;border-radius:50%;flex-shrink:0}
.body{flex:1}.top{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}
.name{font-weight:700;color:#58a6ff;font-size:14px}
.btag{background:#388bfd;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px}
.ts{color:#6e7681;font-size:11px}
.txt{font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.emb{border-left:4px solid #388bfd;background:#0d1117;border-radius:4px;padding:8px 12px;margin-top:6px}
.ftr{text-align:center;color:#6e7681;font-size:12px;margin-top:24px;padding-top:14px;border-top:1px solid #21262d}
</style></head><body>
<div class="hdr"><h1>📋 سجل التيكت</h1><p>${channel.name} | ${new Date().toLocaleDateString("ar-SA")}</p></div>
<div class="msgs">${rows}</div>
<div class="ftr">تم إنشاؤه تلقائياً بواسطة نظام التيكتات</div>
</body></html>`;
}

// ─── Panel ─────────────────────────────────────────────────────────────────────
async function sendPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 نظام التيكتات")
    .setDescription("لفتح تيكت دعم جديد اضغط على الزر أدناه.\nسيتم إنشاء قناة خاصة بك.")
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
      console.log("خطأ في إرسال البانل:", e.message);
    }
  }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, channel, guild } = interaction;

  // ── فتح تيكت ────────────────────────────────────────────────────────────────
  if (customId === "open_ticket") {
    await interaction.deferReply({ ephemeral: true });

    const d = load();
    const existing = Object.values(d.tickets).find(
      (t) => t.userId === member.id && t.guildId === guild.id && !t.closed
    );
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId);
      return interaction.editReply({ content: `❌ لديك تيكت مفتوح: ${ch || "ticket-" + existing.ticketNumber}` });
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
      .setDescription(`مرحباً ${member}!\n\nتم فتح تيكتك. سيتواصل معك الفريق قريباً.`)
      .setColor(0x57f287)
      .addFields(
        { name: "👤 الفاتح", value: `${member}`, inline: true },
        { name: "🔢 رقم التيكت", value: `#${num}`, inline: true },
        { name: "📅 التاريخ", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("كلايم").setEmoji("🟡").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lock_ticket").setLabel("قفل").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("close_ticket").setLabel("إغلاق").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );

    await tc.send({ content: `${member} | <@&${config.supportRoleId}>`, embeds: [embed], components: [row] });
    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${tc}` });
  }

  // ── كلايم ────────────────────────────────────────────────────────────────────
  if (customId === "claim_ticket") {
    if (!member.roles.cache.has(config.supportRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الكلايم.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ ليس تيكتاً.", ephemeral: true });
    if (info.claimed)
      return interaction.reply({ content: `❌ مكلايم بالفعل من <@${info.claimedBy}>.`, ephemeral: true });

    info.claimed = true;
    info.claimedBy = member.id;
    setTicket(channel.id, info);

    await channel.setName(`🟡-${member.user.username}-${info.ticketNumber}`);

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🟡 تم الكلايم من قِبل ${member}`).setColor(0xfee75c)],
    });
  }

  // ── قفل ──────────────────────────────────────────────────────────────────────
  if (customId === "lock_ticket") {
    if (!member.roles.cache.has(config.supportRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه القفل.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ ليس تيكتاً.", ephemeral: true });

    await interaction.deferReply();

    // منع صاحب التيكت من الكتابة
    await channel.permissionOverwrites.edit(info.userId, { SendMessages: false }).catch(() => {});

    info.locked = true;
    setTicket(channel.id, info);

    // حفظ في الأرشيف
    await archiveTo(channel, info, member, guild, "🔒 تيكت مقفل");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("unlock_ticket").setLabel("فتح القفل").setEmoji("🔓").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close_ticket").setLabel("إغلاق").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(`🔒 تم قفل التيكت من قِبل ${member}`).setColor(0xed4245)],
      components: [row],
    });
  }

  // ── فتح القفل ────────────────────────────────────────────────────────────────
  if (customId === "unlock_ticket") {
    if (!member.roles.cache.has(config.supportRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: "❌ فقط فريق الدعم.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return;

    await channel.permissionOverwrites.edit(info.userId, { SendMessages: true }).catch(() => {});
    info.locked = false;
    setTicket(channel.id, info);

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🔓 تم فتح القفل من قِبل ${member}`).setColor(0x57f287)],
    });
  }

  // ── إغلاق ────────────────────────────────────────────────────────────────────
  if (customId === "close_ticket") {
    if (!member.roles.cache.has(config.supportRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: "❌ فقط فريق الدعم يمكنه الإغلاق.", ephemeral: true });

    const info = getTicket(channel.id);
    if (!info) return interaction.reply({ content: "❌ ليس تيكتاً.", ephemeral: true });

    await interaction.deferReply();

    const html = await buildTranscript(channel);
    const tmpFile = path.join(__dirname, `tmp-${channel.id}.html`);
    fs.writeFileSync(tmpFile, html);

    // إرسال DM لصاحب التيكت
    try {
      const opener = await client.users.fetch(info.userId);
      await opener.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋 سجل تيكتك #${info.ticketNumber}`)
            .setDescription(`تم إغلاق تيكتك في **${guild.name}**.\nبالمرفقات سجل كامل للمحادثة.`)
            .setColor(0x5865f2)
            .addFields(
              { name: "👮 أُغلق بواسطة", value: member.user.username, inline: true },
              { name: "📅 تاريخ الإغلاق", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp(),
        ],
        files: [{ attachment: tmpFile, name: `ticket-${info.ticketNumber}.html` }],
      });
    } catch {
      console.log("⚠️ المستخدم أغلق الـ DM.");
    }

    // حفظ في الأرشيف
    await archiveTo(channel, info, member, guild, "📁 تيكت مغلق", tmpFile);

    fs.unlinkSync(tmpFile);
    info.closed = true;
    removeTicket(channel.id);

    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription("✅ جاري حذف القناة خلال 5 ثوانٍ...").setColor(0xed4245)],
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// ─── Helper: أرسل للأرشيف ─────────────────────────────────────────────────────
async function archiveTo(channel, info, member, guild, title, existingFile = null) {
  if (!config.archiveChannelId) return;
  try {
    const archiveCh = await client.channels.fetch(config.archiveChannelId);

    let tmpFile = existingFile;
    let created = false;
    if (!tmpFile) {
      const html = await buildTranscript(channel);
      tmpFile = path.join(__dirname, `arc-${channel.id}.html`);
      fs.writeFileSync(tmpFile, html);
      created = true;
    }

    await archiveCh.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${title} #${info.ticketNumber}`)
          .setDescription(
            `**الفاتح:** <@${info.userId}>\n**بواسطة:** ${member}\n**المدة:** ${Math.round((Date.now() - info.createdAt) / 60000)} دقيقة`
          )
          .setColor(0x5865f2)
          .setTimestamp(),
      ],
      files: [{ attachment: tmpFile, name: `transcript-${info.ticketNumber}.html` }],
    });

    if (created) fs.unlinkSync(tmpFile);
  } catch (e) {
    console.log("خطأ في الأرشيف:", e.message);
  }
}

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(config.token);
