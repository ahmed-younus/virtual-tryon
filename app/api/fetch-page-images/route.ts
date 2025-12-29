import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Helper to normalize and filter image URLs
function processImageUrl(imgUrl: string, baseUrl: string, seenUrls: Set<string>): string | null {
  if (!imgUrl || seenUrls.has(imgUrl)) return null;

  // Skip small images, icons, tracking pixels
  const skipPatterns = [
    'icon', 'logo', 'favicon', 'sprite', 'pixel', 'tracking',
    'spacer', 'blank', '1x1', 'badge', 'button',
    'arrow', 'loading', 'spinner', 'avatar', 'emoji', 'flag',
    'social', 'share', 'facebook', 'twitter', 'instagram', 'pinterest',
    'payment', 'visa', 'mastercard', 'paypal', 'amex'
  ];

  const lowerUrl = imgUrl.toLowerCase();
  if (skipPatterns.some(p => lowerUrl.includes(p))) return null;

  // Make URL absolute
  let absoluteUrl = imgUrl;
  if (imgUrl.startsWith('//')) {
    absoluteUrl = 'https:' + imgUrl;
  } else if (imgUrl.startsWith('/')) {
    const urlObj = new URL(baseUrl);
    absoluteUrl = urlObj.origin + imgUrl;
  } else if (!imgUrl.startsWith('http')) {
    const urlObj = new URL(baseUrl);
    absoluteUrl = urlObj.origin + '/' + imgUrl;
  }

  // Skip if already seen
  if (seenUrls.has(absoluteUrl)) return null;
  seenUrls.add(absoluteUrl);

  return absoluteUrl;
}

// Simple HTML-based scraping (fast, for static sites)
async function simpleScrape(url: string): Promise<string[]> {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) return images;

    const html = await response.text();

    // Check if page requires JavaScript
    if (html.includes('Please enable JavaScript') ||
        html.includes('__NEXT_DATA__') ||
        html.includes('window.__INITIAL_STATE__') ||
        html.length < 10000) {
      return []; // Will need browser scraping
    }

    const addImage = (imgUrl: string) => {
      const processed = processImageUrl(imgUrl, url, seenUrls);
      if (processed) images.push(processed);
    };

    // Extract OG image
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch) addImage(ogMatch[1]);

    // Extract Twitter image
    const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (twitterMatch) addImage(twitterMatch[1]);

    // Extract from JSON-LD schema
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          if (schema['@type'] === 'Product' && schema.image) {
            const imgs = Array.isArray(schema.image) ? schema.image : [schema.image];
            for (const img of imgs) {
              const imgUrl = typeof img === 'object' ? img.url : img;
              if (imgUrl) addImage(imgUrl);
            }
          }
        }
      } catch {}
    }

    // Extract img src
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const match of imgMatches) addImage(match[1]);

    // Extract data-src (lazy loading)
    const dataSrcMatches = html.matchAll(/data-src=["']([^"']+)["']/gi);
    for (const match of dataSrcMatches) addImage(match[1]);

    return images;
  } catch {
    return images;
  }
}

// Browser-based scraping (for JavaScript-heavy sites)
async function browserScrape(url: string): Promise<string[]> {
  let browser = null;

  try {
    console.log('Starting headless browser for:', url);

    const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

    let launchOptions;

    if (isVercel) {
      const executablePath = await chromium.executablePath();
      launchOptions = {
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: executablePath,
        headless: true,
      };
    } else {
      // Local development - find Chrome
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
        console.log('Chrome not found locally');
        return [];
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

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract all images from the rendered page
    const images = await page.evaluate(() => {
      const results: string[] = [];
      const seen = new Set<string>();

      // Skip patterns
      const skipPatterns = [
        'icon', 'logo', 'favicon', 'sprite', 'pixel', 'tracking',
        'spacer', 'blank', '1x1', 'badge', 'button', 'arrow',
        'loading', 'spinner', 'avatar', 'emoji', 'flag',
        'social', 'share', 'facebook', 'twitter', 'instagram',
        'payment', 'visa', 'mastercard', 'paypal'
      ];

      const shouldSkip = (url: string) => {
        const lower = url.toLowerCase();
        return skipPatterns.some(p => lower.includes(p));
      };

      // Get OG image first
      const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (ogImage?.content && !shouldSkip(ogImage.content)) {
        results.push(ogImage.content);
        seen.add(ogImage.content);
      }

      // Get all visible images sorted by size (largest first = likely product images)
      const allImages = Array.from(document.querySelectorAll('img'));
      const imageData = allImages.map(img => {
        const rect = img.getBoundingClientRect();
        const src = img.src || img.dataset.src || img.dataset.zoom || img.dataset.large || '';
        return {
          src,
          area: rect.width * rect.height,
          visible: rect.width > 50 && rect.height > 50
        };
      }).filter(d => d.src && d.visible && !shouldSkip(d.src) && !seen.has(d.src))
        .sort((a, b) => b.area - a.area);

      for (const img of imageData) {
        if (!seen.has(img.src)) {
          results.push(img.src);
          seen.add(img.src);
        }
      }

      // Also check srcset for high-res versions
      for (const img of allImages) {
        if (img.srcset) {
          const parts = img.srcset.split(',');
          const lastPart = parts[parts.length - 1].trim().split(' ')[0];
          if (lastPart && !seen.has(lastPart) && !shouldSkip(lastPart)) {
            results.push(lastPart);
            seen.add(lastPart);
          }
        }
      }

      return results;
    });

    return images;

  } catch (error) {
    console.error('Browser scrape error:', error);
    return [];
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
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('Fetching images from:', url);

    // First try simple scraping
    let images = await simpleScrape(url);

    // If not enough images, use browser scraping
    if (images.length < 3) {
      console.log('Simple scrape found few images, trying browser scraping...');
      const browserImages = await browserScrape(url);

      // Merge results, prioritizing browser images
      const seenUrls = new Set(images);
      for (const img of browserImages) {
        if (!seenUrls.has(img)) {
          images.push(img);
          seenUrls.add(img);
        }
      }
    }

    console.log(`Found ${images.length} images total`);

    return NextResponse.json({
      images: images.slice(0, 30),
      total: images.length,
    });

  } catch (error) {
    console.error('Error fetching page images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images', images: [] },
      { status: 200 }
    );
  }
}
