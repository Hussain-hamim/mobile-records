# Fingerprint feedback

The three user-supplied MP3s are bundled and played locally:

- `registerSuccessTone.mp3`: a verified fingerprint was successfully saved by the enrollment callback.
- `fingerSuccess.mp3`: lookup found an existing customer's fingerprint and opens/fills their profile.
- `wrongfinger.mp3`: no match, ambiguous/duplicate enrollment, rejected extraction, mismatched impressions, verification mismatch, or scan timeout. Repeated native callbacks are throttled to avoid a continuous error tone.

A retry itself does not play a success sound. Reader connection checks, USB/permission failures, cancelled scans, fingerprint removal, and failed saves do not play success feedback. Keep the visual instructions/error message as the authoritative explanation.

One sound plays at a time; a different outcome replaces the prior sound. Cancellation/retry stops incomplete feedback. A completed match/enrollment sound can finish while the profile opens or the enrollment sheet closes. Backgrounding stops playback. Feedback uses media volume and can play in silent/vibrate mode; it never blocks a scan or a saved enrollment. No microphone access is used. Development builds load bundled assets from Metro; packaged release assets play locally.

An Android development APK containing the already-installed `expo-audio` module is required. Older APKs keep working silently until rebuilt; missing audio cannot break fingerprint capture.

`enrollment-success.wav` is the earlier generated chime and is no longer used. The MP3 assets are supplied by the project owner; confirm redistribution rights before publishing the app.
