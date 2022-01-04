export type GPUInfo = {
  [deviceNumber: string]: {
    driverVersion: string;
    memoryUsed: number;
    memoryTotal: number;
    gpuName: string;
  };
};

// For Docker.

export type DockerAllowPort = {
  [port: string]: boolean; // True: Available Port, False: Used Port.
};

export type DockerAllowGPUDevice = {
  [deviceId: string]: boolean; // True: Available Device, False: Used Device.
};

export type ContainerInfo = {
  [containerId: string]: {
    imagePath: string;
    externalPorts: string[];
    GPUDeviceId: string[];
    started: boolean;
    labels?: { [key: string]: string };
  };
};

export type DockerRunParams = {
  containerId: string;
  imagePath: string;
  resourceLimit: {
    vcpu: number;
    memoryGB: number;
    gpuCnt: number;
  };
  envs?: { [key: string]: string };
  command?: string[];
  ports: number[];
  labels?: { [key: string]: string };
  binds?: string[];
};

export type CreateContainer = {
  containerId: string;
  imagePath: string;
  envs?: { [key: string]: string };
  command?: string[];
  ports?: { [serviceName: string]: number };
  labels?: { [key: string]: string };
  downloadFileRef?: string;
  uploadFileName?: string;
};

export type DeleteContainer = {
  containerId: string;
};

export type DetailContainerInfo = {
  requestId: string;
  userAinAddress: string;
  imagePath: string;
  exitCode?: number;
  status: string;
  serviceStatus?: string;
  existInputMount: boolean;
  existOutputMount: boolean;
  uploadFileName?: string;
};

export type RequestInfo = {
  requestType: string;
  params: any;
  userAinAddress: string;
  createdAt: number;
};
