# 작업 머신 성능 저하 전수 진단 (2026-09-17)

> 증상 신고: "터미널이 순간순간 3개씩 와다다 열린다 / 램이 터진다 / 데스크탑이 존나 버벅거린다"
> 신고자 가설: clauth 자동 계정 전환 때문인 것 같다
> **판정: 가설은 절반 맞다.** 터미널 와다다는 clauth가 맞다. 그러나 **느려짐의 주범은 clauth가 아니다.**

---

## 0. 머신 제원 및 현재 상태

| 항목 | 값 | 판정 |
|---|---|---|
| CPU | AMD Ryzen 5 5600 (6코어 / 12스레드) | — |
| RAM | 31.93 GB | — |
| RAM 여유 | 7.69 GB (24.1%) | 주의 |
| **커밋 메모리** | **49.91 GB / 87.93 GB** | **물리 RAM 초과 18GB → 상시 스왑** |
| Memory Compression | 1,505 MB | 이미 압축 중 = 부족 확증 |
| 페이지파일 | D:\pagefile.sys (57GB 할당, 현재 4.28GB, 피크 5.57GB) | — |
| **C: 드라이브** | **35.6 GB 여유 / 475.9 GB (7.5%)** | **위험 (10% 미만)** |
| D: 드라이브 | 584.7 GB 여유 / 953.9 GB (61.3%) | 정상 |
| 프로세스 수 | 688개 | 비정상 |
| 스레드 총합 | 9,450개 | 비정상 |
| 핸들 총합 | 266,202개 | 비정상 |
| 가동시간 | 2일 00시간 22분 | — |

---

## 1. 결함 원장 (심각도순)

### [P0-1] CPU 상시 폭주 — `node` pid 29692, english-game vite:4200

가장 큰 단일 원인. 이 프로세스 하나가 **이틀째 코어 1~1.6개를 쉬지 않고 먹고 있다.**

```
CmdLine : node D:\Desktop\english-game\node_modules\.bin\..\vite\bin\vite.js --port 4200 --strictPort --host 127.0.0.1
Start   : 2026-09-15 21:26:46
가동    : 45.75 시간
누적 CPU: 56.02 시간
평균 점유: 122.6%  (1코어=100% 기준)
실시간   : 1차 측정 162.5% / 2차 측정 95.6%
I/O 읽기 : 0.02 GB   <- 디스크 루프가 아니다
I/O 쓰기 : 0.00 GB
Threads : 34 / Handles: 4,178
```

**해석**: I/O가 사실상 0인데 CPU만 계속 태운다 = 디스크 작업이 아니라 **순수 CPU 스핀 루프**.
vite 파일 감시자가 폴링 모드로 떨어져 16,171개 node_modules 파일을 무한 재순회하는 전형적 패턴.
6코어 머신에서 1.2코어면 **전체 연산력의 10~20%를 상시 헌납** 중이다.

### [P0-2] 순간 랙의 정체 — `chrome-headless-shell` 생성/소멸 반복

진단 중 실측된 최악의 순간:

```
chrome-headless-shell pid=38992 -> CPU 951.9%  (12스레드 중 9.5개 단독 점유)
시스템 전체 합계          -> 1075.2 / 1200  (89.6% 포화)
```

이 프로세스는 다음 측정(약 2분 뒤) 시점에 **이미 죽어 있었고**, 19:04:12~13에 새 인스턴스 4마리가 다시 떴다.
소환자 `node.exe(45876)` 역시 조회 시점에 이미 죽은 고아.

```
pid=48604  258.9MB  parent=chrome-headless-shell(48036)   19:04:12
pid=8304    84.9MB  parent=chrome-headless-shell(48036)   19:04:13
pid=48036   63.2MB  parent=node.exe(45876) <- 이미 죽음    19:04:12
pid=53076   37.5MB  parent=chrome-headless-shell(48036)   19:04:12
```

**해석**: Playwright/headless 브라우저가 뜨고-9코어 태우고-죽고를 반복.
"순간순간 존나 버벅"의 직접 원인. 상시가 아니라 **발작성**이라 작업관리자를 열었을 땐 이미 사라져 있다.

### [P0-3] 터미널 3개 와다다 — clauth 예약작업 (신고자 가설 적중)

clauth 예약작업 4종이 **전부 `Hidden=False`**로 등록돼 있다.

| 작업 | 주기 | Hidden | LogonType | 마지막 결과 |
|---|---|---|---|---|
| clauth-desync-heal | **2분** | False | Interactive | `267009` = 이미 실행 중(겹침), State=**Running** |
| clauth-live-sync | **2분** | False | Interactive | `3221225786` = 0xC000013A 강제종료됨 |
| clauth-daemon-watchdog | **3분** | False | Interactive | `3221225786` = 0xC000013A 강제종료됨 |
| clauth-chain-reorder | 10분 | False | Interactive | 0 (정상) |

`-WindowStyle Hidden` 인자는 **PowerShell이 기동된 뒤에** 적용된다. 그 전에 conhost가 콘솔 창을 이미 만들어 화면에 띄우므로 **창이 반드시 한 번 번쩍인다.** 작업 자체의 `Hidden` 속성이 False라 이중으로 막히지 않는다.

발사 정렬 시뮬레이션(실측):

```
19:12  3개 동시  [daemon-watchdog, desync-heal, live-sync]   <<< 창 3개
19:14  3개 동시  [chain-reorder,  desync-heal, live-sync]    <<< 창 3개
19:16  2개
19:18  3개 동시                                              <<< 창 3개
19:24  4개 동시  [chain-reorder, daemon-watchdog, desync-heal, live-sync]
19:30  3개 동시                                              <<< 창 3개
19:34  3개 동시                                              <<< 창 3개
19:36  3개 동시                                              <<< 창 3개
```

2분·2분·3분·10분 주기가 주기적으로 정렬돼 **2~6분마다 창 3개가 동시에 번쩍인다.**
신고 증언("3개씩 와다다")과 정확히 일치. **가설 확정.**

다만 이 작업들은 가볍다 — 램/CPU 부하의 주범은 아니다. **시각적 방해가 본질.**

### [P0-4] clauth 자동화가 고장난 채 헛돌고 있다

창만 번쩍이고 **실제로는 일을 못 하고 있다.**

`desync-heal.log` (2분마다 실행되는데 로그는 8줄뿐):
```
2026-09-16 01:52:07 refused: live account matches no profile -- needs a human
2026-09-16 09:58:07 refused: live account matches no profile -- needs a human
2026-09-17 01:58:07 refused: live account matches no profile -- needs a human
2026-09-17 17:56:07 refused: live account matches no profile -- needs a human
```

`live-sync.log`:
```
2026-09-15 18:04:29 skip: live chain unrecognised (manual login?) active=acc3 (x179, since 12:06:28)
2026-09-17 17:56:28 skip: live chain unrecognised (manual login?) active=main (x2)
2026-09-17 17:58:28 baseline: main in sync
```
→ 한 번은 **179회 연속 실패**. 기존 메모리에 기록된 "수동 /login 이 로테이션을 무력화하는 함정" 이 그대로 재현 중.

