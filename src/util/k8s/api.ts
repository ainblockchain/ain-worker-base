import * as k8s from '@kubernetes/client-node';
import { Base64 } from 'js-base64';
import * as request from 'request';
import Template from './template';
import * as types from '../../common/types';

export default class Api {
  private config: k8s.KubeConfig;

  static instance: Api;

  constructor(configPath: string) {
    this.config = new k8s.KubeConfig();
    this.config.loadFromFile(configPath);
  }

  /**
   * Get Api instance for Singleton Pattern.
   * @params configPath: Kubernetes Config Path.
   * @returns Api instance.
  */
  static getInstance(configPath: string) {
    if (!Api.instance) {
      Api.instance = new Api(configPath);
    }

    return Api.instance;
  }

  /**
   * convert hwSpec to K8s Unit hwSpec.
   * @params hwSpec: hw spec (cpu, gpu, memory).
   * @returns K8s Unit hwSpec.
  */
  convertToK8sUnit(hwSpec: types.HwSpec) {
    return {
      cpu: `${hwSpec.cpu}m`,
      memory: `${hwSpec.memory}Mi`,
      'nvidia.com/gpu': String(hwSpec.gpu),
    };
  }

  /**
   * hwspec to cpu "m".
   * @params k8sUnit: k8s CPU resource Spec (ex. 1000m).
  */
  convertK8sUnitCpu(k8sUnit: string) {
    if (k8sUnit.includes('m')) return parseInt(k8sUnit, 10);
    return parseInt(k8sUnit, 10) * 1000;
  }

  /**
   * hwspec to Memory "Mi".
   * @params k8sUnit: k8s MEMORY resource Spec (ex. 10Gi).
  */
  convertK8sUnitMemory(k8sUnit: string) {
    if (k8sUnit.includes('Ki') || k8sUnit.includes('K')) return Math.round(parseInt(k8sUnit, 10) / 1000);
    if (k8sUnit.includes('Gi') || k8sUnit.includes('G')) return parseInt(k8sUnit, 10) * 1000;
    return parseInt(k8sUnit, 10);
  }

  /**
   * convert K8s hwSpec to Connect Unit hwSpec.
   * @params hwSpec: K8s hw spec (cpu, nvidia.com/gpu, memory).
   * @returns K8s Unit hwSpec.
  */
  convertToUnit(hwSpec: types.HwK8sSpec) {
    return {
      cpu: this.convertK8sUnitCpu(hwSpec.cpu),
      memory: this.convertK8sUnitMemory(hwSpec.memory),
      gpu: Number(hwSpec['nvidia.com/gpu']) || 0,
    };
  }

