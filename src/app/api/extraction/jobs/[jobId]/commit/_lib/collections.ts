import type { TxClient } from "./types";

export async function ensurePassageCollection(
  tx: TxClient,
  args: {
    academyId: string;
    requestedId?: string;
    name?: string;
    originalFileName: string | null;
  },
): Promise<string | null> {
  const { academyId, requestedId, name, originalFileName } = args;

  if (requestedId) {
    const existing = await tx.passageCollection.findUnique({
      where: { id: requestedId },
      select: { academyId: true },
    });
    if (existing && existing.academyId === academyId) return requestedId;
  }

  const defaultName =
    name ||
    originalFileName ||
    `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`;

  const created = await tx.passageCollection.create({
    data: {
      academyId,
      name: defaultName.slice(0, 120),
      description: "시험지 일괄 등록으로 자동 생성된 컬렉션",
    },
  });
  return created.id;
}

export async function attachPassagesToCollection(
  tx: TxClient,
  collectionId: string,
  passageIds: string[],
) {
  if (passageIds.length === 0) return;
  const maxItem = await tx.passageCollectionItem.findFirst({
    where: { collectionId },
    orderBy: { orderNum: "desc" },
    select: { orderNum: true },
  });
  const baseOrder = (maxItem?.orderNum ?? -1) + 1;
  await tx.passageCollectionItem.createMany({
    data: passageIds.map((passageId, idx) => ({
      collectionId,
      passageId,
      orderNum: baseOrder + idx,
    })),
    skipDuplicates: true,
  });
}

export async function ensureExamCollection(
  tx: TxClient,
  args: { academyId: string; name: string },
): Promise<string | null> {
  const safeName = args.name.slice(0, 120);
  const created = await tx.examCollection.create({
    data: {
      academyId: args.academyId,
      name: safeName,
      description: "시험지 일괄 등록으로 자동 생성된 시험 컬렉션",
    },
  });
  return created.id;
}
