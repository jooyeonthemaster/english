# NARA Credit-Based Billing System - Architecture Design

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Prisma Schema Additions](#2-prisma-schema-additions)
3. [Credit Cost Matrix](#3-credit-cost-matrix)
4. [Subscription Plan Tiers](#4-subscription-plan-tiers)
5. [API Route Structure](#5-api-route-structure)
6. [File Structure](#6-file-structure)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Concurrency & Race Conditions](#8-concurrency--race-conditions)
9. [Edge Cases & Safety](#9-edge-cases--safety)
10. [Migration Strategy](#10-migration-strategy)

---

## 1. System Overview

```
+------------------+       +-------------------+       +------------------+
|   Public Site    |       |  Director App     |       |  Super Admin     |
|  (Registration)  |       |  (Existing)       |       |  (New)           |
+--------+---------+       +--------+----------+       +--------+---------+
         |                          |                            |
         v                          v                            v
+--------+----------+    +----------+---------+    +-------------+--------+
| /api/register     |    | /api/ai/*          |    | /api/admin/*         |
| AcademyRegistration|    | + credit check     |    | Monitoring, Approvals|
+--------+----------+    +----------+---------+    +-------------+--------+
         |                          |                            |
         +------------+-------------+----------------------------+
                      |
              +-------+--------+
              |   Credit       |
              |   Service      |
              |   (lib/credits)|
              +-------+--------+
                      |
              +-------+--------+
              |  PostgreSQL    |
              |  (Supabase)   |
              +----------------+
```

Three new actor types:
- **Super Admin**: Platform operator (developer). Approves academies, monitors everything.
- **Academy Director**: Existing role. Now sees credit balance, subscription status, usage.
- **Public Visitor**: Can submit academy registration requests.

---

## 2. Prisma Schema Additions

### 2.1 New Enums (as string constants)

All enums are stored as strings (consistent with existing schema pattern):

```
SubscriptionTier: "STARTER" | "STANDARD" | "PREMIUM" | "ENTERPRISE"
SubscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
CreditTransactionType: "ALLOCATION" | "CONSUMPTION" | "TOP_UP" | "ADJUSTMENT" | "REFUND" | "RESET" | "ROLLOVER"
OperationType: "QUESTION_GEN_SINGLE" | "QUESTION_GEN_VOCAB" | "PASSAGE_ANALYSIS" | "AUTO_GEN_BATCH" | "LEARNING_QUESTION_GEN" | "QUESTION_EXPLANATION" | "QUESTION_MODIFY" | "AI_CHAT" | "TEXT_EXTRACTION"
RegistrationStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
AcademyStatus: "ACTIVE" | "TRIAL" | "SUSPENDED" | "DEACTIVATED"
RolloverPolicy: "RESET" | "ROLLOVER" | "PARTIAL_ROLLOVER"
```

### 2.2 New Models

```prisma
// ============================================================================
// 20. PLATFORM ADMINISTRATION & BILLING
// ============================================================================

/// SuperAdmin -- Platform-level administrator (developer/operator)
/// role: "SUPER_ADMIN" | "SUPPORT"
model SuperAdmin {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      String   @default("SUPER_ADMIN") // "SUPER_ADMIN" | "SUPPORT"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  reviewedRegistrations AcademyRegistration[] @relation("ReviewedBy")
  creditAdjustments     CreditTransaction[]   @relation("AdjustedBy")

  @@map("super_admins")
}

/// SubscriptionPlan -- Catalog of available plans (rarely changes)
/// tier: "STARTER" | "STANDARD" | "PREMIUM" | "ENTERPRISE"
/// rolloverPolicy: "RESET" | "ROLLOVER" | "PARTIAL_ROLLOVER"
model SubscriptionPlan {
  id              String   @id @default(cuid())
  name            String   // Display name: "스타터", "스탠다드", "프리미엄"
  tier            String   @unique // "STARTER" | "STANDARD" | "PREMIUM" | "ENTERPRISE"
  monthlyPrice    Int      // KRW (e.g., 300000)
  monthlyCredits  Int      // Credits allocated per month
  maxStudents     Int      // Max active students
  maxStaff        Int      // Max active staff (including director)
  features        String   @db.Text // JSON: feature flags
  rolloverPolicy  String   @default("RESET") // "RESET" | "ROLLOVER" | "PARTIAL_ROLLOVER"
  rolloverMaxRate Float    @default(0) // For PARTIAL_ROLLOVER: 0.2 = 20% cap
  description     String?  @db.Text // Plan description for display
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  subscriptions AcademySubscription[]

  @@map("subscription_plans")
}

/// AcademySubscription -- Active subscription instance per academy
/// status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
model AcademySubscription {
  id                 String    @id @default(cuid())
  academyId          String
  planId             String
  status             String    @default("TRIAL") // "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  trialEndsAt        DateTime? // If on trial
  cancelledAt        DateTime?
  graceEndsAt        DateTime? // Read-only access period after expiry
  paymentMethod      String?   // "CARD" | "TRANSFER" | "KAKAO_PAY"
  paymentReference   String?   // External payment system reference
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  // Relations
  academy Academy          @relation(fields: [academyId], references: [id])
  plan    SubscriptionPlan @relation(fields: [planId], references: [id])

  @@index([academyId])
  @@index([status])
  @@index([currentPeriodEnd]) // For cron: find expiring subscriptions
  @@map("academy_subscriptions")
}

/// CreditBalance -- Current credit state per academy (single row per academy)
model CreditBalance {
  id                  String   @id @default(cuid())
  academyId           String   @unique
  balance             Int      @default(0) // Current available credits
  monthlyAllocation   Int      @default(0) // Credits from plan
  bonusCredits        Int      @default(0) // From top-ups still remaining
  totalConsumed       Int      @default(0) // Lifetime consumption counter
  totalAllocated      Int      @default(0) // Lifetime allocation counter
  lowCreditThreshold  Int      @default(50) // Warning when balance drops below
  lastResetAt         DateTime? // Last monthly reset timestamp
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  // Relations
  academy Academy @relation(fields: [academyId], references: [id])

  @@map("credit_balances")
}

/// CreditTransaction -- Immutable audit log of every credit change
/// type: "ALLOCATION" | "CONSUMPTION" | "TOP_UP" | "ADJUSTMENT" | "REFUND" | "RESET" | "ROLLOVER"
/// operationType: specific AI operation that consumed credits (null for non-consumption)
model CreditTransaction {
  id             String   @id @default(cuid())
  academyId      String
  type           String   // "ALLOCATION" | "CONSUMPTION" | "TOP_UP" | "ADJUSTMENT" | "REFUND" | "RESET" | "ROLLOVER"
  amount         Int      // Positive = credit added, Negative = credit consumed
  balanceAfter   Int      // Balance snapshot after this transaction
  operationType  String?  // "QUESTION_GEN_SINGLE" | "PASSAGE_ANALYSIS" | etc.
  description    String?  // Human-readable description
  referenceId    String?  // Related entity ID (questionId, passageId, etc.)
  referenceType  String?  // "QUESTION" | "PASSAGE" | "EXAM" | etc.
  staffId        String?  // Staff who triggered the operation
  adminId        String?  // SuperAdmin who made adjustment (if applicable)
  metadata       String?  @db.Text // JSON: { model, inputTokens, outputTokens, costUsd, durationMs, promptHash }
  createdAt      DateTime @default(now())

  // Relations
  academy Academy     @relation(fields: [academyId], references: [id])
  admin   SuperAdmin? @relation("AdjustedBy", fields: [adminId], references: [id])

  @@index([academyId, createdAt])
  @@index([academyId, type])
  @@index([academyId, operationType])
  @@index([staffId])
  @@index([createdAt]) // For admin analytics across all academies
  @@map("credit_transactions")
}

/// CreditTopUp -- Additional credit purchase records
/// status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED"
model CreditTopUp {
  id               String    @id @default(cuid())
  academyId        String
  creditAmount     Int       // Credits purchased
  price            Int       // KRW paid
  paymentMethod    String?   // "CARD" | "TRANSFER" | "KAKAO_PAY"
  paymentReference String?   // External transaction ID
  status           String    @default("PENDING") // "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED"
  completedAt      DateTime?
  requestedBy      String?   // staffId
  createdAt        DateTime  @default(now())

  // Relations
  academy Academy @relation(fields: [academyId], references: [id])

  @@index([academyId])
  @@index([status])
  @@map("credit_top_ups")
}

/// AcademyRegistration -- Pending academy registration requests
/// status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
model AcademyRegistration {
  id              String    @id @default(cuid())
  // Academy info
  academyName     String
  businessNumber  String?   // 사업자등록번호
  phone           String
  address         String?
  estimatedStudents Int?    // How many students they expect
  // Director info
  directorName    String
  directorEmail   String
  directorPhone   String
  // Request details
  message         String?   @db.Text // Why they want to use the platform
  desiredPlan     String?   // Requested tier
  // Review
  status          String    @default("PENDING") // "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  reviewedById    String?   // SuperAdmin who reviewed
  reviewNote      String?   @db.Text
  reviewedAt      DateTime?
  // Result
  academyId       String?   // Set after approval, links to created Academy
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  reviewedBy SuperAdmin? @relation("ReviewedBy", fields: [reviewedById], references: [id])

  @@index([status])
  @@index([createdAt])
  @@map("academy_registrations")
}
```

### 2.3 Modifications to Existing Models

```prisma
/// Academy -- ADD these fields and relations
model Academy {
  // ... existing fields ...
  status String @default("ACTIVE") // "ACTIVE" | "TRIAL" | "SUSPENDED" | "DEACTIVATED"

  // ... existing relations ...
  subscription       AcademySubscription[]
  creditBalance      CreditBalance?
  creditTransactions CreditTransaction[]
  creditTopUps       CreditTopUp[]
}
```

---

## 3. Credit Cost Matrix

| Operation | Code Constant | Credits | Rationale |
|-----------|--------------|---------|-----------|
| Single question generation (MC) | `QUESTION_GEN_SINGLE` | 2 | ~1500 tokens, moderate complexity |
| Vocab question generation | `QUESTION_GEN_VOCAB` | 1 | Simpler, shorter output |
| Passage analysis (5-layer) | `PASSAGE_ANALYSIS` | 5 | Heavy: ~4000 input + 2000 output tokens |
| Auto-generation batch (~10 Qs) | `AUTO_GEN_BATCH` | 15 | Planning step + multiple generation calls |
| Learning question (naeshin) | `LEARNING_QUESTION_GEN` | 2 | Similar to single MC |
| Generate explanation | `QUESTION_EXPLANATION` | 1 | Short output |
| Modify question (AI rewrite) | `QUESTION_MODIFY` | 1 | Targeted edit, short |
| AI chat message (student) | `AI_CHAT` | 1 | Per message, conversational |
| Text/PDF extraction | `TEXT_EXTRACTION` | 3 | OCR processing |

### Credit Cost Configuration (in code)

```typescript
// src/lib/credit-costs.ts
export const CREDIT_COSTS: Record<string, number> = {
  QUESTION_GEN_SINGLE: 2,
  QUESTION_GEN_VOCAB: 1,
  PASSAGE_ANALYSIS: 5,
  AUTO_GEN_BATCH: 15,
  LEARNING_QUESTION_GEN: 2,
  QUESTION_EXPLANATION: 1,
  QUESTION_MODIFY: 1,
  AI_CHAT: 1,
  TEXT_EXTRACTION: 3,
} as const;

export type OperationType = keyof typeof CREDIT_COSTS;
```

---

## 4. Subscription Plan Tiers

### STARTER (스타터) -- 300,000 KRW/month

| Attribute | Value |
|-----------|-------|
| Monthly Credits | 500 |
| Max Students | 50 |
| Max Staff | 3 |
| Rollover Policy | RESET (no rollover) |
| Features | Question generation (single), Passage analysis, Exam builder, Student app, Attendance, Billing |
| Excluded | Auto-generation, Learning system (naeshin-lingo), Parent reports, Advanced analytics |

### STANDARD (스탠다드) -- 500,000 KRW/month

| Attribute | Value |
|-----------|-------|
| Monthly Credits | 1,200 |
| Max Students | 150 |
| Max Staff | 8 |
| Rollover Policy | PARTIAL_ROLLOVER (20% cap) |
| Features | All STARTER features + Auto-generation, Learning system, Parent app basic, Calendar sync |
| Excluded | Advanced analytics, Custom prompts bulk |

### PREMIUM (프리미엄) -- 1,000,000 KRW/month

| Attribute | Value |
|-----------|-------|
| Monthly Credits | 3,000 |
| Max Students | 500 |
| Max Staff | 20 |
| Rollover Policy | ROLLOVER (full, capped at 1 month worth) |
| Features | All STANDARD features + Advanced analytics, Parent reports, Priority support, Custom branding |

### ENTERPRISE (엔터프라이즈) -- Custom pricing

| Attribute | Value |
|-----------|-------|
| Monthly Credits | Custom (5,000+) |
| Max Students | Unlimited |
| Max Staff | Unlimited |
| Rollover Policy | ROLLOVER (unlimited) |
| Features | All PREMIUM features + Dedicated support, SLA, Custom integrations, API access, White-label |

### Credit Top-Up Pricing

| Package | Credits | Price (KRW) | Per-Credit Cost |
|---------|---------|-------------|-----------------|
| Small | 100 | 15,000 | 150/credit |
| Medium | 300 | 40,000 | 133/credit |
| Large | 700 | 80,000 | 114/credit |
| Bulk | 1,500 | 150,000 | 100/credit |

Note: Plan credits cost ~100-200 KRW/credit depending on tier, top-ups are intentionally ~15-50% more expensive to incentivize plan upgrades.

### Feature Flags JSON Structure

```json
{
  "questionGenSingle": true,
  "questionGenVocab": true,
  "passageAnalysis": true,
  "autoGeneration": false,
  "learningSystem": false,
  "parentReports": false,
  "advancedAnalytics": false,
  "customPrompts": true,
  "examBuilder": true,
  "studentApp": true,
  "parentApp": false,
  "apiAccess": false,
  "customBranding": false,
  "maxExamsPerMonth": 20,
  "maxAiChatMessagesPerStudent": 50
}
```

---

## 5. API Route Structure

### 5.1 Super Admin API Routes

```
POST   /api/admin/auth/login           -- Super admin login (separate from staff auth)
POST   /api/admin/auth/logout          -- Super admin logout
GET    /api/admin/auth/session         -- Get current admin session

GET    /api/admin/dashboard            -- System-wide stats summary
GET    /api/admin/academies            -- List all academies with subscription/credit info
GET    /api/admin/academies/[id]       -- Single academy detail
PATCH  /api/admin/academies/[id]       -- Update academy (status, etc.)

POST   /api/admin/academies/[id]/credits    -- Manual credit adjustment (+/-)
GET    /api/admin/academies/[id]/credits    -- Academy credit history
GET    /api/admin/academies/[id]/usage      -- Academy AI usage stats

GET    /api/admin/registrations             -- List registration requests (filterable by status)
GET    /api/admin/registrations/[id]        -- Single registration detail
PATCH  /api/admin/registrations/[id]        -- Approve/reject with note

GET    /api/admin/plans                     -- List all plans
POST   /api/admin/plans                     -- Create new plan
PATCH  /api/admin/plans/[id]               -- Update plan
DELETE /api/admin/plans/[id]               -- Deactivate plan (soft delete)

GET    /api/admin/analytics/overview        -- Revenue, active academies, credit consumption trends
GET    /api/admin/analytics/usage           -- AI operation breakdown (by type, by academy, by time)
GET    /api/admin/analytics/revenue         -- Subscription + top-up revenue over time
GET    /api/admin/analytics/export          -- CSV/JSON export of analytics data

GET    /api/admin/logs                      -- AI generation logs (all academies, paginated)
GET    /api/admin/logs/[id]                -- Single log detail (prompt, result, cost)
```

### 5.2 Credit & Subscription API Routes (Academy-Facing)

```
GET    /api/credits/balance            -- Current academy credit balance
GET    /api/credits/history            -- Credit transaction history (paginated)
GET    /api/credits/usage-summary      -- Usage breakdown by operation type for current period

POST   /api/credits/top-up             -- Request credit top-up (initiates payment)
POST   /api/credits/top-up/confirm     -- Confirm payment (webhook or callback)

GET    /api/subscription/current       -- Current subscription details
POST   /api/subscription/change        -- Request plan change (upgrade/downgrade)
POST   /api/subscription/cancel        -- Cancel subscription
```

### 5.3 Public Registration API

```
POST   /api/register                   -- Submit academy registration request
GET    /api/register/status/[id]       -- Check registration status (by registration ID)
GET    /api/plans/public               -- Get available plans for public display
```

### 5.4 Modified Existing AI Routes (add credit checks)

Every existing AI route gains a credit check wrapper:

```
POST /api/ai/generate-question         -- +2 credits (QUESTION_GEN_SINGLE)
POST /api/ai/generate-questions-auto   -- +15 credits (AUTO_GEN_BATCH) + feature check
POST /api/ai/passage-analysis/[id]     -- +5 credits (PASSAGE_ANALYSIS)
POST /api/ai/generate-learning-question -- +2 credits (LEARNING_QUESTION_GEN)
POST /api/ai/generate-explanation      -- +1 credit (QUESTION_EXPLANATION)
POST /api/ai/modify-question           -- +1 credit (QUESTION_MODIFY)
POST /api/ai/chat                      -- +1 credit per message (AI_CHAT)
POST /api/ai/extract-text              -- +3 credits (TEXT_EXTRACTION)
```

---

## 6. File Structure

```
src/
  app/
    (admin)/                              # NEW: Super admin route group
      layout.tsx                          # Admin shell (dark sidebar, separate from director)
      admin/
        page.tsx                          # Dashboard: system KPIs
        login/
          page.tsx                        # Super admin login
        academies/
          page.tsx                        # Academy list with search/filter/sort
          [academyId]/
            page.tsx                      # Academy detail: subscription, credits, usage, staff
        registrations/
          page.tsx                        # Registration queue (pending/all)
          [registrationId]/
            page.tsx                      # Review single registration
        plans/
          page.tsx                        # Plan management CRUD
        analytics/
          page.tsx                        # Main analytics dashboard
          usage/
            page.tsx                      # AI usage deep-dive
          revenue/
            page.tsx                      # Revenue analytics
        logs/
          page.tsx                        # AI generation log viewer
        settings/
          page.tsx                        # System settings (credit costs, rate limits, etc.)

    (director)/director/                  # EXISTING: Add new pages
      subscription/
        page.tsx                          # Current plan, usage meter, upgrade CTA
      credits/
        page.tsx                          # Credit balance, transaction history, top-up

    (public)/                             # NEW: Public pages route group
      register/
        page.tsx                          # Academy registration form
        success/
          page.tsx                        # "Application submitted" confirmation
        status/
          page.tsx                        # Check registration status

    api/
      admin/                              # NEW: Admin API routes
        auth/
          login/route.ts
          logout/route.ts
          session/route.ts
        dashboard/route.ts
        academies/
          route.ts                        # GET list
          [academyId]/
            route.ts                      # GET detail, PATCH update
            credits/route.ts             # GET history, POST adjust
            usage/route.ts               # GET usage stats
        registrations/
          route.ts                        # GET list
          [registrationId]/
            route.ts                      # GET detail, PATCH approve/reject
        plans/
          route.ts                        # GET list, POST create
          [planId]/
            route.ts                      # PATCH update, DELETE deactivate
        analytics/
          overview/route.ts
          usage/route.ts
          revenue/route.ts
          export/route.ts
        logs/
          route.ts                        # GET paginated logs
          [logId]/
            route.ts                      # GET single log detail
      credits/                            # NEW: Credit API routes
        balance/route.ts
        history/route.ts
        usage-summary/route.ts
        top-up/
          route.ts                        # POST request top-up
          confirm/route.ts               # POST payment confirmation
      subscription/                       # NEW: Subscription API routes
        current/route.ts
        change/route.ts
        cancel/route.ts
      register/                           # NEW: Public registration
        route.ts                          # POST submit
        status/
          [id]/route.ts                   # GET check status
      plans/
        public/route.ts                   # GET available plans
      cron/                               # NEW: Scheduled jobs
        credit-reset/route.ts            # Monthly credit reset
        subscription-check/route.ts      # Check expired subscriptions

  lib/
    credits.ts                            # NEW: Credit service (deduct, refund, check, getCost)
    credit-costs.ts                       # NEW: Credit cost constants
    admin-auth.ts                         # NEW: Super admin auth helpers
    subscription.ts                       # NEW: Subscription service helpers
    feature-gate.ts                       # NEW: Feature flag checking

  components/
    admin/                                # NEW: Admin UI components
      admin-shell.tsx                     # Admin layout shell
      admin-sidebar.tsx
      academy-table.tsx
      registration-review-card.tsx
      credit-adjustment-dialog.tsx
      analytics-charts.tsx
      usage-chart.tsx
      revenue-chart.tsx
      log-viewer.tsx
    credits/                              # NEW: Credit UI components
      credit-balance-badge.tsx            # Shows balance in header (director)
      credit-usage-chart.tsx
      credit-history-table.tsx
      top-up-dialog.tsx
      low-credit-warning.tsx
    subscription/                         # NEW: Subscription UI components
      plan-card.tsx
      plan-comparison-table.tsx
      current-plan-summary.tsx
      upgrade-dialog.tsx

  hooks/
    use-credits.ts                        # NEW: SWR/React Query hook for credit balance
    use-subscription.ts                   # NEW: Hook for subscription data

  middleware.ts                           # MODIFY: Add academy status check, admin route protection
```

---

## 7. Data Flow Diagrams

### 7.1 Question Generation with Credit Check

```
Director/Teacher                    API Route                     Credit Service              AI Service
     |                                  |                              |                         |
     |-- POST /api/ai/generate-question |                              |                         |
     |                                  |                              |                         |
     |                           getSession()                          |                         |
     |                           validate request                      |                         |
     |                                  |                              |                         |
     |                           deductCredits(academyId, 'QUESTION_GEN_SINGLE', 2, staffId)     |
     |                                  |------------------------------>|                         |
     |                                  |                              |                         |
     |                                  |     UPDATE credit_balances   |                         |
     |                                  |     SET balance = balance-2  |                         |
     |                                  |     WHERE academyId=X       |                         |
     |                                  |       AND balance >= 2       |                         |
     |                                  |                              |                         |
     |                                  |  if count=0: INSUFFICIENT   |                         |
     |                           <------|- return 402                  |                         |
     |  "Insufficient credits"          |                              |                         |
     |                                  |                              |                         |
     |                                  |  if count=1: SUCCESS        |                         |
     |                                  |     INSERT credit_transaction|                         |
     |                                  |  <---------------------------|                         |
     |                                  |                              |                         |
     |                                  |-- generateObject(prompt) ----|------------------------>|
     |                                  |                              |                         |
     |                                  |                              |              AI processes
     |                                  |                              |                         |
     |                                  |<----- AI result -------------|-------------------------|
     |                                  |                              |                         |
     |                            if AI fails:                         |                         |
     |                           refundCredits(academyId, 2)           |                         |
     |                                  |------------------------------>|                         |
     |                                  |     UPDATE balance += 2      |                         |
     |                                  |     INSERT refund transaction |                         |
     |                                  |                              |                         |
     |                            if AI succeeds:                      |                         |
     |                           save Question to DB                   |                         |
     |                           UPDATE transaction.referenceId        |                         |
     |                                  |                              |                         |
     |  <--- return question ---------- |                              |                         |
```

### 7.2 Academy Registration Flow

```
Public Visitor              API                Super Admin            API                  DB
     |                       |                      |                   |                    |
     |-- POST /api/register  |                      |                   |                    |
     |   {academyName,       |                      |                   |                    |
     |    directorEmail,...}  |                      |                   |                    |
     |                       |                      |                   |                    |
     |                  validate input               |                   |                    |
     |                  check duplicate email         |                   |                    |
     |                       |--- INSERT academy_registrations (PENDING) ----------------->|
     |                       |                      |                   |                    |
     |  <-- { id, status }   |                      |                   |                    |
     |                       |                      |                   |                    |
     |                       |   [notification]     |                   |                    |
     |                       |--------------------->|                   |                    |
     |                       |                      |                   |                    |
     |                       |          Reviews registration            |                    |
     |                       |                      |                   |                    |
     |                       |         PATCH /api/admin/registrations/[id]                   |
     |                       |          { action: "APPROVE", planId }   |                    |
     |                       |                      |------------------>|                    |
     |                       |                      |                   |                    |
     |                       |                      |            $transaction {              |
     |                       |                      |              INSERT academies          |
     |                       |                      |              INSERT staff (DIRECTOR)   |
     |                       |                      |              INSERT academy_subscriptions
     |                       |                      |              INSERT credit_balances    |
     |                       |                      |              INSERT credit_transactions|
     |                       |                      |              UPDATE academy_registrations
     |                       |                      |            }                           |
     |                       |                      |                   |                    |
     |                       |                      |  <-- success -----|                    |
     |                       |                      |                   |                    |
     |                       |          Send welcome email to director  |                    |
```

### 7.3 Monthly Credit Reset (Cron Job)

```
Cron Trigger              API /api/cron/credit-reset           DB
     |                              |                            |
     |-- GET (with secret key) ---->|                            |
     |                              |                            |
     |                        SELECT academy_subscriptions       |
     |                        WHERE status = 'ACTIVE'            |
     |                          AND currentPeriodEnd <= NOW()     |
     |                              |--------------------------->|
     |                              |<-- expired subscriptions   |
     |                              |                            |
     |                        For each subscription:             |
     |                              |                            |
     |                        GET plan.rolloverPolicy            |
     |                              |                            |
     |                        if RESET:                          |
     |                          balance = plan.monthlyCredits    |
     |                        if ROLLOVER:                       |
     |                          balance = old + monthlyCredits   |
     |                          (capped at 2x monthly)           |
     |                        if PARTIAL_ROLLOVER:               |
     |                          carryover = min(old, monthly*0.2)|
     |                          balance = carryover + monthly    |
     |                              |                            |
     |                        $transaction {                     |
     |                          UPDATE credit_balances           |
     |                          INSERT credit_transaction (RESET)|
     |                          UPDATE subscription periods      |
     |                        }                                  |
     |                              |--------------------------->|
     |                              |                            |
     |  <-- { processed: N } -------|                            |
```

---

## 8. Concurrency & Race Conditions

### 8.1 Atomic Credit Deduction

The critical section is credit deduction. Two teachers generating questions simultaneously must not overdraw.

**Solution**: PostgreSQL atomic UPDATE with conditional WHERE clause.

```typescript
// src/lib/credits.ts

export async function deductCredits(
  academyId: string,
  operationType: OperationType,
  staffId?: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; balanceAfter: number; transactionId: string }> {
  const cost = CREDIT_COSTS[operationType];
  if (!cost) throw new Error(`Unknown operation type: ${operationType}`);

  // Single atomic UPDATE -- PostgreSQL guarantees this is serialized
  // The WHERE balance >= cost prevents overdraft even under concurrency
  const result = await prisma.creditBalance.updateMany({
    where: {
      academyId,
      balance: { gte: cost },
    },
    data: {
      balance: { decrement: cost },
      totalConsumed: { increment: cost },
    },
  });

  if (result.count === 0) {
    // Either academy not found or insufficient balance
    const current = await prisma.creditBalance.findUnique({
      where: { academyId },
    });
    if (!current) throw new Error('Academy credit balance not found');
    throw new InsufficientCreditsError(current.balance, cost);
  }

  // Get updated balance for audit log
  const updated = await prisma.creditBalance.findUnique({
    where: { academyId },
  });

  // Create immutable audit log
  const transaction = await prisma.creditTransaction.create({
    data: {
      academyId,
      type: 'CONSUMPTION',
      amount: -cost,
      balanceAfter: updated!.balance,
      operationType,
      staffId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  return {
    success: true,
    balanceAfter: updated!.balance,
    transactionId: transaction.id,
  };
}
```

### 8.2 Why This Is Safe

1. **Atomicity**: `UPDATE ... SET balance = balance - 2 WHERE balance >= 2` is a single SQL statement. PostgreSQL executes it atomically with row-level locking.
2. **No phantom reads**: The WHERE clause check and the decrement happen in the same statement.
3. **No long-running transactions**: The credit deduction completes in milliseconds. The AI call happens AFTER, not inside a transaction.
4. **Refund on failure**: If the AI call fails after deduction, we increment back (also atomic).

### 8.3 Refund on AI Failure

```typescript
export async function refundCredits(
  academyId: string,
  operationType: OperationType,
  originalTransactionId: string,
  reason?: string,
): Promise<void> {
  const cost = CREDIT_COSTS[operationType];

  await prisma.$transaction(async (tx) => {
    await tx.creditBalance.update({
      where: { academyId },
      data: {
        balance: { increment: cost },
        totalConsumed: { decrement: cost },
      },
    });

    const updated = await tx.creditBalance.findUnique({
      where: { academyId },
    });

    await tx.creditTransaction.create({
      data: {
        academyId,
        type: 'REFUND',
        amount: cost,
        balanceAfter: updated!.balance,
        operationType,
        description: reason || `Refund for failed ${operationType}`,
        referenceId: originalTransactionId,
        referenceType: 'CREDIT_TRANSACTION',
      },
    });
  });
}
```

---

## 9. Edge Cases & Safety

### 9.1 Academy Status Enforcement

Add to `middleware.ts`:

```typescript
// For all /director/* routes:
// 1. Check academy.status !== 'SUSPENDED' and !== 'DEACTIVATED'
// 2. If SUSPENDED: redirect to /suspended page (show reason, contact info)
// 3. If DEACTIVATED: redirect to /login with error

// For all /api/ai/* routes:
// 1. Check academy.status === 'ACTIVE' or 'TRIAL'
// 2. Check subscription status !== 'CANCELLED' and !== 'SUSPENDED'
// 3. Check feature gate for the specific operation
// 4. Check credit balance
```

### 9.2 Feature Gate Checking

```typescript
// src/lib/feature-gate.ts
export async function checkFeature(
  academyId: string,
  feature: string,
): Promise<boolean> {
  const subscription = await prisma.academySubscription.findFirst({
    where: { academyId, status: { in: ['ACTIVE', 'TRIAL'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) return false;

  const features = JSON.parse(subscription.plan.features);
  return features[feature] === true;
}
```

### 9.3 Capacity Limit Enforcement

Before allowing new student/staff creation:

```typescript
export async function checkCapacity(
  academyId: string,
  type: 'student' | 'staff',
): Promise<{ allowed: boolean; current: number; max: number }> {
  const subscription = await getActiveSubscription(academyId);
  const max = type === 'student' ? subscription.plan.maxStudents : subscription.plan.maxStaff;

  const current = type === 'student'
    ? await prisma.student.count({ where: { academyId, status: 'ACTIVE' } })
    : await prisma.staff.count({ where: { academyId, isActive: true } });

  return { allowed: current < max, current, max };
}
```

### 9.4 Grace Period After Subscription Expiry

When subscription expires and payment fails:
1. Status changes to `PAST_DUE`, `graceEndsAt` set to +7 days
2. During grace period: all existing features work, but new AI operations blocked
3. After grace period: status changes to `SUSPENDED`, only read-only access
4. Director sees banner: "Your subscription has expired. Please update payment to continue."

### 9.5 Plan Change (Upgrade/Downgrade)

- **Upgrade**: Immediate effect. Pro-rated credit difference added. New limits apply immediately.
- **Downgrade**: Takes effect at next billing period. If currently over new plan limits (students/staff), show warning but allow the change. Director must reduce before next period.

### 9.6 Super Admin Auth Separation

Super admin auth uses a completely separate mechanism from Staff auth to avoid cookie/session conflicts:

```typescript
// src/lib/admin-auth.ts
// Uses a separate cookie name: 'nara-admin-session'
// JWT with different secret: ADMIN_JWT_SECRET
// Separate login page: /admin/login
// No overlap with NextAuth staff session
```

### 9.7 Rate Limiting

Beyond credit checks, implement per-academy rate limits to prevent abuse even with sufficient credits:

```typescript
// In-memory or Redis-based rate limiter
const RATE_LIMITS = {
  aiRequests: { window: 3600, max: 100 },  // 100 AI requests per hour per academy
  concurrent: { max: 5 },                   // 5 concurrent AI requests per academy
};
```

### 9.8 Low Credit Warning

After every credit deduction, check threshold:

```typescript
if (balanceAfter <= creditBalance.lowCreditThreshold) {
  // Queue notification to director
  // Show warning toast in UI
  // Email notification (if enabled)
}
```

### 9.9 Audit Trail Completeness

Every CreditTransaction stores metadata:

```json
{
  "model": "gemini-2.0-flash",
  "inputTokens": 1523,
  "outputTokens": 847,
  "estimatedCostUsd": 0.0023,
  "durationMs": 3200,
  "promptHash": "a1b2c3d4",
  "questionType": "BLANK_INFERENCE",
  "passageTitle": "Lesson 3 - Global Warming"
}
```

This enables the super admin to:
- Calculate actual AI costs vs revenue
- Identify expensive operations
- Detect anomalous usage patterns
- Export data for financial reporting

---

## 10. Migration Strategy

### Phase 1: Schema & Infrastructure (Week 1)
1. Add new models to `schema.prisma`
2. Run `prisma migrate dev`
3. Create `SuperAdmin` seed record
4. Implement `src/lib/credits.ts` service
5. Implement `src/lib/admin-auth.ts`
6. Seed `SubscriptionPlan` records

### Phase 2: Admin Dashboard (Week 2)
1. Build admin login + shell layout
2. Build academy list + detail pages
3. Build registration review flow
4. Build manual credit adjustment

### Phase 3: Credit Integration (Week 3)
1. Modify all `/api/ai/*` routes to call `deductCredits()`
2. Add `credit-balance-badge` to director layout header
3. Build director `/credits` and `/subscription` pages
4. Add low-credit warnings

### Phase 4: Registration Flow (Week 4)
1. Build public registration form
2. Wire registration review in admin dashboard
3. Implement approval flow (academy + director + subscription creation)
4. Welcome email integration

### Phase 5: Cron & Analytics (Week 5)
1. Monthly credit reset cron job
2. Subscription expiry checks
3. Admin analytics dashboards
4. Export functionality

### Existing Academy Migration
For the current academy (already in production without subscription):
```sql
-- Create a CreditBalance for existing academy
INSERT INTO credit_balances (id, academy_id, balance, monthly_allocation)
VALUES (gen_random_uuid(), 'existing_academy_id', 9999, 9999);

-- Create a subscription on ENTERPRISE plan (grandfathered)
INSERT INTO academy_subscriptions (id, academy_id, plan_id, status, ...)
VALUES (gen_random_uuid(), 'existing_academy_id', 'enterprise_plan_id', 'ACTIVE', ...);
```

---

## Appendix: Credit Service API Summary

```typescript
// src/lib/credits.ts -- Public API

// Deduct credits before AI operation. Throws InsufficientCreditsError.
deductCredits(academyId, operationType, staffId?, metadata?): Promise<DeductResult>

// Refund credits after failed AI operation.
refundCredits(academyId, operationType, originalTransactionId, reason?): Promise<void>

// Check balance without deducting. Returns { balance, isLow, canAfford }.
checkBalance(academyId, operationType?): Promise<BalanceCheck>

// Get credit cost for an operation type.
getCreditCost(operationType): number

// Allocate credits (monthly reset, top-up, admin adjustment).
allocateCredits(academyId, amount, type, adminId?, description?): Promise<void>

// Get transaction history with pagination and filters.
getTransactionHistory(academyId, filters?): Promise<PaginatedTransactions>

// Get usage summary for current billing period.
getUsageSummary(academyId): Promise<UsageSummary>
```
