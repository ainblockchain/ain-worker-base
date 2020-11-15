import { customAlphabet } from 'nanoid';
import * as ConnectSdk from '@aindev/connect-sdk';
import Logger from '../common/logger';
import * as types from '../common/types';
import * as K8sUtil from '../util/k8s';
import { error } from '../common/constants';
import * as constants from '../common/constants';

const log = Logger.createLogger('manager.worker');

const getRandomString = () => {
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);
  return `w${nanoid()}`;
};

export default class WorkerBase {
  static k8sConstants = {
    gatewayName: 'worker-gw', // Istio Gateway Name for Worker.
    dockerSecretName: 'workerAuth', // Docker Secret Name.
    nodePoolLabelName: 'Ainetwork.ai_nodepoolname', // Lebel Name for nodePool.
    gpuTypeLabelName: 'Ainetwork.ai_gpu_type', // Lebel Name for gpu Type.
    isConnectLabelName: 'ainConnect', // Lebel Name for selecting AIN Connect resource.
    addressLabalName: 'connectAddress',
  };

  static instance: WorkerBase;

  protected connectSdk: ConnectSdk.Worker;

  protected k8sApi: K8sUtil.Api;

  protected workerInfo: types.WorkerInfo;

  protected endpoint: string;

  protected maxDurationTimer: any;

  static nodeWriteTime = 30000; // Lebel Name for selecting AIN Connect resource.

  protected nodeLimits: { // Node resource Limits
    [nodeName: string]: {
      [podName: string]: {
        limits: ConnectSdk.types.NodeInfo,
        containerId: string,
        ainConnect: boolean,
      };
    }
  }

  constructor(workerInfo: types.WorkerInfo, env: 'staging' | 'prod',
    k8sConfigPath: string, test: boolean = false) {
    if (!test) {
      this.connectSdk = new ConnectSdk.Worker(workerInfo.mnemonic, workerInfo.clusterName, env);
    }
    log.info(`[+] Worker Info ( 
      Worker Name: ${workerInfo.clusterName}
      Worker Address: ${this.connectSdk.getAddress()}
    )`);
    this.workerInfo = workerInfo;
    this.maxDurationTimer = {};
    this.nodeLimits = {};
    this.k8sApi = K8sUtil.Api.getInstance(k8sConfigPath);
  }

  /**
   * Get WorkerBase instance for Singleton Pattern.
   * @returns WorkerBase instance.
  */
  static getInstance(workerInfo: types.WorkerInfo, env: 'staging' | 'prod',
    k8sConfigPath: string, test: boolean = false) {
    if (!WorkerBase.instance) {
      WorkerBase.instance = new WorkerBase(workerInfo, env, k8sConfigPath, test);
    }

    return WorkerBase.instance;
  }

