/**
 * Compress common still images before Storage uploads.
 * Animated GIFs and videos are deliberately left untouched.
 * If browser decoding/encoding is unavailable, keep the original file.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file
  if (file.size < 700 * 1024 || typeof createImageBitmap === 'undefined') return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const maxDimension = 1920
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82)
    })
    if (!blob || blob.size >= file.size * 0.92) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload'
    return new File([blob], baseName + '.webp', {
      type: 'image/webp',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
