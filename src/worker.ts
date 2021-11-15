import * as ConnectSdk from "@ainblockchain/connect-sdk";
import Logger from "./common/logger";
import Docker from "./util/docker";
import * as constants from "./common/constants";
import * as utils from "./util/utils";
import dockerJobHandler, * as JobDocker from "./job/docker";
import ErrorDetailCode from "./common/errorCode";

const log = Logger.createLogger("/worker");

export default class WorkerBase {
  static instance: WorkerBase;

  static readonly updateStatusTimeMs = 5000;

  static readonly docker = 5000;

  protected connectSdk: ConnectSdk.Worker;

  constructor(mnemonic: string) {
    this.connectSdk = new ConnectSdk.Worker(
      constants.NETWORK_TYPE as ConnectSdk.types.NetworkType,
      mnemonic,
      constants.NAME
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
          throw new Error(ErrorDetailCode.INVALID_GPU_DEVICE);
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
      async (ref: string, value: ConnectSdk.types.ListenRequestQueueValue) => {
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
    /**
     * @TODO hasEndpoint 추가.
     */
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
      },
      labels: {
        managedBy: constants.MANAGED_BY || "none",
        serviceType: constants.SERVICE_TYPE || null,
      },
    });
  }

  private async updateStatus() {
    const containerInfo = await JobDocker.getAllContainerInfo();
    await this.connectSdk.updateStatus({
      containerInfo,
      currentNumberOfContainer: Docker.getInstance().getContainerCnt(),
    });
  }

  private async requestHandler(
    ref: string,
    value: ConnectSdk.types.ListenRequestQueueValue
  ) {
    log.debug(
      `[+] Request ref: ${ref}, value: ${JSON.stringify(value, null, 4)}`
    );

    const [type, method] = value.requestType.split(":");
    const requestId = ref.split("/").reverse()[0];
    try {
      if (["job", "deployment"].includes(type)) {
        throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
      }
      const result = await dockerJobHandler(
        type,
        method,
        value.params,
        value.userAinAddress
      );
      /**
       * @TODO 응답 메시지 수정.
       */
      await this.connectSdk.sendResponse(requestId, value.userAinAddress, {
        data: result || {},
      });
      log.debug(`[-] Success! ref: ${ref}`);
    } catch (err) {
      log.error(`[-] Failed! ref: ${ref} - ${err}`);
      await this.connectSdk
        .sendResponse(requestId, value.userAinAddress, {
          errorMessage: err.message,
        })
        .catch((error) => {
          log.error(`[-] Failed to send Response - ${error}`);
        });
    }
  }
}
