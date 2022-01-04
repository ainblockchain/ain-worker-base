# AIN Worker

## Index

- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)

## About Repository

이 레파지토리는 AI Network 에 본인 머신을 연결하여, 머신 리소스 제공자로서 보상을 받을 수 있도록 하는 프로젝트이다.

## Getting Started

### prerequisites

- Install Docker
- (optional) GPU 까지 제공하고 싶다면 Docker 에서 GPU 를 사용할 수 있도록 해야함. (셋업&확인 링크)
- 본인 HW 머신에 CPU,MEMORY,DISK,GPU 스펙을 확인하고, 얼마나 할당할 것인지 정한다. (확인하는 방법 링크)

### How To Run

```
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker \
[-e {ENV_DATA}] \
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-connect-base:revamp
```

- ENV_DATA 에 환경 변수 리스트를 참고하여 추가한다.
- GPU 도 제공하고 싶다면 --gpu all 을 추가한다.

### ENV LIST

| ENV KEY                  | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **NAME**                 | Worker Name. (ex. comcom-worker)                                                                          |
| **APP_NAME**             | AI Network Blockchain APP Name. (ex. collaborative_ai)                                                    |
| **CONTAINER_VCPU**       | 한 컨테이너의 CPU Core 개수                                                                               |
| **CONTAINER_MEMORY_GB**  | 한 컨테이너의 MEMORY 용량 (단위: GB)                                                                      |
| **DISK_GB**              | 머신 총 DISK 용량 (단위: GB).                                                                             |
| **CONTAINER_GPU_CNT**    | 한 컨테이너의 GPU 개수.                                                                                   |
| **GPU_DEVICE_NUMBER**    | (Optional) GPU Device IDs 로 ID 사이를 ','로 구분한다. (ex. 1,2,3...)                                     |
| **CONTAINER_MAX_CNT**    | (Optional) 컨테이너 최대 개수로, 기본값은 1이다.                                                          |
| **NODE_PORT_IP**         | (Optional) 컨테이너 접근을 위한 IP(외부에서 접근 가능한 IP).                                              |
| **CONTAINER_ALLOW_PORT** | 사용 가능한 외부 포트들로 포트 범위는 '-'로 구분하고, 각 범위들은 ',' 로 구분한다. ex. '80-83,8888-88889' |
| **MANAGED_BY**           | (Optional) 관리자 정보 (ex. comcom)                                                                       |
| **SERVICE_TYPE**         | (Optional)                                                                                                |
| **SPEC_NAME**            | (Optional) 머신 스펙 이름 (ex. high-gpu)                                                                  |
| **MNEMONIC**             | (Optional) AIN MNEMONIC 으로, 없으면 자동으로 생성하여 $HOME/ain-worker/{NAME}/env.json 에 저장한다.      |
| **ETH_ADDRESS**          | (Optional) 이더리움 주소.                                                                                 |
| **SLACK_WEBHOOK_URL**    | (Optional) 슬랙으로 Worker 에러 로그를 받고 싶은 경우 필요한 Webhook url                                  |

#### example
```
// Non-GPU
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker \
-e APP_NAME=collaborative_ai \
-e NAME={NAME}
-e CONTAINER_VCPU=1
-e CONTAINER_MEMORY_GB=3
-e DISK_GB=50
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-connect-base:revamp


// GPU
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker --gpus all \
-e APP_NAME=collaborative_ai \
-e NAME={NAME}
-e CONTAINER_VCPU=1
-e CONTAINER_MEMORY_GB=3
-e CONTAINER_GPU_CNT=1
-e GPU_DEVICE_NUMBER=0
-e DISK_GB=50
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-connect-base:revamp
```

### How to Get Log

```
docker logs -f --name ain-worker
```

### How to Terminate

```
docker rm -f $(docker ps -f "label=AinConnect.container" -q -a)
```

## Contributing

I am looking for someone to help with this project. Please advise and point out.  
Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code
of conduct, and the process for submitting pull requests to us.

## License

```
MIT License

Copyright (c) 2020 Common Computer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
