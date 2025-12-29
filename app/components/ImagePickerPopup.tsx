'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface ImagePickerPopupProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onImageSelect: (imageData: string) => void;
}

export default function ImagePickerPopup({ url, isOpen, onClose, onImageSelect }: ImagePickerPopupProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [fetchingSelected, setFetchingSelected] = useState(false);
  const [manualUrl, setManualUrl] = useState<string>('');

  // Fetch images when popup opens
  useEffect(() => {
    if (isOpen && url) {
      fetchImages();
    }
    if (!isOpen) {
      setImages([]);
      setError('');
      setSelectedImage(null);
      setManualUrl('');
    }
  }, [isOpen, url]);

  const fetchImages = async () => {
    setLoading(true);
    setError('');
    setImages([]);

    try {
      const response = await fetch('/api/fetch-page-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.images && data.images.length > 0) {
        setImages(data.images);
      } else {
        setError('No product images found. Try pasting the image URL directly.');
      }
    } catch (err) {
      setError('Failed to load images. Try pasting the image URL directly.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = async (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setFetchingSelected(true);
    setError('');

    try {
      const response = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, referer: url }),
      });

      const data = await response.json();

      if (response.ok && data.base64Image) {
        onImageSelect(data.base64Image);
        onClose();
      } else {
        setError(data.error || 'Could not load this image. Try another one.');
        setSelectedImage(null);
      }
    } catch (err) {
      setError('Failed to load image. Try another one.');
      setSelectedImage(null);
      console.error(err);
    } finally {
      setFetchingSelected(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualUrl.trim()) {
      setError('Please paste an image URL');
      return;
    }

    let normalizedUrl = manualUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    await handleImageClick(normalizedUrl);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualUrl) {
      handleManualSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Select Product Image
            </h2>
            <p className="text-white/80 text-sm truncate max-w-md">{url}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
              <p className="text-gray-600 dark:text-gray-300">Loading images from website...</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* Image Grid */}
          {!loading && images.length > 0 && (
            <>
              <p className="text-gray-600 dark:text-gray-300 mb-4 text-center">
                Click on the product image you want to use:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {images.map((imgUrl, index) => (
                  <button
                    key={index}
                    onClick={() => handleImageClick(imgUrl)}
                    disabled={fetchingSelected}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                      selectedImage === imgUrl
                        ? 'border-purple-500 ring-4 ring-purple-500/50'
                        : 'border-gray-200 dark:border-gray-600 hover:border-purple-400'
                    } ${fetchingSelected ? 'opacity-50' : ''}`}
                  >
                    <Image
                      src={imgUrl}
                      alt={`Product image ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {selectedImage === imgUrl && fetchingSelected && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Manual URL Input - Always visible */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">
              {images.length > 0
                ? "Can't find the right image? Paste the image URL directly:"
                : "Paste the product image URL:"}
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => {
                  setManualUrl(e.target.value);
                  setError('');
                }}
                onKeyPress={handleKeyPress}
                placeholder="https://example.com/image.jpg"
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualUrl || fetchingSelected}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {fetchingSelected ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  'Use'
                )}
              </button>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-2">
              Tip: Right-click on any image and select "Copy image address" to get the URL
            </p>
          </div>

          {/* Refresh Button */}
          {!loading && (
            <div className="mt-4 text-center">
              <button
                onClick={fetchImages}
                className="text-purple-600 dark:text-purple-400 hover:underline text-sm"
              >
                Refresh images
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
