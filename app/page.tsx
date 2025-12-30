'use client';

import { useState } from 'react';
import Image from 'next/image';
import ImagePickerPopup from './components/ImagePickerPopup';

type Category = 'upper_body' | 'lower_body' | 'dresses' | 'shoes' | 'eyewear' | 'headwear' | 'watch';

interface ClothItem {
  image: string;
  category: Category;
  detectedItem: string;
}

export default function Home() {
  const [userImage, setUserImage] = useState<string | null>(null);
  const [clothImages, setClothImages] = useState<ClothItem[]>([]);
  const [productUrl, setProductUrl] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [detectingClothing, setDetectingClothing] = useState(false);
  const [error, setError] = useState<string>('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [showImagePicker, setShowImagePicker] = useState(false);

  const handleUserImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const detectClothingType = async (imageData: string): Promise<{ category: Category; itemType: string } | null> => {
    if (!autoDetect) return null;

    setDetectingClothing(true);
    try {
      const response = await fetch('/api/detect-clothing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      const data = await response.json();
      if (response.ok && data.category) {
        return { category: data.category, itemType: data.itemType };
      }
      return null;
    } catch (err) {
      console.error('Failed to detect clothing type:', err);
      return null;
    } finally {
      setDetectingClothing(false);
    }
  };

  const handleClothImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const imageData = reader.result as string;
        setProductUrl('');

        // Auto-detect clothing type
        const detected = await detectClothingType(imageData);
        const newItem: ClothItem = {
          image: imageData,
          category: detected?.category || 'upper_body',
          detectedItem: detected?.itemType || '',
        };
        setClothImages(prev => [...prev, newItem]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeClothImage = (index: number) => {
    setClothImages(prev => prev.filter((_, i) => i !== index));
  };

  const updateClothCategory = (index: number, category: Category) => {
    setClothImages(prev => prev.map((item, i) =>
      i === index ? { ...item, category } : item
    ));
  };

  const handleProductUrlSubmit = () => {
    if (!productUrl) return;
    setError('');

    // Auto-add https:// if missing
    let normalizedUrl = productUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
      setProductUrl(normalizedUrl);
    }

    setShowImagePicker(true);
  };

  const handleImagePickerSelect = async (imageData: string) => {
    setShowImagePicker(false);

    // Auto-detect clothing type
    const detected = await detectClothingType(imageData);
    const newItem: ClothItem = {
      image: imageData,
      category: detected?.category || 'upper_body',
      detectedItem: detected?.itemType || '',
    };
    setClothImages(prev => [...prev, newItem]);
  };

  const handleTryOn = async () => {
    if (!userImage) {
      setError('Please upload your image first');
      return;
    }

    if (clothImages.length === 0) {
      setError('Please upload at least one product image');
      return;
    }

    setLoading(true);
    setError('');
    setLoadingProgress(`Applying ${clothImages.length} item(s) at once...`);

    try {
      // Sort items by priority for better prompt structure
      const categoryPriority: Record<Category, number> = {
        'upper_body': 1,
        'lower_body': 2,
        'dresses': 1,
        'shoes': 3,
        'eyewear': 4,
        'headwear': 4,
        'watch': 4,
      };

      const sortedClothImages = [...clothImages].sort((a, b) =>
        categoryPriority[a.category] - categoryPriority[b.category]
      );

      // Send ALL items in a single request - Gemini 2.5 Flash handles multiple images
      const response = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userImage: userImage,
          clothImages: sortedClothImages.map(item => ({
            image: item.image,
            category: item.category,
            detectedItem: item.detectedItem,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply clothing items');
      }

      setResultImage(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-center mb-4 text-gray-800 dark:text-white">
          Virtual Try-On
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-12">
          Upload your image and try on clothes virtually with AI - Auto-detects clothing type!
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* User Image Upload */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Your Image
            </h2>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-purple-500 transition-colors">
              {userImage ? (
                <div className="relative w-full h-64">
                  <Image
                    src={userImage}
                    alt="User"
                    fill
                    className="object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="py-12">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Upload your full-body image
                  </p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleUserImageUpload}
                className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
            </div>
          </div>

          {/* Cloth Image Upload */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
                Product Images
              </h2>
              {clothImages.length > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {clothImages.length} item{clothImages.length > 1 ? 's' : ''} added
                </span>
              )}
            </div>

            {/* Show uploaded images grid */}
            {clothImages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {clothImages.map((item, index) => (
                  <div key={index} className="relative bg-gray-100 dark:bg-gray-700 rounded-lg p-2">
                    <div className="relative w-full h-32">
                      <Image
                        src={item.image}
                        alt={`Product ${index + 1}`}
                        fill
                        className="object-contain rounded-lg"
                      />
                      <button
                        onClick={() => removeClothImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-2">
                      {item.detectedItem && (
                        <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                          Detected: {item.detectedItem}
                        </div>
                      )}
                      <select
                        value={item.category}
                        onChange={(e) => updateClothCategory(index, e.target.value as Category)}
                        className="w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 dark:bg-gray-600 dark:text-white"
                      >
                        <option value="upper_body">Upper Body</option>
                        <option value="lower_body">Lower Body</option>
                        <option value="dresses">Dresses</option>
                        <option value="shoes">Shoes</option>
                        <option value="eyewear">Eyewear</option>
                        <option value="headwear">Headwear</option>
                        <option value="watch">Watch</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload new image */}
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 transition-colors">
              {detectingClothing ? (
                <div className="py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Detecting item type...</p>
                </div>
              ) : (
                <div className="py-4">
                  <svg
                    className="mx-auto h-10 w-10 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {clothImages.length === 0 ? 'Upload product images' : 'Add another item'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Add shirt, pants, shoes, etc. - all applied in one go!
                  </p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleClothImageUpload}
                disabled={detectingClothing}
                className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
            </div>

            {/* Product URL Input */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Or paste product page URL (Amazon, Zara, H&M, etc.)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://www.amazon.com/product..."
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleProductUrlSubmit}
                  disabled={!productUrl || detectingClothing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Pick Image
                </button>
              </div>
            </div>

            {/* Auto-detect toggle */}
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="autoDetect"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="autoDetect" className="text-sm text-gray-600 dark:text-gray-400">
                Auto-detect item type
              </label>
            </div>
          </div>
        </div>

        {/* Info Box */}
        {clothImages.length > 1 && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-8">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div>
                <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                  {clothImages.length} items will be applied all at once using Gemini AI
                </p>
                <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                  Items: {[...clothImages].sort((a, b) => {
                    const priority: Record<Category, number> = { 'upper_body': 1, 'lower_body': 2, 'dresses': 1, 'shoes': 3, 'eyewear': 4, 'headwear': 4, 'watch': 4 };
                    return priority[a.category] - priority[b.category];
                  }).map(item => item.detectedItem || item.category).join(' + ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Try On Button */}
        <div className="text-center mb-8">
          <button
            onClick={handleTryOn}
            disabled={loading || detectingClothing || clothImages.length === 0}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-4 px-12 rounded-full text-lg shadow-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all"
          >
            {loading ? (loadingProgress || 'Processing...') : `Try On ${clothImages.length > 1 ? `${clothImages.length} Items` : 'Now'}`}
          </button>
          {clothImages.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Add at least one product image to continue
            </p>
          )}
        </div>

        {/* Result */}
        {resultImage && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white text-center">
              Result
            </h2>
            <div className="relative w-full max-w-2xl mx-auto h-96">
              <Image
                src={resultImage}
                alt="Try-on result"
                fill
                className="object-contain rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Image Picker Popup */}
      <ImagePickerPopup
        url={productUrl}
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onImageSelect={handleImagePickerSelect}
      />
    </div>
  );
}
