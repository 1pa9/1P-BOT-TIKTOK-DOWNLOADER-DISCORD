require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { downloadTikTok, formatBytes } = require('./downloader');

const P1 = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TIKTOK_REGEX = /https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\S*/gi;

P1.once('ready', () => {
  console.log(` Bot aktif sebagai ${P1.user.tag}`);
  P1.user.setActivity('TikTok Downloader | !tt help', { type: 'WATCHING' });
});

P1.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // === COMMAND: !tt help ===
  if (content === '!tt help') {
    const embed = new EmbedBuilder()
      .setColor('#69C9D0')
      .setTitle(' TikTok Downloader Bot')
      .setDescription('Download video dan audio dari TikTok Doang')
      .addFields(
        { name: ' Download Video', value: '`!mp4 <url_tiktok>`\nContoh: `!tt https://www.tiktok.com/@user/video/123`', inline: false },
        { name: ' Download Audio', value: '`!mp3 <url_tiktok>`\nContoh: `!tta https://vm.tiktok.com/abc`', inline: false },
        { name: ' Auto-Detect', value: 'Paste URL TikTok langsung di chat, bot akan otomatis mendeteksinya', inline: false },
        { name: ' Perintah Lain', value: '`!tt help` - Menampilkan list command\n`!tt ping` - Cek latensi bot', inline: false },
      )
      .setFooter({ text: 'TikTok Downloader Bot • Made by 1PA9' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === COMMAND: !tt ping ===
  if (content === '!tt ping') {
    const latency = Date.now() - message.createdTimestamp;
    return message.reply(` Latensi: **${latency}ms** | API: **${P1.ws.ping}ms**`);
  }

  // === COMMAND: !tt <url> (download video) ===
  if (content.startsWith('!mp4 ')) {
    const url = content.slice(4).trim();
    return handleDownload(message, url, 'video');
  }

  // === COMMAND: !tta <url> (download audio) ===
  if (content.startsWith('!mp3 ')) {
    const url = content.slice(5).trim();
    return handleDownload(message, url, 'audio');
  }

  // === AUTO-DETECT TikTok URL ===
  const urls = content.match(TIKTOK_REGEX);
  if (urls && urls.length > 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dl_video_${urls[0]}`)
        .setLabel(' Download Video')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`dl_audio_${urls[0]}`)
        .setLabel(' Download Audio')
        .setStyle(ButtonStyle.Secondary),
    );

    const embed = new EmbedBuilder()
      .setColor('#69C9D0')
      .setDescription(` URL TikTok terdeteksi! Mau download apa?`)
      .setFooter({ text: 'Akan kedaluwarsa dalam 60 detik' });

    const reply = await message.reply({ embeds: [embed], components: [row] });

    // Hapus tombol setelah 60 detik
    setTimeout(() => {
      reply.edit({ components: [] }).catch(() => {});
    }, 60000);
  }
});

// === HANDLE BUTTON ===
P1.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, type, ...urlParts] = interaction.customId.split('_');
  if (action !== 'dl') return;

  const url = urlParts.join('_');
  await interaction.deferReply();
  await processDownload(interaction, url, type, true);
});

// === FUNGSI HANDLE DOWNLOAD ===
async function handleDownload(message, url, type) {
  if (!url || !url.startsWith('http')) {
    return message.reply(' URL tidak valid! Contoh: `!tt https://www.tiktok.com/@user/video/123`');
  }

  if (!TIKTOK_REGEX.test(url)) {
    TIKTOK_REGEX.lastIndex = 0;
    return message.reply(' Bukan URL TikTok yang valid!');
  }
  TIKTOK_REGEX.lastIndex = 0;

  const loadingEmbed = new EmbedBuilder()
    .setColor('#FFA500')
    .setDescription(` Mengunduh ${type === 'video' ? 'video' : 'audio'}... Mohon tunggu.`);

  const reply = await message.reply({ embeds: [loadingEmbed] });
  await processDownload(reply, url, type, false);
}

// === FUNGSI PROSES DOWNLOAD ===
async function processDownload(target, url, type, isInteraction) {
  try {
    const result = await downloadTikTok(url, type);

    if (!result.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(' Gagal Mengunduh')
        .setDescription(result.error || 'Terjadi kesalahan tidak diketahui.')
        .addFields({ name: '💡 Tips', value: 'Pastikan URL benar dan video tidak bersifat privat.' });

      if (isInteraction) return target.editReply({ embeds: [errorEmbed] });
      return target.edit({ embeds: [errorEmbed] });
    }

    const { buffer, filename, size, author, description, thumbnail } = result;

    // Cek ukuran file (Discord limit = 25MB untuk non-Nitro)
    if (size > 25 * 1024 * 1024) {
      const tooBigEmbed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(' File Terlalu Besar')
        .setDescription(`Ukuran file **${formatBytes(size)}** melebihi batas Discord (25MB).`)
        .addFields({ name: '🔗 Link Langsung', value: result.directUrl || 'Tidak tersedia' });

      if (isInteraction) return target.editReply({ embeds: [tooBigEmbed] });
      return target.edit({ embeds: [tooBigEmbed] });
    }

    const attachment = new AttachmentBuilder(buffer, { name: filename });

    const successEmbed = new EmbedBuilder()
      .setColor('#00C853')
      .setTitle(` ${type === 'video' ? '📹 Video' : '🎵 Audio'} Berhasil Diunduh`)
      .addFields(
        { name: ' Pembuat', value: author || 'Tidak diketahui', inline: true },
        { name: ' Ukuran', value: formatBytes(size), inline: true },
        { name: ' Deskripsi', value: description ? description.slice(0, 200) + (description.length > 200 ? '...' : '') : 'Tidak ada', inline: false },
      )
      .setFooter({ text: 'TikTok Downloader Bot' })
      .setTimestamp();

    if (thumbnail && type === 'video') successEmbed.setThumbnail(thumbnail);

    if (isInteraction) {
      return target.editReply({ embeds: [successEmbed], files: [attachment] });
    }
    return target.edit({ embeds: [successEmbed], files: [attachment] });

  } catch (error) {
    console.error('Download error:', error);
    const errEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(' Error')
      .setDescription(`Terjadi kesalahan: ${error.message}`);

    if (isInteraction) return target.editReply({ embeds: [errEmbed] });
    return target.edit({ embeds: [errEmbed] });
  }
}

// Login bot
P1.login(process.env.DISCORD_TOKEN);
