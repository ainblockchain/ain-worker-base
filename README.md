<h1 align="center">AIN Connect Worker Base</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## 환경변수
NETWORK_TYPE: "MAINNET" or "TESTNET"
NAME: Worker 고유 이름
ETH_ADDRESS: 보상을 받은 이더리움 주소.
MNEMONIC: 지갑을 복구하기 위한 12개의 단어로 단어 사이를 띄어쓰기로 구분한다. (ex 'apple bike ...)
MANAGED_BY: (optional) Worker 관리 주체.
NODE_PORT_IP: 컨테이너 접근을 위한 IP 로, Docker 버전인 경우 Worker 가 셋업된 머신에 IP 이다.
CONTAINER_MAX_CNT: 컨테이너 최대 개수로, Docker 버전 Worker 인 경우 필수 옵션.
CONTAINER_VCPU: 한 컨테이너 Core 개수, Docker 버전 Worker 인 경우 필수 옵션.
CONTAINER_MEMORY_GB: 한 컨테이너 메모리 용량(GB 단위), Docker 버전 Worker 인 경우 필수 옵션.
CONTAINER_GPU_CNT: 한 컨테이너 GPU 개수.
GPU_DEVICE_NUMBER: GPU Device IDs 로 ID 사이를 ','로 구분한다. (ex. 1,2,3...)
CONTAINER_STORAGE_GB: 한 컨테이너 스토리지 용량(단위 GB), Docker 버전 Worker 인 경우 필수 옵션.
CONTAINER_ALLOW_PORT: 사용 가능한 외부 포트들로 포트 범위는 '-'로 구분하고, 각 범위들은 ',' 로 구분한다. ex. '80-83,8888-88889'
REGISTRY_USERNAME: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 유저 네임.
REGISTRY_PASSWORD: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 비밀번호.
REGISTRY_SERVER: (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 주소.
IS_K8S: Kubernertes 버전 Worker 인 경우 True 로 설정하는 옵션.
ROOT_DOMAIN: Kuberntes 버전에서 ISTIO Gateway 의 Root 도메인 (*.${ROOT_DOMAIN})
GATEWAY_NAME: ISTIO Gateway 이름.
SLACK_WEBHOOK_URL: (optional) Worker 의 Info 와 Error 로그를 Slack 으로 알림 받고 싶을 때 필요한 옵션.
K8S_CONFIG_PATH: (optional) Kubernetes Config 파일 경로이며, 기본은 /root/.kube/config 이다.



## 시작
### Docker 버전 Worker 시작

#### Docker 로 시작
```
docker run -l AinConnect.container=master -d --restart unless-stopped --name worker \
-e NETWORK_TYPE={NETWORK_TYPE} \
-e NAME={NAME} \
-e ETH_ADDRESS={ETH_ADDRESS} \
-e NODE_PORT_IP={NODE_PORT_IP}
-e CONTAINER_MAX_CNT={CONTAINER_MAX_CNT} \
-e CONTAINER_VCPU={CONTAINER_VCPU} \
-e CONTAINER_MEMORY_GB={CONTAINER_MEMORY_GB} \
-e CONTAINER_STORAGE_GB={CONTAINER_STORAGE_GB} \
-e CONTAINER_ALLOW_PORT={CONTAINER_ALLOW_PORT} \
[-e CONTAINER_GPU_CNT={CONTAINER_GPU_CNT}] \
[-e GPU_DEVICE_NUMBER={GPU_DEVICE_NUMBER}] \
[-e MNEMONIC={MNEMONIC}] \
[-e REGISTRY_USERNAME={REGISTRY_USERNAME}] \
[-e REGISTRY_PASSWORD={REGISTRY_PASSWORD}] \
[-e REGISTRY_SERVER={REGISTRY_SERVER}] \
[-e SLACK_WEBHOOK_URL={SLACK_WEBHOOK_URL}] \
-v /var/run/docker.sock:/var/run/docker.sock \
-v ~/ain-worker/{NAME}: ~/ain-worker/{NAME} \
ainblockchain/ain-connect-base:revamp
```
- [] 는 옵셔널 환경 변수이다.
- MNEMONIC 환경 변수가 없으면 자동으로 /ain-worker/{NAME}/env.json 에 저장한다.
- 도커 이미지는 Docker Hub 에 있는 ainblockchain/ain-connect-base 로 하거나 직접 빌드해서 실행한다.

#### 종료
```
docker rm -f $(docker ps -f "label=AinConnect.container" -q -a)
```

#### 로컬에서 시작(개발용)
```
mkdir -p ~/ain-worker/{NAME}

// npm 패키지 설치.
yarn

NETWORK_TYPE={NETWORK_TYPE} \
NAME={NAME} \
ETH_ADDRESS={ETH_ADDRESS} \
NODE_PORT_IP={NODE_PORT_IP}
CONTAINER_MAX_CNT={CONTAINER_MAX_CNT} \
CONTAINER_VCPU={CONTAINER_VCPU} \
CONTAINER_MEMORY_GB={CONTAINER_MEMORY_GB} \
CONTAINER_STORAGE_GB={CONTAINER_STORAGE_GB} \
CONTAINER_ALLOW_PORT={CONTAINER_ALLOW_PORT} \
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


### Kubernetes 버전 Worker 시작
- Kubernetes 에는 기본으로 ISTIO 가 설치 되어 있어야 하고, ISTIO Gateway Setup 와 해당 endpoint 에 대한 와일드카드 도메인이 설정되어 있어야 한다.

#### Kuberneres 에 Worker 를 배포하기
- /k8s.worker.sample.yaml 를 참고하여 {{{ }}} 로 표시된 변수를 채운다.
- {{{ nodeSelector }}} 는 Worker 파드가 할당될 노드의 라벨을 의미한다. (ex AinConnnect.nodePoolName=worker)
- {{{ {{{ K8s Config }}} }}} 는 ./create_account.sh 를 통해서 생성한 뒤에 넣는다.
#### 로컬에서 시작(개발용)
```
mkdir -p ~/ain-worker/{NAME}

// npm 패키지 설치
yarn

IS_K8S=true \
NETWORK_TYPE={NETWORK_TYPE} \
NAME={NAME} \
ETH_ADDRESS={ETH_ADDRESS} \
GATEWAY_NAME={GATEWAY_NAME} \
ROOT_DOMAIN={ROOT_DOMAIN} \
MNEMONIC={MNEMONIC} \
K8S_CONFIG_PATH={} \
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

## NPM 배포
```
./build
// (1) 버전을 확인한다.
npm publish --access=public
```
- npm login을 한다.


# 코드 구조 설명 (src)
- common: 공통으로 사용하는 모듈 및 변수 모음
- manager: 관리 로직 모음
- util: 기능 로직 모음
- _test_: 유닛 테스트 코드

<br>
