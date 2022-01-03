import * as ConnectSdk from "@ainblockchain/connect-sdk";
import Logger from "./common/logger";
import Docker from "./util/docker";
import * as constants from "./common/constants";
import * as utils from "./util/utils";
import * as JobDocker from "./job/docker";
import { ErrorCode, CustomError } from "./common/error";

const log = Logger.createLogger("/worker");

export default class WorkerBase {
  static instance: WorkerBase;

  static readonly updateStatusTimeMs = 5000;

  static readonly docker = 5000;

  protected connectSdk: ConnectSdk.Worker;

  constructor(mnemonic: string) {
    this.connectSdk = new ConnectSdk.Worker(
      constants.NETWORK_TYPE as ConnectSdk.Types.NetworkType,
      mnemonic,
      constants.NAME,
      constants.APP_NAME,
      constants.USE_FIREBASE
    );
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

  public async start() {
    // Register
    await this.register();
    // Heath Check.
    setInterval(async () => {
      await this.updateStatus();
    }, WorkerBase.updateStatusTimeMs);

    this.connectSdk.listenRequestQueue(
      async (ref: string, value: ConnectSdk.Types.ListenRequestQueueValue) => {
        await this.requestHandler(ref, value);
      }
    );

    log.info(`[+] Start Worker ( 
      NETWORK_TYPE: ${constants.NETWORK_TYPE}
      Worker Name: ${constants.NAME}
      Worker Address: ${this.connectSdk.getConnect().getAddress()}
    )`);
  }

  /**
   * Register Worker in Connect.
   */
  private async register() {
    const cpuInfo = await utils.getCpuInfo();
    const gpuInfo = await utils.getGpuInfo();

    await this.connectSdk.register({
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
          maxGB: Number(constants.CONTAINER_STORAGE_GB),
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
      };
    } = {};

    for (const containerId in containerInfo) {
      if (Object.prototype.hasOwnProperty.call(containerInfo, containerId)) {
        const { status, userAinAddress, serviceStatus, imagePath, exitCode } =
          containerInfo[containerId];
        if (status === "exited") {
          const result = await JobDocker.deleteContainer(
            {
              containerId,
            },
            userAinAddress
          );
          await this.connectSdk.sendResponse(
            result.createRequestId,
            userAinAddress,
            {
              data: {
                ...result,
                exitCode,
              },
            }
          );
        } else {
          runningContainerInfo[containerId] = {
            status,
            imagePath,
          };
          if (serviceStatus) {
            runningContainerInfo[containerId] = {
              ...runningContainerInfo[containerId],
              serviceStatus,
            };
          }
        }
      }
    }

    await this.connectSdk.updateStatus({
      workerStatus: "running",
      containerInfo: runningContainerInfo,
      currentNumberOfContainer: Docker.getInstance().getContainerCnt(),
    });
  }

  private async requestHandler(
    ref: string,
    value: ConnectSdk.Types.ListenRequestQueueValue
  ) {
    log.debug(
      `[+] Request ref: ${ref}, value: ${JSON.stringify(value, null, 4)}`
    );

    const requestId = ref.split("/").reverse()[0];
    let result;
    try {
      const { requestType, params, userAinAddress } = value;
      if (requestType === "createContainer") {
        result = await JobDocker.createContainer(
          params,
          userAinAddress,
          requestId
        );
      } else if (requestType === "deleteContainer") {
        result = await JobDocker.deleteContainer(params, userAinAddress);
        await this.connectSdk.sendResponse(
          result.createRequestId,
          value.userAinAddress,
          {
            data: result,
          }
        );
      } else {
        throw new CustomError(ErrorCode.NOT_EXIST, "Function Not Exist");
      }
      await this.connectSdk
        .sendResponse(requestId, value.userAinAddress, {
          data: {
            ...result,
            statusCode: 200,
          },
        })
        .catch((err) => {
          log.error(`[-] Failed to send Response ${err.message}`);
        });
      log.debug(`[-] Success! ref: ${ref}`);
    } catch (error) {
      log.error(`[-] Failed! ref: ${ref} - ${error}`);
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
      await this.connectSdk
        .sendResponse(requestId, value.userAinAddress, data)
        .catch((err) => {
          log.error(`[-] Failed to send Response - ${err}`);
        });
    }
  }
}
