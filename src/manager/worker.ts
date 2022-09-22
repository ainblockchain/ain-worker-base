import { customAlphabet } from 'nanoid';
import * as ConnectSdk from '@aindev/connect-sdk';
import { setIntervalAsync } from 'set-interval-async/dynamic';
import Logger from '../common/logger';
import * as types from '../common/types';
import * as K8sUtil from '../util/k8s';
import Docker from '../util/docker';
import { error } from '../common/constants';
import * as constants from '../common/constants';

const log = Logger.createLogger('manager.worker');

const getRandomString = () => {
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);
  return `w${nanoid()}`;
};

export default class WorkerBase {
  static k8sConstants = {
    gatewayName: constants.GATEWAY_NAME || 'worker-gw', // Istio Gateway Name for Worker.
    dockerSecretName: 'docker-secret', // Docker Secret Name.
    nodePoolLabelName: 'Ainetwork.ai_nodepoolname', // Lebel Name for nodePool.
    gpuTypeLabelName: 'Ainetwork.ai_gpu_type', // Lebel Name for gpu Type.
    isConnectLabelName: 'ainConnect', // Lebel Name for selecting AIN Connect resource.
    addressLabalName: 'connectAddress',
  };

  static instance: WorkerBase;

  protected connectSdk: ConnectSdk.Worker;

  protected k8sApi: K8sUtil.Api;

  protected dockerApi: Docker;

  protected workerInfo: types.WorkerInfo;

  protected istioEndpoint: string;

  protected maxDurationTimer: any;

  protected currentNodePoolDict: types.NodePool;

  static workerInfoWriteTime = 30000; // Lebel Name for selecting AIN Connect resource.

  static workerForHealthCheckTime = 5000;

  static containerWriteTime = 5000; // Lebel Name for selecting AIN Connect resource.

  protected connectContainerInfo: ConnectSdk.types.GetAllContainersReturn;

  constructor(workerInfo: types.WorkerInfo, env: 'staging' | 'prod', test: boolean = false) {
    if (!test) {
      this.connectSdk = new ConnectSdk.Worker(
        workerInfo.mnemonic, workerInfo.clusterName,
        env, constants.FIREBASE_CONFIG,
      );
    }
    log.info(`[+] Worker Info ( 
      NODE_ENV: ${constants.NODE_ENV}
      Worker Name: ${workerInfo.clusterName}
      Worker Address: ${this.connectSdk.getAddress()}
    )`);
    this.workerInfo = workerInfo;
    this.maxDurationTimer = {};
    if (constants.IS_DOCKER && constants.IS_DOCKER.toLowerCase() === 'true') {
      this.dockerApi = Docker.getInstance();
    } else {
      this.connectContainerInfo = {};
      this.k8sApi = K8sUtil.Api.getInstance('/root/.kube/config');
    }
  }

  /**
   * Get WorkerBase instance for Singleton Pattern.
   * @returns WorkerBase instance.
  */
  static getInstance(workerInfo: types.WorkerInfo, env: 'staging' | 'prod',
    test: boolean = false) {
    if (!WorkerBase.instance) {
      WorkerBase.instance = new WorkerBase(workerInfo, env, test);
    }

    return WorkerBase.instance;
  }

  /**
   * Start Worker for Kubernetes.
  */
  async startForK8s() {
    await this.setEndpoint();
    if (this.istioEndpoint) {
      // For network Policy.
      await this.k8sApi.addLabelNamespace('istio-system', {
        worker: 'yes',
      });
    } else if (!constants.NODE_PORT_IP) {
      throw new Error('NODE_PORT_IP Not Exists');
    }
    await this.initPodInfo();
    await this.initStorageInfo();
    await this.initMaxDurationTimer();
    // Start to get node Information.
    setIntervalAsync(this.intervalNodeInfoHandler, WorkerBase.workerInfoWriteTime);
    setIntervalAsync(this.intervalHealth, WorkerBase.workerForHealthCheckTime);
    this.watchPodInfos();
    // Start to get Pod Information.
    // Start to listen SDK Request.
    await this.connectSdk.listenRequest({
      deploy: this.deploy,
      redeploy: this.redeploy,
      undeploy: this.undeploy,
      createNamespace: this.createNamespace,
      deleteNamespace: this.deleteNamespace,
      createStorage: this.createStorage,
      deleteStorage: this.deleteStorage,
      getContainerLog: this.getContainerLog,
      updateContainerStatus: this.updateContainerStatus,
      runCommand: this.runCommand,
    });
    log.info(`[+] Start Worker [Name: ${this.workerInfo.clusterName}]`);
  }

