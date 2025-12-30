import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function GET() {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;

    if (!GOOGLE_API_KEY) {
      return NextResponse.json({
        status: 'error',
        message: 'GOOGLE_AI_API_KEY not found in environment variables'
      });
    }

    console.log('Testing Gemini API...');
    console.log('API Key (first 10 chars):', GOOGLE_API_KEY.substring(0, 10) + '...');

    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    // Try different models - gemini-1.5-flash has better free tier support
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Simple text test
    const result = await model.generateContent('Say "Hello, API is working!" in exactly those words.');
    const response = result.response;
    const text = response.text();

    return NextResponse.json({
      status: 'success',
      message: 'Gemini API is working!',
      response: text,
      apiKeyPrefix: GOOGLE_API_KEY.substring(0, 10) + '...'
    });

  } catch (error) {
    console.error('Gemini test error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for specific error types
    let diagnosis = '';
    if (errorMessage.includes('429') || errorMessage.includes('quota')) {
      diagnosis = 'QUOTA EXCEEDED - Your free tier limit is exhausted. You need to enable billing or wait for quota reset.';
    } else if (errorMessage.includes('401') || errorMessage.includes('API key')) {
      diagnosis = 'INVALID API KEY - Check if your API key is correct.';
    } else if (errorMessage.includes('403')) {
      diagnosis = 'ACCESS DENIED - API key may not have access to this model.';
    } else if (errorMessage.includes('404')) {
      diagnosis = 'MODEL NOT FOUND - The model gemini-2.0-flash-exp may not be available.';
    }

    return NextResponse.json({
      status: 'error',
      message: errorMessage,
      diagnosis: diagnosis || 'Unknown error - check the error message for details',
      apiKeyPrefix: process.env.GOOGLE_AI_API_KEY?.substring(0, 10) + '...'
    });
  }
}
