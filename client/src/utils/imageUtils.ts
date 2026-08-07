export interface PreparedImage {
  base64: string;
  mediaType: string;
  dataUrl: string;
}

// Read a photo and downscale it on a canvas so multi-MB phone photos become
// reasonable JSON payloads while staying sharp enough for display and AI vision.
export function prepareImage(file: File, maxDimension = 1600): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1024 * 1024) {
          // Small enough already — send as-is
          resolve({
            base64: dataUrl.split(',')[1],
            mediaType: file.type || 'image/jpeg',
            dataUrl,
          });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const scaledDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({
          base64: scaledDataUrl.split(',')[1],
          mediaType: 'image/jpeg',
          dataUrl: scaledDataUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
