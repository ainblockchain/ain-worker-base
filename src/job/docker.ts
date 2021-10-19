import ErrorDetailCode from '../common/errorCode';
import * as types from '../common/types';
import * as constants from '../common/constants';
import Docker from '../util/docker';

export async function getAllContainerStatus() {
  const containerList = await Docker.getInstance().getContainerInfosByLabel(`${constants.LABEL_FOR_AIN_CONNECT}=container`);
  const containerStatus = {};
  containerList.forEach((container) => {
    const containerId = container.Names[0].replace('/', '');
    containerStatus[containerId] = container.State;
  });
  return containerStatus;
}

async function createContainer(params: types.JobCreateContainerForDocker, userAinAddress: string) {
  const result = await Docker.getInstance().run({
    ...params,
    resourceLimit: {
      vcpu: Number(constants.CONTAINER_VCPU),
      memoryGB: Number(constants.CONTAINER_MEMORY_GB),
      gpuCnt: Number(constants.CONTAINER_GPU_CNT),
    },
    labels: {
      ...params.labels,
      [constants.LABEL_FOR_OWNER]: userAinAddress,
      [constants.LABEL_FOR_AIN_CONNECT]: 'container',
    },
  });

  const endpoint = {};
  Object.entries(result.publishPorts).forEach(([extenalPort, internalPort]) => {
    endpoint[internalPort] = `${constants.NODE_PORT_IP}:${extenalPort}`;
  });

  return {
    containerId: params.containerId,
    endpoint,
  };
}

async function deleteContainer(params: types.JobDeleteContainerForDocker, userAinAddress: string) {
  await Docker.getInstance().kill(params.containerId, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });

  return {
    containerId: params.containerId,
    result: true,
  };
}

async function getContainer(params: types.JobGetContainerForDocker) {
  if (!Docker.getInstance().getContainerInfoDict()[params.containerId]) {
    throw new Error(ErrorDetailCode.CONTAINER_NOT_EXIST);
  }
  const result = await Docker.getInstance().getContainerInfo(params.containerId);

  return {
    containerId: params.containerId,
    imagePath: result.imagePath,
    status: result.State.Status,
  };
}

export default async function handler(type: string, params: any, userAinAddress: string) {
  if (type === 'createContainer') {
    return createContainer(params, userAinAddress);
  }
  if (type === 'deleteContainer') {
    return deleteContainer(params, userAinAddress);
  }
  if (type === 'getContainer') {
    return getContainer(params);
  }
  throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
}
