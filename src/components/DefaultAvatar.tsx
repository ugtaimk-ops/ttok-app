export function hasPhotoAvatar(value?: string | null): boolean {
  return !!value && (value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:image/"));
}

// Neutral head-and-shoulders silhouette, kept in the app so it works offline.
export default function DefaultAvatar() {
  return (
    <svg viewBox="0 0 100 100" aria-label="기본 프로필" role="img" className="w-full h-full">
      <rect width="100" height="100" fill="#e5e7eb" />
      <circle cx="50" cy="39" r="19" fill="#a8adb5" />
      <path d="M12 100c1-23 16-38 38-38s37 15 38 38" fill="#a8adb5" />
    </svg>
  );
}
