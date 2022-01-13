# AIN Worker

## Index

- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)

## About Repository

This repository is a project that allows you to receive rewards as a machine resource provider by connecting your machine to the AI ​​Network.

## Getting Started

### prerequisites

- Linux (OS)
- Docker (or With GPU)

### How To Run

```
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker \
[-e {ENV_DATA}] \
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-worker
```

- fill in ENV DATA [ENV](#ENV)
- About docker with gpu, Add Option "--gpus all"

### ENV

| ENV KEY                  | Description                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **NAME**                 | Worker Name. (ex. comcom-worker)                                                                                          |
| **APP_NAME**             | AI Network Blockchain APP Name. (ex. collaborative_ai)                                                                    |
| **CONTAINER_VCPU**       | (Optional) A Container CPU Core (default: 1)                                                                              |
| **CONTAINER_MEMORY_GB**  | (Optional) A Container MEMORY Capacity (default: 4)                                                                       |
| **DISK_GB**              | (Optional) DISK Capacity (default: 50)                                                                                    |
| **CONTAINER_GPU_CNT**    | (Optional) A Container Number of GPUs                                                                                     |
| **GPU_DEVICE_NUMBER**    | (Optional) GPU Device IDs, (Separate IDs with ',') (ex. 1,2,3...)                                                         |
| **CONTAINER_MAX_CNT**    | (Optional) The maximum number of containers. (default: 1)                                                                 |
| **NODE_PORT_IP**         | (Optional) container access IP (accessible IP from outside).                                                              |
| **CONTAINER_ALLOW_PORT** | (Optional) Available ports, Port ranges are separated by '-', and each range is separated by ',' (ex. '80-83,8888-88889') |
| **MANAGED_BY**           | (Optional) Manager Name (ex. comcom)                                                                                      |
| **SERVICE_TYPE**         | (Optional)                                                                                                                |
| **SPEC_NAME**            | (Optional) Machine Spec Name (ex. high-gpu)                                                                               |
| **MNEMONIC**             | (Optional) if it does not exist, it is automatically created and saved in $HOME/ain-worker/{NAME}/env.json.               |
| **ETH_ADDRESS**          | (Optional) Ethereum Address 주소.                                                                                         |
| **SLACK_WEBHOOK_URL**    | (Optional) Slack Webhook URL                                                                                              |

#### example

```
// Non-GPU
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker \
-e APP_NAME=collaborative_ai \
-e NAME={NAME} \
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-worker


// GPU
docker run -l AinConnect.container=master -d --restart unless-stopped --name ain-worker --gpus all \
-e APP_NAME=collaborative_ai \
-e NAME={NAME} \
-e CONTAINER_GPU_CNT=1 \
-e GPU_DEVICE_NUMBER=0 \
-v /var/run/docker.sock:/var/run/docker.sock \
-v $HOME/ain-worker/{NAME}:/root/ain-worker/{NAME} \
ainblockchain/ain-worker
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
