param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "VERIFY_FAIL: $Message" }
}

function Get-LowerSha256 {
    param([string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-TextSha256 {
    param([string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $digest = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
    return ([System.BitConverter]::ToString($digest)).Replace('-', '').ToLowerInvariant()
}

$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$casesPath = Join-Path $root 'cases.json'
$manifestPath = Join-Path $root 'PRE_INSPECTION_MANIFEST.json'
$requiredFiles = @(
    'cases.json',
    'ORACLE_PROTOCOL.md',
    'verify_author_seal.ps1',
    'IMMUTABILITY.md',
    'PRE_INSPECTION_MANIFEST.json'
)
foreach ($name in $requiredFiles) {
    Assert-True (Test-Path -LiteralPath (Join-Path $root $name) -PathType Leaf) "missing required file $name"
}

$doc = Get-Content -Raw -Encoding UTF8 -LiteralPath $casesPath | ConvertFrom-Json
Assert-True ($doc.schemaVersion -ceq 'deterministic-structural-holdout-v10.1') 'schemaVersion mismatch'
Assert-True ($doc.setId -ceq 'deterministic-structural-reaudit-v10') 'setId mismatch'
$cases = @($doc.cases)
Assert-True ($cases.Count -eq 200) "expected 200 cases, found $($cases.Count)"
Assert-True ((@($cases.id | Sort-Object -Unique)).Count -eq 200) 'case IDs are not unique'

$familyNames = @(
    'SUMMARY_COMPLETE_MC',
    'GRAMMAR_ERROR_LEADING_LABEL',
    'SENTENCE_ORDER_COMPLETE_UNITS',
    'SENTENCE_ORDER_STANDALONE_LABELS'
)
foreach ($family in $familyNames) {
    $group = @($cases | Where-Object { $_.family -ceq $family })
    Assert-True ($group.Count -eq 50) "$family expected 50 cases, found $($group.Count)"
    Assert-True ((@($group | Where-Object { $_.expected -ceq 'DEFECT' })).Count -eq 25) "$family defect balance mismatch"
    Assert-True ((@($group | Where-Object { $_.expected -ceq 'NORMAL' })).Count -eq 25) "$family normal balance mismatch"
}
Assert-True ((@($cases | Where-Object { $_.expected -notin @('DEFECT','NORMAL') })).Count -eq 0) 'unknown expected label'

$pairs = @($cases | Group-Object pairId)
Assert-True ($pairs.Count -eq 100) "expected 100 pairs, found $($pairs.Count)"
foreach ($pair in $pairs) {
    $members = @($pair.Group)
    Assert-True ($members.Count -eq 2) "pair $($pair.Name) does not have two members"
    Assert-True ((@($members.family | Sort-Object -Unique)).Count -eq 1) "pair $($pair.Name) crosses families"
    Assert-True ((@($members.expected | Sort-Object -Unique)).Count -eq 2) "pair $($pair.Name) is not DEFECT/NORMAL"
}

foreach ($case in $cases) {
    $predicted = $null
    switch ($case.family) {
        'SUMMARY_COMPLETE_MC' {
            $options = @($case.fixture.options)
            Assert-True ($options.Count -ge 3) "$($case.id): fewer than three options"
            Assert-True ((@($options.key | Sort-Object -Unique)).Count -eq $options.Count) "$($case.id): duplicate option key"
            Assert-True ((@($options.text | Sort-Object -Unique)).Count -eq $options.Count) "$($case.id): duplicate option text"
            Assert-True ($options.key -ccontains [string]$case.fixture.storedKey) "$($case.id): stored key absent"
            $quoted = @($options | Where-Object { [string]::Equals([string]$_.text, [string]$case.fixture.carrier.quotedText, [System.StringComparison]::Ordinal) })
            Assert-True ($quoted.Count -eq 1) "$($case.id): quote does not uniquely equal one whole option"
            Assert-True (([string]$case.fixture.carrier.text).Contains([string]$case.fixture.carrier.quotedText)) "$($case.id): carrier text omits quoted text"
            Assert-True ($case.fixture.carrier.authority -cin @('AUTHORITATIVE','NON_AUTHORITATIVE')) "$($case.id): invalid authority"
            if ($case.fixture.carrier.authority -ceq 'AUTHORITATIVE') {
                Assert-True ($case.fixture.carrier.kind -cin @('final','required','completed')) "$($case.id): invalid authoritative kind"
                if ($quoted[0].key -cne $case.fixture.storedKey) { $predicted = 'DEFECT' } else { $predicted = 'NORMAL' }
            } else {
                Assert-True ($case.fixture.carrier.kind -cin @('comparison','negation')) "$($case.id): invalid non-authoritative kind"
                $predicted = 'NORMAL'
            }
        }
        'GRAMMAR_ERROR_LEADING_LABEL' {
            $inventory = $case.fixture.renderedLabelInventory
            $labels = @($inventory.labels)
            Assert-True ($inventory.state -cin @('present','empty','absent')) "$($case.id): invalid inventory state"
            if ($inventory.state -ceq 'present') {
                Assert-True ($labels.Count -gt 0) "$($case.id): present inventory has no labels"
            } else {
                Assert-True ($labels.Count -eq 0) "$($case.id): absent/empty inventory has labels"
            }
            $ref = $case.fixture.leadingReference
            $text = [string]$case.fixture.keyPoint
            Assert-True ($text.Contains([string]$ref.token)) "$($case.id): keyPoint omits recorded token"
            if ([bool]$ref.explicit -and [bool]$ref.atStart) {
                Assert-True ($text.TrimStart().StartsWith([string]$ref.token, [System.StringComparison]::Ordinal)) "$($case.id): recorded leading token is not at start"
                $literalMatch = $false
                foreach ($label in $labels) {
                    if ([string]::Equals([string]$label, [string]$ref.token, [System.StringComparison]::Ordinal)) { $literalMatch = $true; break }
                }
                if ($literalMatch) { $predicted = 'NORMAL' } else { $predicted = 'DEFECT' }
            } else {
                Assert-True (-not [bool]$ref.atStart) "$($case.id): non-explicit start is outside frozen fixtures"
                $predicted = 'NORMAL'
            }
        }
        'SENTENCE_ORDER_COMPLETE_UNITS' {
            $paragraphs = @($case.fixture.paragraphs)
            $analysis = @($case.fixture.unitAnalysis)
            Assert-True ($paragraphs.Count -eq $analysis.Count) "$($case.id): paragraph/analysis length mismatch"
            Assert-True ($paragraphs.Count -ge 1) "$($case.id): no paragraphs"
            for ($i = 0; $i -lt $paragraphs.Count; $i++) {
                Assert-True ([string]$paragraphs[$i] -ceq [string]$analysis[$i].text) "$($case.id): analysis text mismatch at $i"
            }
            if ((@($analysis | Where-Object { -not [bool]$_.independentFiniteUnit })).Count -gt 0) { $predicted = 'DEFECT' } else { $predicted = 'NORMAL' }
        }
        'SENTENCE_ORDER_STANDALONE_LABELS' {
            $entries = @($case.fixture.entries)
            $required = @('(A)','(B)','(C)')
            $ok = ($entries.Count -eq 3)
            if ($ok) {
                for ($i = 0; $i -lt 3; $i++) {
                    $labelOk = [string]::Equals([string]$entries[$i].labelNode, [string]$required[$i], [System.StringComparison]::Ordinal)
                    $placementOk = [string]::Equals([string]$entries[$i].placement, 'standalone', [System.StringComparison]::Ordinal)
                    if (-not $labelOk -or -not $placementOk) { $ok = $false; break }
                }
            }
            if ($ok) { $predicted = 'NORMAL' } else { $predicted = 'DEFECT' }
        }
        default { throw "VERIFY_FAIL: $($case.id): unknown family" }
    }
    Assert-True ($predicted -ceq [string]$case.expected) "$($case.id): oracle predicted $predicted, sealed expected $($case.expected)"
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
Assert-True ($manifest.manifestVersion -ceq 'pre-inspection-seal-v10.1') 'manifest version mismatch'
Assert-True ([bool]$manifest.sealedBeforeProductionInspection) 'pre-inspection declaration is false'
$sealed = @($manifest.sealedFiles)
Assert-True ($sealed.Count -eq 4) 'manifest must seal four payload files'
$expectedSealed = @('cases.json','ORACLE_PROTOCOL.md','verify_author_seal.ps1','IMMUTABILITY.md')
Assert-True (@(Compare-Object $expectedSealed @($sealed.path)).Count -eq 0) 'manifest sealed-file set mismatch'
$sealLines = @()
foreach ($entry in $sealed) {
    $relative = [string]$entry.path
    Assert-True (-not $relative.Contains('/') -and -not $relative.Contains('\') -and -not $relative.Contains('..')) "unsafe manifest path $relative"
    $path = Join-Path $root $relative
    $actualLength = (Get-Item -LiteralPath $path).Length
    $actualHash = Get-LowerSha256 $path
    Assert-True ($actualLength -eq [long]$entry.bytes) "$relative byte length mismatch"
    Assert-True ($actualHash -ceq ([string]$entry.sha256).ToLowerInvariant()) "$relative SHA-256 mismatch"
    $sealLines += ($relative + [char]9 + [string]$entry.bytes + [char]9 + ([string]$entry.sha256).ToLowerInvariant())
}
$canonicalSeal = ($sealLines -join [char]10) + [char]10
Assert-True ((Get-TextSha256 $canonicalSeal) -ceq ([string]$manifest.payloadSealSha256).ToLowerInvariant()) 'aggregate payload seal mismatch'
$caseIdText = ((@($cases.id) -join [char]10) + [char]10)
Assert-True ((Get-TextSha256 $caseIdText) -ceq ([string]$manifest.caseIdOrderSha256).ToLowerInvariant()) 'case ID order seal mismatch'
Assert-True ([int]$manifest.counts.total -eq 200) 'manifest total mismatch'

Write-Output 'VERIFY_OK deterministic-structural-reaudit-v10'
foreach ($family in $familyNames) {
    Write-Output ("COUNT {0} total=50 defect=25 normal=25" -f $family)
}
Write-Output ("SEAL {0}" -f ([string]$manifest.payloadSealSha256).ToLowerInvariant())
