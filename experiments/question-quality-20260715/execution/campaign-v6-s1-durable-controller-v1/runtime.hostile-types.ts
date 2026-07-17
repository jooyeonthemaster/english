/** Compile-only hostile boundary assertions. This file must never be imported at runtime. */
import type { BudgetStore } from "../../harness/ledger";
import type { S1MaterializedCampaign } from "./materialize";
import type {
  S1OfflineTestCredentialEvidence,
  S1OfflineTestPermit,
} from "./runtime.test-support";
import * as productionRuntime from "./runtime";
import type {
  S1DedicatedCredentialCapability,
  S1ExecutionPermit,
} from "./runtime";

type ForbiddenProductionExport = Extract<
  keyof typeof productionRuntime,
  | `${string}ForTesting${string}`
  | `createS1Test${string}`
  | `${string}OfflineTest${string}`
>;

const productionHasNoTestExports: [ForbiddenProductionExport] extends [never]
  ? true
  : never = true;
void productionHasNoTestExports;

declare const offlinePermit: S1OfflineTestPermit;
declare const offlineCredential: S1OfflineTestCredentialEvidence;
declare const campaign: S1MaterializedCampaign;
declare const store: BudgetStore;

// @ts-expect-error A separately branded offline permit cannot enter production.
const cannotBecomeProductionPermit: S1ExecutionPermit = offlinePermit;
// @ts-expect-error Secret-free test evidence cannot become a production credential capability.
const cannotBecomeProductionCredential: S1DedicatedCredentialCapability = offlineCredential;
void cannotBecomeProductionPermit;
void cannotBecomeProductionCredential;

// @ts-expect-error Production reserve rejects the offline permit at compile time.
productionRuntime.reserveS1CampaignBatch({ campaign, permit: offlinePermit, store });
productionRuntime.createS1AssignmentRuntime({
  campaign,
  // @ts-expect-error Production runtime construction rejects the offline permit.
  permit: offlinePermit,
  store,
  assignmentId: "hostile-compile-only",
});
productionRuntime.finalizeS1Campaign({
  campaign,
  // @ts-expect-error Production finalization rejects the offline permit.
  permit: offlinePermit,
  store,
  terminalStatus: "ABORTED_INCOMPLETE",
});
