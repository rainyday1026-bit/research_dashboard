# Changelog

## 0.3.0
- 기본 설정에서 특정 서버 경로를 없앰: `roots` 비우면 열린 작업 폴더, `cacheFile` 비우면 VS Code 확장 저장 폴더를 사용
- 질문 칸 브리핑 프롬프트를 일반화 (질문한 언어로 답함, 읽기 범위는 `roots`)
- `test_webview.js` 가 cache.json 경로를 인자로 받음

## 0.2.3
"이 폴더에서 claude 열기": 새 대화 / 가장 최근 대화 이어가기 / 이전 대화 고르기(날짜·첫 입력·폴더) 를 고른 뒤 터미널에서 `claude` 또는 `claude --resume <id>` 실행. 대화 목록은 `~/.claude/projects/<폴더 경로의 / 와 _ 를 - 로 바꾼 이름>/*.jsonl` 에서 카드 폴더와 상위 폴더(root 까지)를 모두 훑음. 질문 칸이 만든 세션은 제외.

## 0.2.0
- 질문 칸(오른쪽 아래): 질문을 보내면 확장이 `claude -p --output-format json --allowedTools Read Glob Grep` 를 `Claude` 폴더에서 실행(구독 로그인 그대로, API 키 없음). 고른 카드의 STATUS.md 와 가장 최근 history 끝부분을 같이 보내고, 세션 ID 로 대화를 잇는다(`Dashboard/chat.json`). "이 작업 브리핑"/"전체 브리핑" 단추, "새 대화" 로 세션 끊기, "중지" 로 실행 중단. 파일 수정 도구는 허용하지 않음. 설정 `researchDashboard.claudePath / claudeModel / claudeTimeoutSeconds`.
- 접기/펴기: 묶음 제목의 ▾/▸, 위쪽 ⊟(모두 접기) ⊞(모두 펴기). 접힌 묶음은 `order.json` 에 저장. 오른쪽 상세의 절(현재 상태·목표·…)도 제목을 누르면 접힘.

## 0.1.3
묶음(프로젝트) 편집: 카드를 다른 묶음 제목 아래로 끌어 놓으면 확장이 그 `STATUS.md` 머리말의 `project:` 줄만 바꿔 저장한다(옛 형식은 `title/project/updated/legacy: true` 머리말을 앞에 끼워 넣고 본문은 그대로). "+ 묶음" = 빈 묶음 추가(카드가 들어오기 전엔 `order.json` 에만 있음), ✎ = 이름 바꾸기(그 묶음 카드 전부의 project 변경), ✕ = 빈 묶음 지우기, 직접 정렬에서는 ▲▼ 로 묶음 순서.
