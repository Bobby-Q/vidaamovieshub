# VIDAA Compatibility Notes

- Target remote-first navigation before mouse/touch behavior.
- Keep the frontend dependency-free until playback and focus behavior are validated on the target TV.
- Use HTTPS hosting for real VIDAA/vidaa-edge testing.
- Prefer native HTML5 video first, then add HLS/DASH helpers after capability testing.
- Avoid heavy blur, large shadows, and modern-only browser APIs in the first pass.
