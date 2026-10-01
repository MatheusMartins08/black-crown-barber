# Gallery comparison images

The current combined comparison and team photo sources are documented in [current-gallery-and-team-images.md](./current-gallery-and-team-images.md). The prompts and filenames below document previous versions; their unused image files have been removed from `public/`.


## Previous seated comparisons

Generated using built-in `imagegen`. The shared before image feeds both independent sliders. Both edits use the shared before as their reference; each changes only its designated service. Assets are 1448 × 1086 (4:3):

- `public/gallery-seated-before.png`
- `public/gallery-seated-beard-after.png`
- `public/gallery-seated-hair-after.png`

### Seated before prompt

Use case: photorealistic-natural. Create a single photorealistic BEFORE photograph for a barbershop website, landscape 4:3. One fictional adult man around 32 seated in a classic barber chair in a real-looking barbershop. Three-quarter lateral camera angle, his face turned slightly to the right of the image so his left temple, cheek and beard contour are clearly visible. Composition: entire head with generous headroom, shoulders, black barber cape and recognizable leather chair headrest and part of the chair visible; medium close-up, face centered. He has genuinely LONG grown-out dark brown hair, thick messy waves reaching his shoulders, long bulky sides, and a full grown-out untidy beard with uneven cheeks and neck edges and stray hairs. Neutral expression, realistic skin pores, natural hair texture. Soft window lighting, softly defocused barbershop mirror and cabinetry in warm neutral tones, no other people. Natural candid professional photo, not glossy CGI or a beauty-retouched model. No text, logo, labels, watermark, montage or split screen. This one fixed photo will be edited separately for beard-only and hair-only comparisons; facial features, seated pose, background and camera framing must be reproducible.

### Beard-only edit prompt

Use case: identity-preserve edit. Edit this exact photo for the AFTER of a beard-only barbershop comparison. Change ONLY the beard and moustache: trim the bulky untidy beard to an elegant short full beard with tidy even length, clean sharp cheek line, precise neckline and neatly groomed moustache. Keep beard natural and dark brown. Preserve the entire LONG shoulder-length hair exactly unchanged. Preserve this exact man, face position, eyes, gaze, nose, lips, expression, ears, skin texture, seated pose, black cape, barber chair, mirrors, cabinets, background, lighting, framing, perspective and image dimensions. Pixel-aligned face and background for an overlaid slider, no zoom or camera move. Photorealistic. No text, labels, watermark or collage. Only beard grooming changes.

### Hair-only edit prompt

Use case: identity-preserve edit. Edit this exact photo for the AFTER of a hair-only barbershop comparison. Change ONLY scalp hair: replace all shoulder-length long hair with a professional neat short men's haircut, clean low-to-mid skin fade on sides and back, naturally styled textured dark brown top about 5 cm long. Remove the long locks around shoulders, revealing the same black cape and background behind them. Preserve the entire original untidy full beard and moustache exactly unchanged. Preserve this exact man, face position, eyes, gaze, nose, lips, expression, ears, skin texture, seated pose, black cape, barber chair, mirrors, cabinets, background, lighting, framing, perspective and image dimensions. Pixel-aligned face and background for an overlaid slider, no zoom or camera move. Photorealistic. No text, labels, watermark or collage. Only scalp haircut changes.

These fictional, AI-generated images illustrate a male haircut. They are not photographs of the shop's work. Generated with the built-in `imagegen` tool; no CLI or API key was used.

- Before: `public/gallery-comparison-before.png`
- After: `public/gallery-comparison-after.png`
- Both assets: 1448 × 1086 pixels (4:3).

## Before prompt

Use case: photorealistic-natural. Asset: BEFORE photograph for an illustrative male haircut comparison on a barbershop website. Generate a single photorealistic 4:3 landscape photograph, 1200x900 if possible. One fictional adult man around 30, dark brown overgrown unstyled hair with long bulky sides, short neat stubble beard, neutral expression, three-quarter portrait turned slightly to his left so the right temple and side haircut are visible. Head and shoulders centered, entire hair and shoulders visible with comfortable margins. Wearing a plain charcoal crew neck t-shirt, muted light gray-green studio background, soft natural lighting, realistic skin and hair texture. Camera fixed at eye level. No barber, hands, tools, accessories, text, labels, watermark, collage or split screen. This is the before asset; hair is grown out but realistic. Composition must be easy to reproduce exactly in a subsequent edit changing only the haircut.

## After edit prompt

Input: the generated before image.

Use case: identity-preserve edit. Create the AFTER asset of this exact male haircut comparison. Change ONLY the scalp hair: replace the overgrown haircut with a professional low-to-mid skin fade on the visible temple and sides, neatly tapered back, shorter textured dark brown top styled naturally. Preserve the exact same man, every facial feature, face position, eyes, gaze, neutral expression, stubble beard, ears, neck, shoulders, t-shirt, background, lighting, color, camera angle and framing. The face must align pixel-for-pixel with the reference for an overlaid before/after slider. Keep original image dimensions and 4:3 landscape composition. Photorealistic natural hair texture. No text, labels, watermark, collage or split screen. Change only the hair; do not retouch face or beard.
