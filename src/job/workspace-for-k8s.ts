import ErrorDetailCode from '../common/errorCode';
import * as types from '../common/types';
import * as constants from '../common/constants';
import Api from '../util/k8s';

export async function getAllContainerStatus() {
  const podList = await Api.getInstance().getAllPodInfoList(`${constants.LABEL_FOR_AIN_CONNECT}=container`);
  const containerStatus = {};
  podList.forEach((pod) => {
    const containerId = pod.labels.app;
    containerStatus[containerId] = pod.status.phase.toLowerCase();
  });
  return containerStatus;
}

async function createStorage(params: types.K8SCreateStorageParams, userAinAddress: string) {
  await Api.getInstance().createStorage({
    ...params,
    labels: {
      ...params.labels,
      [constants.LABEL_FOR_OWNER]: userAinAddress,
      [constants.LABEL_FOR_AIN_CONNECT]: 'container',
    },
  });
}

async function deleteStorage(params: types.JobDeleteStorageForK8S, userAinAddress: string) {
  await Api.getInstance().deleteNamespace(params.namespaceId, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });
}

async function createWorkspace(params: types.K8SCreateWorkspaceParams, userAinAddress: string) {
  await Api.getInstance().createWorkspace({
    ...params,
    labels: {
      ...params.labels,
      [constants.LABEL_FOR_OWNER]: userAinAddress,
      [constants.LABEL_FOR_AIN_CONNECT]: 'container',
    },
  });
}

async function deleteWorkspace(params: types.JobDeleteWorkspaceForK8S, userAinAddress: string) {
  await Api.getInstance().deleteWorkspace(params.containerId, params.namespaceId, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });
}

async function editWorkspace(params: types.K8SEditWorkspaceParams, userAinAddress: string) {
  await Api.getInstance().editWorkspace(params, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });
}

async function getWorkspace(params: types.JobGetWorkspaceForK8S) {
  const result = await Api.getInstance().getWorkspaceInfo(params.containerId, params.namespaceId);
  return JSON.parse(JSON.stringify(result));
}

async function getNodepool(params: types.JobGetNodepoolForK8S) {
  const result = await Api.getInstance().getNodepoolInfo(params.nodePoolLabel);
  return result;
}

// Temporary Function.
async function runKubectlCommand(params: types.JobRunKubectlCommandForK8S) {
  const result = await Api.getInstance().runKubectlCommand(params.cmd);
  return result;
}

export default async function handler(type: string, params: any, userAinAddress: string) {
  if (type === 'createStorage') {
    return createStorage(params, userAinAddress);
  }
  if (type === 'deleteStorage') {
    return deleteStorage(params, userAinAddress);
  }
  if (type === 'createWorkspace') {
    return createWorkspace(params, userAinAddress);
  }
  if (type === 'deleteWorkspace') {
    return deleteWorkspace(params, userAinAddress);
  }
  if (type === 'editWorkspace') {
    return editWorkspace(params, userAinAddress);
  }
  if (type === 'getWorkspace') {
    return getWorkspace(params);
  }
  if (type === 'getNodepool') {
    return getNodepool(params);
  }
  if (type === 'runKubectlCommand') {
    return runKubectlCommand(params);
  }

  throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
}
