/** Downscale + re-encode an image before upload to keep payloads small. */
export function compressImage(
  file: File,
  quality = 0.7,
  maxWidth = 800,
  maxHeight = 600,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type, lastModified: Date.now() }));
          } else {
            reject(new Error("Canvas to Blob conversion failed"));
          }
        },
        file.type,
        quality,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}
