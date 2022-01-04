<h1 align="center">AIN Connect Worker</h1>
                                                                                                
**AIN Worker** The project is written in Node.js.

## 🛠pre-installed

- ESLint supported editor (IntelliJ, VSCode)
- Node.js 14.17+
- Yarn 1.22+ (`npm install -g yarn`)

<br>

# Code structure description (src)
- common: A collection of commonly used modules and variables.
- job: A collection of request job Method.
- util: utility code collections
- index.ts: entry point.
- worker.ts: About AIN Connect.


## How To Run
```
mkdir -p ~/ain-worker/{NAME}

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

## 코드 스타일 검사

```
yarn lint
```
