<h1 align="center">AIN Connect Worker Base For LG Robot</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## 환경변수
"CLUSTER_NAME": 클러스터 별칭
"MNEMONIC": Worker 고유 문자열 리스트
"IS_DOCKER": true 인 경우 도커 버전으로 워커를 시작함. (false 인 경우는 쿠버네티스 버전으로 시작.)
"REGISTRY_USERNAME": (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 유저 네임.
"REGISTRY_PASSWORD": (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 비밀번호.
"REGISTRY_SERVER": (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 주소.
"NODE_PORT_IP": (optional) istio 없이 NodePort 로만 Endpoint 를 만드는 경우에 필요한 쿠버네티스 외부 IP.
"STORAGE_CLASS": (optional) PVC 생성할 때 사용되는 Storage Class.

## 도커로 시작
```
docker run -d --name worker -e CLUSTER_NAME={CLUSTER_NAME} \
-e MNEMONIC={MNEMONIC} \
-e IS_DOCKER={IS_DOCKER} \
-e NODE_PORT_IP={NODE_PORT_IP}
-e REGISTRY_USERNAME={REGISTRY_USERNAME}
-e REGISTRY_PASSWORD={REGISTRY_PASSWORD}
-e REGISTRY_SERVER={REGISTRY_SERVER}
-e GATEWAY_NAME={GATEWAY_NAME}
-e SLACK_WEBHOOK_URL={REGISTRY_USERNAME} \
-v {Firebase Config Path}:/worker/firebase.json
-v {k8s config path}:/root/.kube/config ainblockchain/ain-connect-base

```
- CLUSTER_NAME 과 MNEMONIC 는 필수이다.
- Kubernetes 버전 Worker 인 경우 "-v {k8s config path}:/root/.kube/config" 는 필수이다.
- Kubernetes 버전 Worker인 경우 GATEWAY_NAME 를 설정할 수 있으면 default 는 worker-gw 이다.
- Docker 버전 Worker 인 경우 IS_DOCKER 에 true로 설정하고, NODE_PORT_IP가 필수이다.
- private 레지스트리와 연결하고 싶으면 REGISTRY_USERNAME, REGISTRY_PASSWORD, REGISTRY_SERVER 를 설정한다.
- Worker 로그를 슬랙 알림으로 받고 싶다면 SLACK_WEBHOOK_URL 를 설정한다.
- 환경변수를 파일로 전달하고 싶다면 '-v {json path}:/worker/env.json' 를 추가한다.


## 쿠버네티스에서 시작
- /k8s.worker.sample.yaml 를 참고하여 {{{ }}} 로 표시된 변수를 채운다.

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
