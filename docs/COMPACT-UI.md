# Compact mobile visual system

The mobile palette follows the existing admin portal. Admin CSS and behavior are unchanged.

## Components
- `theme.ts`: deep green palette, gradient stops, spacing and motion durations.
- `visual-effects.tsx`: shared accessibility preferences, animated presses, gradients and modal tint/blur.
- `ui.tsx`: 16px page gutters, 12px cards, 48px standard controls, expandable sections that retain mounted input state after first opening.
- Bottom tabs remain in normal navigator layout with safe-area padding and an edge-to-edge tinted surface.
- Photos keep `contain` previews; the compact thumbnails still open the existing full preview/editor.

## Motion and materials
Presses take 150ms, active tabs 200ms, disclosures 220ms. Fingerprint progress only animates on scanner events. Reduced motion disables decorative transitions; system reduced transparency uses opaque surfaces. iOS date sheets use a light blur. Android native date dialogs retain platform rendering; separate-window overlays use a tint instead of attempting unsupported cross-window blur. Android 11 incurs no blur cost.

## Checks
- TypeScript and lint pass.
- 182 existing domain/security/sync/photo tests pass.
- Expo Doctor: 21/21 checks pass.
- Browser demo: purchase and sale save, existing customer reused from profile, phone field retained through closing/reopening optional details.
- Narrow browser checks: Pashto at 320 CSS pixels, Dari at 360 CSS pixels, English at 390×844 CSS pixels, purchase/sale and details. No document horizontal overflow in checked views. Records search returns the empty state; fingerprint search opens and dismisses cleanly with no enrolled templates.
- Real fingerprint capture, native camera/photo editing, keyboard behavior and physical iPhone safe areas still need hands-on checks. The UI work does not replace those checks.

## Release

At the user’s request, additional testing was stopped and the physical Xiaomi production installation was prioritized. The temporary emulator was stopped and removed; no emulator-upgrade success is claimed.
Redesign release: version 1.0.2, Android versionCode 3. Branding follow-up: version 1.0.3, Android versionCode 4, named Radefy MobileReg. The launcher, monochrome launcher, splash, iOS icon configuration and web favicon reuse the exact PNG displayed on the sign-in screen; the app title uses the brand name in all three languages. Use the existing production signing key and an in-place upgrade (`adb install -r`); do not uninstall or clear app storage.
