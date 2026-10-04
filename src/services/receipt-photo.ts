import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export async function receiptPhoto(uri: string): Promise<string | undefined> {
  // Decode only private device files / previously selected Android folders.
  if (!/^(file|content):\/\//.test(uri)) return undefined;
  const context = ImageManipulator.manipulate(uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let temporary: string | undefined;
  try {
    image = await context.renderAsync();
    if (Math.max(image.width, image.height) > 1600) {
      context.resize(
        image.width >= image.height ? { width: 1600 } : { height: 1600 },
      );
      image.release();
      image = undefined;
      image = await context.renderAsync();
    }
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.85,
      base64: true,
    });
    temporary = saved.uri;
    return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : undefined;
  } finally {
    image?.release();
    context.release();
    if (temporary && temporary !== uri) {
      try {
        const file = new File(temporary);
        if (file.exists) file.delete();
      } catch {}
    }
  }
}
