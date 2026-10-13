import { Modal, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

/** Measure this native window's insets for the Screen rendered inside it. */
export function ScreenModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}
