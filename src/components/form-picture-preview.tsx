import type { FormPicture } from "../services/form-image-types";

// Android saves directly through the system folder picker.
export function FormPicturePreview(_props: {
  picture: FormPicture | null;
  onClose: () => void;
}) {
  return null;
}
