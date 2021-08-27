import * as k8s from '@kubernetes/client-node';
import * as ConnectSdk from '@aindev/connect-sdk';

export type NODE_ENV = 'prod' | 'staging';

export type ClusterType = 'aws' | 'gcp' | 'azure' | 'on-premise';

export type WorkerInfo = {
  clusterName: string; // Unique!
  mnemonic: string;
  dockerAuth?: {
    username: string;
    password: string;
    server: string; // Reposity Address
  };
}

// k8s
export type K8sResourceType = 'namespace' | 'deployment' | 'service' | 'virtualService' | 'storage' | 'persistentVolumeClaim' | 'persistentVolume';

/**
 * CPU: 'm', MEMORY: 'Mi'
*/
export type HwSpec = {
  cpu: number;
  gpu: number;
  memory: number;
};

/**
 * CPU: 'm', MEMORY: 'Mi'
*/
export type HwK8sSpec = {
  cpu: string;
  'nvidia.com/gpu': string;
  memory: string;
};

/**
 * @param path: NFS Base Path.
 * @param server: NFS Address.
*/
export type NfsInfo = {
  path: string;
  server: string;
}

/**
 * @param storageGb: Storage Capacity.
 * @param accessModes: (ReadWriteMany: Multi-node access, ReadWriteOnce: Single-node access).
 * @param nfsInfo: NFS Info.
*/
export type StorageConfig = {
  capacity: number,
  storageClassName: string;
  accessModes: 'ReadWriteMany' | 'ReadWriteOnce';
  nfsInfo?: NfsInfo;
  labels?: {[key: string]: string };
}

export type DockerAuthInfo = {
  username: string;
  password: string;
  server: string;
}

/**
 * @param env: Container Environment.
 * @param replicas: Number of Pods.
 * @param imagePath: Container Docker image Path.
*/
export type DeploymentConfig = {
  env?: Object;
  replicas?: number;
  imageName?: string;
  storageSpec?: StorageSpec;
}

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';

export type PodInfo = {
  targetNodeName: string;
  resource: {
    limits: HwSpec,
    requests: HwSpec,
  },
  labels: { [key: string]: string },
  appName: string,
  name: string,
  namespaceId: string,
  status: {
    phase: PodPhase,
    message?: string,
    containerStatuses?: k8s.V1ContainerStatus[],
  },
  image: string,
}
export type GetPodInfo = {
  updatedAt: number;
  params: {
    namespaceId: string;
    podName: string;
    status: {
      phase: ConnectSdk.types.PodPhaseList;
    }
  };
}

export type ContainerSpec = {
  imagePath: string, // DOCKER IMAGE URL
  resourceLimits: HwK8sSpec,
  env?: Object, // { ENV_NAME: ENV_VALUE }
  ports?: number[], // Internal Port List
}

export type StorageSpec = {
  [storageId: string]: {
    mountPath: string, // to Container
    subPath?: string,
    readOnly?: 0 | 1,
  }
}

export type SecretSpecs = {
  [secretId: string]: {
    mountPath: string, // to Container
  }
}

/**
 * @param storageSpec: Storage Info for mounting storage to Container.
 * @param secretSpec: Secret Info for mounting storage to Container.
 * @param imagePullSecretName: Secret Name about private Docker registry.
 * @param labels: deploy,pod labels
 * @param nodePoolLabel: param for select nodePool.
 * @param replicas: Number of Pods.
 * @param privileged: root authority.
*/
export type DeploymentCreateConfig = {
  storageSpec?: StorageSpec;
  secretSpec?: SecretSpecs
  imagePullSecretName?: string;
  labels?: {[key: string]: string};
  nodePoolLabel?: Object;
  replicas?: number;
  privileged?: boolean;
  strategy?: 'RollingUpdate' | 'Recreate';
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

/*
  Available -- a free resource that is not yet bound to a claim
  Bound     -- the volume is bound to a claim
  Released  -- the claim has been deleted, but the resource is not yet reclaimed by the cluster
  Failed    -- the volume has failed its automatic reclamation
*/
export type StorageStatus = 'Available' | 'Bound' | 'Released' | 'Failed';

export type StorageInfo = {
  appName: string,
  status: StorageStatus,
  labels: {[key: string]: string},
  claim?: {
    name: string,
    namespaceId: string,
  },
}

export type NetworkConfig = {
  ipConfig?: {
    ipBlock: string,
    cidr: string[]
  },
  podLabel?: { [key: string]: string },
  namespaceSelector?: { [key: string]: string },
}

export type KubectlCommandResult = {
  stdout: string,
  stderr: string,
  statusCode: number,
}
