# Research Dashboard

`STATUS.md` 가 있는 폴더를 작업 카드로 보여 주는 VS Code 확장.
`STATUS.md` 형식은 Claude Code research-log 스킬의 형식(FORMAT.md)을 따른다.

## 기능
- 열기: 상태 표시줄 왼쪽 `Research` 또는 명령 팔레트 `Research Dashboard: 열기`.
- 왼쪽 = 카드 목록(상태, 갱신일, 진행 단계, 현재 상태 한 줄). 정렬: 최신순 / 이름순 / 직접 정렬(카드를 끌어서 순서 변경). 옛 형식은 항상 맨 아래. 오른쪽 = 목표·이유·진행 단계·주요 결과·재개.
- 주요 결과의 파일을 누르면 그림(png/svg), 표(csv 앞 50행), 본문(md/txt, `#절` 지정 시 그 절)을 그 자리에서 보여 준다.
- 묶음(프로젝트) 편집: 카드를 다른 묶음 아래로 끌면 그 `STATUS.md` 의 `project:` 줄만 바꾼다. 묶음 추가 / 이름 바꾸기 / 빈 묶음 지우기 / 접기·펴기.
- "터미널에 넣기" = 그 폴더에서 통합 터미널을 열고 명령을 입력해 둔다(Enter 는 직접). "claude 열기" = 새 대화 / 최근 대화 이어가기 / 이전 대화 고르기.
- 질문 칸: `claude -p` (Claude Code 로그인 그대로, API 키 불필요) 로 고른 작업이나 전체 작업을 브리핑. 읽기 도구(Read/Glob/Grep)만 허용하고 파일은 고치지 않는다.
- STATUS.md 수정 시각이 바뀐 것만 다시 읽는다(`pollSeconds` 마다). 전체 재탐색은 ↻ 또는 `Research Dashboard: 다시 훑기`.

## 설치
VS Code 로 그 서버(또는 PC)에 접속한 상태에서 한다. Node.js 가 필요하다.

1. 받기
   ```bash
   git clone https://github.com/rainyday1026-bit/research_dashboard.git ~/research_dashboard
   ```
2. 설치 파일(.vsix) 만들기
   ```bash
   cd ~/research_dashboard && npx -y @vscode/vsce@2.32.0 package
   ```
   (최신 vsce 는 Node 22 일부 버전에서 `ERR_REQUIRE_ESM` 으로 실패하므로 2.32.0 을 쓴다)
3. 설치: 명령 팔레트(Ctrl+Shift+P) → `Extensions: Install from VSIX...` → 만든 `research-dashboard-<버전>.vsix` 선택 → 창 다시 로드
4. 볼 폴더 설정: 명령 팔레트 → `Preferences: Open Remote Settings (JSON)` (로컬 PC 면 `Open User Settings (JSON)`)
   ```json
   "researchDashboard.roots": ["/연구/폴더"]
   ```
   적지 않으면 VS Code 에 열린 작업 폴더를 본다.

업데이트: `cd ~/research_dashboard && git pull` 후 2–3 을 다시 한다.

필요한 것
- 카드는 `STATUS.md` 가 있는 폴더마다 하나씩 생긴다. research-log 형식으로 기록하고 있어야 한다.
- 질문 칸과 "claude 열기" 는 [Claude Code](https://claude.com/claude-code) 가 설치·로그인되어 있어야 한다.

## 설정
| 설정 | 기본값 | 설명 |
|---|---|---|
| `researchDashboard.roots` | (비움) | STATUS.md 를 찾을 최상위 폴더들. 비우면 열린 작업 폴더 |
| `researchDashboard.cacheFile` | (비움) | 캐시 파일. `order.json`(정렬), `chat.json`(질문 칸 대화) 도 같은 폴더. 비우면 VS Code 확장 저장 폴더 |
| `researchDashboard.maxDepth` | 6 | 탐색 깊이 |
| `researchDashboard.skipDirs` | node_modules 등 | 건너뛸 폴더 이름 |
| `researchDashboard.pollSeconds` | 20 | STATUS.md 수정 확인 주기(초) |
| `researchDashboard.claudePath` / `claudeModel` / `claudeTimeoutSeconds` | | 질문 칸의 claude 실행 설정 |

원격 서버(Remote-SSH)에서 쓸 때는 서버마다 원격 설정(`Preferences: Open Remote Settings`)에 `roots` 를 적어 두면 편하다.

## 개발
`node test_webview.js <cache.json>` 으로 webview 렌더링을 검사한다. 변경 내역은 [CHANGELOG.md](CHANGELOG.md).

## License
MIT
