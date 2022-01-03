<h1 align="center">AIN Connect Worker Base</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

# 코드 구조 설명 (src)

- src/common: 공통으로 사용하는 모듈 및 변수 모음.
- src/job: 요청 Job 로직 모음.
- src/util: 여러 유틸 코드 모음으로, Docker 나 kubernetes 같은 로직이 포함되어 있음.
- src/index.ts: 코드 진입점.
- src/worker.ts: AIN Connect 관련 로직.
- test: 유닛 테스트 코드
  <br>

## 환경변수

- APP_NAME: AIN Blockchain App 이름 (ex, collaborative_ai)
- NETWORK_TYPE: "MAINNET" or "TESTNET" or "DEVNET"
- NAME: Worker 고유 이름
- ETH_ADDRESS: 보상을 받은 이더리움 주소.
- MNEMONIC: 지갑을 복구하기 위한 12개의 단어로 단어 사이를 띄어쓰기로 구분한다. (ex 'apple bike ...)
- MANAGED_BY: (optional) Manage ID.
- SERVICE_TYPE: (optional) 서비스 유형(ex. teachable-nlp)
- SPEC_NAME: (optional) HW SPEC NAME(ex. d4v4)
- NODE_PORT_IP: (optional) 컨테이너 접근을 위한 IP.
- CONTAINER_MAX_CNT: (optional) 컨테이너 최대 개수로, 기본값은 1이다.
- CONTAINER_VCPU: 한 컨테이너 Core 개수, Docker 버전 Worker 인 경우 필수 옵션.
- CONTAINER_MEMORY_GB: 한 컨테이너 메모리 용량(GB 단위), Docker 버전 Worker 인 경우 필수 옵션.
- CONTAINER_GPU_CNT: 한 컨테이너 GPU 개수.
- GPU_DEVICE_NUMBER: GPU Device IDs 로 ID 사이를 ','로 구분한다. (ex. 1,2,3...)
- CONTAINER_STORAGE_GB: 한 컨테이너 스토리지 용량(단위 GB), Docker 버전 Worker 인 경우 필수 옵션.
- CONTAINER_ALLOW_PORT: (optional) 사용 가능한 외부 포트들로 포트 범위는 '-'로 구분하고, 각 범위들은 ',' 로 구분한다. ex. '80-83,8888-88889'
- REGISTRY_USERNAME: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 유저 네임.
- REGISTRY_PASSWORD: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 비밀번호.
- REGISTRY_SERVER: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 주소.
- SLACK_WEBHOOK_URL: (optional) Worker 의 Info 와 Error 로그를 Slack 으로 알림 받고 싶을 때 필요한 옵션.

## How To

### Docker 버전 Worker 시작

#### Docker 로 시작

```
docker run -l AinConnect.container=master -d --restart unless-stopped --name worker \
-e APP_NAME={APP_NAME} \
-e NETWORK_TYPE={NETWORK_TYPE} \
-e NAME={NAME} \
-e ETH_ADDRESS={ETH_ADDRESS} \
-e CONTAINER_MAX_CNT={CONTAINER_MAX_CNT} \
-e CONTAINER_VCPU={CONTAINER_VCPU} \
-e CONTAINER_MEMORY_GB={CONTAINER_MEMORY_GB} \
-e CONTAINER_STORAGE_GB={CONTAINER_STORAGE_GB} \
[-e NODE_PORT_IP={NODE_PORT_IP}] \
[-e CONTAINER_ALLOW_PORT={CONTAINER_ALLOW_PORT}] \
[-e CONTAINER_GPU_CNT={CONTAINER_GPU_CNT}] \
[-e GPU_DEVICE_NUMBER={GPU_DEVICE_NUMBER}] \
[-e MNEMONIC={MNEMONIC}] \
[-e REGISTRY_USERNAME={REGISTRY_USERNAME}] \
[-e REGISTRY_PASSWORD={REGISTRY_PASSWORD}] \
[-e REGISTRY_SERVER={REGISTRY_SERVER}] \
[-e SLACK_WEBHOOK_URL={SLACK_WEBHOOK_URL}] \
[--gpus all] \
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-connect-base:revamp
```

- [] 는 옵셔널 환경 변수이다.
- MNEMONIC 환경 변수가 없으면 자동으로 $HOME/ain-worker/{NAME}/env.json 에 저장한다.
- 도커 이미지는 Docker Hub 에 있는 ainblockchain/ain-connect-base 로 하거나 직접 빌드해서 실행한다.

#### 로그

```
docker logs -f worker
```

#### 종료

```
docker rm -f $(docker ps -f "label=AinConnect.container" -q -a)
```

#### 로컬에서 시작(개발용)

```
mkdir -p ~/ain-worker/{NAME}

// npm 패키지 설치.
yarn

APP_NAME={APP_NAME} \
NETWORK_TYPE={NETWORK_TYPE} \
NAME={NAME} \
ETH_ADDRESS={ETH_ADDRESS} \
CONTAINER_MAX_CNT={CONTAINER_MAX_CNT} \
CONTAINER_VCPU={CONTAINER_VCPU} \
CONTAINER_MEMORY_GB={CONTAINER_MEMORY_GB} \
CONTAINER_STORAGE_GB={CONTAINER_STORAGE_GB} \
[NODE_PORT_IP={NODE_PORT_IP}] \
[CONTAINER_ALLOW_PORT={CONTAINER_ALLOW_PORT}] \
[CONTAINER_GPU_CNT={CONTAINER_GPU_CNT}] \
[GPU_DEVICE_NUMBER={GPU_DEVICE_NUMBER}] \
[MNEMONIC={MNEMONIC}] \
[REGISTRY_USERNAME={REGISTRY_USERNAME}] \
[REGISTRY_PASSWORD={REGISTRY_PASSWORD}] \
[REGISTRY_SERVER={REGISTRY_SERVER}] \
[SLACK_WEBHOOK_URL={SLACK_WEBHOOK_URL}] \
yarn start
```

- [] 는 옵셔널 환경 변수이다.

## 유닛 테스트 실행

```
yarn test
```

## 코드 스타일 검사

```
yarn lint
```
