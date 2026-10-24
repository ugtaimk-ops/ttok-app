const MAX_IMAGE_SIDE = 2048;
const MAX_ORIGINAL_BYTES = 2 * 1024 * 1024;
const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function prepareAiImage(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일을 선택해 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("사진을 읽을 수 없어요. JPG 또는 PNG 사진을 선택해 주세요."));
      image.src = url;
    });

    if (SUPPORTED_MIME.has(file.type) && file.size <= MAX_ORIGINAL_BYTES &&
        Math.max(image.naturalWidth, image.naturalHeight) <= MAX_IMAGE_SIDE) {
      return { base64: await readBase64(file), mimeType: file.type };
    }

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 기기에서는 사진을 변환할 수 없어요.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { base64: canvas.toDataURL("image/jpeg", 0.88).split(",")[1], mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
