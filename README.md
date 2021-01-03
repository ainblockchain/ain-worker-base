<h1 align="center">AIN Connect Worker Base</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## 로컬로 시작
```
// For K8s
NODE_ENV={staging or prod} CLUSTER_NAME={ex. comcom{}} MNEMONIC='${mnemonic}' STORAGE_CLASS={(optional)'azurefile'} CONFIG_PATH='./config.yaml' yarn start

// For Docker
NODE_ENV={staging or prod} CLUSTER_NAME={ex. comcom{}} MNEMONIC='${mnemonic}' STORAGE_CLASS={(optional)'azurefile'} IS_DOCKER=true yarn start
```
- firebase를 변경하고 싶다면, FIREBASE_CONFIG_PATH를 환경변수로 추가한다.

## 도커로 시작
```
// For K8s
docker run -d --name worker-k8s -v {k8s config path}:/server/config.yaml -e CLUSTER_NAME={ex. comcom{}} -e MNEMONIC='${mnemonic}' -e CONFIG_PATH='./config.yaml' ainblockchain/ain-connect-base:<TAG>
// For Docker
docker run -d --name worker-docker -v /var/run/docker.sock:/var/run/docker.sock -e CLUSTER_NAME={ex. comcom{}} -e MNEMONIC='${mnemonic}' -e IS_DOCKER=true ainblockchain/ain-connect-base:<TAG>
```
- firebase를 변경하고 싶다면, FIREBASE_CONFIG_PATH를 환경변수로 추가한다.(-v $PWD/firebase.json:/server/firebase.json -e FIREBASE_CONFIG_PATH="./firebase.json")

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