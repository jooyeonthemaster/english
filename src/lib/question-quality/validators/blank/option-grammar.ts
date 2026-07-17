const HIGH_CONFIDENCE_PAST_ONLY_FORMS = new Set([
  "arose",
  "awoke",
  "became",
  "began",
  "blew",
  "broke",
  "brought",
  "bought",
  "caught",
  "came",
  "chose",
  "clung",
  "crept",
  "dealt",
  "did",
  "dug",
  "drew",
  "drank",
  "drove",
  "ate",
  "fell",
  "fled",
  "flew",
  "forbade",
  "forgot",
  "forgave",
  "froze",
  "gave",
  "went",
  "grew",
  "had",
  "heard",
  "hid",
  "knew",
  "lent",
  "meant",
  "rode",
  "rang",
  "ran",
  "said",
  "sent",
  "shook",
  "sang",
  "sank",
  "sat",
  "slept",
  "spoke",
  "stood",
  "stole",
  "stuck",
  "stung",
  "struck",
  "swam",
  "swore",
  "swung",
  "taught",
  "tore",
  "told",
  "threw",
  "took",
  "understood",
  "woke",
  "wore",
  "won",
  "wrote",
]);

const SPENT_ADJECTIVE_NOUNS = new Set([
  "ammunition",
  "batteries",
  "battery",
  "cartridge",
  "cartridges",
  "case",
  "cases",
  "energy",
  "force",
  "forces",
  "fuel",
  "fuels",
  "material",
  "materials",
  "resource",
  "resources",
  "shell",
  "shells",
  "uranium",
]);

export interface InfinitivePastFormFinding {
  form: string;
  index: number;
}

/**
 * Detect only high-confidence "to + simple-past" sequences. Forms with common
 * base-word or adjectival readings (found, left, paid, saw, etc.) are omitted.
 * "spent" is retained for the production failure while allowing ordinary
 * prepositional noun phrases such as "to spent fuel".
 */
export function findInfinitivePastOnlyForms(
  text: string,
): InfinitivePastFormFinding[] {
  const findings: InfinitivePastFormFinding[] = [];
  const pattern = /\bto\s+([A-Za-z]+)\b/g;

  for (const match of text.matchAll(pattern)) {
    const rawForm = match[1];
    if (rawForm !== rawForm.toLowerCase()) continue;

    const form = rawForm.toLowerCase();
    const index = match.index ?? 0;
    if (HIGH_CONFIDENCE_PAST_ONLY_FORMS.has(form)) {
      findings.push({ form, index });
      continue;
    }

    if (form !== "spent") continue;
    const tail = text.slice(index + match[0].length);
    const nextWord = tail.match(/^\s+([A-Za-z]+)/)?.[1]?.toLowerCase();
    if (nextWord && SPENT_ADJECTIVE_NOUNS.has(nextWord)) continue;
    findings.push({ form, index });
  }

  return findings;
}
