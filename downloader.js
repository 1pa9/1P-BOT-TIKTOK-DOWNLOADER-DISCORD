const https = require('https');
const http = require('http');

/**
 * Download video atau audio dari TikTok menggunakan API publik
 * @param {string} url - URL TikTok
 * @param {string} type - 'video' atau 'audio'
 * @returns {Promise<object>} - Hasil download
 */
async function downloadTikTok(url, type = 'video') {
  try {
    // Resolve URL pendek (vm.tiktok.com, vt.tiktok.com)
    const resolvedUrl = await resolveRedirect(url);
    console.log(`[Downloader] URL: ${resolvedUrl}, Type: ${type}`);

    // Ambil data dari API tikwm.com (API publik, gratis)
    const apiData = await fetchTikTokAPI(resolvedUrl);

    if (!apiData || apiData.code !== 0) {
      return { success: false, error: 'Gagal mengambil data dari TikTok. Video mungkin privat atau URL tidak valid.' };
    }

    const videoData = apiData.data;
    const author = videoData.author?.nickname || videoData.author?.unique_id || 'Unknown';
    const description = videoData.title || '';
    const thumbnail = videoData.cover || videoData.origin_cover || null;

    let downloadUrl;
    let filename;

    if (type === 'audio') {
      // Unduh audio/musik
      downloadUrl = videoData.music_info?.play || videoData.music?.play;
      if (!downloadUrl) {
        return { success: false, error: 'Audio tidak tersedia untuk video ini.' };
      }
      const musicTitle = videoData.music_info?.title || videoData.music?.title || 'audio';
      filename = sanitizeFilename(`${author}_${musicTitle}.mp3`);
    } else {
      // Unduh video tanpa watermark
      downloadUrl = videoData.play || videoData.wmplay;
      if (!downloadUrl) {
        return { success: false, error: 'URL video tidak ditemukan.' };
      }
      filename = sanitizeFilename(`${author}_tiktok_${Date.now()}.mp4`);
    }

    // Download file sebagai buffer
    console.log(`[Downloader] Mengunduh dari: ${downloadUrl}`);
    const { buffer, size } = await downloadBuffer(downloadUrl);

    return {
      success: true,
      buffer,
      filename,
      size,
      author,
      description,
      thumbnail,
      directUrl: downloadUrl,
    };

  } catch (error) {
    console.error('[Downloader] Error:', error.message);
    return { success: false, error: `Gagal mengunduh: ${error.message}` };
  }
}

/**
 * Ambil data TikTok dari tikwm.com API
 */
async function fetchTikTokAPI(url) {
  return new Promise((resolve, reject) => {
    const encodedUrl = encodeURIComponent(url);
    const apiUrl = `https://www.tikwm.com/api/?url=${encodedUrl}&hd=1`;

    https.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Gagal parse response API'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Resolve URL redirect (vm.tiktok.com -> www.tiktok.com)
 */
async function resolveRedirect(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return resolve(url);

    const lib = url.startsWith('https') ? https : http;
    lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        resolveRedirect(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      } else {
        resolve(url);
      }
      res.destroy(); // Tutup koneksi
    }).on('error', () => resolve(url)); // Jika error, kembalikan URL asli
  });
}

/**
 * Download URL sebagai Buffer
 */
async function downloadBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Terlalu banyak redirect'));

    const lib = url.startsWith('https') ? https : http;
    lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
    }, (res) => {
      // Ikuti redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        res.destroy();
        return;
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, size: buffer.length });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Format bytes menjadi string yang mudah dibaca
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Bersihkan nama file dari karakter tidak valid
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100); // Batasi panjang nama file
}

module.exports = { downloadTikTok, formatBytes };
