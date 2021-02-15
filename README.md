<h1 align="center">AIN Connect Resource Worker</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Connect Resource Worker** 프로젝트는 Node.js 로 작성되었습니다.

<br>

## 🛠사전 설치
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## env.sample.json
- type: Worker Type 으로  ‘inference’ | ‘training’ | ‘k8s’ | ‘docker' 이다. (required)
- ethAddress: payout 할 이더리움 주소이다. (type: ‘inference’ or ‘training’ 인 경우만 required)
- sharedDirPath: type 이 ‘training’ 인 경우 학습 컨테이너와의 통신을 위한 디렉토리 경로 (type: ‘training’ 인 경우만 required)
- gpuDeviceNumber: GPU 디바이스 넘버 (ex. 1,2,3)
- jobType: type 이 ‘inference’ 인 경우만 추론 컨테이너 타입을 명시. (type: ‘inference’ 인 경우만 required)
- dockerAuth: Private Docker 레지스트리 계정
  - username
  - password
  - server

## 코드 실행
```
// k8s config.yaml 생성(kubectl ctx {target cluster name}, create_account.sh 이용)
// env.json 생성(env.sample.json 이용)
yarn start
```

## 도커로 코드 실행
```
docker build -t ainblockchain/ain-connect-base:$tag .
docker run -d --name worker \ 
  -v $PWD/env.json:/server/env.json \
  -v $PWD/config.yaml:/server/config.yaml \
  ainblockchain/ain-connect-base:$tag
```
- Worker Type 이 'training' 인 경우 ```-v ${env.json.sharedDirPath}:/server/training``` 을 추가 해야 함.
- 로그 확인: docker logs -f worker

## 유닛 테스트 실행
```
yarn test
```

## 코드 스타일 검사
```
yarn lint
```

# 코드 구조 설명 (src)
- common: 공통으로 사용하는 모듈 및 변수 모음.
- core: Worker 핵심 기능 모음으로 Worker Type 별로 정의 되어 있음.
- util: 도커, 쿠버네티스 기능 로직 모음.
- interface: AI Network 와의 인터페이스 로직 모음.
- test: 테스트 코드 모음.

<br>