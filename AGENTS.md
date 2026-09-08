# AGENTS.md

## 사용자 작업 수행 원칙

- 사용자의 "절대 안 된다는 건 없다"는 원칙에 따라, 일시적인 실패나 첫 번째 도구 오류만으로 작업이 불가능하다고 단정하지 않는다. 최신 상태를 다시 확인하고, 원인을 진단하며, 지원되는 해결 경로를 끝까지 시도한다.
- 이미 허용된 작업과 통상적인 설정·연결·복구·검증은 직접 수행한다. 사용자가 할 일을 불필요하게 늘리거나, 이미 받은 허락을 반복해서 묻지 않는다.
- 실제 권한·인증·도구의 한계나 상위 지침을 숨기거나 우회하지 않는다. 사용자 조작이 꼭 필요한 경우에는 먼저 가능한 준비를 마치고, 확인한 원인과 필요한 최소 조작만 구체적으로 안내한다. 실행하거나 검증하지 않은 일을 완료했다고 말하지 않는다.

## Non-Negotiable Image Generation Rule

- When Codex is asked to generate images, webtoons, thumbnails, product shots, visual assets, or any image-containing deliverable, Codex must not use this app's backend, CLI scripts, AtlasCloud, OpenRouter image models, Higgsfield, Gemini image APIs, Replicate, or any other external image-generation API.
- Codex must generate images directly through the native Codex image generation capability available in the current session. If that direct image generation capability is unavailable, insufficient for batching, or blocked, stop and report the blocker instead of falling back to an external API.
- For educational webtoon generation, all visible Korean/English text must be generated inside the image itself. Do not generate a blank image and overlay text afterward.
- Do not discard or downgrade already-paid/generated image assets solely because they were made before this rule existed. Existing assets may remain usable if they pass the strict QA requirements, but all future image generation must follow the direct Codex-only rule above.
