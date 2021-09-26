import Dockerode from 'dockerode';
import * as constants from '../common/constants';
import * as types from '../common/types';
import ErrorDetailCode from '../common/errorCode';

export default class Docker {
  private static instance: Docker;

  private static readonly MAX_CONTAINER_MAX_CNT = Number(constants.CONTAINER_MAX_CNT);

  private static readonly MAX_IMAGE_CNT = Number(constants.CONTAINER_MAX_CNT) + 2;

  private static readonly SOCKET_PATH = '/var/run/docker.sock';

  private dockerode: Dockerode;

  private allowPorts: types.DockerAllowPort;

  private allowGPUDevice: types.DockerAllowGPUDevice;

  private containerInfo: types.ContainerInfo;

  private dockerImagePathList: string[];

  private constructor() {
    this.allowPorts = {};
    this.allowGPUDevice = {};
    this.containerInfo = {};
    this.dockerImagePathList = [];
    this.dockerode = new Dockerode({ socketPath: Docker.SOCKET_PATH });
  }

  static getInstance(): Docker {
    if (!Docker.instance) {
      Docker.instance = new Docker();
    }
    return Docker.instance;
  }

  async init(containerLabel: string) {
    if (constants.GPU_DEVICE_NUMBER) {
      await this.checkGPUDocker()
        .catch((err) => {
          throw new Error(ErrorDetailCode.GPU_NOT_SUPPORTED);
        });
    }
    // Init allowPort
    const portRangeList = constants.CONTAINER_ALLOW_PORT.split(',');
    for (const portRange of portRangeList) {
      const [first, second] = portRange.split('-');
      const endPort = second || first;
      for (let port = Number(first); port <= Number(endPort); port += 1) {
        this.allowPorts[port] = true;
      }
    }
    // Init allowGPUDevice
    const deviceIdList = (constants.GPU_DEVICE_NUMBER) ? constants.GPU_DEVICE_NUMBER.split(',') : [];
    for (const deviceId of deviceIdList) {
      this.allowGPUDevice[deviceId] = true;
    }
    // Init containerInfo
    const connectContainers = await this.getContainerInfosByLabel(containerLabel);
    for (const connectContainer of connectContainers) {
      const {
        Names: names, Image: imagePath, Ports: ports,
      } = connectContainer;
      const name = names[0].replace('/', '');
      const { HostConfig } = await this.getContainerInfo(name);
      this.containerInfo[name] = {
        started: true,
        imagePath,
        extenalPorts: ports.map((item) => String(item.PublicPort)),
        GPUDeviceId: (
          HostConfig.DeviceRequests && HostConfig.DeviceRequests[0])
          ? HostConfig.DeviceRequests[0].DeviceIDs || [] : [],
      };
    }
  }

  async checkGPUDocker() {
    await this.run({
      imagePath: 'ubuntu:18.04',
      containerId: 'connectGpuChecker',
      command: ['tail', '-f'],
      ports: [],
      resourceLimit: {
        vcpu: 1,
        memoryGB: 1,
        gpuCnt: 1,
      },
    });
    await this.kill('connectGpuChecker');
  }

  /**
   * Run Docker Container. if the Docker Image not Exists, pull Docker Image.
   */
  async run(params: types.DockerRunParams) {
    const {
      imagePath, containerId, ports, envs, command, resourceLimit, labels,
    } = params;

    const exists = await this.existContainer(params.containerId);
    if (exists) {
      throw new Error(ErrorDetailCode.CONTAINER_ALREADY_EXISTS);
    }

    // Check Container Limit.
    if (this.getContainerCnt() === Docker.MAX_CONTAINER_MAX_CNT) {
      throw new Error(ErrorDetailCode.EXCEED_CONTAINER_LIMIT);
    }
    if (this.containerInfo[containerId]) {
      throw new Error(ErrorDetailCode.CONTAINER_ALREADY_EXISTS);
    }

    // Check Extenal Port.
    const allowPorts = Object.entries(this.allowPorts).filter(([_, allow]) => allow);
    if (allowPorts.length < ports.length || ports.length > 3) {
      throw new Error(ErrorDetailCode.EXCEED_CONTAINER_PORT);
    }
    const publishPorts: {[extenalPort: string]: string} = {};
    ports.forEach((port, idx) => {
      const extenalPort = allowPorts[idx][0];
      publishPorts[extenalPort] = String(port);
      this.allowPorts[extenalPort] = false;
    });

    // Check GPU Device
    const allowDeviceGPU = Object.entries(this.allowGPUDevice).filter(([_, allow]) => allow);
    const gpuDeviceNumbers: string[] = [];
    for (let gpuIdx = 0; gpuIdx < resourceLimit.gpuCnt; gpuIdx += 1) {
      const gpuDeviceNum = allowDeviceGPU[gpuIdx][0];
      this.allowGPUDevice[gpuDeviceNum] = false;
      gpuDeviceNumbers.push(gpuDeviceNum);
    }

    const cpuFirstCore = `${(this.getContainerCnt() * resourceLimit.vcpu) + 1}`;
    this.containerInfo[containerId] = {
      imagePath,
      extenalPorts: Object.keys(publishPorts),
      GPUDeviceId: gpuDeviceNumbers,
      started: false,
    };

    const createOption = {
      name: containerId,
      ExposedPorts: {},
      Env: Object.entries(envs || {}).map(([key, value]) => `${key}=${value}`),
      Cmd: command,
      Image: imagePath,
      Labels: labels,
      HostConfig: {
        CpusetCpus: `${cpuFirstCore}-${Number(cpuFirstCore) + resourceLimit.vcpu - 1}`,
        KernelMemoryTCP: resourceLimit.memoryGB * 1000 * 1000,
        PortBindings: {},
        AutoRemove: true,
        Binds: [],
        ShmSize: 4294967296, // 4GB
        DeviceRequests: (gpuDeviceNumbers.length !== 0) ? [
          {
            Driver: '',
            Count: 0,
            DeviceIDs: gpuDeviceNumbers,
            Capabilities: [['gpu']],
            Options: {},
          },
        ] : [],
      },
    };

    for (const [externalPort, internalPort] of Object.entries(publishPorts)) {
      createOption.ExposedPorts[`${internalPort}/tcp`] = {};
      createOption.HostConfig.PortBindings[`${internalPort}/tcp`] = [{ HostPort: externalPort }];
    }

    try {
      // Pull Image
      await this.pullImage(imagePath);

      const container = await this.dockerode.createContainer(createOption);
      await container.start();
      this.containerInfo[containerId].started = true;

      return {
        publishPorts,
      };
    } catch (err) {
      delete this.containerInfo[containerId];
      Object.values(publishPorts).forEach((port) => {
        this.allowPorts[port] = true;
      });
      Object.values(gpuDeviceNumbers).forEach((gpuDeviceId) => {
        this.allowGPUDevice[gpuDeviceId] = true;
      });
      throw err;
    }
  }

