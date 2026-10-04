import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { tazkiraPhotoCrop } from "../domain/photo-frame";

/** Local attachment crop only; never invokes scanning or sends an image. */
export async function cropCardPhoto(
  photo: { uri: string; width: number; height: number },
  preview: { width: number; height: number },
) {
  const crop = tazkiraPhotoCrop(photo, preview);
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    context.crop(crop);
    if (crop.width > 1600) context.resize({ width: 1600 });
    const image = await context.renderAsync();
    try {
      return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
