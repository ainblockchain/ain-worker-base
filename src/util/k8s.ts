import * as k8s from '@kubernetes/client-node';
import * as util from 'util';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as mustache from 'mustache';
import * as request from 'request';
import ErrorDetailCode from '../common/errorCode';
import * as types from '../common/types';
import * as constants from '../common/constants';

const workspaceTemplate = fs.readFileSync(
  'k8s_templates/workspace.mustache',
  { encoding: 'utf-8' },
);

const storageTemplate = fs.readFileSync(
  'k8s_templates/storage.mustache',
  { encoding: 'utf-8' },
);

const storageForNfsTemplate = fs.readFileSync(
  'k8s_templates/storage-for-nfs.mustache',
  { encoding: 'utf-8' },
);

const exec = util.promisify(require('child_process').exec);

export default class Api {
  private config: k8s.KubeConfig;

  private static readonly K8S_CONFIG_PATH = constants.K8S_CONFIG_PATH;

  static instance: Api;

  constructor() {
    this.config = new k8s.KubeConfig();
    this.config.loadFromFile(Api.K8S_CONFIG_PATH);
  }

  /**
   * Get K8S API instance for Singleton Pattern.
  */
  static getInstance() {
    if (!Api.instance) {
      Api.instance = new Api();
    }

    return Api.instance;
  }

  /**
   * Apply yaml in JSON.
  */
  async apply(k8sYaml: string) {
    const api = k8s.KubernetesObjectApi.makeApiClient(this.config);
    const specs: k8s.KubernetesObject[] = yaml.safeLoadAll(k8sYaml);
    for (const spec of specs) {
      await api.create(spec);
    }
  }

  async isSelectLabel(resourceType: 'deployment' | 'namespace', name: string,
    namespace: string = 'default', labels: {[key: string]: string}) {
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    let targetLabels = {};

    try {
      if (resourceType === 'deployment') {
        const res = await appV1Api.readNamespacedDeploymentStatus(name, namespace);
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
    } catch (err) {
      throw err.body.message;
    }
  }

  /**
   * Delete namespace.
   */
  async deleteNamespace(namespaceId: string, allowLabels?: {[key: string]: string}) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    await coreApi.deleteNamespace(namespaceId);
    if (allowLabels) {
      const isSelectLabel = await this.isSelectLabel('namespace', namespaceId, undefined, allowLabels);
      if (!isSelectLabel) {
        throw new Error(ErrorDetailCode.CAN_NOT_ALLOW);
      }
    }
    await coreApi.deleteNamespace(namespaceId);
  }

  // For Workspace.

  /**
   * Create Namespace, Deployment, Service, VirtualService.
   */
  async createWorkspace(params: types.K8SCreateWorkspaceParams) {
    const {
      storageSpec, envs, labels, nodeSelectors, ports, containerId,
    } = params;

    const generatedSpecYAML = mustache.render(workspaceTemplate, {
      ...params,
      storageSpec: Object.entries(storageSpec || {}).map(([key, value]) => ({ key, value })),
      envs: Object.entries(envs || {}).map(([key, value]) => ({ key, value })),
      labels: Object.entries(labels || {}).map(([key, value]) => ({ key, value })),
      nodeSelectors: Object.entries(nodeSelectors || {}).map(([key, value]) => ({ key, value })),
      rootDomain: constants.ROOT_DOMAIN,
      gateway: constants.GATEWAY_NAME,
    });
    await this.apply(generatedSpecYAML);

    const endpoint = {};
    ports.forEach((port) => {
      endpoint[port] = `https://${port}-${containerId}.${constants.ROOT_DOMAIN}`;
    });
    return endpoint;
  }

  /**
   * Get Pod Info About Workspace With pod phase..
   */
  async getWorkspaceInfo(containerId: string, namespaceId: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const res = await coreApi.listNamespacedPod(
      namespaceId, undefined, undefined, undefined, undefined, `app=${containerId}`,
    );
    const podInfo = this.parsePodInfo(res.body.items[0]);
    if (podInfo) {
      return podInfo;
    }
    throw new Error(ErrorDetailCode.FAILED_GET_WORKSPACE);
  }