  /**
   * Kill Docker Container.
   */
  async kill(containerId: string, allowLabels?: {[key: string]: string}) {
    if (!this.containerInfo[containerId]) {
      throw new Error(ErrorDetailCode.CONTAINER_NOT_EXIST);
    }
    if (!this.containerInfo[containerId].started) {
      throw new Error(ErrorDetailCode.CONTAINER_NOT_STARTED);
    }
    const containerHandler = this.dockerode.getContainer(containerId);
    const constainerInfo = await containerHandler.inspect();
    if (allowLabels) {
      Object.entries(allowLabels).forEach(([key, value]) => {
        if (!constainerInfo.Config.Labels[key] || constainerInfo.Config.Labels[key] !== value) {
          throw new Error(ErrorDetailCode.CAN_NOT_ALLOW);
        }
      });
    }
    await containerHandler.remove({ force: true });
    delete this.containerInfo[containerId];
  }

  /**
   * Exec Docker Container.
   */
  async exec(containerId: string, command: string) {
    const containerHandler = this.dockerode.getContainer(containerId);
    const exec = await containerHandler.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStderr: true,
      AttachStdout: true,
    });
    await exec.start({
      stdin: true,
    });
  }

  /**
   * Get Container Information By ContainerId.
   */
  getContainerInfo = async (containerId: string) => {
    const containerHandler = this.dockerode.getContainer(containerId);
    const result = await containerHandler.inspect();
    return {
      ...result,
      ...this.containerInfo[containerId],
    };
  }

  /**
   * Get Container Information By Container Label.
   */
  getContainerInfosByLabel = async (label: string) => {
    const result = await this.dockerode.listContainers({
      filters: {
        label: [label],
      },
    });
    return result;
  }

  /**
   * Pull Docker Image.
   */
  private async pullImage(imagePath: string) {
    // Clear Not Used Docker Image.
    if (!this.dockerImagePathList.includes(imagePath)
      && this.dockerImagePathList.length === Docker.MAX_IMAGE_CNT) {
      for (const dockerImagePath of this.dockerImagePathList) {
        const containerValue = Object.values(this.containerInfo)
          .filter((item) => item.imagePath === dockerImagePath);
        // Not Used Image.
        if (containerValue.length === 0) {
          await this.removeImage(dockerImagePath);
        }
      }
    }

    if (!this.dockerImagePathList.includes(imagePath)) {
      this.dockerImagePathList.push(imagePath);
    }
    if (imagePath.split(':').length === 1) {
      imagePath += ':latest';
    }
    let authconfig: any;
    if (constants.REGISTRY_USERNAME && constants.REGISTRY_PASSWORD && constants.REGISTRY_SERVER) {
      authconfig = {
        username: constants.REGISTRY_USERNAME,
        password: constants.REGISTRY_PASSWORD,
        serveraddress: constants.REGISTRY_SERVER,
      };
    }
    try {
      await this.dockerode.pull(imagePath, { authconfig });
    } catch (err) {
      this.dockerImagePathList = this.dockerImagePathList.filter((item) => item !== imagePath);
      throw err;
    }
  }

  /**
   * Remove Docker Image.
   */
  async removeImage(imagePath: string) {
    this.dockerImagePathList = this.dockerImagePathList.filter((item) => item !== imagePath);
    const imageController = this.dockerode.getImage(imagePath);
    await imageController.remove();
  }

  /**
   * Method to check if container exists.
   * @param name - Container Name.
   */
  async existContainer(containerId: string) {
    try {
      const container = this.dockerode.getContainer(containerId);
      await container.inspect();
      return true;
    } catch (_) {
      return false;
    }
  }

  getContainerCnt() {
    return Object.keys(this.containerInfo).length;
  }

  getDockerImagePathList() {
    return this.dockerImagePathList;
  }

  getContainerInfoDict() {
    return this.containerInfo;
  }
}
