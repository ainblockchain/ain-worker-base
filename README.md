<h1 align="center">AIN Connect Worker Base</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## env.json 작성
```
{
  "CLUSTER_NAME": "", // 클러스터 별칭
  "REGISTRY_USERNAME": "", // (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 유저 네임.
  "REGISTRY_PASSWORD": "", // (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 비밀번호.
  "REGISTRY_SERVER": "", // (optional) Private 도커 레지스트리를 사용하는 경우에 필요한 레지스트리 주소.
  "NODE_PORT_IP": "", // (optional) istio 없이 NodePort 로만 Endpoint 를 만드는 경우에 필요한 쿠버네티스 외부 IP.
  "IS_DOCKER": "", // true 인 경우 도커 버전으로 워커를 시작함. (false 인 경우는 쿠버네티스 버전으로 시작.)
  "STORAGE_CLASS": "" // (optional) PVC 생성할 때 사용되는 Storage Class.
}
```

## 도커로 시작
```
// For K8s
docker run -d --name worker-k8s -v {/PATH/TO/CONFIG}:/server/env.json -v {k8s config path}:/server/config.yaml ainblockchain/ain-connect-base:<TAG>
// For Docker
docker run -d --name worker-docker -v {/PATH/TO/CONFIG}:/server/env.json -v /var/run/docker.sock:/var/run/docker.sock ainblockchain/ain-connect-base:<TAG>
```
- /PATH/TO/CONFIG에 env.sample.json을 참고하여 파일을 생성한다.

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