'use client';

import { useState } from 'react';
import Image from 'next/image';
import { composeImages } from './utils/imageComposer';

export default function Home() {
  const [userImage, setUserImage] = useState<string | null>(null);
  const [clothImage, setClothImage] = useState<string | null>(null);
  const [clothImageUrl, setClothImageUrl] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [category, setCategory] = useState<'upper_body' | 'lower_body' | 'dresses'>('upper_body');
  const [garmentDescription, setGarmentDescription] = useState<string>('');

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

  const handleClothImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setClothImage(reader.result as string);
        setClothImageUrl('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClothUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClothImageUrl(e.target.value);
    setClothImage(null);
  };

  const handleTryOn = async () => {
    if (!userImage) {
      setError('Please upload your image first');
      return;
    }

    if (!clothImage && !clothImageUrl) {
      setError('Please upload a cloth image or provide a URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userImage,
          clothImage: clothImage || clothImageUrl,
          category,
          garmentDescription: garmentDescription || 'high quality clothing item',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process virtual try-on');
      }

      setResultImage(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-center mb-4 text-gray-800 dark:text-white">
          Virtual Try-On
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-12">
          Upload your image and try on clothes virtually with AI
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
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              Cloth Image
            </h2>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
              {clothImage ? (
                <div className="relative w-full h-64">
                  <Image
                    src={clothImage}
                    alt="Cloth"
                    fill
                    className="object-contain rounded-lg"
                  />
                </div>
              ) : clothImageUrl ? (
                <div className="relative w-full h-64">
                  <Image
                    src={clothImageUrl}
                    alt="Cloth from URL"
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
                    Upload cloth image or use URL below
                  </p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleClothImageUpload}
                className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Or paste image URL
              </label>
              <input
                type="url"
                value={clothImageUrl}
                onChange={handleClothUrlChange}
                placeholder="https://example.com/cloth.jpg"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Advanced Options */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
            Advanced Options
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Garment Type
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'upper_body' | 'lower_body' | 'dresses')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="upper_body">Upper Body (Shirts, Jackets, Tops)</option>
                <option value="lower_body">Lower Body (Pants, Skirts)</option>
                <option value="dresses">Dresses</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Garment Description (Optional)
              </label>
              <input
                type="text"
                value={garmentDescription}
                onChange={(e) => setGarmentDescription(e.target.value)}
                placeholder="e.g., Navy blue denim jacket"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

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
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-4 px-12 rounded-full text-lg shadow-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all"
          >
            {loading ? 'Processing...' : 'Try On Now'}
          </button>
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
    </div>
  );
}
