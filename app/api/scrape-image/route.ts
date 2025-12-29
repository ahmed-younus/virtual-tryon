import { NextRequest, NextResponse } from 'next/server';

// Extract image URL from HTML content
function extractImageFromHtml(html: string, baseUrl: string): string | null {
  let imageUrl: string | null = null;

  // Strategy 1: Open Graph image (most reliable)
  const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
  if (ogImageMatch) {
    imageUrl = ogImageMatch[1];
  }

  // Strategy 2: Twitter card image
  if (!imageUrl) {
    const twitterImageMatch = html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
                              html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image["']/i);
    if (twitterImageMatch) {
      imageUrl = twitterImageMatch[1];
    }
  }

  // Strategy 3: JSON-LD product schema
  if (!imageUrl) {
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match[1];
        const data = JSON.parse(jsonContent);
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          if (schema['@type'] === 'Product' && schema.image) {
            imageUrl = Array.isArray(schema.image) ? schema.image[0] :
                      (typeof schema.image === 'object' ? schema.image.url : schema.image);
            break;
          }
          // Check @graph array
          if (schema['@graph']) {
            for (const node of schema['@graph']) {
              if (node['@type'] === 'Product' && node.image) {
                const img = Array.isArray(node.image) ? node.image[0] : node.image;
                imageUrl = typeof img === 'object' ? img.url : img;
                break;
              }
            }
          }
        }
        if (imageUrl) break;
      } catch {
        // Invalid JSON, continue
      }
    }
  }

  // Strategy 4: Data attributes (lazy loading)
  if (!imageUrl) {
    const dataPatterns = [
      /data-src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i,
      /data-zoom-image=["']([^"']+)/i,
      /data-large-image=["']([^"']+)/i,
      /data-original=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i,
    ];
    for (const pattern of dataPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        imageUrl = match[1];
        break;
      }
    }
  }

  // Strategy 5: Common product image patterns
  if (!imageUrl) {
    const patterns = [
      // Product/main/hero image classes
      /<img[^>]*class=["'][^"']*(?:product|main|primary|hero|gallery)[^"']*["'][^>]*src=["']([^"']+)["']/i,
      // Image with product in src
      /<img[^>]*src=["']([^"']*(?:product|item|goods)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
      // Large images (often products)
      /<img[^>]*src=["']([^"']+(?:large|zoom|main|full|1200|1000|800)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        imageUrl = match[1];
        break;
      }
    }
  }

  // Strategy 6: First reasonable image
  if (!imageUrl) {
    const imgMatches = html.matchAll(/<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi);
    for (const match of imgMatches) {
      const src = match[1];
      if (src &&
          !src.includes('icon') &&
          !src.includes('logo') &&
          !src.includes('favicon') &&
          !src.includes('placeholder') &&
          !src.includes('1x1') &&
          !src.includes('sprite') &&
          !src.includes('tracking') &&
          !src.includes('pixel') &&
          !src.startsWith('data:') &&
          (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
        imageUrl = src;
        break;
      }
    }
  }

  // Make URL absolute
  if (imageUrl) {
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      try {
        const urlObj = new URL(baseUrl);
        imageUrl = urlObj.origin + imageUrl;
      } catch {
        return null;
      }
    } else if (!imageUrl.startsWith('http')) {
      try {
        const urlObj = new URL(baseUrl);
        imageUrl = urlObj.origin + '/' + imageUrl;
      } catch {
        return null;
      }
    }
  }

  return imageUrl;
}

// Simple fetch-based scraping
async function simpleScrape(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractImageFromHtml(html, url);
  } catch {
    return null;
  }
}

// Try with mobile user agent as fallback
async function mobileScrape(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractImageFromHtml(html, url);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log('Scraping product image from:', url);

    // Try desktop scrape first
    let imageUrl = await simpleScrape(url);

    // If failed, try mobile user agent
    if (!imageUrl) {
      console.log('Desktop scrape failed, trying mobile...');
      imageUrl = await mobileScrape(url);
    }

    if (!imageUrl) {
      return NextResponse.json(
        {
          error: 'Could not find product image on this page. Try copying the image URL directly (right-click on image > Copy image address).',
          suggestion: 'Some websites have strong anti-bot protection. You can manually copy the image URL from the website.'
        },
        { status: 404 }
      );
    }

    console.log('Found image URL:', imageUrl);

    // Fetch the image and convert to base64
    try {
      const imageResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': url,
          'Accept': 'image/*',
        },
      });

      if (imageResponse.ok) {
        const imageBuffer = await imageResponse.arrayBuffer();
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const base64Image = `data:${contentType};base64,${Buffer.from(imageBuffer).toString('base64')}`;

        return NextResponse.json({
          imageUrl,
          base64Image,
          message: 'Successfully extracted product image!',
        });
      }
    } catch (fetchError) {
      console.log('Could not fetch image directly:', fetchError);
    }

    // If we can't fetch the image, just return the URL
    return NextResponse.json({
      imageUrl,
      message: 'Found image URL. If it doesn\'t load, try copying the image directly from the website.',
    });

  } catch (error) {
    console.error('Error scraping image:', error);
    return NextResponse.json(
      {
        error: 'Failed to scrape product image',
        details: error instanceof Error ? error.message : String(error),
        suggestion: 'Try copying the image URL directly from the product page (right-click on image > Copy image address)'
      },
      { status: 500 }
    );
  }
}
