import * as k8s from '@kubernetes/client-node';
import { Base64 } from 'js-base64';
import * as request from 'request';
import * as http2 from 'http2';
import * as util from 'util';
import * as types from '../../common/types';

const exec = util.promisify(require('child_process').exec);

export default class Api {
  private config: k8s.KubeConfig;

  static instance: Api;

  private informer: any; // For informer.stopped..

  constructor(configPath: string) {
    this.config = new k8s.KubeConfig();
    this.config.loadFromFile(configPath);
  }

  /**
   * Get Api instance for Singleton Pattern.
   * @param configPath: Kubernetes Config Path.
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
   * @param hwSpec: hw spec (cpu, gpu, memory).
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
   * @param k8sUnit: k8s CPU resource Spec (ex. 1000m).
  */
  convertK8sUnitCpu(k8sUnit: string) {
    if (k8sUnit.includes('m')) return parseInt(k8sUnit, 10);
    return parseInt(k8sUnit, 10) * 1000;
  }

  /**
   * hwspec to Memory "Mi".
   * @param k8sUnit: k8s MEMORY resource Spec (ex. 10Gi).
  */
  convertK8sUnitMemory(k8sUnit: string) {
    if (k8sUnit.includes('Ki') || k8sUnit.includes('K')) return Math.round(parseInt(k8sUnit, 10) / 1000);
    if (k8sUnit.includes('Gi') || k8sUnit.includes('G')) return parseInt(k8sUnit, 10) * 1000;
    return parseInt(k8sUnit, 10);
  }

  /**
   * convert K8s hwSpec to Connect Unit hwSpec.
   * @param hwSpec: K8s hw spec (cpu, nvidia.com/gpu, memory).
   * @returns K8s Unit hwSpec.
  */
  convertToUnit(hwSpec?: types.HwK8sSpec) {
    if (!hwSpec) {
      return {
        cpu: 0,
        memory: 0,
        gpu: 0,
      };
    }
    return {
      cpu: (hwSpec.cpu) ? this.convertK8sUnitCpu(hwSpec.cpu) : 0,
      memory: (hwSpec.memory) ? this.convertK8sUnitMemory(hwSpec.memory) : 0,
      gpu: Number(hwSpec['nvidia.com/gpu']) || 0,
    };
  }

  /**
   * Apply yaml in JSON.
   * @param kubeJson: k8s yaml in JSON.
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
   * Create Secret.
   * @param name: Secret Name.
   * @param namespace: Namespace Name.
   * @param type: Secret Type (ex. Opaque).
   * @param data: Secret Data.
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
   * @param dockerAuth: Private Docker Registry Username,Password,Addr.
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
   * @param name: Secret Name.
   * @param namespace: Namespace Name.
   * @param dockerAuth: Private Docker Registry Username,Password,Addr.
  */
  async createDockerSecret(
    name: string, namespace: string, dockerAuth: types.DockerAuthInfo,
  ) {
    const data = this.getDockerSecretData(dockerAuth);
    await this.createSecret(name, namespace, 'kubernetes.io/dockerconfigjson', data);
  }

