import { NextRequest, NextResponse } from 'next/server';

export const config = {
  runtime: 'edge',
};

const kanalMap: Record<string, string> = {
  // Buraya kanal isimlerini ve gerçek URL'lerini ekle
  'ornekkanal': 'https://trox.cinemax6.com:3545/stream/play.m3u8',
  'haber': 'https://baska-bir-url.com/playlist.m3u8',
  // İstediğin kadar ekle, yoksa hardcoded yerine config'den çekebilirsin
  // Eğer tek kanal ise if ile de kontrol edebilirsin
};

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.pathname.split('/').pop()?.replace('.m3u8', '');
  
  if (!channel) {
    return new NextResponse('Kanal adı eksik', { status: 400 });
  }

  const targetUrl = kanalMap[channel.toLowerCase()];
  if (!targetUrl) {
    return new NextResponse(`Bilinmeyen kanal: ${channel}`, { status: 404 });
  }

  try {
    const target = new URL(targetUrl);
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (compatible; Proxy)',
        // Gerekirse: 'Referer': 'https://senin-siten.com',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return new NextResponse(`Kaynak hata: ${response.status}`, { status: response.status });
    }

    let body: BodyInit = response.body!;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('m3u8')) {
      let playlist = await response.text();

      // Playlist içindeki tüm .ts, .m3u8, key vs. linkleri proxy üzerinden geçir
      // Relative yolları absolute yapıp proxy prefix ekle
      const proxyPrefix = req.nextUrl.origin + req.nextUrl.pathname.replace(/\/[^/]+\.m3u8$/, '/');

      playlist = playlist.replace(
        /(^[^#].*?\.(m3u8|ts|aac|key|(?:[a-z0-9]{8,}))(?:\?.*)?)/gmi,
        (match) => {
          let absUrl: string;
          if (match.startsWith('http')) {
            absUrl = match.split('?')[0]; // query varsa temizle, gerekirse ayrı yönet
          } else {
            absUrl = new URL(match.split('?')[0], target).href;
          }
          // Clean URL: /kanaladi/segment.ts şeklinde olsun
          return proxyPrefix + absUrl.replace(/^https?:\/\/[^/]+\//, '');
          // Alternatif: eğer orijinalde path varsa onu koru
        }
      );

      // Relative yollar için ekstra replace (eğer varsa ../ veya ./)
      playlist = playlist.replace(
        /^([^#][^h][^t][^t][^p].*?\.(ts|m3u8|key))/gm,
        proxyPrefix + '$1'
      );

      body = playlist;
    }

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
    headers.set('Content-Type', contentType || 'application/vnd.apple.mpegurl');

    return new NextResponse(body, {
      status: response.status,
      headers,
    });

  } catch (err) {
    console.error(err);
    return new NextResponse('Proxy hatası', { status: 502 });
  }
}
