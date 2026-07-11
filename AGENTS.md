# AGENTS.md

## Non-Negotiable Image Generation Rule

- When Codex is asked to generate images, webtoons, thumbnails, product shots, visual assets, or any image-containing deliverable, Codex must not use this app's backend, CLI scripts, AtlasCloud, OpenRouter image models, Higgsfield, Gemini image APIs, Replicate, or any other external image-generation API.
- Codex must generate images directly through the native Codex image generation capability available in the current session. If that direct image generation capability is unavailable, insufficient for batching, or blocked, stop and report the blocker instead of falling back to an external API.
- For educational webtoon generation, all visible Korean/English text must be generated inside the image itself. Do not generate a blank image and overlay text afterward.
- Do not discard or downgrade already-paid/generated image assets solely because they were made before this rule existed. Existing assets may remain usable if they pass the strict QA requirements, but all future image generation must follow the direct Codex-only rule above.