  /**
   * Delete VirtualService by AppName
   * @param appName: App Name.
   * @param namespace: Namespace Name.
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
    const url = `${this.config.getCurrentCluster()!.server}/apis/networking.istio.io/v1beta1/namespaces/${namespace}/virtualservices`;

    return new Promise((resolve, reject) => {
      request.delete(url, opts,
        (error, _response, _body) => {
          let json;
          try {
            json = JSON.parse(_body);
          } catch (err) {
            reject(err);
          }
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
   * @param type: K8s Resource Type.
   * @param namespace: Namespace Name.
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
      await coreApi.deletePersistentVolume(name)
        .catch(() => {});
    } else {
      throw new Error('Invalid param');
    }
  }

  async getGatewayHosts(name: string, namespace: string) {
    const opts = {} as request.Options;
    this.config.applyToRequest(opts);

    const url = `${this.config.getCurrentCluster()!.server}/apis/networking.istio.io/v1beta1/namespaces/${namespace}/gateways/${name}`;

    return new Promise<string[]>((resolve, reject) => {
      request.get(url, opts,
        (error, _response, _body) => {
          try {
            const json = JSON.parse(_body);
            if (json.spec) {
              const hosts = json.spec.servers.map((item: any) => item.hosts[0]);
              resolve(hosts);
            } else {
              reject(json.reason);
            }
            if (error) {
              reject(error);
            }
          } catch (err) {
            reject(err);
          }
        });
    });
  }

  async addLabelNamespace(name: string, labels: {[key: string]: string}) {
    const api = this.config.makeApiClient(k8s.CoreV1Api);
    const res = await api.readNamespace(name);
    const finalLabels = {
      ...res.body.metadata?.labels,
      ...labels,
    };
    const options = { headers: { 'Content-type': 'application/json-patch+json' } };
    await api.patchNamespace(name, [{
      op: 'replace',
      path: '/metadata/labels',
      value: finalLabels,
    }], undefined, undefined, undefined, undefined, options);
  }

  async createNetworkPolicy(name: string, namespace: string,
    selectPodLabel: { [key: string]: string }, config: types.NetworkConfig) {
    const api = this.config.makeApiClient(k8s.NetworkingV1Api);

    const ingress = [
      { from: [] as object[] },
    ];
    if (config.podLabel) {
      for (const [key, value] of Object.entries(config.podLabel)) {
        ingress[0].from.push({
          podSelector: {
            matchLabels: {
              [key]: value,
            },
          },
        });
      }
    }

    if (config.ipConfig) {
      ingress[0].from.push({
        ipBlock: {
          cidr: config.ipConfig.cidr,
          ipBlock: config.ipConfig.ipBlock,
        },
      });
    }

    if (config.namespaceSelector) {
      for (const [key, value] of Object.entries(config.namespaceSelector)) {
        ingress[0].from.push({
          namespaceSelector: {
            matchLabels: {
              [key]: value,
            },
          },
        });
      }
    }

    await api.createNamespacedNetworkPolicy(namespace, {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name,
        namespace,
      },
      spec: {
        podSelector: {
          matchLabels: selectPodLabel,
        },
        policyTypes: ['Ingress'],
        ingress,
      },
    });
  }

  async deleteNetworkPolicy(name: string, namespace: string) {
    const api = this.config.makeApiClient(k8s.NetworkingV1Api);
    await api.deleteNamespacedNetworkPolicy(name, namespace);
  }

  /**
   * Parse Pod Information From k8s.V1Pod
   * @param pod: k8s.V1Pod
  */
  parsePodInfo(pod: k8s.V1Pod): types.PodInfo | undefined {
    if (pod.spec && pod.metadata && pod.status && pod.metadata.labels) {
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
        image: containers[0].image as string,
      };
      return podInfo;
    }
    return undefined;
  }

  /**
   * Get Pod Resource Limits using Container Specs.
   * @param containers: Containers in Pod.
  */
  getPodLimit(containers: k8s.V1Container[]) {
    const limits = {
      cpu: 0,
      memory: 0,
      gpu: 0,
    };
    for (const container of containers) {
      if (container.resources) {
        const containerLimits = this.convertToUnit(container.resources.limits as types.HwK8sSpec);
        const containerRequests = this.convertToUnit(
          container.resources.requests as types.HwK8sSpec,
        );
        // CPU
        if (container.resources.limits && container.resources.limits.cpu
          && containerLimits.cpu > 0) {
          limits.cpu += containerLimits.cpu;
        } else if (container.resources.requests && container.resources.requests.cpu) {
          limits.cpu += containerRequests.cpu;
        }
        // Memory
        if (container.resources.limits && container.resources.limits.memory
          && containerRequests.memory > 0) {
          limits.memory += containerRequests.memory;
        } else if (container.resources.requests && container.resources.requests.memory) {
          limits.memory += containerRequests.memory;
        }
        // GPU
        if (container.resources.limits && container.resources.limits['nvidia.com/gpu']) {
          limits.gpu += parseInt(container.resources.limits['nvidia.com/gpu'], 10);
        }
      }
    }
    return limits;
  }

  /**
   * Get Pod Information.
   * @param appName: App Name about pod Label.
   * @param namespace: Namespace Name.
  */
  async getPodInfobyAppName(appName: string, namespace: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const res = await coreApi.listNamespacedPod(
      namespace, undefined, undefined, undefined, undefined, `app=${appName}`,
    );
    const podInfo = this.parsePodInfo(res.body.items[0]);
    if (podInfo) {
      return podInfo;
    }
    throw new Error('Failed to get Pod Info.');
  }

  /**
   * Get All Pod Information.
  */
  async getAllPodInfoList() {
    const url = `${this.config.getCurrentCluster()!.server}/api/v1/pods`;

    return new Promise<types.PodInfo[]>((resolve, reject) => {
      const opts = {
        timeout: 10000,
      } as request.Options;
      this.config.applyToRequest(opts);
      request.get(url, opts,
        (error, _response, _body) => {
          if (error) {
            reject(error);
          }
          try {
            const podInfos = [];
            let jsonData;
            try {
              jsonData = JSON.parse(_body);
            } catch (err) {
              reject(err);
            }
            for (const item of jsonData.items) {
              const podInfo = this.parsePodInfo(item);
              if (podInfo) {
                podInfos.push(podInfo);
              }
            }
            resolve(podInfos);
          } catch (err) {
            reject(err);
          }
        });
    });
  }

  /**
   * Get Node Information.
   * @param nodePoolLabel: label for finding NodePool.
   * @param namespace: Namespace Name.
  */
  async getNodesInfo(nodePoolLabel: string, gpuTypeLabel: string) {
    const allPodInfoList = await this.getAllPodInfoList();
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
              const targetPodInfoList = allPodInfoList
                .filter((podInfo) => (podInfo.targetNodeName === node.metadata.name));
              const allocatable = {
                cpu: targetPodInfoList.map((podInfo) => podInfo.resourcelimits.cpu)
                  .reduce((current, pre) => pre + current),
                memory: targetPodInfoList.map((podInfo) => podInfo.resourcelimits.memory)
                  .reduce((current, pre) => pre + current),
                gpu: targetPodInfoList.map((podInfo) => podInfo.resourcelimits.gpu)
                  .reduce((current, pre) => pre + current),
              };

              if (nodePoolName) {
                if (!nodePool[nodePoolName]) {
                  nodePool[nodePoolName] = JSON.parse(JSON.stringify({
                    gpuType: gpuType || '',
                    osImage: node.status.nodeInfo.osImage,
                    nodes: {},
                  }));
                }
                nodePool[nodePoolName].nodes[node.metadata.name] = {
                  capacity: this.convertToUnit(node.status.allocatable),
                  allocatable,
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
   * @param pv: k8s.V1PersistentVolume.
  */
  parsePersistentVolumeInfo(pv: k8s.V1PersistentVolume): types.StorageInfo | undefined {
    if (pv.metadata && pv.metadata.labels && pv.status && pv.spec && pv.spec.claimRef) {
      const pvInfo = {
        appName: pv.metadata.labels.app,
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
     * @param selectLabel: label for selecting persistentvolumes
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
          let jsonData;
          try {
            jsonData = JSON.parse(_body);
          } catch (err) {
            reject(err);
          }
          for (const item of jsonData.items) {
            if (item.metadata.labels && item.metadata.labels.app
              && (!selectLabel || (item.metadata.labels[selectLabel]))
            ) {
              const storageInfo = {
                appName: item.metadata.labels.app,
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
   * @param name: Deployment Name.
   * @param namespace: Namespace Name.
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
   * @param name: Storage Name.
  */
  async existPersistentVolumeClaim(name: string, namespace: string) {
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
   * @param name: Secret Name.
   * @param namespace: namespace Name.
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
   * @param name: Namespace Name.
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
   * @param name: Deployment Name.
   * @param namespace: namespace Name.
   * @param config: namespace Name.
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
      if (config.imageName) {
        patch.push({
          op: 'replace',
          path: '/spec/template/spec/containers/0/image',
          value: config.imageName,
        });
      }

      if (config.storageSpec) {
        const volumes = [];
        const volumeMounts = [];

        for (const [storageId, storageSpec] of Object.entries(config.storageSpec)) {
          volumes.push({
            name: storageId,
            persistentVolumeClaim: { claimName: storageId },
          });

          volumeMounts.push(JSON.parse(JSON.stringify({
            name: storageId,
            mountPath: storageSpec.mountPath,
            readOnly: !!(storageSpec.readOnly),
            subPath: storageSpec.subPath,
          })));
        }

        patch.push({
          op: 'replace',
          path: '/spec/template/spec/volumes',
          value: volumes,
        });
        patch.push({
          op: 'replace',
          path: '/spec/template/spec/containers/0/volumeMounts',
          value: volumeMounts,
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
  makeInformerPod(
    addCallback: (data: k8s.V1Pod) => void,
    updateCallback: (data: k8s.V1Pod) => void,
    deleteCallback: (data: k8s.V1Pod) => void,
    errorCallback: () => void,
  ) {
    const addHandler = async (obj: any) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await addCallback(podInfo);
      }
    };
    const updateHandler = async (obj: any) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await updateCallback(podInfo);
      }
    };
    const deleteHandler = async (obj: any) => {
      const podInfo = this.parsePodInfo(obj);
      if (podInfo) {
        await deleteCallback(podInfo);
      }
    };
    const errorHandler = async () => {
      await errorCallback();
    };

    const http2Request = {
      webRequest: (opts: any, _callback: any) => {
        const connectionOptions = {};
        this.config.applyToRequest(connectionOptions as any);
        const url = new URL(opts.uri);
        const host = `${url.protocol}//${url.host}`;
        const http2ClientSession = http2.connect(host, { ca: connectionOptions['ca'] });
        let path = '/api/v1/pods?watch=true';
        if (opts && opts.qs && opts.qs.resourceVersion) {
          path += `&resourceVersion=${opts.qs.resourceVersion}`;
        }
        const requestHeaders = { ':method': 'GET', ':path': path };
        requestHeaders['Authorization'] = connectionOptions['headers'].Authorization;
        const requestOptions = {
          endStream: false,
        };
        const http2Stream = http2ClientSession.request(requestHeaders, requestOptions);
        let count = 0;
        const pingInterval = setInterval(() => {
          let payload = count.toString().padStart(8, '0');
          payload = payload.slice(payload.length - 8);
          if (http2Stream.closed || http2Stream.destroyed) {
            if (!http2Stream.closed) {
              http2Stream.emit('close');
            }
            return;
          }
          http2ClientSession.ping(Buffer.from(payload), (error, _duration, _payload) => {
            if ((error || http2Stream.closed
              || http2Stream.destroyed) && this.informer && !this.informer.stopped) {
              if (!http2Stream.closed) {
                http2Stream.emit('close');
              }
            }
            count += 1;
          });
        }, 5000);

        http2Stream.on('end', () => {
          clearInterval(pingInterval);
          http2ClientSession.close();
          this.informer.off('error', errorHandler);
          this.informer.off('add', addHandler);
          this.informer.off('update', updateHandler);
          this.informer.off('delete', deleteHandler);
          this.informer.stop();
        });
        return http2Stream;
      },
    };
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const listFn = () => coreApi.listPodForAllNamespaces();
    const watch = new k8s.Watch(this.config, http2Request);
    this.informer = new k8s.ListWatch('/api/v1/pods', watch, listFn, false);

    this.informer.start();
    this.informer.on('error', errorHandler);
    this.informer.on('add', addHandler);
    this.informer.on('update', updateHandler);
    this.informer.on('delete', deleteHandler);

    setInterval(async () => {
      if (this.informer && this.informer.stopped) {
        try {
          await this.informer.start();
        } catch (err) {
          this.informer.stop();
          return;
        }
        this.informer.on('error', errorHandler);
        this.informer.on('add', addHandler);
        this.informer.on('update', updateHandler);
        this.informer.on('delete', deleteHandler);
      }
    }, 15000);
  }

  /**
   * Get Container Log.
   * @param appName
   * @param namespace
  */
  getContainerLog = async (appName: string, namespace: string, sinceSeconds?: number) => {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const podInfo = await this.getPodInfobyAppName(appName, namespace);
    if (podInfo.name) {
      const result = await coreApi.readNamespacedPodLog(podInfo.name, namespace,
        undefined, undefined, undefined, undefined, undefined,
        undefined, sinceSeconds, undefined, true);
      return result.body;
    }
    throw new Error('not Exist Pod Name.');
  }

  async isSelectLabel(resourceType: 'deployment' | 'pvc' | 'namespace', name: string,
    namespace: string = 'default', labels: {[key: string]: string}) {
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    let targetLabels = {};

    if (resourceType === 'deployment') {
      const res = await appV1Api.readNamespacedDeploymentStatus(name, namespace);
      targetLabels = res.body.metadata?.labels || {};
    } else if (resourceType === 'pvc') {
      const res = await coreApi.readNamespacedPersistentVolumeClaim(name, namespace);
      targetLabels = res.body.metadata?.labels || {};
    } else {
      // namespace
      const res = await coreApi.readNamespace(name);
      targetLabels = res.body.metadata?.labels || {};
    }
    for (const [key, value] of Object.entries(labels)) {
      if (targetLabels[key] !== value) {
        return false;
      }
    }
    return true;
  }

  async runCommand(cmd: string): Promise<types.KubectlCommandResult> {
    const command = `cat << EOF | kubectl ${cmd} 
EOF`;
    try {
      const result = await exec(command);

      return {
        ...result,
        statusCode: 0,
      };
    } catch (error) {
      return {
        stdout: error.stdout,
        stderr: error.stderr,
        statusCode: error.code,
      };
    }
  }
}
