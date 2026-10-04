import { requireOptionalNativeModule } from "expo";
import { AppState, Platform } from "react-native";

export type FingerprintSound = "enrolled" | "matched" | "rejected";
const sources = {
  enrolled: require("../../assets/sounds/registerSuccessTone.mp3"),
  matched: require("../../assets/sounds/fingerSuccess.mp3"),
  rejected: require("../../assets/sounds/wrongfinger.mp3"),
};
let current: { kind: FingerprintSound; cancel: () => void } | null = null;

export function stopFingerprintSound() {
  current?.cancel();
}

/** Feedback never blocks scanning, navigation, or a successfully saved enrollment. */
export async function playFingerprintSound(
  kind: FingerprintSound,
): Promise<void> {
  if (current?.kind === kind || AppState.currentState !== "active") return;
  // Older APKs still work silently until rebuilt with the installed expo-audio.
  if (Platform.OS !== "web" && !requireOptionalNativeModule("ExpoAudio"))
    return;
  current?.cancel();
  let disposed = false;
  let player: { remove: () => void } | undefined;
  let status: { remove: () => void } | undefined;
  let background: { remove: () => void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const session = { kind, cancel: cleanup };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    status?.remove();
    background?.remove();
    try {
      player?.remove();
    } catch {
      /* Already released by the OS. */
    }
    if (current === session) current = null;
  }
  current = session;
  try {
    background = AppState.addEventListener("change", (state) => {
      if (state !== "active") cleanup();
    });
    // Also bounds a stalled import/load without retaining a listener indefinitely.
    timeout = setTimeout(cleanup, 5000);
    const { createAudioPlayer, setAudioModeAsync } = await import("expo-audio");
    if (disposed) return;
    await setAudioModeAsync({
      // Scan feedback follows media volume, including on silent/vibrate phones.
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    });
    if (disposed || AppState.currentState !== "active") {
      cleanup();
      return;
    }
    const audio = createAudioPlayer(sources[kind], { updateInterval: 100 });
    player = audio;
    status = audio.addListener("playbackStatusUpdate", (state) => {
      if (state.didJustFinish || state.error) cleanup();
    });
    audio.volume = 0.7;
    audio.loop = false;
    audio.play();
  } catch {
    cleanup();
  }
}

/** Called only after the verified template has been saved by the enrollment callback. */
export function playEnrollmentSuccess() {
  return playFingerprintSound("enrolled");
}