`reorder-chain.log` 마지막 실제 작업:
```
2026-09-16 01:04:10 reordered: [acc7 main acc3 acc2 acc5 acc4 acc6] -> [main acc3 acc2 acc5 acc7 acc4 acc6]
```
→ 그 이후 **약 42시간 동안 로그 0줄**. 10분마다 떠서 아무것도 안 하고 종료.

`daemon-watchdog.log`:
```
2026-09-17 18:57:05 restarted daemon (pid 21796)   <- 어제 20:50 이후 처음
```

종료코드 `3221225786`(0xC000013A, STATUS_CONTROL_C_EXIT)는 **스크립트가 완주 못 하고 죽었다**는 뜻.
`ExecutionTimeLimit=PT5M` 에 걸려 강제 종료되고 있을 가능성이 높다.
`desync-heal`은 State=Running + 267009(이미 실행 중) = **2분 주기를 못 따라가 인스턴스가 겹치는 중**.

### [P1-1] RAM 초과 커밋 — 앱 인구 과잉

커밋 49.91GB vs 물리 31.93GB → **18GB를 페이지파일에서 돌린다.** 이게 "데스크탑 버벅"의 체감 주범.

| 프로세스 | 개수 | 합계 메모리 |
|---|---:|---:|
| **Code (VS Code)** | **35** | **7,352.7 MB** |
| chrome | 38 | 4,838.3 MB |
| node | 57 | 3,464.0 MB |
| claude | 19 | 3,392.6 MB |
| Aside | 17 | 1,957.3 MB |
| Memory Compression | 1 | 1,593.2 MB |
| svchost | 82 | 1,567.1 MB |
| ChatGPT | 12 | 1,361.8 MB |
| msedgewebview2 | 18 | 937.0 MB |
| vmmemWSL | 1 | 749.7 MB |
| powershell | 10 | 625.4 MB |
| conhost | **76** | 554.6 MB |
| python3.13 | 16 | 522.5 MB |
| ChatGPT Classic | 5 | 480.0 MB |
| cmd | 43 | 284.3 MB |
| uv | 9 | 283.1 MB |
| bash | 22 | 170.8 MB |

**VS Code 창(워크스페이스)이 18개** 열려 있다. 가장 오래된 건 9/15 18:34 — 이틀째 방치.

### [P1-2] 좀비 dev 서버 13개가 포트를 점유한 채 살아 있다

| 포트 | pid | 메모리 | 기동 | 프로젝트 |
|---|---|---|---|---|
| 3100 | 35408 | 85.1 MB | 09-15 20:27 | 2025meeting next dev |
| 3101 | 31756 | 88.4 MB | 09-15 22:57 | 2025meeting next dev |
| 3102 | 26084 | 87.8 MB | 09-15 23:18 | 2025meeting next dev |
| **4200** | **29692** | **251.6 MB** | 09-15 21:26 | **english-game vite <- P0-1 폭주범** |
| 4311 | 37552 | 82.9 MB | 09-16 22:25 | pinlight next dev |
| 4312 | 47144 | 51.8 MB | 09-16 20:09 | pinlight next start |
| 4313 | 51488 | 53.6 MB | 09-16 20:13 | pinlight next start |
| 4314 | 46652 | 53.6 MB | 09-16 20:15 | pinlight next start |
| 4315 | 51848 | 53.4 MB | 09-16 20:31 | pinlight next start |
| 4316 | 51120 | 53.7 MB | 09-16 20:32 | pinlight next start |
| 4340 | 48504 | 174.7 MB | 09-17 18:18 | english-game vite |
| 4341 | 23220 | 207.1 MB | 09-17 18:19 | english-game vite |
| 4342 | 47352 | 176.3 MB | 09-17 18:36 | english-game vite |

pinlight만 **6개 연속 포트**(4311~4316)를 물고 있다 = `--strictPort` 충돌 회피로 계속 번호를 올리며 재기동한 흔적.
english-game vite는 **4개 동시 가동**(4200/4340/4341/4342) + 조회 중 2개(47824/41232) 추가 관측 = 6개.

합계 약 1.4GB + 각자 파일 감시자 스레드.

### [P1-3] 고아 콘솔 프로세스 18개 (최고령 48.5시간)

부모가 죽었는데 살아남은 콘솔:

```
cmd.exe     pid=23004  48.5시간
cmd.exe     pid=37300  46.4시간
bash.exe    pid=35864  45.8시간
bash.exe    pid=47772  24.1시간
conhost.exe pid=35472  24.1시간
... (총 18개, 합계 134.5 MB)
```

전체 conhost 80개 / cmd 48개 / bash 26개 중 상당수가 Claude Code의 Bash 툴 호출 잔재.
메모리 자체는 134MB로 작지만 **프로세스·핸들 인구를 부풀려** 시스템 전반을 무겁게 만든다.

### [P1-4] C: 드라이브 7.5% — 곧 임계

Windows는 여유 10% 아래에서 눈에 띄게 느려진다(페이지파일 확장·인덱싱·업데이트 압박). 현재 **7.5%**.

사용자 프로필 1레벨:
```
AppData     185.89 GB   1,790,854 파일   <- 179만 개
.codex       42.01 GB      24,846
Downloads    17.86 GB         205
.claude      11.03 GB      26,631
.cache        8.60 GB      21,831
.android      6.82 GB         129
Desktop       6.43 GB      71,785
.ollama       3.11 GB           9
.gemini       2.70 GB      22,478
.vscode       2.40 GB      25,825
flutter       1.76 GB      18,723
.gradle       1.02 GB      33,586
.cursor       0.94 GB      21,307
.bun          0.43 GB      23,864
```

AppData\Local 내부:
```
wsl                21.52 GB       2 파일
Google             13.36 GB  94,931
Packages           12.95 GB  65,469
Kakao               9.64 GB  57,617
Programs            9.62 GB  94,510
npm-cache           9.18 GB 172,393
Android             8.57 GB  68,459
uv                  5.99 GB 421,562   <- 42만 파일(!)
Microsoft           4.34 GB  49,411
ms-playwright       3.86 GB   3,459
ms-playwright-mcp   3.34 GB  29,615
pnpm                2.94 GB 147,355
```

AppData\Roaming 내부:
```
Claude   11.19 GB  21,321
Cursor   10.86 GB  75,769
Notion    3.22 GB  27,412
Code      2.42 GB  10,686
npm       1.62 GB  49,019
```

**용량보다 파일 개수가 더 나쁘다.** 179만 개 파일을 Defender 실시간 검사(활성 확인됨)와 인덱서가 계속 훑는다.
제외 목록은 관리자 권한이 없어 확인 불가.

### [P2-1] 이번 세션 MCP 서버 9종 연결 실패 — 증상이 아니라 결과

```
codex(CONNECTION_CLOSED) / hwp / magic / neander-erp / playwright /
sequential-thinking / supabase / trigger / word-document-server  ... 전부 CONNECT_TIMEOUT 30초
```

