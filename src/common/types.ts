import * as k8s from '@kubernetes/client-node';

export type NODE_ENV = 'prod' | 'staging';

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
 * @params path: NFS Base Path.
 * @params server: NFS Address.
*/
export type NfsInfo = {
  path: string;
  server: string;
}

/**
 * @params storageGb: Storage Capacity.
 * @params accessModes: (ReadWriteMany: Multi-node access, ReadWriteOnce: Single-node access).
 * @params nfsInfo: NFS Info.
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
 * @params env: Container Environment.
 * @params replicas: Number of Pods.
 * @params imagePath: Container Docker image Path.
*/
export type DeploymentConfig = {
  env?: Object;
  replicas?: number;
  imagePath?: string;
}

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';

export type PodInfo = {
  targetNodeName: string;
  resourcelimits: HwSpec,
  labels: { [key: string]: string },
  appName: string,
  name: string,
  namespaceId: string,
  status: {
    phase: PodPhase,
    message?: string,
    containerStatuses?: k8s.V1ContainerStatus[],
  },
}

export type ContainerSpec = {
  imagePath: string, // DOCKER IMAGE URL
  resourceLimits: HwK8sSpec,
  env?: Object, // { ENV_NAME: ENV_VALUE }
  ports?: number[], // Internal Port List
}

export type StorageSpecs = {
  [storageId: string]: {
    mountPath: string, // to Container
  }
}

export type SecretSpecs = {
  [secretId: string]: {
    mountPath: string, // to Container
  }
}

/**
 * @params storageSpecs: Storage Info for mounting storage to Container.
 * @params secretSpec: Secret Info for mounting storage to Container.
 * @params imagePullSecretName: Secret Name about private Docker registry.
 * @params labels: deploy,pod labels
 * @params nodePoolLabel: params for select nodePool.
 * @params replicas: Number of Pods.
 * @params privileged: root authority.
*/
export type DeploymentCreateConfig = {
  storageSpecs?: StorageSpecs;
  secretSpec?: SecretSpecs
  imagePullSecretName?: string;
  labels?: {[key: string]: string},
  nodePoolLabel?: Object,
  replicas?: number;
  privileged?: boolean;
}

export type NodePool = {
  [nodePoolName: string]: {
    gpuType: string,
    osImage: string,
    nodes: {
      [nodeId: string]: HwSpec
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
  storageId: string,
  status: StorageStatus,
  labels: {[key: string]: string},
  claim?: {
    name: string,
    namespaceId: string,
  },
}
