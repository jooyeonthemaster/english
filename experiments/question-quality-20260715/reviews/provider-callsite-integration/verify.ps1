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
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file is missing: $RelativePath"
  }
  if (-not (Select-String -LiteralPath $path -Pattern $Pattern -Quiet)) {
    throw "Required evidence is missing from ${RelativePath}: $Pattern"
  }
}

Push-Location $repo
try {
  if (-not (Test-Path -LiteralPath $tsx)) {
    throw "Local tsx binary is missing; verifier will not download dependencies."
  }

  $manifestPath = Join-Path $PSScriptRoot "manifest.sha256"
  foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ($line -notmatch "^([a-f0-9]{64})  (.+)$") {
      throw "Malformed manifest line: $line"
    }
    $expectedHash = $Matches[1]
    $relativePath = $Matches[2]
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $relativePath)).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "Manifest mismatch: $relativePath expected=$expectedHash actual=$actualHash"
    }
  }

  # Transport and stage topology.
  Require-Text "src/lib/atlas-ai.ts" "fetch:\s*atlasResearchFetch"
  Require-Text "src/lib/question-generation-research-runtime.ts" "question\.candidate-repair-json"
  Require-Text "src/lib/question-generation-research-runtime.ts" "grammar\.ladder\.repair"
  Require-Text "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts" "runQuestionGenerationResearchOperation"
  Require-Text "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts" "strict-schema failure cannot silently downgrade"

  # These are deliberate blocker sentinels. If either disappears, the audit
  # must be refreshed rather than silently inheriting the old BLOCK verdict.
  Require-Text "src/lib/question-ai-schemas-mc.ts" "questions:\s*z\.array\(schema\)"
  Require-Text "src/lib/question-generation-llm.ts" "output:\s*Output\.json\(\)"

  $productionConstruction = Get-ChildItem -LiteralPath (Join-Path $repo "src") -Recurse -File |
    Select-String -Pattern "new\s+QuestionGenerationCallsiteAdapter" |
    Select-Object -First 1
  if ($null -ne $productionConstruction) {
    throw "A production adapter construction now exists; refresh and re-audit the sealed runner before claiming this snapshot."
  }

  Invoke-Checked $tsx --test `
    "tests/unit/atlas-research-fetch-boundary.test.ts" `
    "experiments/question-quality-20260715/harness/atlas-controller.test.ts" `
    "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts"

  Invoke-Checked $tsx "experiments/question-quality-20260715/harness/test.ts"

  if ($Full) {
    if (-not (Test-Path -LiteralPath $eslint) -or -not (Test-Path -LiteralPath $tsc)) {
      throw "Local eslint/tsc binaries are missing; verifier will not download dependencies."
    }
    Invoke-Checked $eslint `
      "src/lib/atlas-research-fetch-boundary.ts" `
      "src/lib/question-generation-research-runtime.ts" `
      "src/lib/question-generation-llm.ts" `
      "src/lib/atlas-ai.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts" `
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts" `
      "src/lib/korean/quality/solver-gate.ts" `
      "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts" `
      "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts"
    Invoke-Checked $tsc --noEmit --pretty false
  }

  Write-Host "provider/callsite zero-network evidence: PASS"
  Write-Host "full production parity: BLOCK (sentinels confirmed)"
} finally {
  Pop-Location
}