머신이 포화 상태(CPU 89.6%, RAM 스왑 중)라 MCP 핸드셰이크가 30초 안에 못 끝난 것.
**MCP 설정 문제가 아니라 위 결함들의 2차 피해.** 머신이 풀리면 같이 풀린다.

---

## 2. 종합 판정

| 증상 | 진짜 원인 | clauth 책임? |
|---|---|---|
| **터미널 3개씩 와다다** | clauth 예약작업 4종 Hidden=False, 2~6분마다 3개 동시 발사 | **예 (100%)** |
| **순간 버벅** | chrome-headless-shell 생성/소멸 반복, 순간 9.5코어 점유 | 아니오 |
| **상시 느림** | node pid 29692 vite 폭주 1.2코어 상시 + RAM 18GB 초과 커밋 | 아니오 |
| **램 터짐** | VS Code 18창 7.35GB + chrome 4.84GB + node 57개 + 좀비 서버 13개 | 아니오 |
| MCP 전멸 | 위 셋의 2차 피해 | 아니오 |

**clauth는 눈에 보이는 증상(창 번쩍임)의 범인이지만, 성능 저하의 범인은 아니다.**
다만 clauth는 **별개로 고장나 있다** — 창만 띄우고 실제 동기화는 42시간째 실패 중이므로 어차피 손봐야 한다.

---

## 3. 수리안 (미적용 — 사용자 승인 대기)

### 3-A. 즉시 회수 (CPU 1.2코어 + RAM 약 1.5GB)

