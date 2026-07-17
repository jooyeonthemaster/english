# Corpus v3 review staging

`blind-packet.json` may contain only packet metadata and items whose fields are
exactly `blindId` and `passage`. Target/source maps, reviewer forms, DB passage
IDs, and academy IDs belong under `private/`, which is git-ignored.

No packet is created when corpus preflight reports a supply shortage. A packet
is evidence of a filled candidate queue, not evidence that any item is usable.
