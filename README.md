# Virtual Try-On App

Virtual try-on application jahan aap apni image upload karke clothes try kar sakte hain.

## Features

- User image upload
- Cloth image upload (file ya URL)
- **Client-side image composition for instant preview**
- Responsive design with Tailwind CSS
- Dark mode support
- **NO API key needed - works instantly!**

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

That's it! **No API keys, no signup, no configuration needed!**

## How to Use

1. Upload apni full-body image "Your Image" section mein
2. Cloth image upload karein ya URL paste karein "Cloth Image" section mein
3. "Try On Now" button click karein
4. Instant result dekhen - cloth overlay aapki image pe!

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **HTML5 Canvas** - Client-side image composition

## Current Implementation

Right now, this app uses **client-side canvas** to overlay the cloth image on your photo as a visual demo. The cloth appears semi-transparent over your image.

### Want Real AI Try-On?

To add real AI-powered virtual try-on, you can integrate:

1. **Replicate API** - High quality, paid ($0.0055 per generation)
   - Model: `cuuupid/idm-vton`
   - Get API key from [replicate.com](https://replicate.com)

2. **Hugging Face Spaces** - Free but may be slow
   - Use Gradio client to connect to hosted models
   - Models: `yisol/IDM-VTON`, `levihsu/OOTDiffusion`

3. **Local AI Model** - Run on your own GPU
   - Clone models from Hugging Face
   - Requires CUDA-capable GPU

The code structure is ready - just update [app/api/tryon/route.ts](app/api/tryon/route.ts) with your preferred AI service.

## Notes

- **100% FREE** - No APIs, no costs, works offline!
- Demo mode shows cloth overlay on your image
- Best results ke liye clear, full-body images use karein
- Instant processing - no waiting!

## License

MIT
