import * as ConnectSdk from "@ainblockchain/connect-sdk";
import * as fs from "fs";
import * as util from "util";
import Logger from "./common/logger";
import Docker from "./util/docker";
import * as constants from "./common/constants";
import * as utils from "./util/utils";
import * as JobDocker from "./job/docker";
import { ErrorCode, CustomError } from "./common/error";
import * as types from "./common/types";

const log = Logger.createLogger("/worker");

const INTERVAL_QUEUE_CHECK_MS = 30000;
const readFile = util.promisify(fs.readFile);

export default class WorkerBase {
  static instance: WorkerBase;

  static readonly updateStatusTimeMs = 5000;

  static readonly docker = 5000;

  protected workerSdk: ConnectSdk.Worker;

  protected storageSdk: ConnectSdk.Storage;

  constructor(mnemonic: string) {
    this.workerSdk = new ConnectSdk.Worker(
      constants.NETWORK_TYPE as ConnectSdk.Types.NetworkType,
      mnemonic,
      constants.NAME,
      constants.APP_NAME
    );
    if (constants.ENABLE_STORAGE === "true") {
      this.storageSdk = new ConnectSdk.Storage(
        constants.NETWORK_TYPE as ConnectSdk.Types.NetworkType,
        mnemonic,
        constants.NAME
      );
    }
  }

  /**
   * Get WorkerBase instance for Singleton Pattern.
   * @returns WorkerBase instance.
   */
  static getInstance(mnemonic: string) {
    if (!WorkerBase.instance) {
      WorkerBase.instance = new WorkerBase(mnemonic);
    }

    return WorkerBase.instance;
  }

  /**
   * Validate And Init For Docker.
   */
  public async init() {
    const gpuInfo = await utils.getGpuInfo();
    if (constants.GPU_DEVICE_NUMBER) {
      const deviceIdList = constants.GPU_DEVICE_NUMBER.split(",");
      for (const deviceId of deviceIdList) {
        if (!gpuInfo[deviceId]) {
          throw new CustomError(ErrorCode.NOT_SUPPORTED, "GPU Not Supported");
        }
      }
    }
    await Docker.getInstance().init(
      `${constants.LABEL_FOR_AIN_CONNECT}=container`
    );
  }

  public listenRequestQueue() {
    setInterval(async () => {
      const requests: {
        [requestId: string]: types.RequestInfo;
      } | null = await this.workerSdk.getRequestQueue();
      if (requests) {
        const sortedRequestsByCreatedAt = Object.entries(requests).sort(
          ([, a], [, b]) => a.createdAt - b.createdAt
        );
        if (sortedRequestsByCreatedAt.length !== 0) {
          const [requestId, value] = sortedRequestsByCreatedAt[0];
          await this.requestHandler(requestId, value);
        }
      }
    }, INTERVAL_QUEUE_CHECK_MS);
  }

  public async start() {
    // Register
    await this.register();
    // Heath Check.
    setInterval(async () => {
      try {
        await this.updateStatus();
      } catch (err) {
        log.error(`Failed to Update Status For Worker: ${err}`);
      }
    }, WorkerBase.updateStatusTimeMs);

    this.listenRequestQueue();

    if (this.storageSdk) {
      await this.storageSdk.signIn();
    }

    log.info(`[+] Start Worker ( 
      NETWORK_TYPE: ${constants.NETWORK_TYPE}
      Worker Name: ${constants.NAME}
      Worker Address: ${this.workerSdk.getConnect().getAddress()}
    )`);
  }

  /**
   * Register Worker in Connect.
   */
  private async register() {
    const cpuInfo = await utils.getCpuInfo();
    const gpuInfo = await utils.getGpuInfo();

    await this.workerSdk.register({
      ethAddress: constants.ETH_ADDRESS,
      containerSpec: {
        cpu: {
          name: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
          vcpu: Number(constants.CONTAINER_VCPU),
        },
        gpu: constants.CONTAINER_GPU_CNT
          ? {
              name: Object.values(gpuInfo)[0].gpuName,
              memoryGB: Object.values(gpuInfo)[0].memoryTotal / 1000,
              count: Number(constants.CONTAINER_GPU_CNT),
            }
          : null,
        memory: {
          maxGB: Number(constants.CONTAINER_MEMORY_GB),
        },
        storage: {
          maxGB: Number(constants.DISK_GB),
        },
        maxNumberOfContainer: Number(constants.CONTAINER_MAX_CNT),
        hasEndpoint: !!constants.CONTAINER_ALLOW_PORT,
      },
      labels: {
        managedBy: constants.MANAGED_BY || "none",
        serviceType: constants.SERVICE_TYPE || null,
        spec: constants.SPEC_NAME || null,
      },
    });
  }