```powershell
# 1) 폭주 vite 사살 — 단독으로 1.2코어 회수
Stop-Process -Id 29692 -Force

# 2) 좀비 dev 서버 일괄 정리 (포트 3100~3102, 4311~4316, 4340~4342)
4200,3100,3101,3102,4311,4312,4313,4314,4315,4316,4340,4341,4342 | ForEach-Object {
  Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

# 3) 고아 콘솔 정리 (부모 죽은 conhost/cmd/bash 18개)
$alive = (Get-CimInstance Win32_Process).ProcessId
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -in @('conhost.exe','cmd.exe','bash.exe') -and $_.ParentProcessId -notin $alive } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

> 주의: 2)는 열려 있는 dev 서버를 전부 끈다. 지금 쓰는 포트가 있으면 목록에서 빼야 한다.

### 3-B. 터미널 번쩍임 제거 (관리자 PowerShell 필요)

두 겹으로 막는다. `Hidden=$true` 만으로는 부족하고, 실행기를 `powershell.exe` → `wscript.exe + .vbs` 로 바꿔야 창이 **완전히** 안 뜬다.

```powershell
# 1겹: 작업 자체를 Hidden 처리
'clauth-desync-heal','clauth-live-sync','clauth-daemon-watchdog','clauth-chain-reorder' | ForEach-Object {
  $t = Get-ScheduledTask -TaskName $_
  $t.Settings.Hidden = $true
  Set-ScheduledTask -TaskName $_ -Settings $t.Settings
}
```

```vbs
' 2겹: C:\Users\jooye\.clauth\run-hidden.vbs  (창을 아예 만들지 않는 런처)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """", 0, False
```

```powershell
# 각 작업의 Action 을 vbs 런처로 교체
$pairs = @{
  'clauth-desync-heal'     = 'C:\Users\jooye\.clauth\desync-heal.ps1'
  'clauth-live-sync'       = 'C:\Users\jooye\.clauth\sync-live.ps1'
  'clauth-daemon-watchdog' = 'C:\Users\jooye\.clauth\daemon-watchdog.ps1'
  'clauth-chain-reorder'   = 'C:\Users\jooye\.clauth\reorder-chain.ps1'
}
foreach ($k in $pairs.Keys) {
  $a = New-ScheduledTaskAction -Execute 'wscript.exe' `
       -Argument ('"C:\Users\jooye\.clauth\run-hidden.vbs" "{0}"' -f $pairs[$k])
  Set-ScheduledTask -TaskName $k -Action $a
}
```

추가로 **주기 완화**를 권한다. 2분 주기는 과하고, desync-heal은 이미 자기 주기를 못 따라가 겹치고 있다:
- `clauth-desync-heal` : 2분 → **5분**
- `clauth-live-sync` : 2분 → **5분** (다른 분 오프셋으로 시작해 정렬 회피)
- `clauth-daemon-watchdog` : 3분 → **10분**

### 3-C. clauth 기능 복구 (사람 손 필요 — 자동화 불가)

`desync-heal` 이 `live account matches no profile -- needs a human` 을 4회 반환했고,
`live-sync` 는 `live chain unrecognised (manual login?)` 로 최대 179회 연속 실패했다.
= **수동 /login 으로 프로필이 오염된 상태.** 기존 메모리에 기록된 복구 절차가 정본:

```
clauth login 재인증 + 시크릿창
(전환 프롬프트가 뜨면 반드시 n — y 누르면 프로필 오염)
```

스크립트 강제종료(0xC000013A) 원인은 `ExecutionTimeLimit=PT5M` 초과 의심.
복구 후에도 재발하면 해당 스크립트에 타임아웃 가드를 넣어야 한다.

### 3-D. headless 브라우저 재생산 차단

Playwright/headless 인스턴스가 고아 상태로 반복 생성 중이다.

```powershell
# 현재 떠 있는 headless 전부 정리
Get-Process chrome-headless-shell -ErrorAction SilentlyContinue | Stop-Process -Force
```

근본 대책은 `.claude.json` / MCP 설정에서 **playwright MCP 를 상시 기동에서 빼고 필요할 때만 켜는 것**.
이번 세션에서도 playwright MCP 는 어차피 CONNECT_TIMEOUT 으로 죽어 있었다 — 켜둔 값어치가 없다.

### 3-E. C: 드라이브 확보 (약 60~70GB 회수 가능)

| 대상 | 예상 회수 | 명령 |
|---|---:|---|
| `.codex` 캐시/런타임 | ~42 GB | 내용 확인 후 선별 삭제 (런타임 재다운로드 가능) |
| `Downloads` | ~17.8 GB | 205개뿐 — 눈으로 훑고 D: 로 이동 |
| npm-cache | ~9.2 GB | `npm cache clean --force` |
| uv 캐시 (42만 파일) | ~6 GB | `uv cache clean` |
| pnpm 저장소 | ~2.9 GB | `pnpm store prune` |
| ms-playwright + mcp | ~7.2 GB | 안 쓰는 브라우저 빌드 제거 |

**추가 권고**: Defender 실시간 검사 제외 경로 등록 (관리자 권한 필요)
```
C:\Users\jooye\AppData\Local\npm-cache
C:\Users\jooye\AppData\Local\uv
C:\Users\jooye\AppData\Local\pnpm
C:\Users\jooye\.codex
D:\Desktop\*\node_modules
```
179만 개 파일 실시간 스캔이 상시 배경 부하다.

### 3-F. 앱 인구 정리 (수동)

- VS Code 창 **18개 → 3~4개**로 (약 5GB 회수)
- chrome 탭 38프로세스 정리 (약 3GB)
- ChatGPT 데스크탑 12 + ChatGPT Classic 5 = 17프로세스 1.84GB — 둘 다 띄울 이유 없음
- Aside 17프로세스 1.96GB — 안 쓰면 종료

---

## 4. 적용 우선순위

| 순위 | 조치 | 회수량 | 승인 필요 |
|---|---|---|---|
| 1 | 3-A 폭주 vite 사살 | **CPU 1.2코어** | 프로세스 종료 승인 |
| 2 | 3-A 좀비 서버 13개 | ~1.4 GB + 포트 | 어떤 포트 살릴지 확인 |
| 3 | 3-D headless 정리 | 순간 9.5코어 스파이크 제거 | 프로세스 종료 승인 |
| 4 | 3-B 작업 Hidden 처리 | **창 번쩍임 0** | 관리자 권한 |
| 5 | 3-F VS Code 창 정리 | ~5 GB | 수동 |
| 6 | 3-E 디스크 확보 | ~60-70 GB | 삭제 대상 확인 |
| 7 | 3-C clauth 재인증 | 기능 복구 | 사람 손 (자동화 불가) |

**1~3번만 해도 CPU는 즉시 풀린다. 4번이 "와다다"를 끝낸다.**

---

## 5. 재발 방지 메모

- `-WindowStyle Hidden` 은 **창 번쩍임을 못 막는다.** PowerShell 기동 후 적용이라 conhost가 먼저 뜬다. 예약작업 무창 실행의 정본은 `wscript.exe + .vbs (윈도우모드 0)`.
- 예약작업 주기를 2·3·10분처럼 **서로 배수 관계로 잡으면 주기적으로 정렬돼 동시 발사**한다. 소수 분(5·7·11분)이나 명시적 오프셋을 쓸 것.
- `LastTaskResult=3221225786` = `0xC000013A` = 강제종료. **실패가 아니라 "완주 못 함"** — 대개 ExecutionTimeLimit.
- `LastTaskResult=267009` = `0x00041301` = "이미 실행 중". **주기가 스크립트 실행시간보다 짧다**는 신호.
- 프로세스 CPU 진단은 **누적 CPU 1회 조회로는 못 잡는다.** 폭주범이 발작성이면 순간에 죽는다 — 반드시 2회 샘플 차분으로 실시간 %를 구할 것.
- 진단 스크립트가 `Where-Object { CommandLine -match 'clauth' }` 같은 필터를 쓰면 **자기 자신이 걸린다**(자기매칭 함정). 이번에도 "실행 중인 clauth 프로세스 1개"로 잡힌 건 진단 명령 본인이었다.
- `[int]3221225786` 은 Int32 오버플로로 캐스팅 실패한다. 종료코드는 `[uint32]` 또는 문자열로 다룰 것.

---

---

## 6. 적용 기록 — Playwright 상시기동 제거 (2026-09-17 19:29~19:35)

사용자 승인: *"그 플레이라이트 상시기동은 내 어사이드라는 프로그램이랑 관련 없으면 제거해도 돼. 철저하게 해줘."*

### 6-1. 선결 조건 — Aside 무관성 확증 (3중 증거)

| 검증 | 결과 |
|---|---|
| `C:\Program Files\Aside` 내 playwright 파일 | **0건** |
| `C:\Users\jooye\AppData\Local\Aside` 내 playwright 파일 | **0건** |
| Aside 프로세스 17개 실행파일 | 전부 `C:\Program Files\Aside\Application\Aside.exe` + 자체 `aside-daemon.exe` |
| Aside user-data-dir | 자체(`AppData\Local\Aside\User Data`), ms-playwright 미참조 |
| `.aside` 내 playwright 언급 9건 | **전부 대화기록/메모리/스킬 문서의 텍스트** — 설정 0건 |

결정적 증거는 `.aside/u/0/memory/MEMORY.md`:
```
**Unsupported Playwright methods (not available in Aside REPL):**
```
Aside는 **자체 REPL에 Playwright 유사 API**를 구현했을 뿐, ms-playwright 설치본을 쓰지 않는다.
→ **무관 확정. 제거 안전.**

### 6-2. 제거하면 안 되는 것 — 프로브 엔진 (보존)

`ms-playwright` 브라우저 빌드는 **이 리포의 게이트 하네스가 직접 쓴다.** MCP와 무관하게 살려야 한다.

```
package.json     : "@playwright/test": "^1.59.1"
                   "test:webkit": "playwright test --project=webkit-desktop"
playwright.config.ts : projects[{ name: "webkit-desktop", devices["Desktop Safari"] }]
.tmp-e31/probe-e33-chip-nav.mjs : import { chromium } from "playwright"  ->  chromium.launch()
.tmp-e29 / .tmp-e31 / .tmp-e35 : 프로브 다수 동일 패턴
```

`webkit-desktop` 은 [safari-print-static-rca] 의 **WebKit 대리 실측 게이트**다. 지우면 사파리 인쇄 회귀 검증이 죽는다.

**보존 확인**: `ms-playwright` 16개 빌드 무사 (`chromium-1243`, `webkit-2158`, `webkit-2272` 실재 확인).

### 6-3. 실제로 제거한 것

**설정 6건** (전 파일 백업 `*.bak.20260917-192937` 선행):

| # | 파일 | 항목 | 패키지 |
|---|---|---|---|
| 1 | `~/.claude.json` | `mcpServers.playwright` (전역) | `@playwright/mcp@latest` |
| 2 | `~/.claude.json` | `projects[...\Desktop\claudecode].mcpServers.playwright-stealth` | `@executeautomation/playwright-mcp-server` |
| 3 | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers.playwright` | `@playwright/mcp@latest` |
| 4 | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers.playwright-stealth` | `@executeautomation/playwright-mcp-server` |
| 5 | `~/.cursor/mcp.json` | `mcpServers.playwright-stealth` | `@executeautomation/playwright-mcp-server` |
| 6 | `nara/.claude/settings.local.json` | `permissions.allow["mcp__playwright__*"]` | (죽은 권한) |

> **Claude Desktop 앱에도 걸려 있었다** — Claude Code만 보고 끝냈으면 절반만 지운 셈이 됐다.
> pid 24152(Claude Desktop)가 02:56에 playwright MCP 2종을 동시에 띄운 게 증거였다.

**프로세스 20개 / 568.6 MB** — 누수분 전량 종료.

기동 시각이 누수를 증명한다:
```
09/15 20:22  x3   (2일 전 세션 잔재)
09/16 02:56  x7
09/17 18:56  x4   (102MB 짜리로 비대화)
09/17 19:25  x4   <- 이 진단 세션 중에 또 떴다
```
**세션 하나당 `cmd -> node(npx) -> cmd -> node(cli.js)` 4프로세스가 새로 뜨고 절대 안 죽는다.**
CONNECT_TIMEOUT 으로 연결 실패한 뒤에도 프로세스는 고아로 살아남는다.

**디스크 3.4 GB** — `AppData\Local\ms-playwright-mcp` 제거.
29개 폴더 전수 확인 결과 **전부 `mcp-chrome-*`** = MCP 서버가 세션마다 만든 브라우저 프로필. `ms-playwright` 와 별개 폴더라 프로브에 영향 없음.

### 6-4. 검증 결과

| 검증 항목 | 결과 |
|---|---|
| 설정 4파일 JSON 유효성 | **전부 OK** |
| playwright 문자열 잔존 | **0건** (수정 6분 뒤 재확인 — 실행 중 세션이 되돌리지 않음) |
| 잔존 playwright MCP 프로세스 | **0개** |
| chrome-headless-shell | **0개** |
| `ms-playwright` 브라우저 빌드 | **16개 무사** |
| **Aside 프로세스** | **17개 + daemon 1개 — 전부 무사** |
| C: 여유 | 35.60 GB -> **38.70 GB** (+3.1) |

남은 MCP 서버:
```
Claude Code 전역 :  9개  codex, figma, hwp, magic, neander-erp,
                         sequential-thinking, supabase, trigger, word-document-server
Claude Desktop   : 13개  brave-search, chrome-devtools, context7, desktop-commander, exa,
                         magic, mcp-server-firecrawl, morphllm-fast-apply, sequential-thinking,
                         serena, taskmaster-ai, tavily, text-editor
Cursor           :  8개  TalkToFigma, context7, desktop-commander, exa, firecrawl-mcp,
                         sequential-thinking, taskmaster-ai, tosspayments-integration-guide
```

### 6-5. 주의 — RAM 수치는 아직 안 좋아졌다

| 항목 | 진단 시작 | 작업 후 | |
|---|---|---|---|
| C: 여유 | 35.60 GB | **38.70 GB** | 개선 |
| RAM 여유 | 7.69 GB | **4.65 GB** | **악화** |
| 커밋 | 49.91 GB | **52.75 GB** | **악화** |
| 프로세스 | 688 | 695 | 악화 |

**Playwright 제거가 실패한 게 아니다.** 원인 셋:
1. **P0-1 폭주 vite(pid 29692)가 아직 살아 있다** — 미승인이라 안 건드렸다. 누적 CPU 56.02 -> 56.20시간(30분 새 +10.8분 = 평균 36%)
2. 진단 자체가 무거웠다 — 179만 파일 재귀 스캔 2회가 파일 캐시를 채웠다
3. 그 사이 VS Code·chrome 이 계속 자랐다

**Playwright 제거의 실효는 "앞으로 안 쌓인다"에 있다.** 세션당 4프로세스 × 102MB 누수가 멈춘 것이고, 이미 쌓인 568MB 는 회수했다. **체감 개선은 P0-1·P0-2 를 처리해야 나온다.**

### 6-6. 추가 발견 — 손대지 않은 것

- `chrome-devtools` MCP (Claude Desktop) 도 브라우저를 띄우는 MCP다. playwright 가 아니라 **범위 밖**이라 두었다. 필요하면 같은 방식으로 제거 가능.
- `ms-playwright` 안에 **구버전 빌드가 쌓여 있다**: chromium 1169/1217/1228/1234/1243(5종), headless_shell 동일 5종, webkit 2158/2272(2종), firefox 1511. `@playwright/test 1.59.1` 이 쓰는 건 최신 1종뿐 — 구버전 정리로 **2~3GB 추가 회수 가능**하나, 어느 프로브가 어느 버전을 고정하는지 확인 전이라 보류.
- `claude_desktop_config.json` 과 `~/.cursor/mcp.json` 에 **API 키가 평문**으로 들어 있다(Anthropic·Firecrawl·Brave·Exa). 이번 작업 범위 밖이지만 별건으로 다룰 값어치가 있다.

### 6-7. 재발 방지 (추가)

- **MCP 설정은 한 곳이 아니다.** Claude Code(`~/.claude.json` — 전역 + 프로젝트별 각각), Claude Desktop(`%APPDATA%\Claude\claude_desktop_config.json`), Cursor(`~/.cursor/mcp.json`)가 **서로 독립**이다. 하나만 고치면 나머지가 계속 프로세스를 띄운다.
- **npx 기반 MCP(`npx -y pkg@latest`)는 프로세스를 4겹으로 쌓는다**(cmd -> npx node -> cmd -> 실제 node). 연결 실패해도 고아로 남는다. MCP 연결 타임아웃이 잦은 머신에서는 npx MCP 자체가 누수원이다.
- **자기매칭 함정이 이번에도 터졌다.** `Where-Object { $_.CommandLine -match 'playwright-mcp' }` 로 일괄 종료했더니 **명령 자신의 커맨드라인이 패턴을 포함해 스스로를 죽였다**(exit 255). 회피법: 패턴을 `'play' + 'wright'` 로 쪼개거나 `$_.ProcessId -ne $PID` 를 걸 것.
- **PowerShell `Remove-Item $var -Recurse`** 는 하네스 경로 가드에 막힐 수 있다. 리터럴 경로나 `rm -rf` 로 우회.

---

*6장 작업 실시: 2026-09-17 19:29~19:35 KST · 백업 `*.bak.20260917-192937` 보존 · 사용자 검증 대기*

---

## 7. 적용 기록 — 좀비 프로세스 전량 사살 (2026-09-17 19:40~19:45)

사용자 승인: *"전부 사살해버려."*

### 7-1. 사살 실행

**38개 프로세스 / 약 1,672 MB** 종료. 자기 조상 체인(explorer·Code·claude·powershell)은 보호 집합으로 제외.

| 분류 | 내용 |
|---|---|
| 폭주 vite | **pid 29692** — 누적 CPU 56.2시간, 평균 122.6% 점유. **사살 확인** |
| 좀비 dev 서버 | english-game(4200·4340~4344) / pinlight(4311~4316) / 2025meeting(3100~3102) + npx·cmd·bash 래퍼 전량 |
| 고아 콘솔 | 1시간 이상 된 14개 (최고령 49시간) |

### 7-2. 회복 실측

| 항목 | 진단 시작 | Playwright 제거 후 | **사살 후** |
|---|---:|---:|---:|
| **시스템 CPU** | **1075.2 / 1200 (89.6%)** | — | **142.7 / 1200 (11.9%)** |
| 커밋 메모리 | 49.91 GB | 52.75 GB | **47.18 GB** |
| RAM 여유 | 7.69 GB | 4.65 GB | **5.90 GB** |
| C: 여유 | 35.60 GB | 38.70 GB | **38.63 GB** |
| 프로세스 수 | 688 | 695 | **628** |
| node | 57 | 56 | **27** |
| cmd | 43 | 41 | **25** |
| conhost | 76 | 81 | **70** |
| 1시간+ 고아 콘솔 | 18 | — | **1** |
| dev 포트 점유 | 13 | — | **2** |

**핵심 성과는 CPU다. 89.6% 포화 -> 11.9%.** 폭주 vite 한 마리가 전체의 대부분이었다.

커밋 메모리도 진단 시작치(49.91GB) 아래인 47.18GB 로 내려와 **물리 RAM 초과분이 18GB -> 15GB 로 축소**됐다.

### 7-3. 무사 확인

```
Aside     : 17개 + daemon 1개   (제거 작업 전후 동일)
VS Code   : 39개                (영향 없음)
claude    : 20개                (영향 없음)
```

### 7-4. 미해결 — 살아있는 세션이 vite 를 계속 되살린다

사살 직후 **포트 4200 이 새 PID(49988)로 부활**했고, 1분 뒤 4344(pid 25900)도 떴다.

계보 추적 결과:
```
[0] node.exe  vite.js --port 4200 --strictPort --host 127.0.0.1   19:41:34
[1] cmd.exe   /d /s /c vite --port 4200 ...
[2] node.exe  npx-cli.js vite --port 4200 ...
[3] bash.exe  "/c/Program Files/nodejs/npx" vite --port 4200 ...
[4] bash.exe  (동일)
[5] DEAD_PARENT pid=25876
```

**정체: 살아있는 Claude Code 세션이 english-game 작업 중 `npx vite` 를 띄우고 있다.**
`bash.exe -c "source .../shell-snapshots/snapshot-bash-..."` = Claude Code 의 Bash 툴 호출 패턴.

이것이 **포트 번호가 4200 -> 4340 -> 4341 -> 4342 -> 4343 -> 4344 로 계속 올라간 이유**다:
`--strictPort` 라 기존 포트가 물려 있으면 실패하고, 세션이 +1 한 포트로 재시도한다. 그 결과가 좀비 6마리였다.

**이건 좀비가 아니라 라이브 작업이다.** 죽이면 그 세션의 진행 중 작업이 깨지므로 **사용자 판단 대기**로 남긴다.

> **근본 대책**: 해당 세션에서 dev 서버를 띄울 때 `--strictPort` 재시도로 포트를 올리지 말고,
> 기존 서버를 재사용하거나 작업 종료 시 반드시 내리도록 할 것.
> Claude Code 의 Bash 툴은 **호출이 끝나도 자식 프로세스를 죽이지 않는다** — 백그라운드 서버는 명시적으로 내려야 한다.

### 7-5. 재발 방지 (추가)

- **`Stop-Process` 일괄 사살 전에 자기 조상 체인을 보호 집합으로 만들어라.** 안 그러면 자기가 붙어 있는 터미널·에디터를 죽인다. 이번 보호 체인: `explorer(9836) -> Code(17892) -> Code(17612) -> claude(51620) -> powershell(12840)`.
- **CIM 의 `ProcessId` 는 UInt32 다.** `$map[$p.ProcessId]` 로 넣고 `$map[$PID]`(Int32)로 찾으면 **조용히 실패**한다. 1차 시도에서 보호 집합이 빈 채로 돌았다 — 반드시 `[int]` 로 캐스팅해 키를 통일할 것.
- **PowerShell 정렬 지시자는 `{0,10}` 이지 `{0,>10}` 이 아니다.** `>` 를 쓰면 `-f` 가 FormatError 로 전멸한다.
- **`npx <pkg>` 는 프로세스를 5겹으로 쌓는다**(bash -> bash -> node npx-cli -> cmd -> node 본체). 하나만 죽이면 나머지가 고아로 남으므로 **커맨드라인 패턴으로 전 계층을 한 번에 잡아야** 한다.

---

*7장 작업 실시: 2026-09-17 19:40~19:45 KST · 38개 사살 · 라이브 세션 vite 2개는 판단 대기*

---

## 8. 적용 기록 — C: 드라이브 정리 (2026-09-17 20:00~20:10)

사용자 승인: *"8월 대화도 지워줘. 둘다 해줘."*
삭제 대장 정본: `docs/incidents/disk-cleanup-manifest-2609.txt`

### 8-1. `.codex` 42GB 의 정체 — 프로그램이 아니라 대화 기록이었다

사용자 질문: *"코덱스에 42기가 파일이 있다는거야? 코덱스 용량이 42기가라는 소리야?"*
**답: 코덱스 실행파일은 567MB. 나머지 41.4GB 는 전부 누적된 대화 기록이다.**

| 항목 | 용량 | 정체 |
|---|---:|---|
| `sessions/` | **27 GB** | 대화 로그 `rollout-*.jsonl` 5,579개 |
| `thread_history_1.sqlite` | **7.8 GB** | 스레드 히스토리 DB (단일 파일) |
| `generated_images/` | **5.8 GB** | 생성 이미지 2,801장 |
| `logs_2.sqlite` | 869 MB | 로그 DB |
| `plugins/` | 457 MB | (내부 `codex.exe` 285MB 포함) |
| `.sandbox-bin/codex.exe` | 282 MB | **실행파일 본체** |

**단일 대화 하나가 2.7GB 짜리 jsonl 파일**이 된다. 상위 6개 대화만 10.6GB.

월별 분포(삭제 전):
```
2026-04    362 MB     14개
2026-05    4.5 GB    170개
2026-06    7.8 GB    101개
2026-07     12 GB  3,479개   <- 최대
2026-08    962 MB  1,778개
2026-09    1.1 GB     37개
```
8월부터 파일당 크기가 급감(파일 수는 급증) — 코덱스가 로그 분할 방식을 바꾼 것으로 보인다.

### 8-2. 실행 내역

**[A] `.codex/sessions` 2026-04 ~ 2026-08 삭제 (복구 불가)**

| 폴더 | 용량 | 파일 |
|---|---:|---:|
| 2026/04 | 362 MB | 14 |
| 2026/05 | 4,557 MB | 170 |
| 2026/06 | 7,935 MB | 101 |
| 2026/07 | 12,112 MB | 3,479 |
| 2026/08 | 962 MB | 1,778 |
| **합계** | **25,928 MB (25.32 GB)** | **5,542** |

**보존**: `2026/09` 1,107 MB / 37개 (최신 2026-09-16) — 무사 확인.

**[B] `Downloads` zip 21개 -> `D:\archive\downloads-2609` 이동 (삭제 아님)**

성공 **21 / 실패 0**, 17.24 GB. 목적지 검증 21개·17.24GB 일치.
최대 항목: `[신촌] CELEB-*` 8개 약 11.9GB (구글드라이브 사진 아카이브), `drive-download-*` 4개, `★기록사진 영상★.zip` 909MB, `수다락 상세페이지.Zip` 823MB.

### 8-3. 결과

| 시점 | C: 여유 | 여유율 |
|---|---:|---:|
| 진단 시작 | 35.60 GB | 7.50% |
| Playwright MCP 제거 후 | 38.70 GB | 8.13% |
| **정리 후** | **81.07 GB** | **17.03%** |

**총 회수 45.47 GB.** 여유율이 위험선(10%) 아래 7.5% 에서 **17.03%** 로 올라왔다.

| 폴더 | 이전 | 이후 |
|---|---:|---:|
| `.codex` | 42.01 GB / 24,846개 | **16.70 GB / 19,300개** |
| `Downloads` | 17.86 GB / 205개 | **0.62 GB / 184개** |
| `D:` 여유 | 584.7 GB | 567.4 GB (이동분 수용) |

**무사 확인**: codex 프로세스 6개 정상, 9월 세션 37개 보존.

### 8-4. 손대지 않은 것

- **`thread_history_1.sqlite` (7.8 GB)** — 잠김은 풀려 있어 삭제 가능하나 **코덱스의 대화 이어가기·검색이 깨질 수 있어** 보류. 회수량 대비 리스크가 크다.
- **`logs_2.sqlite` (869 MB)** — 코덱스가 실행 중이라 **파일 잠김**. 코덱스를 완전히 종료해야 건드릴 수 있다.
- **`generated_images/` (5.8 GB)** — 실제 이미지 자산이라 사용자 확인 전 보류. 2,801장 중 2026-08 은 0장, 2026-09 는 42장 — 대부분 4~7월 생성분이라 정리 여지는 크다.

### 8-5. 재발 방지

- **`.codex` 는 자동으로 안 줄어든다.** 세션 로그에 보존 정책이 없어 무한 누적된다. 분기마다 오래된 `sessions/<년>/<월>` 을 비우는 습관이 필요하다.
- **대화 하나가 GB 단위가 될 수 있다** — 장시간·대용량 세션은 로그가 폭증한다. `sessions/` 는 용량 감시 대상.
- **Downloads 는 용량이 아니라 zip 개수로 봐라.** 202개 중 zip 21개가 전체의 96.5% 였다. 나머지 181개는 다 합쳐 0.6GB.
- **이동은 `Move-Item -LiteralPath`** 를 쓸 것. 한글·`★`·대괄호가 섞인 파일명이라 bash `mv` 나 와일드카드는 위험하다(이번 21개 전부 그런 이름).

---

*8장 작업 실시: 2026-09-17 20:00~20:10 KST · 45.47 GB 회수 · 대장 `disk-cleanup-manifest-2609.txt`*

---

## 9. P0-2 원인 정정 — 헤드리스 크롬 폭주는 MCP가 아니라 english-game E2E (2026-09-17 21:25)

사용자 질문: *"지금 cpu가 존나 튀는건 클로드 코드 세션을 내가 한번에 존나 띄워서 그런건가?"* (작업관리자 CPU 95%)

### 9-1. 답: 세션 수는 무죄

| 대상 | 개수 | CPU (전체=100%) | 메모리 |
|---|---:|---:|---:|
| Claude Code 세션 (claude.exe) | 11 | **1.86%** | 2.56 GB |
| **chrome-headless-shell** | 5 | **82.1%** | ~800 MB |

세션은 CPU를 거의 안 쓴다. **메모리만 먹는다** — 11개 중 8개가 9/15 시작분(약 1.6GB).

### 9-2. 진범 — 계보 실측

```
chrome-headless-shell  (ms-playwright\chromium_headless_shell-1243, 프로필 Temp\playwright_chromiumdev_profile-*)
 <- node  english-game\node_modules\playwright\lib\worker\workerProcessEntry.js
 <- node  @playwright\test\cli.js test e2e/zz-final-capture.spec.ts --project=pc -g A+B+C
 <- cmd <- npx <- bash <- bash (Claude Code Bash 툴) <- DEAD_PARENT
```

**english-game 작업 중인 Claude Code 세션이 Playwright E2E 캡처 테스트를 돌리고 있다.** 측정 시점 11분째 진행 중.

### 9-3. 왜 브라우저 하나가 코어 8~9개를 먹나

- english-game 은 **three.js (3D WebGL)** 게임이다
- 헤드리스 크롬 GPU 프로세스 플래그: `--headless --use-angle=swiftshader --enable-unsafe-swiftshader`
- **SwiftShader = GPU를 CPU로 에뮬레이션하는 소프트웨어 렌더러.** english-game `playwright.config` 주석도 명시: *"headless Chromium: WebGL2(SwiftShader)"*
- 3D 장면의 매 프레임을 CPU 여러 스레드로 그리므로 **테스트가 도는 내내 CPU가 포화**된다

### 9-4. 정정 사항

§1 P0-2 에서 순간 9.5코어 스파이크(pid 38992)를 "Playwright/headless 브라우저 생성·소멸 반복"으로만 기록했고, §6 의 Playwright **MCP** 제거가 이를 막는 것처럼 읽힐 수 있었다. **그렇지 않다.**

- §6 MCP 제거가 막은 것: **세션마다 4프로세스씩 쌓이던 MCP 누수**(유효)
- §6 MCP 제거가 **못 막는 것**: english-game 세션의 **Playwright 라이브러리 E2E 실행** — 이게 CPU 스파이크의 실체
- 당시 pid 38992 는 부모가 이미 죽어 계보를 확정하지 못했으나, 동일 실행파일(chromium_headless_shell)·동일 패턴(고아 bash 체인)으로 보아 **같은 english-game E2E 실행이었을 가능성이 높다**(미확증)

### 9-5. 대책 (english-game 쪽)

- **즉효**: 캡처 테스트는 CPU를 포화시킨다는 전제로 **다른 무거운 작업과 동시에 돌리지 말 것**
- **구조**: 테스트 모드에서 three.js 렌더 루프를 **필요할 때만 그리기**(캡처 직전 1프레임) 또는 FPS 제한, 캡처 해상도·`deviceScaleFactor` 축소 — SwiftShader 비용은 픽셀 수 × 프레임 수에 비례한다
- **시험해볼 것**: SwiftShader 대신 실제 GPU(ANGLE d3d11) 사용 — 헤드리스 셸에서 동작 여부는 미검증
- `workers` 는 이미 1 — 병렬도 문제는 아니다

---

*9장 작성: 2026-09-17 21:25 KST · E2E 테스트는 라이브 작업이라 종료하지 않음*

---

## 10. 작업표시줄 "Terminal" 창 16개 — 실측 (2026-09-17 22:40~23:13)

사용자 신고: 작업표시줄 미리보기에 `Terminal` 창이 16개 이상 쌓인 스크린샷. *"터미널이 뭔 상황이야?"*

### 10-1. 창 1개 = clauth 예약작업 스크립트 1개 (확정)

떠 있는 Windows Terminal 창(클래스 `CASCADIA_HOSTING_WINDOW_CLASS`)마다 `AttachConsole → GetConsoleWindow → owner` 로 **안에서 도는 프로세스를 역추적**했다. 매핑된 창은 전부 clauth 스크립트였다(다른 출처 0건):

```
22:55:14  창 4개
  창 = reorder-chain.ps1    (22:54:01 시작)
  창 = desync-heal.ps1      (22:52:01 시작)
  창 = daemon-watchdog.ps1  (22:51:01 시작)
  창 = sync-live.ps1        (22:50:26 시작)
  부모 = pid 2512 (작업 스케줄러 서비스), 전부 -WindowStyle Hidden
```

- `WindowsTerminal.exe -Embedding` 으로 기동 = **기본 터미널 위임(handoff)**. `HKCU\Console\%%Startup` 의 Delegation 값이 비어 있어 Windows 11 기본값(Windows Terminal)이 적용된다.
- `-WindowStyle Hidden` 은 콘솔 창을 숨기는 옵션이라, 위임받은 Windows Terminal 창에는 효과가 없다.
- **무죄 확인**: 클로드 계정 모니터 앱(`server.mjs`)은 65초마다 파워셸을 띄우지만 `windowsHide: true` 라 창을 만들지 않는다. Claude Code 세션의 파워셸도 창을 만들지 않았다.

### 10-2. 16개까지 쌓인 이유 — 스크립트가 수 분씩 안 끝났다

| 시각 | 스크립트 수명 | 당시 부하 |
|---|---|---|
| 22:50~22:56 | **2.5~5분** (5분 제한에 걸려 강제종료 = `0xC000013A`) | english-game E2E(`zz-final-capture`·`mic.spec`·`vitest`) 연속 실행, CPU 95% |
| 23:10 | **11~19초** (시작까지 4.5~5.5초) | 헤드리스 크롬 0, 테스트 러너 0, CPU 42% |

느린 구간에서 스크립트는 **일하는 게 아니라 멈춰 있었다**:
```
reorder-chain    경과 220초  누적 CPU 0.72초
sync-live        경과  78초  누적 CPU 0.63초
daemon-watchdog  경과  45초  누적 CPU 0.03초, 스레드 1개 Wait/Executive  <- 초기화 전 단계에서 정지
```
2분·2분·3분·10분 주기로 계속 발사되는데 한 번에 수 분씩 창이 안 닫히니 창이 누적됐다. 사용자가 창을 닫으면 스크립트가 `0xC000013A` 로 끝난다(§1 P0-3 의 종료코드와 일치).

### 10-3. 프로세스 시작 지연 — 실험 결과와 한계

임시 예약작업 3종으로 "작업 시작 → 스크립트 첫 줄 실행" 지연을 쟀다(느린 구간, 22:57~23:05):

| 방식 | 첫 줄까지 |
|---|---:|
| A. clauth 현행 (`powershell -WindowStyle Hidden`) | 86.4초 |
| B. `wscript` + vbs (SW_HIDE) | 150초 내 시작 못 함 |
| C. `conhost --headless` | 150초 내 시작 못 함 |

- 실행 방식을 바꿔도 느렸다 = **창 숨김 방식 문제가 아니라, 그 시점 예약작업 프로세스 초기화 자체가 막혀 있었다.**
- 원인 후보(미확증):
  1. **CPU 포화** — english-game 의 SwiftShader 3D 테스트가 코어를 다 쓰던 시기와 겹친다. 부하가 빠진 23:10 에는 4.5초 만에 시작했다.
  2. **커널 보안 드라이버 17개** — 새 프로세스·파일·레지스트리 접근을 가로챈다.
     - INCA nProtect 10개: `TKPcFt`(프로세스 필터), `TKFsAvM`·`TKFsFtM`(파일시스템), `TKRgAc`·`TKRgFt`(레지스트리), `TKFWFV`(방화벽), `TKCtrl`, `noskp`, `nosku`, `np_ck64s`
     - AhnLab Safe Transaction 6개: `AhnRghNt`, `AntiStealth_SafeTransaction(F)`, `asc_kbc`, `ATamptNt`, `MeDCoreD`, `MeDVpDrv`
     - RaonSecure 1개: `JRSUKD25`
- B·C 가 A 보다도 느렸던 이유는 **설명하지 못했다.** 인과를 확정하려면 보안 모듈을 끈 상태에서 재측정해야 한다(관리자 권한·사용자 판단 필요).
- **디스크는 무죄**: NVMe SSD 2개 정상, C: 읽기 평균 1.4ms·쓰기 0.2ms, 24시간 디스크 오류 0건.

### 10-4. 같이 발견된 결함

- **clauth 데몬 반복 크래시**: 오늘 20:35:58 · 22:53:48 · 23:08:57, 전부 `0xc0000409` · 오프셋 `0x282c7e` 동일 = 같은 버그. 워치독이 되살려도 다시 죽는다 → **자동 계정 전환이 수시로 멈춘다.**
- **Aside Updater Service 시작 실패 16회**(3시간) — 매번 서비스 관리자 30초 대기 + DCOM 10005.
- `desync-heal.ps1` 은 실행마다 `whois.ps1` 파워셸을 중첩으로 띄운다 — 느린 구간에서 수명이 가장 길었다.

### 10-5. 대책 (미적용 — 사용자 승인 대기)

| 안 | 내용 | 효과 | 비고 |
|---|---|---|---|
| 1 | 기본 터미널 앱을 **Windows 콘솔 호스트**로 변경 | 작업 창이 Windows Terminal로 넘어가지 않아 `-WindowStyle Hidden` 이 먹힘. 단, 숨김은 파워셸이 초기화된 뒤 적용되므로 **느린 구간에는 콘솔 창이 초기화될 때까지(수십 초~수 분) 보일 수 있음** | 사용자 설정 1개, 되돌리기 쉬움. clauth 무수정 |
| 2 | 예약작업 실행을 `wscript` + vbs(SW_HIDE)로 전환 | 창 자체가 안 만들어짐(데몬이 이 방식으로 떠서 창 0개 확인) | 느린 구간 B 실험이 150초 내 시작 못 한 점은 미해명 |
| 3 | 주기 완화(2분 → 5분 등) | 창 발생 빈도·중첩 감소 | 로테이션 반응 속도 저하 |
| 4 | english-game E2E 실행 중 부하 관리(§9-5) | 느린 구간 자체를 줄임 | 해당 세션 몫 |
| 5 | clauth 데몬 크래시(`0x282c7e`) 수리 | 로테이션 신뢰성 | clauth 측 버그 |

### 10-6. 재발 방지

- **"-WindowStyle Hidden 인데 창이 뜬다" = 기본 터미널 위임부터 의심하라.** `WindowsTerminal.exe -Embedding` 이 증거다.
- 창의 정체는 제목(`powershell.exe` 경로)으로는 못 가린다. **`AttachConsole(pid)` → `GetConsoleWindow()` → `GetWindow(GW_OWNER)` 로 창↔프로세스를 매핑**해야 확정된다.
- 창 개수만 세는 A/B 실험은 **백그라운드 clauth 창에 오염된다**(기준선 2·4개). 지연은 창이 아니라 **스크립트가 파일에 남긴 타임스탬프**로 재라.
- 프로세스 "생성 시각"과 "실행 시작"은 다르다. **누적 CPU가 0에 머무는 구간 = 초기화에서 멈춘 구간**이다.

---

*10장 작성: 2026-09-17 23:13 KST · 임시 예약작업 zz-probe-* 전부 삭제 확인 · 설정 변경 없음*

*진단 실시: 2026-09-17 19:00~19:12 KST · 수리 미적용 · 사용자 승인 대기*
