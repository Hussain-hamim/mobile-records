import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { recordPhotoCrop } from "../domain/photo-frame";

/** Square attachment crop only; never invokes scanning or sends an image. */
export async function cropRecordPhoto(
  photo: { uri: string; width: number; height: number },
  preview: { width: number; height: number },
) {
  const crop = recordPhotoCrop(photo, preview);
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
