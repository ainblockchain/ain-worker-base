import * as ConnectSdk from "@ainblockchain/connect-sdk";
import * as fs from "fs";
import { customAlphabet } from "nanoid";
import * as types from "../common/types";
import * as constants from "../common/constants";
import Docker from "../util/docker";
import { ErrorCode, CustomError } from "../common/error";

function getRandomRequestId() {
  const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 25);
  return `r${nanoid()}`;
}

export async function getAllContainerInfo() {
  const containerList = await Docker.getInstance().getContainerInfosByLabel(
    `${constants.LABEL_FOR_AIN_CONNECT}=container`
  );
  const containerInfos: { [containerId: string]: types.DetailContainerInfo } =
    {};
  for (const container of containerList) {
    const containerId = container.Names[0].replace("/", "");
    containerInfos[containerId] = {
      status: container.State,
      serviceStatus: container.serviceStatus,
      imagePath: container.Image,
      requestId: container.Labels[constants.LABEL_FOR_REQUEST_ID],
      userAinAddress: container.Labels[constants.LABEL_FOR_OWNER],
      existInputMount:
        !!container.Labels[constants.ENV_KEY_FOR_INPUT_DATA_PATH],
      existOutputMount:
        !!container.Labels[constants.ENV_KEY_FOR_OUTPUT_DATA_PATH],
      uploadFileName:
        container.Labels[constants.LABEL_KEY_FOR_UPLOAD_FILE_NAME],
    };
    if (container.State === "exited") {
      const containerDetail = await Docker.getInstance().getContainerInfo(
        containerId
      );
      containerInfos[containerId] = {
        ...containerInfos[containerId],
        exitCode: containerDetail.State.ExitCode,
      };
    }
  }
  return containerInfos;
}

async function createContainer(
  params: types.CreateContainer,
  userAinAddress: string,
  requestId: string,
  storageSdk?: ConnectSdk.Storage
) {
  const containerId = getRandomRequestId();
  const { ports, envs, command, imagePath, downloadFileRef, uploadFileName } =
    params;
  if (!constants.NODE_PORT_IP && ports) {
    throw new CustomError(ErrorCode.NOT_SUPPORTED, "ENDPOINT Not Supported");
  }

  const rootPath = `${constants.SHARED_PATH}/${requestId}`;
  if (downloadFileRef || uploadFileName) {
    if (!storageSdk) {
      throw new CustomError(
        ErrorCode.NOT_SUPPORTED,
        "Storage GPU Not Supported"
      );
    }
    fs.mkdirSync(rootPath, { recursive: true });
  }

  const portToService = {};
  const paramsPorts: number[] = [];
  for (const serviceName in ports) {
    if (Object.prototype.hasOwnProperty.call(ports, serviceName)) {
      const portNumber = ports[serviceName];
      portToService[portNumber] = serviceName;
      paramsPorts.push(portNumber);
    }
  }
  const newEnv = {};
  const newlabel = {};
  if (downloadFileRef) {
    newEnv[constants.ENV_KEY_FOR_INPUT_DATA_PATH] =
      constants.ENV_DEFAULT_VALUE_FOR_INPUT_DATA_PATH;
    newlabel[constants.ENV_KEY_FOR_INPUT_DATA_PATH] =
      constants.ENV_DEFAULT_VALUE_FOR_INPUT_DATA_PATH;

    await storageSdk!.downloadFile(downloadFileRef, `${rootPath}/input`);
  }
  if (uploadFileName) {
    newEnv[
      constants.ENV_KEY_FOR_OUTPUT_DATA_PATH
    ] = `${constants.CONTAINER_ROOT_PATH}/${uploadFileName}`;
    newlabel[
      constants.ENV_KEY_FOR_OUTPUT_DATA_PATH
    ] = `${constants.CONTAINER_ROOT_PATH}/${uploadFileName}`;
    newlabel[constants.LABEL_KEY_FOR_UPLOAD_FILE_NAME] = uploadFileName;
  }

  const result = await Docker.getInstance().run({
    ports: paramsPorts,
    containerId,
    command,
    envs: {
      ...envs,
      ...newEnv,
    },
    imagePath,
    resourceLimit: {
      vcpu: Number(constants.CONTAINER_VCPU),
      memoryGB: Number(constants.CONTAINER_MEMORY_GB),
      gpuCnt: Number(constants.CONTAINER_GPU_CNT),
    },
    labels: {
      ...params.labels,
      [constants.LABEL_FOR_OWNER]: userAinAddress,
      [constants.LABEL_FOR_AIN_CONNECT]: "container",
      [constants.LABEL_FOR_REQUEST_ID]: requestId,
      [constants.ENV_KEY_FOR_JSON_LOG_FILE_PATH]:
        constants.ENV_DEFAULT_VALUE_FOR_JSON_LOG_FILE_PATH,
      ...newlabel,
    },
    binds: [`${rootPath}:${constants.CONTAINER_ROOT_PATH}`],
  });
  if (Object.keys(result.publishPorts).length === 0) {
    return {
      containerId,
    };
  }

  const endpoint = {};
  Object.entries(result.publishPorts).forEach(
    ([externalPort, internalPort]) => {
      endpoint[
        portToService[internalPort]
      ] = `${constants.NODE_PORT_IP}:${externalPort}`;
    }
  );

  return {
    containerId,
    endpoint,
  };
}

async function deleteContainer(
  params: types.DeleteContainer,
  userAinAddress: string
) {
  const requestId = await Docker.getInstance().kill(params.containerId, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });

  return {
    containerId: params.containerId,
    status: "terminated",
    terminatedAt: Date.now(),
    createRequestId: requestId,
  };
}
export { createContainer, deleteContainer };