  /**
   * Start Worker for Docker.
  */
  async startForDocker() {
    await this.initContainerForDocker();
    setIntervalAsync(this.intervalWorkerInfoForDocker, WorkerBase.workerInfoWriteTime);
    setIntervalAsync(this.intervalContainerInfoForDocker, WorkerBase.containerWriteTime);
    await this.connectSdk.listenRequest({
      deployForDocker: this.deployForDocker,
      undeployForDocker: this.undeployForDocker,
    });
    log.info(`[+] Start Worker [Name: ${this.workerInfo.clusterName}]`);
  }

  protected async setEndpoint() {
    try {
      const hosts = await this.k8sApi.getGatewayHosts(WorkerBase.k8sConstants.gatewayName,
        'istio-system');
      [this.istioEndpoint] = hosts;
    } catch (err) {
      log.info(`[+] istio Gateway Not Exists - ${err}`);
    }
  }

  /**
   * Remove unnecessary information about Pod in firebase.
  */
  protected initPodInfo = async () => {
    log.debug('[+] initPodInfo');
    const allContainerInfo = await this.connectSdk.getAllContainers(this.workerInfo.clusterName);
    const podInfoList = await this.k8sApi.getAllPodInfoList();
    const k8sPodNameList = podInfoList.map((item) => item.name);

    if (allContainerInfo) {
      this.connectContainerInfo = allContainerInfo;
      for (const [containerId, containerInfo] of Object.entries(allContainerInfo)) {
        for (const podName of Object.keys(containerInfo)) {
          if (!k8sPodNameList.includes(podName)) {
            await this.connectSdk.deletePodStatus(
              this.workerInfo.clusterName, containerId,
              podName,
            );
            if (this.connectContainerInfo && this.connectContainerInfo[containerId][podName]) {
              delete this.connectContainerInfo[containerId][podName];
            }
          }
        }
      }
    }
  }

  /**
   * Remove unnecessary information about Storage in firebase.
  */
  protected initStorageInfo = async () => {
    log.debug('[+] initStorageInfo');
    const allStorageInfo = await this.connectSdk.getAllStorages(this.workerInfo.clusterName);
    const persistentVolumeInfoList = await this.k8sApi.getPersistentVolumeInfoList();
    const k8sStorageIdList = persistentVolumeInfoList.map((item) => item.appName);

    if (allStorageInfo) {
      for (const storageId of Object.keys(allStorageInfo)) {
        if (!k8sStorageIdList.includes(storageId)) {
          await this.connectSdk.deleteStorageStatus(
            this.workerInfo.clusterName, storageId,
          );
        }
      }
    }
  }

  /**
   * Set Max Duration Timer using Pod labels.
  */
  protected initMaxDurationTimer = async () => {
    log.debug('[+] initMaxDurationTimer');
    const podInfoList = await this.k8sApi.getAllPodInfoList();

    const nowTime = Date.now();
    for (const podInfo of podInfoList) {
      const {
        labels, appName, namespaceId,
      } = podInfo;
      if (labels && labels.sleepTime && labels.ainConnect) {
        if (nowTime >= Number(labels.sleepTime)) {
          log.debug(`[+] automatically deploy containerId: ${appName}`);
          await this.undeploy('', {
            containerId: appName,
            namespaceId,
            clusterName: this.workerInfo.clusterName,
            targetAddress: 'targetAddress',
          });
        } else {
          this.maxDurationTimer[appName] = setTimeout(
            this.autoSleepPodHandler(appName, namespaceId), Number(labels.sleepTime) - nowTime,
          );
        }
      }
    }
  }

