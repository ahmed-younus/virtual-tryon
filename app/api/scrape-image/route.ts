import { NextRequest, NextResponse } from 'next/server';

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

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

    // Try multiple strategies to find product image
    let imageUrl: string | null = null;

    // Strategy 1: Open Graph image (most reliable for product pages)
    const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
    if (ogImageMatch) {
      imageUrl = ogImageMatch[1];
      console.log('Found OG image:', imageUrl);
    }

    // Strategy 2: Twitter card image
    if (!imageUrl) {
      const twitterImageMatch = html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
                                html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image["']/i);
      if (twitterImageMatch) {
        imageUrl = twitterImageMatch[1];
        console.log('Found Twitter image:', imageUrl);
      }
    }

    // Strategy 3: JSON-LD product schema
    if (!imageUrl) {
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      if (jsonLdMatch) {
        for (const match of jsonLdMatch) {
          try {
            const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
            const data = JSON.parse(jsonContent);

            // Handle array of schemas
            const schemas = Array.isArray(data) ? data : [data];
            for (const schema of schemas) {
              if (schema['@type'] === 'Product' && schema.image) {
                imageUrl = Array.isArray(schema.image) ? schema.image[0] : schema.image;
                console.log('Found JSON-LD product image:', imageUrl);
                break;
              }
            }
            if (imageUrl) break;
          } catch {
            // Invalid JSON, continue
          }
        }
      }
    }

    // Strategy 4: Main product image patterns (common e-commerce sites)
    if (!imageUrl) {
      const productImagePatterns = [
        /<img[^>]*class=["'][^"']*(?:product|main|primary|hero)[^"']*["'][^>]*src=["']([^"']+)["']/i,
        /<img[^>]*id=["'][^"']*(?:product|main|primary)[^"']*["'][^>]*src=["']([^"']+)["']/i,
        /<img[^>]*data-src=["']([^"']+)["'][^>]*class=["'][^"']*product/i,
        /<img[^>]*src=["']([^"']+)["'][^>]*alt=["'][^"']*product/i,
      ];

      for (const pattern of productImagePatterns) {
        const match = html.match(pattern);
        if (match) {
          imageUrl = match[1];
          console.log('Found product image via pattern:', imageUrl);
          break;
        }
      }
    }

    // Strategy 5: First large image in the page
    if (!imageUrl) {
      const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
      for (const match of imgMatches) {
        const src = match[1];
        // Skip small images, icons, logos
        if (src &&
            !src.includes('icon') &&
            !src.includes('logo') &&
            !src.includes('favicon') &&
            !src.includes('placeholder') &&
            !src.includes('1x1') &&
            !src.includes('sprite') &&
            (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
          imageUrl = src;
          console.log('Found first valid image:', imageUrl);
          break;
        }
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Could not find product image on this page' },
        { status: 404 }
      );
    }

    // Make URL absolute if it's relative
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      const urlObj = new URL(url);
      imageUrl = urlObj.origin + imageUrl;
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': url,
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json({
        imageUrl,
        message: 'Found image URL but could not fetch it directly. Use the URL in the cloth image field.',
      });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const base64Image = `data:${contentType};base64,${Buffer.from(imageBuffer).toString('base64')}`;

    return NextResponse.json({
      imageUrl,
      base64Image,
      message: 'Successfully extracted product image!',
    });

  } catch (error) {
    console.error('Error scraping image:', error);
    return NextResponse.json(
      {
        error: 'Failed to scrape product image',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
