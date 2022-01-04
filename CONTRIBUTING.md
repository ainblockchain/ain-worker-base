<h1 align="center">AIN Connect Worker Base</h1>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 14.17+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

# 코드 구조 설명 (src)

- src/common: 공통으로 사용하는 모듈 및 변수 모음.
- src/job: 요청 Job 로직 모음.
- src/util: 여러 유틸 코드 모음으로, Docker 나 kubernetes 같은 로직이 포함되어 있음.
- src/index.ts: 코드 진입점.
- src/worker.ts: AIN Connect 관련 로직.


## How To Run

#### 로컬에서 시작(개발용)

```
mkdir -p ~/ain-worker/{NAME}

// npm 패키지 설치.
yarn

[ENV_LIST, ex, NAME={NAME} ] yarn start

// example

NAME={NAME} \
APP_NAME=collaborative_ai \
NETWORK_TYPE=DEVNET \
CONTAINER_VCPU=1 \
CONTAINER_MEMORY_GB=3 \
DISK_GB=50 yarn start
```

- [] 는 옵셔널 환경 변수이다.

## 코드 스타일 검사

```
yarn lint
```