  /**
   * autoSleepPodHandler
   * @returns containerId: Container Id.
   * @returns namespaceId: Container namespace.
  */
  protected autoSleepPodHandler = (containerId: string, namespaceId: string) => async () => {
    log.debug(`[+] automatically deploy containerId: ${containerId}`);
    await this.undeploy('', {
      containerId,
      namespaceId,
      clusterName: this.workerInfo.clusterName,
      targetAddress: 'targetAddress',
    });
    if (this.maxDurationTimer[containerId]) {
      delete this.maxDurationTimer[containerId];
    }
  }

  private runCommand = async (_: string, params: ConnectSdk.types.RunCommandParams) => {
    log.debug(`[+] runCommand cmd: ${params.cmd}`);
    try {
      const result = await this.k8sApi.runCommand(params.cmd);
      if (result.statusCode !== 0) {
        throw { statusCode: error.failed, errMessage: result.stderr };
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err) {
      throw { statusCode: error.failed, errMessage: err };
    }
  }

  /**
   * Create Deployment, Service and VirtualService.
   * @returns containerId: Unique Id.
   * @returns clusterName: Cluster Name.
   * @returns endpoint: endpoint per external port.
  */
  protected deploy = async (
    address: string, params: ConnectSdk.types.DeployParams) => {
    log.debug(`[+] deploy [namespaceId: ${params.namespaceId}]`);
    const containerId = getRandomString();
    const ports = params.containerInfo.port;

    // Checking if the storage exists
    if (params.containerInfo.storageSpec) {
      for (const storageId of Object.keys(params.containerInfo.storageSpec)) {
        const result = await this.k8sApi.existPersistentVolumeClaim(storageId, params.namespaceId);
        if (!result) {
          throw { statusCode: error.invalidParams, errMessage: 'invalid StorageSpec Params.' };
        }
      }
    }
    // Checking if the secret exists
    if (params.containerInfo.secretSpec) {
      for (const secretId of Object.keys(params.containerInfo.secretSpec)) {
        const result = await this.k8sApi.existSecret(secretId, params.namespaceId);
        if (!result) {
          throw { statusCode: error.invalidParams, errMessage: 'invalid SecretSpec params' };
        }
      }
    }
    try {
      // Create Deployment.
      const deployJson = K8sUtil.Template.getDeployment(
        containerId, params.namespaceId, {
          imagePath: params.containerInfo.imageName,
          resourceLimits: this.k8sApi.convertToK8sUnit(params.containerInfo.hwSpec),
          env: params.containerInfo.env,
          ports,
        }, {
          strategy: params.strategy,
          storageSpec: params.containerInfo.storageSpec,
          secretSpec: params.containerInfo.secretSpec,
          imagePullSecretName: (this.workerInfo.dockerAuth)
            ? WorkerBase.k8sConstants.dockerSecretName : undefined,
          labels: (params.maxDuration)
            ? {
              sleepTime: String(Date.now() + params.maxDuration * 1000 * 60 * 60),
              ainConnect: 'yes',
              [WorkerBase.k8sConstants.addressLabalName]: address,
            }
            : { ainConnect: 'yes', [WorkerBase.k8sConstants.addressLabalName]: address }, // labels
          nodePoolLabel: (params.containerInfo.nodePoolName)
            ? { [WorkerBase.k8sConstants.nodePoolLabelName]: params.containerInfo.nodePoolName }
            : undefined,
          replicas: params.containerInfo.replicas,
        },
      );
      await this.k8sApi.apply(deployJson);

      const isNodePort = !this.istioEndpoint;
      // Create Service.
      const svcJson = K8sUtil.Template.getService(containerId,
        params.namespaceId, params.containerInfo.port, undefined, isNodePort);
      const result = await this.k8sApi.apply(svcJson);

      const endpoint = {};
      if (isNodePort) {
        for (const portInfo of result['spec']['ports']) {
          endpoint[portInfo.port] = `${constants.NODE_PORT_IP}:${portInfo.nodePort}`;
        }
      } else {
        // Create VirtualService per extenal Port.
        for (const port of ports) {
          const baseEndpoint = this.istioEndpoint.replace('*', containerId);
          const subEndpoint = `${port}-${baseEndpoint}`;
          const vsJson = K8sUtil.Template.getVirtualService(`${containerId}${port}`,
            params.namespaceId, containerId, subEndpoint, `${WorkerBase.k8sConstants.gatewayName}.istio-system`, Number(port));
          await this.k8sApi.apply(vsJson);
          endpoint[port] = subEndpoint;
        }
      }
      // maxDuration : x hours.
      if (params.maxDuration) {
        this.maxDurationTimer[containerId] = setTimeout(
          this.autoSleepPodHandler(containerId, params.namespaceId),
          params.maxDuration * 1000 * 60 * 60,
        );
      }
      return {
        containerId, endpoint, clusterName: this.workerInfo.clusterName,
      };
    } catch (err) {
      log.error(`[-] Failed to deploy - ${err.message}`);
      await this.undeploy(address, {
        targetAddress: params.targetAddress,
        clusterName: params.clusterName,
        namespaceId: params.namespaceId,
        containerId,
      }).catch(() => {});
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Delete Deployment, Service and VirtualService.
  */
  protected undeploy = async (_: string, params: ConnectSdk.types.UndeployParams) => {
    log.debug(`[+] undeploy [namespaceId: ${params.namespaceId} containerId: ${params.containerId}]`);
    try {
      await this.k8sApi.deleteResource('deployment', params.containerId, params.namespaceId);
      await this.k8sApi.deleteResource('service', params.containerId, params.namespaceId);
      if (this.istioEndpoint) {
        await this.k8sApi.deleteResource('virtualService', params.containerId, params.namespaceId);
      }
      if (this.maxDurationTimer[params.containerId]) {
        clearTimeout(this.maxDurationTimer[params.containerId]);
        delete this.maxDurationTimer[params.containerId];
      }
      return {};
    } catch (err) {
      log.error(`[-] Failed to undeploy ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Configrate Deployment. (Env, Replicas, ImagePath)
  */
  protected redeploy = async (_: string, params: ConnectSdk.types.RedeployParams) => {
    log.debug(`[+] redeploy [namespaceId: ${params.namespaceId} containerId: ${params.containerId}]`);
    const result = await this.k8sApi.editDeployment(params.containerId,
      params.namespaceId, params.option);
    if (result) {
      return {};
    }

    throw { statusCode: error.failed, errMessage: 'Failed To Patch.' };
  }

  /**
   * Create Namespace.
   * @returns namespaceId: Random String.
  */
  protected createNamespace = async (address: string,
    _: ConnectSdk.types.CreateNamespaceParams) => {
    log.debug('[+] createNamespace');
    const namespaceId = getRandomString();
    try {
      const namespaceJson = K8sUtil.Template.getNamespace(namespaceId, {
        [WorkerBase.k8sConstants.addressLabalName]: address,
      });
      await this.k8sApi.apply(namespaceJson);
      if (this.workerInfo.dockerAuth) {
        await this.k8sApi.createDockerSecret(WorkerBase.k8sConstants.dockerSecretName,
          namespaceId, this.workerInfo.dockerAuth);
      }
      await this.k8sApi.createNetworkPolicy('worker', namespaceId, {
        ainConnect: 'yes',
      }, {
        podLabel: {
          block: 'block',
        },
        namespaceSelector: {
          worker: 'yes',
        },
      });

      return { namespaceId };
    } catch (err) {
      log.error(`[-] Failed to create Namespace - ${err.body.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Delete Namespace (All resources with the namespaceId are removed).
  */
  protected deleteNamespace = async (_: string,
    params: ConnectSdk.types.DeleteNamespaceParams) => {
    log.debug(`[+] deleteNamespace [namespaceId: ${params.namespaceId}]`);
    try {
      await this.k8sApi.deleteResource('namespace', params.namespaceId);
      return {};
    } catch (err) {
      log.error(`[-] Failed to delete Namespace - ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
    * Create Storage.
    * @returns storageId
  */
  protected createStorage = async (address: string, params: ConnectSdk.types.CreateStorageParams):
  Promise<ConnectSdk.types.CreateStorageReturn> => {
    log.debug(`[+] createStorage [namespaceId: ${params.namespaceId}, address: ${address}] `);

    try {
      const storageId = getRandomString();
      const storageClassName = (params.nfsInfo) ? storageId : constants.STORAGE_CLASS || '';
      if (params.nfsInfo) {
        // Create PV.
        const pvJson = K8sUtil.Template.getPersistentVolume(storageId, {
          capacity: params.capacity,
          nfsInfo: params.nfsInfo,
          storageClassName,
          accessModes: params.accessModes || 'ReadWriteOnce',
          labels: {
            ainConnect: 'yes',
          },
        });
        await this.k8sApi.apply(pvJson);
      }
      // Create PVC.
      const pvcJson = K8sUtil.Template.getPersistentVolumeClaim(storageId, params.namespaceId, {
        capacity: params.capacity,
        storageClassName,
        accessModes: params.accessModes || 'ReadWriteOnce',
        labels: {
          ainConnect: 'yes',
          [WorkerBase.k8sConstants.addressLabalName]: address,
        },
      });
      await this.k8sApi.apply(pvcJson);
      return { storageId };
    } catch (err) {
      log.error(`[-] Failed to create Storage - ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
    * Delete Storage.
  */
  protected deleteStorage = async (_: string,
    params: ConnectSdk.types.DeleteStorageParams) => {
    log.debug(`[+] deleteStorage [namespaceId: ${params.namespaceId}] storageId: ${params.storageId}`);

    try {
      // Delete pv,pvc.
      await this.k8sApi.deleteResource('storage', params.storageId, params.namespaceId);
      return {};
    } catch (err) {
      log.error(`[-] Failed to delete Storage - ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
    * Get Container Log.
  */
  protected getContainerLog = async (_: string,
    params: ConnectSdk.types.GetContainerLogParams) => {
    log.debug(`[+] getContainerLog [namespaceId: ${params.namespaceId}] containerId: ${params.containerId}`);
    try {
      const sinceSeconds = (params.fromTimestamp)
        ? Math.round((Date.now() - params.fromTimestamp) / 1000) : undefined;
      const result = await this.k8sApi.getContainerLog(
        params.containerId, params.namespaceId, sinceSeconds,
      );
      return { log: result };
    } catch (err) {
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Get Sum of Node Resource Limits Using Pod Info.
  */
  protected getSumLimitNode(nodePodList: { [podName: string]: {
    limits: ConnectSdk.types.NodeInfo,
    containerId: string,
  }; }) {
    const limits = {
      cpu: 0,
      memory: 0,
      gpu: 0,
    };
    for (const nodePod of Object.keys(nodePodList)) {
      const pod = nodePodList[nodePod];
      limits.cpu += pod.limits.cpu;
      limits.memory += pod.limits.memory;
      limits.gpu += pod.limits.gpu;
    }
    return limits;
  }

  protected intervalHealth = async () => {
    try {
      await this.connectSdk.setClusterStatus({
        nodePool: this.currentNodePoolDict,
        clusterName: this.workerInfo.clusterName,
      });
    } catch (err) {
      log.debug(`[-] Failed to Set Worker info ${err.message}`);
    }
  }

  /**
   * Write Node Information to redis using k8s Pod and k8s Node Information.
  */
  protected intervalNodeInfoHandler = async () => {
    try {
      const nodePoolDict = await this.k8sApi.getNodesInfo(
        WorkerBase.k8sConstants.nodePoolLabelName, WorkerBase.k8sConstants.gpuTypeLabelName,
      );
      const convertNodePoolDict = {};
      for (const nodepool of Object.keys(nodePoolDict)) {
        convertNodePoolDict[nodepool] = {
          ...nodePoolDict[nodepool],
          nodes: {},
        };
        for (const nodeName of Object.keys(nodePoolDict[nodepool].nodes)) {
          const { capacity, allocatable } = nodePoolDict[nodepool].nodes[nodeName];
          convertNodePoolDict[nodepool].nodes[nodeName.replace(/\./gi, '-')] = {
            capacity,
            allocatable,
          };
        }
      }
      this.currentNodePoolDict = convertNodePoolDict;
      // Write Cluster Status with Node Info to Redis.
      await this.connectSdk.setClusterStatus({
        nodePool: convertNodePoolDict,
        clusterName: this.workerInfo.clusterName,
      });
    } catch (err) {
      log.debug(`[-] Failed to get NodeInfo ${err.message}`);
    }
  }

  protected convertStatus = (data: types.PodInfo): ConnectSdk.types.PodPhaseList => {
    let phase = data.status.phase.toLowerCase();
    if (phase === 'unknown') {
      phase = 'failed';
    } else if (phase === 'pending' && data.status.containerStatuses) {
      const reson = data.status.containerStatuses[0].state?.waiting?.reason;
      if (reson && reson === 'ContainerCreating') {
        phase = 'createContainer';
      }
    } else if (phase === 'running') {
      phase = 'success';
    }
    return phase as ConnectSdk.types.PodPhaseList;
  }

  protected writePodStatus = async (data: types.PodInfo) => {
    const phase = this.convertStatus(data);
    let condition;
    if (data.status.containerStatuses && data.status.containerStatuses[0].state?.waiting) {
      const waitingInfo = data.status.containerStatuses[0].state?.waiting;
      condition = {
        type: 'ContainersReady' as 'ContainersReady',
        status: false,
        reason: waitingInfo.reason,
        message: waitingInfo.message,
      };
    }
    log.debug(`[+] setPodStatus podName: ${data.appName}, phase:${phase}`);
    try {
      await this.connectSdk.setPodStatus({
        clusterName: this.workerInfo.clusterName,
        containerId: data.appName,
        podId: data.name,
        podStatus: {
          podName: data.name,
          namespaceId: data.namespaceId,
          status: {
            phase,
            condition,
          },
          image: data.image,
        },
      });
    } catch (err) {
      log.error(`[-] Failed to set pod status - ${err}`);
    }
    if (!this.connectContainerInfo) this.connectContainerInfo = {};
    if (!this.connectContainerInfo[data.appName]) this.connectContainerInfo[data.appName] = {};
    this.connectContainerInfo[data.appName][data.name] = {
      params: {
        namespaceId: data.namespaceId,
        podName: data.name,
        status: { phase },
        image: data.image,
      },
      updatedAt: 0,
    };
  }

  /**
   * It is CallBack Function for Watching Pod Information [UPDATE, ADDED].
  */
  protected podUpdateOrAddCallback = async (data: types.PodInfo) => {
    try {
      if (data.labels && data.labels.ainConnect) {
        log.debug(`[+] podUpdateOrAddCallback podName: ${data.appName}, status:${data.status.phase}`);
        await this.writePodStatus(data);
      }
    } catch (err) {
      log.error(`[-] Failed to write Pod Status - ${err.message}`);
    }
  }

  /**
   * It is CallBack Function for Watching Pod Information [DELETE].
  */
  protected podDeleteCallback = async (data: types.PodInfo) => {
    log.debug(`[+] podDeleteCallback podName: ${data.appName}, status:${data.status.phase}`);
    // Only information generated through API is removed in redis.
    if (data.labels && data.labels.ainConnect) {
      if (data.labels && data.labels.nfs) {
        try {
          await this.connectSdk.deleteStorageStatus(
            this.workerInfo.clusterName, data.appName,
          );
        } catch (err) {
          log.error(`[-] Failed to delete Storage ${err.message}`);
        }
      } else {
        try {
          await this.connectSdk.deletePodStatus(
            this.workerInfo.clusterName, data.appName,
            data.name,
          );
          if (this.connectContainerInfo && this.connectContainerInfo[data.appName][data.name]) {
            delete this.connectContainerInfo[data.appName][data.name];
          }
        } catch (err) {
          log.error(`[-] Failed to delete NodeInfo ${err.message}`);
        }
      }
    }
  }

  /**
   * Start to Watch Pod Information.
  */
  protected watchPodInfos() {
    this.k8sApi.makeInformerPod(
      this.podUpdateOrAddCallback, // ADDED
      this.podUpdateOrAddCallback, // UPDATE
      this.podDeleteCallback, // DELETE
      async () => { // ERROR
        log.error('[-] watchPodInfos Error');
        // Remove Pod Information on Redis for sync.
        await this.initPodInfo();
      },
    );
  }

  public initContainerForDocker = async () => {
    const containerInfoInDb = await this.connectSdk.getAllContainersForDocker(
      this.workerInfo.clusterName,
    );
    if (containerInfoInDb) {
      for (const containerId of Object.keys(containerInfoInDb)) {
        try {
          await this.dockerApi.setContainerInfo(containerId);
        } catch (err) {
          await this.connectSdk.deleteContainerStatusForDocker(
            this.workerInfo.clusterName, containerId,
          );
        }
      }
    }
  }

  // For Docker
  private deployForDocker = async (address: string,
    params: ConnectSdk.types.DeployForDockerParams) => {
    log.debug(`[+] deployForDocker - address:${address}`);
    const containerId = getRandomString();
    await this.dockerApi.run(
      containerId, params.image, params.env, params.command,
      !params.publishPorts, params.publishPorts,
    );
    const containerStatus = await this.dockerApi.getContainerInfo(containerId);
    setTimeout(async () => {
      await this.connectSdk.setContainerStatusForDocker({
        containerStatus,
        containerId,
        clusterName: this.workerInfo.clusterName,
      });
    }, 3000);
    return { containerId };
  }

  private undeployForDocker = async (address: string,
    params: ConnectSdk.types.UndeployForDockerParams) => {
    log.debug(`[+] undeployForDocker - address:${address}`);
    await this.dockerApi.kill(params.containerId);
    await this.connectSdk.deleteContainerStatusForDocker(this.workerInfo.clusterName,
      params.containerId);
  }

  private intervalWorkerInfoForDocker = async () => {
    try {
      await this.connectSdk.setWorkerStatusForDocker(this.workerInfo.clusterName);
    } catch (err) {
      log.error(`[-] intervalWorkerInfoForDocker - ${err.message}`);
    }
  };

  private intervalContainerInfoForDocker = async () => {
    const allContainerInfo = await this.dockerApi.getAllContainerInfo();
    for (const [containerId, containerInfo] of Object.entries(allContainerInfo)) {
      const containerStatus = containerInfo as ConnectSdk.types.ContainerStatusForDocker;
      try {
        await this.connectSdk.setContainerStatusForDocker({
          containerStatus,
          containerId,
          clusterName: this.workerInfo.clusterName,
        });
      } catch (err) {
        log.error(`[-] intervalContainerInfoForDocker - ${err.message}`);
      }
    }
  };

  private updateContainerStatus = async (address: string,
    params: ConnectSdk.types.UpdateContainerStatusParams) => {
    log.debug(`[+] updateContainerStatus[${address}] params: ${JSON.stringify(params, null, 4)}`);
    const data = await this.k8sApi.getPodInfobyAppName(params.containerId, params.namespaceId);
    log.debug(`[+] updateContainerStatus[${address}] podName: ${data.appName}, status:${data.status.phase}`);
    await this.writePodStatus(data);

    return { containerId: params.containerId };
  }
}