  /**
   * Start Worker.
  */
  async start() {
    // For network Policy.
    await this.k8sApi.addLabelNamespace('istio-system', {
      worker: 'yes',
    });
    await this.setEndpoint();
    await this.initPodInfo();
    await this.initStorageInfo();
    await this.initMaxDurationTimer();
    // Start to get node Information.
    setInterval(this.intervalNodeInfoHandler, WorkerBase.nodeWriteTime);
    // Start to get Pod Information.
    this.watchPodInfos();
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
    });
    log.info(`[+] Start Worker [Name: ${this.workerInfo.clusterName}]`);
  }

  protected async setEndpoint() {
    const hosts = await this.k8sApi.getGatewayHosts(WorkerBase.k8sConstants.gatewayName,
      'istio-system');
    [this.endpoint] = hosts;
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
      for (const [containerId, containerInfo] of Object.entries(allContainerInfo)) {
        for (const podName of Object.keys(containerInfo)) {
          if (!k8sPodNameList.includes(podName)) {
            await this.connectSdk.deletePodStatus(
              this.workerInfo.clusterName, containerId,
              podName,
            );
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

  /**
   * Create Deployment, Service and VirtualService.
   * @returns containerId: Unique Id.
   * @returns clusterName: Cluster Name.
   * @returns endpoint: endpoint per external port.
  */
  protected deploy = async (
    address: string, params: ConnectSdk.types.DeployParams) => {
    log.info(`[+] deploy [namespaceId: ${params.namespaceId}]`);
    const containerId = getRandomString();
    const baseEndpoint = this.endpoint.replace('*', containerId);
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

      // Create Service.
      const svcJson = K8sUtil.Template.getService(containerId,
        params.namespaceId, params.containerInfo.port, undefined);
      await this.k8sApi.apply(svcJson);

      const endpoint = {};
      // Create VirtualService per extenal Port.
      for (const port of ports) {
        const subEndpoint = `${port}-${baseEndpoint}`;
        const vsJson = K8sUtil.Template.getVirtualService(`${containerId}${port}`,
          params.namespaceId, containerId, subEndpoint, `${WorkerBase.k8sConstants.gatewayName}.istio-system`, Number(port));
        await this.k8sApi.apply(vsJson);
        endpoint[port] = subEndpoint;
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
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Delete Deployment, Service and VirtualService.
  */
  protected undeploy = async (address: string, params: ConnectSdk.types.UndeployParams) => {
    log.info(`[+] undeploy [namespaceId: ${params.namespaceId} containerId: ${params.containerId}]`);
    const isAuth = await this.k8sApi.isSelectLabel('deployment', params.containerId, params.namespaceId, {
      [WorkerBase.k8sConstants.addressLabalName]: address,
    });
    if (!isAuth) {
      throw { statusCode: error.unauthorized, errMessage: 'Unauthorized Address.' };
    }
    try {
      await this.k8sApi.deleteResource('deployment', params.containerId, params.namespaceId);
      await this.k8sApi.deleteResource('service', params.containerId, params.namespaceId);
      await this.k8sApi.deleteResource('virtualService', params.containerId, params.namespaceId);
      if (this.maxDurationTimer[params.containerId]) {
        clearTimeout(this.maxDurationTimer[params.containerId]);
        delete this.maxDurationTimer[params.containerId];
      }
      return {};
    } catch (err) {
      log.error(`[-] Failed to undeploy ${err}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Configrate Deployment. (Env, Replicas, ImagePath)
  */
  protected redeploy = async (address: string, params: ConnectSdk.types.RedeployParams) => {
    log.info(`[+] redeploy [namespaceId: ${params.namespaceId} containerId: ${params.containerId}]`);
    const isAuth = await this.k8sApi.isSelectLabel('deployment', params.containerId, params.namespaceId, {
      [WorkerBase.k8sConstants.addressLabalName]: address,
    });
    if (!isAuth) {
      throw { statusCode: error.unauthorized, errMessage: 'Unauthorized Address.' };
    }
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
    log.info('[+] createNamespace');
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
      this.k8sApi.createNetworkPolicy('worker', namespaceId, {
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
      log.error(`[-] failed to create Namespace - ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
   * Delete Namespace (All resources with the namespaceId are removed).
  */
  protected deleteNamespace = async (address: string,
    params: ConnectSdk.types.DeleteNamespaceParams) => {
    log.info(`[+] deleteNamespace [namespaceId: ${params.namespaceId}]`);
    const isAuth = await this.k8sApi.isSelectLabel('namespace', params.namespaceId, undefined, {
      [WorkerBase.k8sConstants.addressLabalName]: address,
    });
    if (!isAuth) {
      throw { statusCode: error.unauthorized, errMessage: 'Unauthorized Address.' };
    }
    try {
      await this.k8sApi.deleteResource('namespace', params.namespaceId);
      return {};
    } catch (err) {
      log.error(`[-] failed to delete Namespace - ${err.message}`);
      throw { statusCode: error.failed, errMessage: err.message };
    }
  }

  /**
    * Create Storage.
    * @returns storageId
  */
  protected createStorage = async (address: string, params: ConnectSdk.types.CreateStorageParams):
  Promise<ConnectSdk.types.CreateStorageReturn> => {
    log.info(`[+] createStorage [namespaceId: ${params.namespaceId}, address: ${address}] `);

    try {
      const storageId = getRandomString();
      const storageClassName = (params.nfsInfo) ? storageId : constants.STORAGE_CLASS;
      if (params.nfsInfo) {
        // Create PV.
        const pvJson = K8sUtil.Template.getPersistentVolume(storageId, {
          capacity: params.capacity,
          nfsInfo: params.nfsInfo,
          storageClassName,
          accessModes: 'ReadWriteMany',
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
        accessModes: 'ReadWriteMany',
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
  protected deleteStorage = async (address: string,
    params: ConnectSdk.types.DeleteStorageParams) => {
    log.info(`[+] deleteStorage [namespaceId: ${params.namespaceId}] storageId: ${params.storageId}`);
    const isAuth = await this.k8sApi.isSelectLabel('pvc', params.storageId, params.namespaceId, {
      [WorkerBase.k8sConstants.addressLabalName]: address,
    });
    if (!isAuth) {
      throw { statusCode: error.unauthorized, errMessage: 'Unauthorized Address.' };
    }
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
  protected getContainerLog = async (address: string,
    params: ConnectSdk.types.GetContainerLogParams) => {
    log.info(`[+] getContainerLog [namespaceId: ${params.namespaceId}] containerId: ${params.containerId}`);
    const isAuth = await this.k8sApi.isSelectLabel('deployment', params.containerId, params.namespaceId, {
      [WorkerBase.k8sConstants.addressLabalName]: address,
    });
    if (!isAuth) {
      throw { statusCode: error.unauthorized, errMessage: 'Unauthorized Address.' };
    }
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

  /**
   * Write Node Information to redis using k8s Pod and k8s Node Information.
  */
  protected intervalNodeInfoHandler = async () => {
    try {
      const nodePoolDict = await this.k8sApi.getNodesInfo(
        WorkerBase.k8sConstants.nodePoolLabelName, WorkerBase.k8sConstants.gpuTypeLabelName,
      );
      for (const nodepool of Object.keys(nodePoolDict)) {
        for (const nodeName of Object.keys(nodePoolDict[nodepool].nodes)) {
          const node = nodePoolDict[nodepool].nodes[nodeName];
          let currentLimits;
          if (this.nodeLimits[nodeName]) { // It is updated periodically using Pod Information.
            currentLimits = this.getSumLimitNode(this.nodeLimits[nodeName]);
          } else {
            return;
          }
          // Total Capacity that can actually be allocated
          node.capacity = node.allocatable;
          node.allocatable = {
            cpu: (node.capacity.cpu - currentLimits.cpu > 0)
              ? node.capacity.cpu - currentLimits.cpu : 0,
            memory: (node.capacity.memory - currentLimits.memory > 0)
              ? node.capacity.memory - currentLimits.memory : 0,
            gpu: (node.capacity.gpu - currentLimits.gpu > 0)
              ? node.capacity.gpu - currentLimits.gpu : 0,
          };
        }
      }
      // Write Cluster Status with Node Info to Redis.
      await this.connectSdk.setClusterStatus({
        nodePool: nodePoolDict,
        clusterName: this.workerInfo.clusterName,
      });
    } catch (err) {
      log.error(`[-] Failed to get NodeInfo ${err}`);
    }
  }

  /**
   * It is CallBack Function for Watching Pod Information [UPDATE, ADDED].
  */
  protected podUpdataOrAddCallback = async (data: types.PodInfo) => {
    try {
      // Stores all pod information for each node.
      if (!this.nodeLimits[data.targetNodeName]) {
        this.nodeLimits[data.targetNodeName] = {};
      }
      this.nodeLimits[data.targetNodeName][data.name] = {
        limits: data.resourcelimits,
        containerId: data.appName,
        ainConnect: !!(data.labels && data.labels.ainConnect),
      };
      if (this.nodeLimits[data.targetNodeName][data.name].ainConnect) {
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
        if (data.labels && data.labels.nfs) {
          if (phase === 'createContainer') phase = 'createStorage';
          await this.connectSdk.setStorageStatus({
            clusterName: this.workerInfo.clusterName,
            storageId: data.appName,
            storageStatus: { status: phase as ConnectSdk.types.StorageStatus },
          });
        } else {
          await this.connectSdk.setPodStatus({
            clusterName: this.workerInfo.clusterName,
            containerId: data.appName,
            podId: data.name,
            podStatus: {
              podName: data.name,
              namespaceId: data.namespaceId,
              status: {
                phase: phase as ConnectSdk.types.PodPhaseList,
              },
            },
          });
        }
      }
    } catch (err) {
      log.error(err);
    }
  }

  /**
   * It is CallBack Function for Watching Pod Information [DELETE].
  */
  protected podDeleteCallback = async (data: types.PodInfo) => {
    if (this.nodeLimits[data.targetNodeName]
      && this.nodeLimits[data.targetNodeName][data.name]) {
      delete this.nodeLimits[data.targetNodeName][data.name];
    }
    // Only information generated through API is removed in redis.
    if (data.labels && data.labels.ainConnect) {
      if (data.labels && data.labels.nfs) {
        await this.connectSdk.deleteStorageStatus(
          this.workerInfo.clusterName, data.appName,
        );
      } else {
        await this.connectSdk.deletePodStatus(
          this.workerInfo.clusterName, data.appName,
          data.name,
        );
      }
    }
  }

  /**
   * Start to Watch Pod Information.
  */
  protected watchPodInfos() {
    this.k8sApi.watchPod(
      this.podUpdataOrAddCallback, // ADDED
      this.podUpdataOrAddCallback, // UPDATE
      this.podDeleteCallback, // DELETE
      async () => { // ERROR
        // Remove Pod Information on Redis for sync.
        await this.initPodInfo();
        this.nodeLimits = {};
      },
    );
  }
}
