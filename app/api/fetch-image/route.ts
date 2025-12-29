import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, referer } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    console.log('Fetching image:', imageUrl);

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': referer || imageUrl,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch image (${response.status})` },
        { status: 400 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Validate it's actually an image
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'URL does not point to an image' },
        { status: 400 }
      );
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const base64Image = `data:${contentType};base64,${base64}`;

    return NextResponse.json({
      base64Image,
      contentType,
      size: buffer.byteLength,
    });

  } catch (error) {
    console.error('Error fetching image:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image' },
      { status: 500 }
    );
  }
}
