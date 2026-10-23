/** Shrinks a picked image to a JPEG no bigger than maxSide pixels on its longest side, so uploads stay small. */
export async function resizeImage(file: File, maxSide = 1600): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG.")
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Couldn't process that image.")
  // JPEG has no transparency, so transparent areas become white instead of black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error("Couldn't process that image.")
  return blob
}