  private async updateStatus() {
    const containerInfo = await JobDocker.getAllContainerInfo();
    const runningContainerInfo: {
      [containerId: string]: {
        status: string;
        serviceStatus?: string;
        imagePath: string;
        logs: { [key: string]: string };
      };
    } = {};

    const successExitContainers = [];
    for (const containerId in containerInfo) {
      if (Object.prototype.hasOwnProperty.call(containerInfo, containerId)) {
        const { status, serviceStatus, imagePath, exitCode, requestId } =
          containerInfo[containerId];
        if (status === "exited") {
          await this.responseForExitContainer(
            containerId,
            containerInfo[containerId]
          );
          if (exitCode === 0) {
            successExitContainers.push(containerInfo[containerId]);
          }
        } else {
          const logs = await this.getLogForContainer(requestId);
          runningContainerInfo[containerId] = serviceStatus
            ? {
                status,
                imagePath,
                logs,
                serviceStatus,
              }
            : {
                status,
                imagePath,
                logs,
              };
        }
      }
    }
    await this.workerSdk.updateStatus({
      workerStatus: "running",
      containerInfo:
        Object.keys(runningContainerInfo).length === 0
          ? undefined
          : runningContainerInfo,
      currentNumberOfContainer: Docker.getInstance().getContainerCnt(),
    });

    await this.uploadForExitContainer(successExitContainers);
  }

  private async responseForExitContainer(
    containerId: string,
    containerInfo: types.DetailContainerInfo
  ) {
    const { exitCode, userAinAddress, requestId } = containerInfo;
    const logs = await this.getLogForContainer(requestId);
    const result = await JobDocker.deleteContainer(
      {
        containerId,
      },
      userAinAddress
    );
    await this.workerSdk.sendResponse(result.createRequestId, userAinAddress, {
      data: {
        ...result,
        exitCode,
        logs,
      },
    });
  }

  private async uploadForExitContainer(
    containerInfos: types.DetailContainerInfo[]
  ) {
    for (const containerInfo of containerInfos) {
      const { existInputMount, existOutputMount, requestId, uploadFileName } =
        containerInfo;
      const rootPath = `${constants.SHARED_PATH}/${requestId}`;
      if (fs.existsSync(`${rootPath}/${uploadFileName}`)) {
        await this.storageSdk.uploadFile(
          `trainResult/${requestId}/${this.workerSdk.getWorkerId()}/${uploadFileName}`, // Temp Path
          `${rootPath}/${uploadFileName}`
        );
      }

      if (existInputMount || existOutputMount) {
        fs.rmdirSync(rootPath, { recursive: true });
      }
    }
  }

  private async getLogForContainer(requestId: string) {
    const logfilePath = `${constants.SHARED_PATH}/${requestId}/log.json`;
    if (fs.existsSync(logfilePath)) {
      const data = await readFile(logfilePath);
      try {
        return JSON.parse(String(data));
      } catch (err) {
        log.error(`Failed to Write Log - requestId: ${requestId}`);
        return {};
      }
    }
    return {};
  }

  private async requestHandler(
    requestId: string,
    value: ConnectSdk.Types.ListenRequestQueueValue
  ) {
    log.debug(
      `[+] Request requestId: ${requestId}, value: ${JSON.stringify(
        value,
        null,
        4
      )}`
    );
    let result;
    try {
      const { requestType, params, userAinAddress } = value;
      if (requestType === "createContainer") {
        result = await JobDocker.createContainer(
          params,
          userAinAddress,
          requestId,
          this.storageSdk
        );
      } else if (requestType === "deleteContainer") {
        result = await JobDocker.deleteContainer(params, userAinAddress);
        const logs = await this.getLogForContainer(result.createRequestId);
        await this.workerSdk.sendResponse(
          result.createRequestId,
          value.userAinAddress,
          {
            data: {
              ...result,
              logs,
            },
          }
        );
      } else {
        throw new CustomError(ErrorCode.NOT_EXIST, "Function Not Exist");
      }
      await this.workerSdk
        .sendResponse(requestId, value.userAinAddress, {
          data: {
            ...result,
            statusCode: 200,
          },
        })
        .catch((err) => {
          log.error(`[-] Failed to send Response ${err.message}`);
        });
      log.debug(`[-] Success! requestId: ${requestId}`);
    } catch (error) {
      log.error(`[-] Failed! requestId: ${requestId} - ${error}`);
      let data = {};
      if (Object.values(ErrorCode).includes(error.statusCode)) {
        data = {
          errorMessage: error.message,
          statusCode: error.statusCode,
        };
      } else {
        data = {
          errorMessage: error.message,
          statusCode: ErrorCode.UNEXPECTED,
        };
      }
      await this.workerSdk
        .sendResponse(requestId, value.userAinAddress, data)
        .catch((err: any) => {
          log.error(`[-] Failed to send Response - ${err}`);
        });
    }
  }
}
