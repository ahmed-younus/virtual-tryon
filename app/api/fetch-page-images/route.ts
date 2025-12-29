import { NextRequest, NextResponse } from 'next/server';

// Helper to normalize and filter image URLs
function processImageUrl(imgUrl: string, baseUrl: string, seenUrls: Set<string>): string | null {
  if (!imgUrl || seenUrls.has(imgUrl)) return null;

  // Skip small images, icons, tracking pixels
  const skipPatterns = [
    'icon', 'logo', 'favicon', 'sprite', 'pixel', 'tracking',
    'spacer', 'blank', '1x1', 'badge', 'button',
    'arrow', 'loading', 'spinner', 'avatar', 'emoji', 'flag',
    'social', 'share', 'facebook', 'twitter', 'instagram', 'pinterest',
    'payment', 'visa', 'mastercard', 'paypal', 'amex',
    'placeholder', 'transparent', 'gradient'
  ];

  const lowerUrl = imgUrl.toLowerCase();
  if (skipPatterns.some(p => lowerUrl.includes(p))) return null;

  // Skip data URIs that are too small (likely placeholders)
  if (imgUrl.startsWith('data:') && imgUrl.length < 500) return null;

  // Make URL absolute
  let absoluteUrl = imgUrl;
  if (imgUrl.startsWith('//')) {
    absoluteUrl = 'https:' + imgUrl;
  } else if (imgUrl.startsWith('/')) {
    try {
      const urlObj = new URL(baseUrl);
      absoluteUrl = urlObj.origin + imgUrl;
    } catch {
      return null;
    }
  } else if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
    try {
      const urlObj = new URL(baseUrl);
      absoluteUrl = urlObj.origin + '/' + imgUrl;
    } catch {
      return null;
    }
  }

  // Skip if already seen
  if (seenUrls.has(absoluteUrl)) return null;
  seenUrls.add(absoluteUrl);

  return absoluteUrl;
}

