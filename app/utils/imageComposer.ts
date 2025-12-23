// Client-side image composition utility
// This creates a visual demo of try-on by combining images

export async function composeImages(
  userImageBase64: string,
  clothImageBase64: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const userImg = new window.Image();
    const clothImg = new window.Image();

    let userLoaded = false;
    let clothLoaded = false;

    const checkBothLoaded = () => {
      if (userLoaded && clothLoaded) {
        // Set canvas size based on user image
        canvas.width = userImg.width;
        canvas.height = userImg.height;

        // Draw user image as background
        ctx.drawImage(userImg, 0, 0);

        // Calculate position for cloth overlay (center-top area)
        const clothWidth = canvas.width * 0.4; // 40% of canvas width
        const clothHeight = (clothImg.height / clothImg.width) * clothWidth;
        const x = canvas.width * 0.3; // 30% from left
        const y = canvas.height * 0.15; // 15% from top

        // Add semi-transparent overlay effect
        ctx.globalAlpha = 0.85;
        ctx.drawImage(clothImg, x, y, clothWidth, clothHeight);

        // Reset alpha
        ctx.globalAlpha = 1.0;

        // Add a border around the cloth to make it visible
        ctx.strokeStyle = '#4F46E5';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, clothWidth, clothHeight);

        // Add demo watermark
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(79, 70, 229, 0.8)';
        ctx.fillText('DEMO MODE', 20, canvas.height - 20);

        // Convert to base64
        const result = canvas.toDataURL('image/jpeg', 0.9);
        resolve(result);
      }
    };

    userImg.onload = () => {
      userLoaded = true;
      checkBothLoaded();
    };

    clothImg.onload = () => {
      clothLoaded = true;
      checkBothLoaded();
    };

    userImg.onerror = () => reject(new Error('Failed to load user image'));
    clothImg.onerror = () => reject(new Error('Failed to load cloth image'));

    userImg.src = userImageBase64;
    clothImg.src = clothImageBase64;
  });
}
