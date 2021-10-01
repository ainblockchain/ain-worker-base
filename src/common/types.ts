import * as k8s from '@kubernetes/client-node';

export type GPUInfo = {
  [deviceNumber: string]: {
    driverVersion: string;
    memoryUsed: number;
    memoryTotal: number;
    gpuName: string;
  }
}

// For Docker.

export type DockerAllowPort = {
  [port: string]: boolean; // True: Available Port, False: Used Port.
}

export type DockerAllowGPUDevice = {
  [deviceId: string]: boolean; // True: Available Device, False: Used Device.
}

export type ContainerInfo = {
  [containerId: string]: {
    imagePath: string;
    externalPorts: string[];
    GPUDeviceId: string[];
    started: boolean;
  }
}

export type DockerRunParams = {
  containerId: string;
  imagePath: string;
  resourceLimit: {
    vcpu: number;
    memoryGB: number;
    gpuCnt: number;
  }
  envs?: {[key: string]: string};
  command?: string[];
  ports: number[];
  labels?: {[key: string]: string};
}

export type JobCreateContainerForDocker = {
  containerId: string;
  imagePath: string;
  envs?: {[key: string]: string};
  command?: string[];
  ports: number[];
  labels?: {[key: string]: string};
}

export type JobDeleteContainerForDocker = {
  containerId: string;
}

export type JobGetContainerForDocker = {
  containerId: string;
}

// For Kubernetes

/**
 * HwSpec Type in K8s response.
 */
export type HwK8sSpec = {
  cpu: string;
  'nvidia.com/gpu': string;
  memory: string;
};

export type HwSpec = {
  cpuM: number;
  gpuCnt: number;
  memoryGB: number;
};

export type StorageSpec = {
  [storageId: string]: {
    mountPath: string, // For Container.
    subPath?: string, // For Storage.
    readOnly?: 0 | 1,
  }
}

export type K8SCreateWorkspaceParams = {
  containerId: string;
  namespaceId: string;
  imagePath: string;
  ports: number[];
  resourceLimit: HwSpec;
  storageSpec?: StorageSpec;
  envs?: {[key: string]: string};
  labels?: {[key: string]: string};
  nodeSelectors?: {[key: string]: string}; // Labels For Selecting Node.
  applyToleration?: boolean; // Node Toleration.
}

/**
 * @param path: NFS Base Path.
 * @param server: NFS Address.
*/
export type NfsInfo = {
  path: string;
  server: string;
}

export type K8SCreateStorageParams = {
  storageId: string;
  namespaceId: string;
  capacityGB: number;
  nfsInfo?: NfsInfo;
  labels: {[key: string]: string};
}

export type K8SEditWorkspaceParams = {
  containerId: string;
  namespaceId: string;
  imagePath: string;
  envs?: {[key: string]: string};
  storageSpec?: StorageSpec;
}

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';

export type PodInfo = {
  targetNodeName: string;
  resourceLimits: HwSpec,
  labels: { [key: string]: string },
  containerId: string,
  name: string,
  namespaceId: string,
  status: {
    phase: PodPhase,
    message?: string,
    containerStatuses?: k8s.V1ContainerStatus[],
  },
  imagePath: string,
}

export type GetPodInfo = {
  updatedAt: number;
  params: {
    namespaceId: string;
    podName: string;
    status: {
      phase: PodPhase;
    }
  };
}

export type HwStatus = {
  capacity: HwSpec;
  allocatable: HwSpec;
};

export type NodePool = {
  [nodePoolName: string]: {
    gpuType: string,
    osImage: string,
    nodes: {
      [nodeId: string]: HwStatus
    }
  }
};

export type KubectlCommandResult = {
  stdout: string,
  stderr: string,
  statusCode: number,
}

export type JobDeleteStorageForK8S = {
  namespaceId: string;
}

export type JobDeleteWorkspaceForK8S = {
  containerId: string;
  namespaceId: string;
}

export type JobGetWorkspaceForK8S = {
  containerId: string;
  namespaceId: string;
}

export type JobGetNodepoolForK8S = {
  nodePoolLabel: string;
}

export type JobRunKubectlCommandForK8S = {
  cmd: string;
}
