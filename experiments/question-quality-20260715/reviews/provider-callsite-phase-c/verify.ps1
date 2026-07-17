param(
  [switch]$Full
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$tsx = Join-Path $repo "node_modules\.bin\tsx.cmd"
$eslint = Join-Path $repo "node_modules\.bin\eslint.cmd"
$tsc = Join-Path $repo "node_modules\.bin\tsc.cmd"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
}

function Require-Text {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Pattern
  )
  $path = Join-Path $repo $RelativePath
  if (-not (Select-String -LiteralPath $path -Pattern $Pattern -Quiet)) {
    throw "Required Phase-C evidence is missing from ${RelativePath}: $Pattern"
  }
}

Push-Location $repo
try {
  foreach ($binary in @($tsx, $eslint, $tsc)) {
    if (-not (Test-Path -LiteralPath $binary)) {
      throw "Missing local binary; verifier will not download dependencies: $binary"
    }
  }

  $manifestPath = Join-Path $PSScriptRoot "manifest.sha256"
  foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ($line -notmatch "^([a-f0-9]{64})  (.+)$") {
      throw "Malformed manifest line: $line"
    }
    $expected = $Matches[1]
    $relative = $Matches[2]
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $relative)).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
      throw "Manifest mismatch: $relative expected=$expected actual=$actual"
    }
  }

  Require-Text "src/lib/question-generation-research-runtime.ts" "expectedQuestionsPerStructuredCall"
  Require-Text "src/lib/question-generation-research-schema.ts" "questions\.length\(researchQuestionCount\)"
  Require-Text "src/lib/question-ai-schemas-mc.ts" "buildResearchAwareQuestionResponseSchema\(schema\)"
  Require-Text "src/lib/atlas-ai.ts" "require_parameters:\s*true"
  Require-Text "src/lib/question-generation-llm.ts" "Research strict structured-output failure is an ITT no-candidate"
  Require-Text "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts" "differs from sealed count"
  Require-Text "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts" "runQuestionGenerationWithEmptyRetry"
  Require-Text "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts" "secondRunBodies.length, 1"

  $productionRunner = Get-ChildItem -LiteralPath (Join-Path $repo "src") -Recurse -File |
    Select-String -Pattern "runPhaseCQuestionGenerationAssignment|new\s+QuestionGenerationCallsiteAdapter" |
    Select-Object -First 1
  if ($null -ne $productionRunner) {
    throw "A production campaign runner now exists; HTTP/Trigger parity must be re-audited."
  }

  Invoke-Checked $tsx --test `
    "tests/unit/atlas-research-fetch-boundary.test.ts" `
    "experiments/question-quality-20260715/harness/atlas-controller.test.ts" `
    "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts" `
    "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/structured-cardinality-wire.test.ts" `
    "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts" `
    "tests/unit/fallback-json-null-promotion.test.mjs" `
    "tests/unit/wave1-schema-order.test.mjs" `
    "tests/unit/wave3-premium-writing.test.mjs"

  Invoke-Checked $tsx "experiments/question-quality-20260715/harness/test.ts"

  if ($Full) {
    Invoke-Checked $eslint `
      "src/lib/question-generation-research-runtime.ts" `
      "src/lib/question-generation-research-schema.ts" `
      "src/lib/question-ai-schemas-mc.ts" `
      "src/lib/atlas-ai.ts" `
      "src/lib/question-generation-llm.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts" `
      "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts" `
      "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts" `
      "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/structured-cardinality-wire.test.ts" `
      "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts" `
      "tests/unit/wave3-premium-writing.test.mjs"
    Invoke-Checked $tsc --noEmit --pretty false
  }

  Write-Host "Phase-C mechanistic policy: PASS"
  Write-Host "Phase-C registered engine-entry route: PASS (one mocked failure fixture)"
  Write-Host "Workbench HTTP/Trigger and full production parity: BLOCK"
} finally {
  Pop-Location
}
