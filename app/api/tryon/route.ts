import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export async function POST(request: NextRequest) {
  try {
    const { userImage, clothImage, category } = await request.json();

    if (!userImage || !clothImage) {
      return NextResponse.json(
        { error: 'Both user image and cloth image are required' },
        { status: 400 }
      );
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          error: 'REPLICATE_API_TOKEN not configured',
          instructions: 'Add token to .env.local file'
        },
        { status: 500 }
      );
    }

    console.log('Starting Replicate virtual try-on with p-image-edit...');
    console.log('Category:', category);
    console.log('User image length:', userImage?.length || 0);
    console.log('Cloth image length:', clothImage?.length || 0);

    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    });

    // Generate category-specific prompt
    let clothingPrompt = '';

    if (category === 'lower_body') {
      clothingPrompt = `Replace ONLY the pants/trousers/lower body clothing of the person in image 1 with the exact pants/jeans/trousers from image 2. Keep the upper body clothing (shirt, t-shirt, jacket) EXACTLY as it is - do not change it. Focus ONLY on replacing the lower body garment (pants, jeans, trousers, shorts, skirt). The new pants must fit naturally on the person's legs and waist.`;
    } else if (category === 'dresses') {
      clothingPrompt = `Replace the entire outfit of the person in image 1 with the dress/full outfit from image 2. This is a full body garment replacement including both upper and lower body.`;
    } else if (category === 'shoes') {
      clothingPrompt = `Replace ONLY the shoes/footwear of the person in image 1 with the exact shoes from image 2. Keep ALL clothing (shirt, pants, jacket, etc.) EXACTLY as it is - do not change any clothing. Focus ONLY on replacing the footwear/shoes. The new shoes must fit naturally on the person's feet. Do NOT add glasses, hats, or any other accessories.`;
    } else if (category === 'eyewear') {
      clothingPrompt = `Add ONLY the glasses/sunglasses from image 2 to the person's face in image 1. Place them naturally on the face, fitting properly on the nose and ears. Keep ALL clothing and other accessories EXACTLY as they are - do not change anything else. Focus ONLY on adding the eyewear.`;
    } else if (category === 'headwear') {
      clothingPrompt = `Add ONLY the hat/cap from image 2 to the person's head in image 1. Place it naturally on the head. Keep ALL clothing and other accessories EXACTLY as they are - do not change anything else. Focus ONLY on adding the headwear.`;
    } else if (category === 'watch') {
      clothingPrompt = `Add ONLY the watch from image 2 to the person's wrist in image 1. Place it naturally on the wrist. Keep ALL clothing and other accessories EXACTLY as they are - do not change anything else. Focus ONLY on adding the watch.`;
    } else {
      // upper_body (default)
      clothingPrompt = `Replace ONLY the upper body clothing (shirt, t-shirt, top, jacket) of the person in image 1 with the exact garment from image 2. Keep the lower body clothing (pants, jeans, trousers) EXACTLY as it is - do not change it. Focus ONLY on replacing the upper body garment.`;
    }

    const fullPrompt = `${clothingPrompt} CRITICAL REQUIREMENTS: 1) Match the EXACT colors from image 2 - DO NOT brighten or over-saturate. Keep natural, realistic tones. 2) Keep ALL other clothing items EXACTLY as they appear - do not modify, remove, or change any clothing that is not being replaced. 3) Maintain the person's exact pose, body structure, face, and background. 4) Preserve patterns, textures, and design details from image 2. 5) Ensure natural fitting with realistic wrinkles and folds. 6) Result must be photorealistic - no artificial enhancements.`;

    console.log('Prompt:', fullPrompt);

    // Use p-image-edit model for multi-image editing
    // Retry logic for rate limits
    let output;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        output = await replicate.run(
          "prunaai/p-image-edit",
          {
            input: {
              images: [userImage, clothImage],
              prompt: fullPrompt,
              turbo: false,
              aspect_ratio: "match_input_image",
              seed: 42
            }
          }
        );
        break;
      } catch (err: unknown) {
        lastError = err;
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('throttled')) {
          console.log(`Rate limited, waiting 10 seconds before retry... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          retries--;
        } else {
          throw err;
        }
      }
    }

    if (!output) {
      throw lastError || new Error('Failed after retries');
    }

    console.log('Starting to process Replicate output...');
    console.log('Output type:', typeof output);
    console.log('Output value:', output);

    // Handle different output formats
    let base64Result: string | null = null;

    // If output is a ReadableStream or async iterable, collect binary data
    if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of output as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      // Combine all chunks into a single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to base64
      base64Result = `data:image/jpeg;base64,${Buffer.from(combined).toString('base64')}`;
      console.log('Successfully converted binary data to base64');
    } else if (typeof output === 'string' && (output as string).startsWith('http')) {
      // Handle URL format (legacy)
      console.log('Fetching image from URL:', output);
      const imageResponse = await fetch(output as string);
      const imageBlob = await imageResponse.blob();
      const buffer = await imageBlob.arrayBuffer();
      base64Result = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
    } else if (Array.isArray(output) && output.length > 0) {
      // Handle array of URLs
      const imageUrl = output[0];
      if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        const buffer = await imageBlob.arrayBuffer();
        base64Result = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
      }
    }

    if (base64Result) {
      return NextResponse.json({
        result: base64Result,
        message: 'AI-powered virtual try-on complete!'
      });
    }

    return NextResponse.json(
      {
        error: 'Unexpected output format from Replicate',
        debug: `Output type: ${typeof output}`
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