// Extract high-resolution image URL from srcset or URL patterns
function getHighResUrl(imgUrl: string): string {
  // Remove size parameters to get higher res versions
  let highRes = imgUrl
    .replace(/[\?&]w=\d+/g, '')
    .replace(/[\?&]h=\d+/g, '')
    .replace(/[\?&]width=\d+/g, '')
    .replace(/[\?&]height=\d+/g, '')
    .replace(/[\?&]size=\w+/g, '')
    .replace(/_\d+x\d+\./g, '.')
    .replace(/-\d+x\d+\./g, '.')
    .replace(/\/\d+x\d+\//g, '/')
    .replace(/\?.*$/, ''); // Remove all query params for cleaner URL

  // For Zara specifically
  if (imgUrl.includes('zara.com')) {
    highRes = imgUrl
      .replace(/\/w\/\d+\//g, '/w/1920/')
      .replace(/\?ts=.*$/, '');
  }

  // For H&M
  if (imgUrl.includes('hm.com') || imgUrl.includes('hmgroup')) {
    highRes = imgUrl.replace(/\?.*$/, '');
  }

  return highRes || imgUrl;
}

// Simple HTML-based scraping
async function simpleScrape(url: string): Promise<string[]> {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) return images;

    const html = await response.text();

    const addImage = (imgUrl: string) => {
      const processed = processImageUrl(imgUrl, url, seenUrls);
      if (processed) {
        const highRes = getHighResUrl(processed);
        if (!seenUrls.has(highRes)) {
          images.push(highRes);
          seenUrls.add(highRes);
        }
      }
    };

    // 1. Extract OG image (usually the main product image)
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch) addImage(ogMatch[1]);

    // 2. Extract Twitter image
    const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (twitterMatch) addImage(twitterMatch[1]);

    // 3. Extract from JSON-LD schema (very reliable for e-commerce)
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          // Handle Product schema
          if (schema['@type'] === 'Product' && schema.image) {
            const imgs = Array.isArray(schema.image) ? schema.image : [schema.image];
            for (const img of imgs) {
              const imgUrl = typeof img === 'object' ? (img.url || img.contentUrl) : img;
              if (imgUrl) addImage(imgUrl);
            }
          }
          // Handle ItemList (product listings)
          if (schema['@type'] === 'ItemList' && schema.itemListElement) {
            for (const item of schema.itemListElement) {
              if (item.image) addImage(typeof item.image === 'object' ? item.image.url : item.image);
            }
          }
          // Handle @graph array
          if (schema['@graph']) {
            for (const node of schema['@graph']) {
              if (node['@type'] === 'Product' && node.image) {
                const imgs = Array.isArray(node.image) ? node.image : [node.image];
                for (const img of imgs) {
                  const imgUrl = typeof img === 'object' ? img.url : img;
                  if (imgUrl) addImage(imgUrl);
                }
              }
            }
          }
        }
      } catch {}
    }

    // 4. Extract from data attributes commonly used by e-commerce sites
    const dataPatterns = [
      /data-src=["']([^"']+)["']/gi,
      /data-lazy-src=["']([^"']+)["']/gi,
      /data-original=["']([^"']+)["']/gi,
      /data-zoom-image=["']([^"']+)["']/gi,
      /data-large-image=["']([^"']+)["']/gi,
      /data-image=["']([^"']+)["']/gi,
      /data-full-size-image-url=["']([^"']+)["']/gi,
    ];

    for (const pattern of dataPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match[1].includes('.jpg') || match[1].includes('.jpeg') ||
            match[1].includes('.png') || match[1].includes('.webp')) {
          addImage(match[1]);
        }
      }
    }

    // 5. Extract regular img src
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const match of imgMatches) {
      const src = match[1];
      // Only add if it looks like a product image (has common image extensions)
      if (src.match(/\.(jpg|jpeg|png|webp)/i)) {
        addImage(src);
      }
    }

    // 6. Extract from srcset (high-res images)
    const srcsetMatches = html.matchAll(/srcset=["']([^"']+)["']/gi);
    for (const match of srcsetMatches) {
      const srcset = match[1];
      const parts = srcset.split(',');
      // Get the largest image (usually last)
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1].trim().split(' ')[0];
        if (lastPart) addImage(lastPart);
      }
    }

    // 7. Look for image URLs in JavaScript/JSON data
    const jsImageMatches = html.matchAll(/"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
    for (const match of jsImageMatches) {
      // Filter for likely product images (usually larger URLs with product-like patterns)
      const imgUrl = match[1];
      if (imgUrl.includes('product') || imgUrl.includes('media') ||
          imgUrl.includes('image') || imgUrl.includes('photo') ||
          imgUrl.includes('catalog') || imgUrl.includes('asset')) {
        addImage(imgUrl);
      }
    }

    return images;
  } catch (error) {
    console.error('Simple scrape error:', error);
    return images;
  }
}

// Try multiple approaches to get images
async function fetchImagesWithFallbacks(url: string): Promise<string[]> {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  // 1. Try direct scraping first
  const directImages = await simpleScrape(url);
  for (const img of directImages) {
    if (!seenUrls.has(img)) {
      images.push(img);
      seenUrls.add(img);
    }
  }

  // 2. If not enough images, try with mobile user agent (some sites serve different content)
  if (images.length < 3) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.ok) {
        const html = await response.text();

        // Extract images from mobile version
        const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
        for (const match of imgMatches) {
          const processed = processImageUrl(match[1], url, seenUrls);
          if (processed && !seenUrls.has(processed)) {
            images.push(getHighResUrl(processed));
            seenUrls.add(processed);
          }
        }
      }
    } catch {}
  }

  return images;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('Fetching images from:', url);

    const images = await fetchImagesWithFallbacks(url);

    console.log(`Found ${images.length} images total`);

    // Return unique images, limited to 30
    const uniqueImages = [...new Set(images)];

    return NextResponse.json({
      images: uniqueImages.slice(0, 30),
      total: uniqueImages.length,
    });

  } catch (error) {
    console.error('Error fetching page images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images', images: [] },
      { status: 200 }
    );
  }
}
