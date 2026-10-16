// Turns an uploaded picture into a compact PNG/JPEG data URL (the only formats the PDF renderer
// reads) that lives inside the template JSON, so there is no separate file storage to manage.
// Keeps transparency for PNG/WebP/SVG/GIF; photos become JPEG. Shrinks until it fits MAX_CHARS
// (the server rejects anything bigger).
export const MAX_CHARS = 500_000;

export async function fileToDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP, GIF or SVG image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = objectUrl;
    });
    const natW = img.naturalWidth || 300;
    const natH = img.naturalHeight || 100;
    const keepAlpha = !/jpe?g/.test(file.type);

    for (const max of [900, 600, 400, 250]) {
      const ratio = Math.min(1, max / Math.max(natW, natH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(natW * ratio));
      canvas.height = Math.max(1, Math.round(natH * ratio));
      const ctx = canvas.getContext("2d")!;
      if (!keepAlpha) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
      if (out.length <= MAX_CHARS) return out;
    }
    throw new Error("Image is too detailed to embed. Try a simpler or smaller one.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
