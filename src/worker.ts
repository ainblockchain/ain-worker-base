import * as ConnectSdk from '@ainblockchain/connect-sdk';
import Logger from './common/logger';
import Docker from './util/docker';
import * as constants from './common/constants';
import * as utils from './util/utils';
import dockerJobHandler from './job/docker';
import k8sWorkspaceJobHandler from './job/workspace-for-k8s';
import ErrorDetailCode from './common/errorCode';

const log = Logger.createLogger('/worker');

export default class WorkerBase {
  static instance: WorkerBase;

  static readonly updateStatusTimeMs = 5000;

  static readonly docker = 5000;

  protected connectSdk: ConnectSdk.Worker;

  constructor(mnemonic: string) {
    this.connectSdk = new ConnectSdk.Worker(
      constants.NETWORK_TYPE as ConnectSdk.types.NetworkType, mnemonic, constants.NAME,
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
    if (!constants.IS_K8S) {
      const gpuInfo = await utils.getGpuInfo();
      const cpuInfo = await utils.getCpuInfo();
      if (cpuInfo.physicalCores < Number(constants.CONTAINER_VCPU)) {
        throw new Error(ErrorDetailCode.NOT_ENOUGH_VCPU);
      }
      if (constants.GPU_DEVICE_NUMBER) {
        const deviceIdList = constants.GPU_DEVICE_NUMBER.split(',');
        for (const deviceId of deviceIdList) {
          if (!gpuInfo[deviceId]) {
            throw new Error(ErrorDetailCode.INVALID_GPU_DEVICE);
          }
        }
      }
      await Docker.getInstance().init(`${constants.LABEL_FOR_AIN_CONNECT}=container`);
    }
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
      },
    );

    log.info(`[+] Start Worker ( 
      NETWORK_TYPE: ${constants.NETWORK_TYPE}
      Worker Name: ${constants.NAME}
      Worker Address: ${this.connectSdk.getConnect().getAddress()}
      IS_K8S: ${(constants.IS_K8S) ? 'yes' : 'no'}
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
      containerSpec: (!constants.IS_K8S) ? {
        cpu: {
          name: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
          vcpu: Number(constants.CONTAINER_VCPU),
        },
        gpu: (constants.CONTAINER_GPU_CNT) ? {
          name: Object.values(gpuInfo)[0].gpuName,
          memoryGB: Object.values(gpuInfo)[0].memoryTotal,
          count: Number(constants.CONTAINER_GPU_CNT),
        } : null,
        memory: {
          maxGB: Number(constants.CONTAINER_MEMORY_GB),
        },
        storage: {
          maxGB: Number(constants.CONTAINER_STORAGE_GB),
        },
        maxNumberOfContainer: Number(constants.CONTAINER_MAX_CNT),
      } : null,
      labels: {
        managedBy: constants.MANAGED_BY || 'none',
      },
    });
  }

  private async updateStatus() {
    // await this.connectSdk.updateStatus({
    //   currentNumberOfContainer: (constants.IS_K8S) ? 0 : Docker.getInstance().getContainerCnt(),
    // });
  }

  private async requestHandler(ref: string, value: ConnectSdk.types.ListenRequestQueueValue) {
    log.debug(`[+] Request ref: ${ref}, value: ${JSON.stringify(value, null, 4)}`);

    const [service, method] = value.requestType.split(':');
    const requestId = ref.split('/').reverse()[0];
    try {
      let result: any;
      if (constants.IS_K8S) {
        if (service === 'k8s') {
          result = await k8sWorkspaceJobHandler(method, value.params, value.userAinAddress);
        } else {
          throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
        }
      } else if (service === 'docker') {
        result = await dockerJobHandler(method, value.params, value.userAinAddress);
      } else {
        throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
      }
      await this.connectSdk.sendResponse(requestId, value.userAinAddress, {
        data: result || {},
      });
      log.debug(`[-] Success! ref: ${ref}`);
    } catch (err) {
      log.error(`[-] Failed! ref: ${ref} - ${err}`);
      await this.connectSdk.sendResponse(requestId, value.userAinAddress, {
        errorMessage: err.message,
      }).catch((error) => {
        log.error(`[-] Failed to send Response - ${error}`);
      });
    }
  }
}
