<h1 align="center">AIN Connect Worker Base</h1>
<h4 align="center">AIN Connect 와 연결하여 HW 생태계를 만들어주는 프로젝트이다.</h4>
                                                                                                
**AIN Worker** 프로젝트는 Node.js로 작성되었습니다.

<br>

## 🛠사전 설치

- ESLint 가 지원되는 에디터 (IntelliJ, VSCode 등)
- Node.js 12.16+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

## 시작
```
yarn
NODE_ENV={staging or prod} CLUSTER_NAME=donghyeon MNEMONIC='mnemonic' CONFIG_PATH='./config.yaml' yarn start
```

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