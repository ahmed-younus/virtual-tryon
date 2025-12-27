import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'REPLICATE_API_TOKEN not configured' },
        { status: 500 }
      );
    }

    console.log('Detecting clothing type from image...');

    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    });

    // Use a vision model to analyze the clothing
    const output = await replicate.run(
      "yorickvp/llava-13b:80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb",
      {
        input: {
          image: image,
          prompt: "Look at this image and identify what type of clothing or accessory this is. Respond with ONLY ONE of these exact words: SHIRT, TSHIRT, JACKET, HOODIE, SWEATER, COAT, PANTS, JEANS, TROUSERS, SHORTS, SKIRT, DRESS, GLASSES, SUNGLASSES, WATCH, HAT, CAP, SHOES, SNEAKERS, BOOTS, BAG, OTHER. Just respond with the single word, nothing else.",
          max_tokens: 20,
          temperature: 0.1,
        }
      }
    );

    console.log('LLaVA output:', output);

    // Parse the response
    let detectedType = String(output).trim().toUpperCase();

    // Map to our categories
    let category: 'upper_body' | 'lower_body' | 'dresses' | 'accessories' = 'upper_body';
    let itemType = 'clothing';

    const upperBodyItems = ['SHIRT', 'TSHIRT', 'T-SHIRT', 'JACKET', 'HOODIE', 'SWEATER', 'COAT', 'TOP', 'BLOUSE', 'CARDIGAN'];
    const lowerBodyItems = ['PANTS', 'JEANS', 'TROUSERS', 'SHORTS', 'SKIRT'];
    const dressItems = ['DRESS', 'GOWN', 'JUMPSUIT', 'ROMPER'];
    const accessoryItems = ['GLASSES', 'SUNGLASSES', 'WATCH', 'HAT', 'CAP', 'SHOES', 'SNEAKERS', 'BOOTS', 'BAG', 'BELT', 'SCARF', 'TIE', 'JEWELRY', 'NECKLACE', 'BRACELET', 'EARRING'];

    // Clean up the detected type
    for (const item of upperBodyItems) {
      if (detectedType.includes(item)) {
        category = 'upper_body';
        itemType = item.toLowerCase();
        break;
      }
    }

    for (const item of lowerBodyItems) {
      if (detectedType.includes(item)) {
        category = 'lower_body';
        itemType = item.toLowerCase();
        break;
      }
    }

    for (const item of dressItems) {
      if (detectedType.includes(item)) {
        category = 'dresses';
        itemType = item.toLowerCase();
        break;
      }
    }

    for (const item of accessoryItems) {
      if (detectedType.includes(item)) {
        category = 'accessories';
        itemType = item.toLowerCase();
        break;
      }
    }

    return NextResponse.json({
      category,
      itemType,
      rawDetection: detectedType,
      message: `Detected: ${itemType}`,
    });

  } catch (error) {
    console.error('Error detecting clothing:', error);
    return NextResponse.json(
      {
        error: 'Failed to detect clothing type',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
