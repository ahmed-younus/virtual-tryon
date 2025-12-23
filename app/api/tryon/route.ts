import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export async function POST(request: NextRequest) {
  try {
    const { userImage, clothImage, category, garmentDescription } = await request.json();

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

    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    });

    // Use p-image-edit model for multi-image editing
    // This model can change clothes on a person using prompt + images
    const output = await replicate.run(
      "prunaai/p-image-edit",
      {
        input: {
          images: [userImage, clothImage],
          prompt: `Replace the clothes of the person in image 1 with the exact clothing item from image 2. CRITICAL COLOR REQUIREMENTS: Match the EXACT colors from image 2 - DO NOT make them brighter, more saturated, or more vibrant. Keep the natural, realistic color tones exactly as they appear in the garment image. If the clothing is dark, keep it dark. If it's muted, keep it muted. DO NOT enhance, brighten, or over-saturate the colors. Preserve the exact RGB values and color accuracy from the original garment. Keep patterns, textures, and all design details identical to image 2. Maintain realistic fabric texture and material appearance with natural lighting - avoid artificial brightening or color enhancement. Ensure natural fitting with realistic wrinkles and folds. Keep the person's pose, body structure unchanged. Result must look photorealistic with accurate color reproduction, not artificially enhanced or brightened.`,
          turbo: false, // Better quality for complex editing
          aspect_ratio: "match_input_image",
          seed: 42
        }
      }
    );

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
    } else if (typeof output === 'string' && output.startsWith('http')) {
      // Handle URL format (legacy)
      console.log('Fetching image from URL:', output);
      const imageResponse = await fetch(output);
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
