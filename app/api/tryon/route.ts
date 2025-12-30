import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ClothItem {
  image: string;
  category: string;
  detectedItem?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support both single cloth and multiple clothes
    const userImage = body.userImage;
    const clothImages: ClothItem[] = body.clothImages || (body.clothImage ? [{ image: body.clothImage, category: body.category || 'upper_body' }] : []);

    if (!userImage || clothImages.length === 0) {
      return NextResponse.json(
        { error: 'User image and at least one cloth image are required' },
        { status: 400 }
      );
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;

    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        {
          error: 'GOOGLE_AI_API_KEY not configured',
          instructions: 'Add your Google AI API key to .env.local file'
        },
        { status: 500 }
      );
    }

    console.log('Starting virtual try-on with Gemini 3 Pro Image Preview (Direct API)...');
    console.log('Number of clothing items:', clothImages.length);

    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

    // Use gemini-3-pro-image-preview for image generation
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      generationConfig: {
        // @ts-expect-error - responseModalities is valid for image models
        responseModalities: ['image', 'text'],
      },
    });

    // Build dynamic prompt based on all clothing items
    const clothingDescriptions = clothImages.map((item, index) => {
      const itemName = item.detectedItem || item.category;
      return `Image ${index + 2}: ${itemName}`;
    }).join(', ');

    // Create a strict prompt that preserves identity
    const clothingPrompt = `STRICT VIRTUAL TRY-ON - IDENTITY PRESERVATION IS CRITICAL

Image 1: Reference person (DO NOT CHANGE THIS PERSON'S APPEARANCE)
${clothingDescriptions}

TASK: Edit ONLY the clothing on the person in Image 1. Replace their current clothes with the items shown in the other images.

CRITICAL RULES - MUST FOLLOW:
1. FACE: Keep the EXACT same face - same eyes, nose, mouth, skin tone, facial features, expression. DO NOT generate a new face.
2. BODY: Keep the EXACT same body shape, proportions, height, weight. DO NOT change body type.
3. POSE: Keep the EXACT same pose, arm positions, leg positions, head angle.
4. BACKGROUND: Keep the EXACT same background, lighting, and environment.
5. HAIR: Keep the EXACT same hairstyle, hair color, hair length.
6. SKIN: Keep the EXACT same skin tone and any visible skin.

ONLY CHANGE: The clothing items. Swap out their current clothes with the items from the reference images.

This is a clothing swap only - the person's identity must remain 100% unchanged.

Generate a single image showing the person wearing all the clothing items.`;

    // Helper function to extract base64 data from data URL
    const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
      // If no data URL prefix, assume it's raw base64 jpeg
      return { mimeType: 'image/jpeg', data: dataUrl };
    };

    // Prepare all images for the model
    const userImageData = extractBase64(userImage);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: clothingPrompt },
      { inlineData: { mimeType: userImageData.mimeType, data: userImageData.data } },
    ];

    // Add all clothing images
    for (const item of clothImages) {
      const clothData = extractBase64(item.image);
      parts.push({ inlineData: { mimeType: clothData.mimeType, data: clothData.data } });
    }

    // Retry logic for rate limits
    let result;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        console.log('Sending request to Gemini...');
        result = await model.generateContent(parts);
        break;
      } catch (err: unknown) {
        lastError = err;
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
          console.log(`Rate limited, waiting 10 seconds before retry... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          retries--;
        } else {
          throw err;
        }
      }
    }

    if (!result) {
      throw lastError || new Error('Failed after retries');
    }

    console.log('Response received, processing...');

    const response = result.response;
    const candidates = response.candidates;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { error: 'No response from model' },
        { status: 500 }
      );
    }

    // Look for image in the response
    let base64Result: string | null = null;

    for (const candidate of candidates) {
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Check for inline data (image)
          if ('inlineData' in part && part.inlineData) {
            const { mimeType, data } = part.inlineData;
            base64Result = `data:${mimeType};base64,${data}`;
            console.log('Found image in response');
            break;
          }
        }
      }
      if (base64Result) break;
    }

    if (base64Result) {
      return NextResponse.json({
        result: base64Result,
        message: `Virtual try-on complete! Applied ${clothImages.length} item(s).`
      });
    }

    // If no image found, check for text response (might contain error or explanation)
    let textResponse = '';
    for (const candidate of candidates) {
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if ('text' in part && part.text) {
            textResponse += part.text;
          }
        }
      }
    }

    return NextResponse.json(
      {
        error: 'No image generated by model',
        details: textResponse || 'Model did not return an image',
        debug: 'Check if the model supports image generation with the current prompt'
      },
      { status: 500 }
    );

  } catch (error) {
    console.error('Error in virtual try-on:', error);
    return NextResponse.json(
      {
        error: 'Failed to process virtual try-on',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
