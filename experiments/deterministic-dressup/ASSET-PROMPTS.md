# Asset generation prompts

Mode: native Codex built-in image generation. No external image API was used.

## Model shared prompt

```text
Use case: photorealistic-natural
Asset type: deterministic dress-up prototype base model
Primary request: full-body front-facing studio photograph of an adult person in an airport security scanner pose
Scene/backdrop: perfectly flat neutral light gray background, no floor line
Subject clothing: fitted matte light-gray sleeveless unitard and close-fitting knee-length shorts; bare feet
Style/medium: photorealistic clinical catalog photography, natural anatomy and skin texture
Composition/framing: exact frontal view; entire body centered; upper arms raised diagonally sideways about 45 degrees; elbows bent 90 degrees; forearms vertical; palms open forward; feet shoulder-width; symmetric
Lighting/mood: soft even flat studio light with minimal shadows
Constraints: one person only; joints and silhouette unobscured; no accessories, text, watermark, crop, or camera tilt
```

Model variants: `short slim narrow frame`, `tall very lean long-limbed`, `average-height broad muscular athletic`, `medium-short plus-size soft round body`, `very tall pear-shaped frame with narrow shoulders, long torso, wide hips and full thighs`.

## Outfit shared prompt

```text
Use case: product-mockup
Asset type: canonical reusable 2D dress-up garment sprite
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background, uniform edge to edge, no floor
Subject arrangement: complete empty outfit as if worn by an invisible mannequin in a rigid airport-security pose; torso upright; upper sleeves extend diagonally upward about 45 degrees; elbows bend 90 degrees; lower sleeves point vertically upward; trousers front-facing below with straight separated legs; no person, skin, head, hands, feet, hanger, mannequin, or props
Style/medium: photorealistic catalog garment cutout with clear seams and fabric texture
Composition/framing: centered full outfit, exact frontal view, generous padding, all cuffs and hems visible
Constraints: one outfit only; no cast shadow, reflection, text, logo, or watermark; background exact flat #00ff00; no green in garment; symmetrical canonical shape
```

Outfit variants: navy two-button business suit; charcoal five-button stand-collar suit; burgundy zip hoodie with white T-shirt and charcoal joggers; blue denim trucker jacket with cream T-shirt and olive cargo trousers; black bomber with sand knit top and sand chinos.

Chroma-key sources were converted locally to RGBA with the installed Codex image-generation skill helper.
