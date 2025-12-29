import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Helper function for simple fetch-based scraping (faster for simple sites)
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

    // Check if page requires JavaScript (common indicators)
    if (html.includes('Please enable JavaScript') ||
        html.includes('challenge') ||
        html.length < 5000) {
      return null; // Need headless browser
    }

    return extractImageFromHtml(html, url);
  } catch {
    return null;
  }
}

// Extract image URL from HTML content
function extractImageFromHtml(html: string, baseUrl: string): string | null {
  let imageUrl: string | null = null;

  // Strategy 1: Open Graph image
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
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
          const data = JSON.parse(jsonContent);
          const schemas = Array.isArray(data) ? data : [data];
          for (const schema of schemas) {
            if (schema['@type'] === 'Product' && schema.image) {
              imageUrl = Array.isArray(schema.image) ? schema.image[0] :
                        (typeof schema.image === 'object' ? schema.image.url : schema.image);
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

  // Strategy 4: Common product image patterns
  if (!imageUrl) {
    const patterns = [
      // Data attributes (lazy loading)
      /data-(?:src|zoom|large|main)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i,
      // Srcset first image
      /srcset=["']([^"'\s]+)/i,
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

  // Strategy 5: First reasonable image
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
      const urlObj = new URL(baseUrl);
      imageUrl = urlObj.origin + imageUrl;
    } else if (!imageUrl.startsWith('http')) {
      const urlObj = new URL(baseUrl);
      imageUrl = urlObj.origin + '/' + imageUrl;
    }
  }

  return imageUrl;
}

// Headless browser scraping for JavaScript-heavy sites
async function browserScrape(url: string): Promise<string | null> {
  let browser = null;

  try {
    console.log('Starting headless browser for:', url);

    // Detect environment and configure accordingly
    const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

    let launchOptions;

    if (isVercel) {
      // Serverless environment (Vercel/AWS Lambda)
      const executablePath = await chromium.executablePath();
      launchOptions = {
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: executablePath,
        headless: true,
      };
    } else {
      // Local development - find Chrome on Windows/Mac/Linux
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
      ];

      let chromePath = null;
      for (const p of possiblePaths) {
        try {
          const fs = await import('fs');
          if (fs.existsSync(p)) {
            chromePath = p;
            break;
          }
        } catch {}
      }

      if (!chromePath) {
        console.log('Chrome not found locally, skipping browser scrape');
        return null;
      }

      launchOptions = {
        executablePath: chromePath,
        headless: true,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      };
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to find product image using multiple methods
    const imageUrl = await page.evaluate(() => {
      // Method 1: OG image meta tag
      const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (ogImage?.content) return ogImage.content;

      // Method 2: Twitter image
      const twitterImage = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement;
      if (twitterImage?.content) return twitterImage.content;

      // Method 3: JSON-LD schema
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent || '');
          const schemas = Array.isArray(data) ? data : [data];
          for (const schema of schemas) {
            if (schema['@type'] === 'Product' && schema.image) {
              const img = Array.isArray(schema.image) ? schema.image[0] : schema.image;
              return typeof img === 'object' ? img.url : img;
            }
          }
        } catch {}
      }

      // Method 4: Find largest visible image (likely product image)
      const images = Array.from(document.querySelectorAll('img'));
      let largestImage = null;
      let largestArea = 0;

      for (const img of images) {
        const rect = img.getBoundingClientRect();
        const area = rect.width * rect.height;
        const src = img.src || img.dataset.src || img.dataset.zoom || '';

        // Skip small images, icons, tracking pixels
        if (area > largestArea &&
            area > 10000 && // Minimum 100x100
            src &&
            !src.includes('icon') &&
            !src.includes('logo') &&
            !src.includes('favicon') &&
            !src.includes('placeholder') &&
            !src.includes('1x1') &&
            !src.includes('tracking')) {
          largestArea = area;
          largestImage = src;
        }
      }

      return largestImage;
    });

    return imageUrl;

  } catch (error) {
    console.error('Browser scrape error:', error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
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

    // First try simple fetch (faster)
    let imageUrl = await simpleScrape(url);

    // If simple scrape failed, use headless browser
    if (!imageUrl) {
      console.log('Simple scrape failed, trying headless browser...');
      imageUrl = await browserScrape(url);
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
