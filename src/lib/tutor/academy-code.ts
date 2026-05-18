import { randomInt } from "node:crypto";

const ACADEMY_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ACADEMY_CODE_LENGTH = 4;
const MAX_ATTEMPTS = 80;

type AcademyCodeClient = {
  academy: {
    findUnique(args: { where: { code: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
};

function createAcademyCodeCandidate() {
  let code = "";
  for (let index = 0; index < ACADEMY_CODE_LENGTH; index += 1) {
    const randomIndex = randomInt(ACADEMY_CODE_ALPHABET.length);
    code += ACADEMY_CODE_ALPHABET[randomIndex];
  }
  return code;
}

export async function createUniqueAcademyCode(client: AcademyCodeClient) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = createAcademyCodeCandidate();
    const existing = await client.academy.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }

  throw new Error("Unable to allocate academy code");
}
