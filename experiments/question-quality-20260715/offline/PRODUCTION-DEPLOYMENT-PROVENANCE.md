# Production deployment provenance

Deployment: `dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD`
URL: `nara-qn6rcsvkh-jooyoens-projects-59877186.vercel.app`
Metadata Git SHA: `467c6d107137a91088d3eba1620ba4036a63d709`
Metadata branch: `20260714jooyeon`
CLI dirty flag: `1`

The metadata SHA is not the full source identity because this was a CLI deployment from a dirty worktree. The table below compares Vercel's pinned per-file raw SHA-1 identifiers with the current worktree and every content-changing Git revision. `HISTORY_RECONSTRUCTABLE_DRIFT` means the exact deployed bytes (allowing only line-ending normalization) can be reconstructed from the listed commit; `DEPLOYED_UNMATCHED_DRIFT` cannot.

## Summary

- Relevant deployed files: 69
- Relevant current/deployed union: 71
- CURRENT_EXACT: 58
- HISTORY_RECONSTRUCTABLE_DRIFT: 11
- LOCAL_ONLY_POST_DEPLOYMENT: 2

## File provenance

| File | Status | Deployed UID | Newest reconstructing commit |
|---|---:|---|---|
| `package-lock.json` | CURRENT_EXACT | `21d86bebf57e2482136b32d0699c29a9d64e2686` | `434d6d61c89e` (crlf) |
| `package.json` | CURRENT_EXACT | `aec434ea2c2c26bf179e0a1556a703b92eb6316e` | `434d6d61c89e` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/build-analysis-context.ts` | CURRENT_EXACT | `7ad1d29a86af6ed049d5268057ef30140d9238b3` | `744ade9f2c50` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/constants.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `da29405af7739707af5598efec0f413f619ae286` | `3f155ca682ba` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts` | CURRENT_EXACT | `631f50736e83ca4b55ec6aad9d9f920d9ecf2ca9` | `3f155ca682ba` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts` | CURRENT_EXACT | `fdb47555047b83eb5fb8d6ce817e123a81f4b5d2` | `448488cae9ab` (git-object-bytes) |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts` | CURRENT_EXACT | `10f8af4e4ace66b84d9fcaabc661e2da8ae60d18` | `448488cae9ab` (git-object-bytes) |
| `src/app/api/ai/generate-questions-auto/_lib/prompts.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `2044e358fa51a991219b99028f7c733859982565` | `448488cae9ab` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/question-repair.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `0839bea55cec9ec3c44c1b52d0fa492624a1b817` | `448488cae9ab` (crlf) |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `6bf6c7c53137deb89d8377f1eb813f996d6021e1` | `448488cae9ab` (git-object-bytes) |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts` | CURRENT_EXACT | `745be1479ba240e80cbd96422c0890fd490f0841` | — |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-types.ts` | CURRENT_EXACT | `8eacf69572adc48d58dce076069e5edc7f1ad79e` | `3f155ca682ba` (git-object-bytes) |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `7a5a7422e2d681e6136ba1d3647b3116229dcec3` | `448488cae9ab` (git-object-bytes) |
| `src/app/api/ai/generate-questions-auto/_lib/schemas.ts` | CURRENT_EXACT | `69dece0c3f440e77553290135be701225f30f82b` | `744ade9f2c50` (crlf) |
| `src/app/api/ai/generate-questions-auto/route.ts` | CURRENT_EXACT | `f91411896ffaf9f097b45ee1f29cf586760f8637` | `b93ed8578758` (crlf) |
| `src/app/api/workbench/ai-jobs/question-generation/fast/route.ts` | CURRENT_EXACT | `90cb0acdeeb7fd97e07ce81e35fbb0602d55a5ad` | `448488cae9ab` (crlf) |
| `src/app/api/workbench/ai-jobs/question-generation/route.ts` | CURRENT_EXACT | `497d2d1a95f9662f83477c7400ea90f467ad0407` | `591cdb413c8b` (crlf) |
| `src/lib/atlas-ai.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `8d84cd8da7b804f0463a92e0606bb34e46305ff3` | `448488cae9ab` (crlf) |
| `src/lib/atlas-chat-rest.ts` | CURRENT_EXACT | `e88f8911760e1d475de2462407a442edc868a71b` | `3b9457ca770b` (crlf) |
| `src/lib/atlas-research-fetch-boundary.ts` | LOCAL_ONLY_POST_DEPLOYMENT | — | — |
| `src/lib/atlas.ts` | CURRENT_EXACT | `5ea6a91fb1047eee970847036f2bb2eb51dfca38` | `c3720bfb7cc2` (crlf) |
| `src/lib/question-generation-llm.ts` | CURRENT_EXACT | `ec278b8d64342204290926eea120c38c523032d4` | `448488cae9ab` (crlf) |
| `src/lib/question-generation-persistence.ts` | CURRENT_EXACT | `bfcd808c3f53c19e440a37b754167ff00b082b54` | `27372abb9742` (crlf) |
| `src/lib/question-generation-plans.ts` | CURRENT_EXACT | `b35fcdf10733f13e904a02e90f566176bb2c8a5b` | `448488cae9ab` (crlf) |
| `src/lib/question-generation-prompt-contract.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `75cf601d985dc615b6fe2bc87d195333ab2238ba` | `448488cae9ab` (crlf) |
| `src/lib/question-quality/candidate-blocks/antonym.ts` | CURRENT_EXACT | `07e172093e444b5ddd189e5383c5c93fa1f5353f` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/candidate-blocks/blank.ts` | CURRENT_EXACT | `7ca24e2101ae17147ddf356e0d6293c803ecd1a1` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/candidate-blocks/grammar.ts` | CURRENT_EXACT | `3f1a101f50a41cfd0d30ac49d1fe4d517c555537` | `448488cae9ab` (crlf) |
| `src/lib/question-quality/candidate-blocks/implied.ts` | CURRENT_EXACT | `dee4ba57dba515ee16c2712352327132e0f7f38f` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/candidate-blocks/index.ts` | CURRENT_EXACT | `9a6f8cc0c7b7b751c05c993c6965ee5503a524ca` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/candidate-blocks/irrelevant.ts` | CURRENT_EXACT | `25e59d318ab9c8b57e9f99a562ddd043f2dc054d` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/candidate-blocks/reference.ts` | CURRENT_EXACT | `91ec70dd39e3db641c8b3728f41bd1a87e627f65` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/candidate-blocks/shared.ts` | CURRENT_EXACT | `04091232cd4d9968666b3404d877060e3389a796` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/core.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `deebd250ce98cd46d39102539ca5fd0333b9130a` | `27372abb9742` (crlf) |
| `src/lib/question-quality/dispatcher.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `fb297a318e7cc8e56c12db8f9482a2b272f4684b` | `448488cae9ab` (crlf) |
| `src/lib/question-quality/feasibility.ts` | CURRENT_EXACT | `6d4b850bc9c702e995e2a9d8bb6bdef1c2d25100` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/index.ts` | CURRENT_EXACT | `f69094b33d28c2f9da80c27b9aed3975618ff4d4` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/rubric.ts` | CURRENT_EXACT | `ffd76a0b9e576aad61bd433285698e7d88f00c70` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/antonym.ts` | CURRENT_EXACT | `ab9cb70ff6e9e7de61720a6ff5a4c19885f70d66` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/blank/fill-key.ts` | CURRENT_EXACT | `1760feb3ec926706309efbd033616c190fd8ffe7` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/blank/inference-distractor.ts` | CURRENT_EXACT | `736272d63b466b928c0c3816a062fe35095f360a` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/blank/inference.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `ed77dc14b0570a54e1ecf83469b3197858cf1d3f` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/blank/multi.ts` | CURRENT_EXACT | `c3b07c19de1d19e3f159f26af8c0779782faeaf6` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/blank/paraphrase.ts` | CURRENT_EXACT | `96351302f7ae0bce8c0dd595209835c06cb0b6de` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/blank/seam.ts` | LOCAL_ONLY_POST_DEPLOYMENT | — | — |
| `src/lib/question-quality/validators/blank/shared.ts` | CURRENT_EXACT | `e192a678231d87be62ba016e4df59b094cb9a1cf` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/conditional-writing.ts` | CURRENT_EXACT | `4b9ff6e5941d125fa2d4a89e9bc4251fca39a441` | `3f155ca682ba` (git-object-bytes) |
| `src/lib/question-quality/validators/content-match.ts` | CURRENT_EXACT | `f42c65d2dda0c554c19998abae73dc8a829c4a12` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/grammar/combo.ts` | HISTORY_RECONSTRUCTABLE_DRIFT | `e840f42a5b744a62f8b5ae76f3423ece66e3f149` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/grammar/correction.ts` | CURRENT_EXACT | `3bb87fe6e0d16f6c9a11aa792bd9f1532525cd49` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/grammar/explanation-lint.ts` | CURRENT_EXACT | `b589d7b05526014f95808a56f84457509705a09a` | `448488cae9ab` (git-object-bytes) |
| `src/lib/question-quality/validators/grammar/marked.ts` | CURRENT_EXACT | `0326cf31642523ca60f607dbad843cf691d82019` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/grammar/nonword-filler.ts` | CURRENT_EXACT | `a67efbf88ddad96506e8587ac1d1011ce471ebae` | `448488cae9ab` (git-object-bytes) |
| `src/lib/question-quality/validators/grammar/shared.ts` | CURRENT_EXACT | `cc75a29d5d1f7fdae3fad40c7d5d4047c12b721b` | `448488cae9ab` (crlf) |
| `src/lib/question-quality/validators/implied-distractor.ts` | CURRENT_EXACT | `e9c2cc0c64d67da7bf8df0bf6ba7fb278306230f` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/implied.ts` | CURRENT_EXACT | `a87947e244bdc3664ab99c4e16034d4e7a1e2239` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/irrelevant.ts` | CURRENT_EXACT | `be48f3610f05c8d5764d2e463b1ee8187defd1ce` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/misc.ts` | CURRENT_EXACT | `26349c6fe646457874cd3003989d2209a602da95` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/options.ts` | CURRENT_EXACT | `01b8a0674151f5a03e1fea566bdcf32528e5586d` | `27372abb9742` (crlf) |
| `src/lib/question-quality/validators/reference.ts` | CURRENT_EXACT | `81eb82f8aaa2058952348dc7b38a7e08e741e11c` | `3f155ca682ba` (git-object-bytes) |
| `src/lib/question-quality/validators/sentence-insert.ts` | CURRENT_EXACT | `f277c154e33104c2c462ae885c3864f22c2e7266` | — |
| `src/lib/question-quality/validators/sentence-order.ts` | CURRENT_EXACT | `a7b446bf008ec1c723322b43d4dcdac204db27ab` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/summary/complete.ts` | CURRENT_EXACT | `01d696657461b7a62315fa284e59945350540af1` | `27372abb9742` (git-object-bytes) |
| `src/lib/question-quality/validators/summary/killer-trap.ts` | CURRENT_EXACT | `ff4712749f187ec91092f07885f5a18c71a2bdeb` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/summary/mc.ts` | CURRENT_EXACT | `a508fa6b9c2aac78350615694de12a9b5a0e8758` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/summary/writing.ts` | CURRENT_EXACT | `61981b745cd0a44bce9eab6779827697d378d7f1` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/topic-sentence/writing.ts` | CURRENT_EXACT | `8b95e246c985999d38fa58a65776385a25d60442` | `3f155ca682ba` (crlf) |
| `src/lib/question-quality/validators/topic.ts` | CURRENT_EXACT | `560f9c0f2dc99d30bde331f4773640f049afe6e5` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/vocab.ts` | CURRENT_EXACT | `33ad4fa2032a250ac5f4b6d888e323fdfdb3cf72` | `5701cfc89cb4` (crlf) |
| `src/lib/question-quality/validators/word-order.ts` | CURRENT_EXACT | `6a3f5f0c56e965bef1a8c6bc9f9d4bfd2755c42f` | `3f155ca682ba` (git-object-bytes) |
| `src/trigger/workbench-question-generation.ts` | CURRENT_EXACT | `d99e6fb2a6f24eb5bf332ccf7ad746edf0135e30` | `d98da5a58a6e` (crlf) |

## Interpretation guard

Historical database rows must be joined to the production snapshot actually serving at their generation time. The current worktree, metadata SHA alone, and any single historical commit are not substitutes for this dirty deployment's per-file provenance.
