import ErrorDetailCode from '../common/errorCode';
import * as types from '../common/types';
import * as constants from '../common/constants';
import Docker from '../util/docker';

export async function getAllContainerInfo() {
  const containerList = await Docker.getInstance().getContainerInfosByLabel(`${constants.LABEL_FOR_AIN_CONNECT}=container`);
  const containerInfos = {};
  for (const container of containerList) {
    const containerId = container.Names[0].replace('/', '');
    const ports = container.Ports.map((Port) => Port.PublicPort);
    containerInfos[containerId] = {
      status: container.State,
      imagePath: container.Image,
      ports,
    };
    if (container.State === 'exited') {
      const containerDetail = await Docker.getInstance().getContainerInfo(containerId);
      containerInfos[containerId] = {
        ...containerInfos[containerId],
        exitCode: containerDetail.State.ExitCode,
      };
    }
  }
  return containerInfos;
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

export default async function handler(type: string, params: any, userAinAddress: string) {
  if (type === 'createContainer') {
    return createContainer(params, userAinAddress);
  }
  if (type === 'deleteContainer') {
    return deleteContainer(params, userAinAddress);
  }
  throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
}
