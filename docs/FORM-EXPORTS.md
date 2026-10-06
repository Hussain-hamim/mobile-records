# Transaction form exports

The default print, PDF and picture presentation is `pashto-v2`, rendered by
`src/domain/print-form-v2.ts`. It uses Pashto independently of the app language,
Kabul time, the selected Solar Hijri/Gregorian calendar and A4 paper.

The layout includes customer and shop identities, phone specifications, price,
the accepted customer/Tazkira images, the seller declaration, and physical
signature/thumbprint spaces. Missing images have explicit placeholders. The
biometric panel is included only when the current customer has an enrolled
fingerprint. Its symbol is not a captured fingerprint or proof of identity.

Photos and enrollment status are resolved at export time, as the document notes.
Images are embedded JPEGs; temporary download URLs, raw fingerprint templates,
and local paths never enter the document. Existing receipt scope checks and
private photo access remain in use.

## Historical compatibility

The **Original draft layout** option retains the existing `draft-v1` renderer
and its language behavior. Selecting a layout does not alter saved transaction
snapshots or their database template-version field. `pashto-v2` is an export
presentation version, shown in its footer; it does not claim that the original
record was saved with a different template.

Keep both renderers when adding future presentation versions. Do not replace
the original renderer with a mutable alias to the newest layout. Attachments
can change independently of historical transaction details.

## Verification

- Focused tests cover Pashto defaults, direction mapping, conditional biometric
  display, embedded-photo validation, escaping, and legacy compatibility.
- Synthetic purchase and sale PDFs fit one A4 page; long details continue onto
  additional pages. Check actual Android printer output before client rollout.
- Wording follows the supplied Pashto reference in a redesigned layout. This
  is not a claim of government approval; have the client review the declaration
  and one printed purchase and sale for their paperwork requirements.