  /**
   * Apply yaml in JSON.
   * @params kubeJson: k8s yaml in JSON.
  */
  async apply(kubeJson: k8s.KubernetesObject) {
    kubeJson.metadata = kubeJson.metadata || {};
    kubeJson.metadata.annotations = kubeJson.metadata.annotations || {};
    kubeJson.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] = JSON.stringify(kubeJson);
    const api = k8s.KubernetesObjectApi.makeApiClient(this.config);
    try {
      // If it already exists, modify.
      await api.read(kubeJson);
      const response = await api.patch(kubeJson);
      return response.body;
    } catch (e) {
      try {
        const response = await api.create(kubeJson);
        return response.body;
      } catch (error) {
        throw error.body;
      }
    }
  }

  /**
   * Create NFS Server in Cluster.
   * @params name: Storage Name.
   * @params namespace: Namespace Name.
   * @params capacity: Storage capacity (x GB).
   * @params config: Storage Config (accessModes ...).
   * @params resourceLimits: k8s resourceLimits.
   * @params  nodePoolLabel: params for select nodePool.
   *          [if it is undefined then select from all nodepool]
   * @returns clusterIp: NFS Cluster IP
  */
  async createLocalNfsServer(name: string, namespace: string,
    config: types.StorageConfig, resourceLimits: types.HwSpec, nodePoolLabel?: Object) {
    const nfsName = `nfs-${name}`;

    // Create PVC.
    const pvcJson = Template.getPersistentVolumeClaim(nfsName, namespace, config);
    await this.apply(pvcJson);
    // Create NFS Server.
    const deployJson = Template.getDeployment(name, namespace, {
      imagePath: 'k8s.gcr.io/volume-nfs:0.8',
      ports: [2049, 111, 20048],
      resourceLimits: this.convertToK8sUnit(resourceLimits),
    }, {
      storageSpecs: {
        [nfsName]: {
          mountPath: '/exports',
        },
      },
      labels: config.labels,
      nodePoolLabel,
    });
    await this.apply(deployJson);
    const svcJson = Template.getService(name, namespace, [2049, 111, 20048]);
    const result = await this.apply(svcJson);

    return result['spec']['clusterIP'];
  }

  /**
   * Delete NFS Server in Cluster.
   * @params name: Storage Name.
   * @params namespace: Namespace Name.
  */
  async deleteLocalNfsServer(name: string, namespace: string) {
    await this.deleteResource('service', name, namespace);
    await this.deleteResource('deployment', name, namespace);
    await this.deleteResource('persistentVolumeClaim', `nfs-${name}`, namespace);
  }

  /**
   * Create Secret.
   * @params name: Secret Name.
   * @params namespace: Namespace Name.
   * @params type: Secret Type (ex. Opaque).
   * @params data: Secret Data.
  */
  async createSecret(
    name: string, namespace: string,
    type: string, data: {[key: string]: string},
  ) {
    const base64Data = {};
    for (const key of Object.keys(data)) {
      base64Data[key] = Base64.encode(data[key]);
    }
    const api = this.config.makeApiClient(k8s.CoreV1Api);
    await api.createNamespacedSecret(namespace, {
      apiVersion: 'v1',
      kind: 'Secret',
      type,
      metadata: {
        name,
      },
      data: base64Data,
    });
  }

  /**
   * Get Secret Data for Private Docker Registry.
   * @params dockerAuth: Private Docker Registry Username,Password,Addr.
  */
  getDockerSecretData(dockerAuth: types.DockerAuthInfo) {
    const auth = Base64.encode(`${dockerAuth.username}:${dockerAuth.password}`);
    const rawData = {
      auths: {},
    };
    rawData.auths[dockerAuth.server] = {
      ...dockerAuth,
      auth,
    };

    return {
      '.dockerconfigjson': JSON.stringify(rawData),
    };
  }

  /**
   * Create Secret for Private Docker Repository.
   * @params name: Secret Name.
   * @params namespace: Namespace Name.
   * @params dockerAuth: Private Docker Registry Username,Password,Addr.
  */
  async createDockerSecret(
    name: string, namespace: string, dockerAuth: types.DockerAuthInfo,
  ) {
    const data = this.getDockerSecretData(dockerAuth);
    await this.createSecret(name, namespace, 'kubernetes.io/dockerconfigjson', data);
  }

  /**
   * Delete VirtualService by AppName
   * @params appName: App Name.
   * @params namespace: Namespace Name.
  */
  async deleteVirtualService(appName: string, namespace: string) {
    let opts = {} as request.Options;
    this.config.applyToRequest(opts);
    opts = {
      qs: {
        labelSelector: `app=${appName}`,
      },
      ...opts,
    };
    const url = `${this.config.getCurrentCluster()!.server}/apis/networking.istio.io/v1alpha3/namespaces/${namespace}/virtualservices`;

    return new Promise((resolve, reject) => {
      request.delete(url, opts,
        (error, _response, _body) => {
          const json = JSON.parse(_body);
          if (error) {
            reject(error);
          }
          if (json.items.length === 0) {
            reject(new Error('not Exists'));
          }
          resolve(true);
        });
    });
  }

  /**
   * Delete K8s Resource (ex, namespace,...).
   * @params type: K8s Resource Type.
   * @params namespace: Namespace Name.
  */
  async deleteResource(type: types.K8sResourceType, name: string, namespace?: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    if (type === 'namespace') {
      await coreApi.deleteNamespace(name);
    } else if (type === 'deployment' && namespace) {
      await appV1Api.deleteNamespacedDeployment(name, namespace);
    } else if (type === 'service' && namespace) {
      await coreApi.deleteNamespacedService(name, namespace);
    } else if (type === 'virtualService' && namespace) {
      await this.deleteVirtualService(name, namespace);
    } else if (type === 'persistentVolume') {
      await coreApi.deletePersistentVolume(name);
    } else if (type === 'persistentVolumeClaim' && namespace) {
      await coreApi.deleteNamespacedPersistentVolumeClaim(name, namespace);
    } else if (type === 'storage' && namespace) {
      await coreApi.deleteNamespacedPersistentVolumeClaim(name, namespace)
        .catch(() => {});
      await coreApi.deletePersistentVolume(name);
    } else {
      throw new Error('Invalid Params');
    }
  }

  /**
   * Parse Pod Information From k8s.V1Pod
   * @params pod: k8s.V1Pod
  */
  parsePodInfo(pod: k8s.V1Pod): types.PodInfo | undefined {
    if (pod.spec && pod.metadata && pod.status && pod.metadata.labels
      && pod.status.conditions) {
      const { containers } = pod.spec;
      const resourcelimits = this.getPodLimit(containers);
      const podInfo = {
        targetNodeName: pod.spec.nodeName as string,
        resourcelimits,
        labels: pod.metadata.labels,
        appName: pod.metadata.labels.app,
        name: pod.metadata.name as string,
        namespaceId: pod.metadata.namespace as string,
        status: {
          phase: pod.status.phase as types.PodPhase,
          message: pod.status.message,
          containerStatuses: pod.status.containerStatuses,
        },
      };
      return podInfo;
    }
    return undefined;
  }

  /**
   * Get Pod Resource Limits using Container Specs.
   * @params containers: Containers in Pod.
  */
  getPodLimit(containers: k8s.V1Container[]) {
    const limits = {
      cpu: 0,
      memory: 0,
      gpu: 0,
    };
    for (const container of containers) {
      if (container.resources && container.resources.limits) {
        const containrLimits = this.convertToUnit(container.resources.limits as types.HwK8sSpec);
        if (container.resources.limits.cpu) {
          limits.cpu += containrLimits.cpu;
        }
        if (container.resources.limits.memory) {
          limits.memory += containrLimits.memory;
        }
        if (container.resources.limits['nvidia.com/gpu']) {
          limits.gpu += containrLimits.gpu;
        }
      }
    }
    return limits;
  }

  /**
   * Get Pod Information.
   * @params appName: App Name about pod Label.
   * @params namespace: Namespace Name.
  */
  async getPodInfobyAppName(appName: string, namespace: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const res = await coreApi.listNamespacedPod(
      namespace, undefined, undefined, undefined, undefined, `app=${appName}`,
    );
    const podInfo = res.body.items[0];
    if (podInfo && podInfo.status && podInfo.spec && podInfo.metadata) {
      const containerInfo = podInfo.spec.containers[0];
      const port = {};
      if (containerInfo.ports) {
        for (const portInfo of containerInfo.ports) {
          port[portInfo.containerPort] = portInfo.protocol;
        }
      }
      return {
        podName: podInfo.metadata.name,
        resourceStatus: podInfo.status.phase || 'Unknown',
        containerImage: containerInfo.image,
        env: containerInfo.env,
        port,
      };
    }
    throw new Error('Failed to get Pod Info.');
  }

  /**
   * Get All Pod Information.
  */
  async getAllPodInfoList() {
    const url = `${this.config.getCurrentCluster()!.server}/api/v1/pods`;

    return new Promise<types.PodInfo[]>((resolve, reject) => {
      const opts = {} as request.Options;
      this.config.applyToRequest(opts);
      request.get(url, opts,
        (error, _response, _body) => {
          if (error) {
            reject(error);
          }
          const podInfos = [];
          const jsonData = JSON.parse(_body);
          for (const item of jsonData.items) {
            const podInfo = this.parsePodInfo(item);
            if (podInfo) {
              podInfos.push(podInfo);
            }
          }
          resolve(podInfos);
        });
    });
  }

  /**
   * Get Node Information.
   * @params nodePoolLabel: label for finding NodePool.
   * @params namespace: Namespace Name.
  */
  async getNodesInfo(nodePoolLabel: string, gpuTypeLabel: string) {
    const url = `${this.config.getCurrentCluster()!.server}/api/v1/nodes`;
    const opts = {} as request.Options;
    this.config.applyToRequest(opts);
    return new Promise<types.NodePool>((resolve, reject) => {
      request.get(url, opts,
        (error, _response, _body) => {
          if (error) {
            reject();
          }
          try {
            const nodePool = {};
            const nodes = JSON.parse(_body).items;
            for (const node of nodes) {
              const nodePoolName = node.metadata.labels[nodePoolLabel];
              const gpuType = node.metadata.labels[gpuTypeLabel];
              if (nodePoolName) {
                if (!nodePool[nodePoolName]) {
                  nodePool[nodePoolName] = JSON.parse(JSON.stringify({
                    gpuType: gpuType || '',
                    osImage: node.status.nodeInfo.osImage,
                    nodes: {},
                  }));
                }
                nodePool[nodePoolName].nodes[node.metadata.name] = {
                  capacity: this.convertToUnit(node.status.capacity),
                  allocatable: this.convertToUnit(node.status.allocatable),
                };
              }
            }
            resolve(nodePool);
          } catch (_) {
            reject(_);
          }
        });
    });
  }

  /**
   * Parse PersistentVolume Information From k8s.V1PersistentVolume.
   * @params pv: k8s.V1PersistentVolume.
  */
  parsePersistentVolumeInfo(pv: k8s.V1PersistentVolume): types.StorageInfo | undefined {
    if (pv.metadata && pv.metadata.labels && pv.status && pv.spec && pv.spec.claimRef) {
      const pvInfo = {
        storageId: pv.metadata.labels.app,
        labels: pv.metadata.labels,
        status: pv.status.phase as types.StorageStatus,
        claim: {
          name: pv.spec.claimRef.name as string,
          namespaceId: pv.spec.claimRef.namespace as string,
        },
      };
      return pvInfo;
    }
    return undefined;
  }

  /**
     * Get All persistentvolumes Information.
     * @params selectLabel: label for selecting persistentvolumes
  */
  async getPersistentVolumeInfoList(selectLabel?: string) {
    const url = `${this.config.getCurrentCluster()!.server}/api/v1/persistentvolumes`;

    return new Promise<types.StorageInfo[]>((resolve, reject) => {
      const opts = {} as request.Options;
      this.config.applyToRequest(opts);
      request.get(url, opts,
        (error, _response, _body) => {
          if (error) {
            reject(error);
          }
          const storageInfos = [];
          const jsonData = JSON.parse(_body);
          for (const item of jsonData.items) {
            if (item.metadata.labels && item.metadata.labels.app
              && (!selectLabel || (item.metadata.labels[selectLabel]))
            ) {
              const storageInfo = {
                storageId: item.metadata.labels.app,
                labels: item.metadata.labels,
                status: item.status.phase as types.StorageStatus,
                claim: {
                  name: item.spec.claimRef.name,
                  namespaceId: item.spec.claimRef.namespace,
                },
              };
              storageInfos.push(storageInfo);
            }
          }
          resolve(storageInfos);
        });
    });
  }

  /**
   * existDeployment
   * @params name: Deployment Name.
   * @params namespace: Namespace Name.
  */
  async existDeployment(name: string, namespace: string) {
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    try {
      await appV1Api.readNamespacedDeploymentStatus(name, namespace);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * existStorage
   * @params name: Storage Name.
  */
  async existPersistentVolume(name: string, namespace: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    try {
      await coreApi.readNamespacedPersistentVolumeClaim(name, namespace);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * existSecret
   * @params name: Secret Name.
   * @params namespace: namespace Name.
  */
  async existSecret(name: string, namespace: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    try {
      await coreApi.readNamespacedSecret(name, namespace);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * existNamespace
   * @params name: Namespace Name.
  */
  async existNamespace(name: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    try {
      await coreApi.readNamespace(name);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Configrate Deployment
   * @params name: Deployment Name.
   * @params namespace: namespace Name.
   * @params config: namespace Name.
  */
  async editDeployment(name: string, namespace: string, config: types.DeploymentConfig) {
    const patch = [];
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    try {
      if (config.replicas !== undefined) {
        patch.push({
          op: 'replace',
          path: '/spec/replicas',
          value: config.replicas,
        });
      }
      if (config.imagePath) {
        patch.push({
          op: 'replace',
          path: '/spec/template/spec/containers/0/image',
          value: config.imagePath,
        });
      }

      if (config.env) {
        const envValue = [];
        for (const key of Object.keys(config.env)) {
          envValue.push({
            name: key,
            value: String(config.env[key]),
          });
        }
        patch.push({
          op: 'replace',
          path: '/spec/template/spec/containers/0/env',
          value: envValue,
        });
      }
      if (patch.length !== 0) {
        const options = { headers: { 'Content-type': 'application/json-patch+json' } };
        await appV1Api.patchNamespacedDeployment(name, namespace, patch,
          undefined, undefined, undefined, undefined, options);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Watch Pod.
  */
  async watchPod(
    addCallback: (data: types.PodInfo) => void,
    updateCallback: (data: types.PodInfo) => void,
    deleteCallback: (data: types.PodInfo) => void,
    errorCallback: () => void,
  ) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const listFn = () => coreApi.listPodForAllNamespaces();
    const informer = k8s.makeInformer(this.config, '/api/v1/pods', listFn);

    informer.on('add', async (obj: k8s.V1Pod) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await addCallback(podInfo);
      }
    });
    informer.on('update', async (obj: k8s.V1Pod) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await updateCallback(podInfo);
      }
    });
    informer.on('delete', async (obj: k8s.V1Pod) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await deleteCallback(podInfo);
      }
    });
    informer.on('error', async (err: k8s.V1Pod) => {
      // eslint-disable-next-line no-console
      console.log(err);
      await errorCallback();
      // Restart informer after 5sec
      setTimeout(() => {
        informer.start();
      }, 5000);
    });
    informer.start();
  }

  /**
   * Get Container Log.
   * @params appName
   * @params namespace
  */
  getContainerLog = async (appName: string, namespace: string, sinceSeconds?: number) => {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const podInfo = await this.getPodInfobyAppName(appName, namespace);
    if (podInfo.podName) {
      const result = await coreApi.readNamespacedPodLog(podInfo.podName, namespace,
        undefined, undefined, undefined, undefined, undefined,
        undefined, sinceSeconds, undefined, true);
      return result.body;
    }
    throw new Error('not Exist Pod Name.');
  }
}