  /**
   * Edit Only Deployment About Workspace.
   */
  async editWorkspace(params: types.K8SEditWorkspaceParams, allowLabels: {[key: string]: string}) {
    if (allowLabels) {
      const isSelectLabel = await this.isSelectLabel('deployment', params.containerId, params.namespaceId, allowLabels);
      if (!isSelectLabel) {
        throw new Error(ErrorDetailCode.CAN_NOT_ALLOW);
      }
    }

    const patch = [];
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    if (params.imagePath) {
      patch.push({
        op: 'replace',
        path: '/spec/template/spec/containers/0/image',
        value: params.imagePath,
      });
    }

    if (params.storageSpec) {
      const volumes = [];
      const volumeMounts = [];

      for (const [storageId, storageSpec] of Object.entries(params.storageSpec)) {
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

    if (params.envs) {
      const envValue = [];
      for (const key of Object.keys(params.envs)) {
        envValue.push({
          name: key,
          value: String(params.envs[key]),
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
      await appV1Api.patchNamespacedDeployment(params.containerId, params.namespaceId, patch,
        undefined, undefined, undefined, undefined, options);
    }
  }

  /**
   * Delete VirtualService by Container Id.
  */
  async deleteVirtualService(containerId: string, namespaceId: string) {
    let opts = {} as request.Options;
    this.config.applyToRequest(opts);
    opts = {
      qs: {
        labelSelector: `app=${containerId}`,
      },
      ...opts,
    };
    const url = `${this.config.getCurrentCluster()!.server}/apis/networking.istio.io/v1alpha3/namespaces/${namespaceId}/virtualservices`;

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
   * Delete Deployment, Service, VirtualService.
   */
  async deleteWorkspace(
    containerId: string, namespaceId: string, allowLabels?: {[key: string]: string},
  ) {
    if (allowLabels) {
      const isSelectLabel = await this.isSelectLabel('deployment', containerId, namespaceId, allowLabels);
      if (!isSelectLabel) {
        throw new Error(ErrorDetailCode.CAN_NOT_ALLOW);
      }
    }
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const appV1Api = this.config.makeApiClient(k8s.AppsV1Api);
    await appV1Api.deleteNamespacedDeployment(containerId, namespaceId);
    await coreApi.deleteNamespacedService(containerId, namespaceId);
    await this.deleteVirtualService(containerId, namespaceId);
  }

  // For Storage.

  /**
   * Create Persistent Volume, Persistent Volume Claim.
   */
  async createStorage(params: types.K8SCreateStorageParams) {
    if (params.nfsInfo) {
      const generatedSpecYAML = mustache.render(storageForNfsTemplate, {
        ...params,
        labels: Object.entries(params.labels || {}).map(([key, value]) => ({ key, value })),
      });
      await this.apply(generatedSpecYAML);
    } else {
      const generatedSpecYAML = mustache.render(storageTemplate, {
        ...params,
        labels: Object.entries(params.labels || {}).map(([key, value]) => ({ key, value })),
      });
      await this.apply(generatedSpecYAML);
    }
  }

  async runKubectlCommand(cmd: string) {
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

  /**
   * Get All Pod Information.
  */
  async getAllPodInfoList(labels?: string) {
    const coreApi = this.config.makeApiClient(k8s.CoreV1Api);
    const res = await coreApi.listPodForAllNamespaces(undefined, undefined, undefined, labels);
    const podInfos = [];
    for (const item of res.body.items) {
      const podInfo = this.parsePodInfo(item);
      if (podInfo) {
        podInfos.push(podInfo);
      }
    }
    return podInfos;
  }

  async getNodepoolInfo(nodePoolLabel: string) {
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
              const targetPodInfoList = allPodInfoList
                .filter((podInfo) => (podInfo.targetNodeName === node.metadata.name));
              const allocatable = {
                cpuM: targetPodInfoList.map((podInfo) => podInfo.resourceLimits.cpuM)
                  .reduce((current, pre) => pre + current),
                memoryGB: targetPodInfoList.map((podInfo) => podInfo.resourceLimits.memoryGB)
                  .reduce((current, pre) => pre + current),
                gpuCnt: targetPodInfoList.map((podInfo) => podInfo.resourceLimits.gpuCnt)
                  .reduce((current, pre) => pre + current),
              };

              if (nodePoolName) {
                if (!nodePool[nodePoolName]) {
                  nodePool[nodePoolName] = JSON.parse(JSON.stringify({
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
   * hwspec to cpu "m".
   * @param k8sUnit: k8s CPU resource Spec (ex. 1000m).
  */
  convertK8sUnitCpu(k8sUnit: string) {
    if (k8sUnit.includes('m')) return parseInt(k8sUnit, 10);
    return parseInt(k8sUnit, 10) * 1000;
  }

  /**
   * hwspec to Memory "Gi".
   * @param k8sUnit: k8s MEMORY resource Spec (ex. 10Gi).
  */
  convertK8sUnitMemory(k8sUnit: string) {
    if (k8sUnit.includes('Ki') || k8sUnit.includes('K')) return Math.round(parseInt(k8sUnit, 10) / (1000 * 1000));
    if (k8sUnit.includes('Mi') || k8sUnit.includes('M')) return parseInt(k8sUnit, 10) / 1000;
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
        cpuM: 0,
        memoryGB: 0,
        gpuCnt: 0,
      };
    }
    return {
      cpuM: (hwSpec.cpu) ? this.convertK8sUnitCpu(hwSpec.cpu) : 0,
      memoryGB: (hwSpec.memory) ? this.convertK8sUnitMemory(hwSpec.memory) : 0,
      gpuCnt: Number(hwSpec['nvidia.com/gpu']) || 0,
    };
  }

  /**
   * Get Pod Resource Limits using Container Specs.
   * @param containers: Containers in Pod.
  */
  getPodLimit(containers: k8s.V1Container[]) {
    const limits = {
      cpuM: 0,
      memoryGB: 0,
      gpuCnt: 0,
    };
    for (const container of containers) {
      if (container.resources) {
        const containerLimits = this.convertToUnit(container.resources.limits as types.HwK8sSpec);
        const containerRequests = this.convertToUnit(
          container.resources.requests as types.HwK8sSpec,
        );
        // CPU
        if (container.resources.limits && container.resources.limits.cpu
          && containerLimits.cpuM > 0) {
          limits.cpuM += containerLimits.cpuM;
        } else if (container.resources.requests && container.resources.requests.cpu) {
          limits.cpuM += containerRequests.cpuM;
        }
        // Memory
        if (container.resources.limits && container.resources.limits.memory
          && containerRequests.memoryGB > 0) {
          limits.memoryGB += containerRequests.memoryGB;
        } else if (container.resources.requests && container.resources.requests.memory) {
          limits.memoryGB += containerRequests.memoryGB;
        }
        // GPU
        if (container.resources.limits && container.resources.limits['nvidia.com/gpu']) {
          limits.gpuCnt += parseInt(container.resources.limits['nvidia.com/gpu'], 10);
        }
      }
    }
    return limits;
  }

  /**
   * Parse Pod Information From k8s.V1Pod
   * @param pod: k8s.V1Pod
  */
  parsePodInfo(pod: k8s.V1Pod): types.PodInfo | undefined {
    if (pod.spec && pod.metadata && pod.status && pod.metadata.labels) {
      const { containers } = pod.spec;
      const ports = containers[0].ports
        ? containers[0].ports.map((port) => port.containerPort) : [];
      const resourceLimits = this.getPodLimit(containers);
      const podInfo = {
        targetNodeName: pod.spec.nodeName as string,
        resourceLimits,
        labels: pod.metadata.labels,
        containerId: pod.metadata.labels.app,
        name: pod.metadata.name as string,
        namespaceId: pod.metadata.namespace as string,
        ports,
        status: {
          phase: pod.status.phase as types.PodPhase,
          message: pod.status.message,
          containerStatuses: pod.status.containerStatuses,
        },
        imagePath: containers[0].image as string,
      };
      return podInfo;
    }
    return undefined;
  }
}
