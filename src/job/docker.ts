import ErrorDetailCode from "../common/errorCode";
import * as types from "../common/types";
import * as constants from "../common/constants";
import Docker from "../util/docker";

export async function getAllContainerInfo() {
  /**
   * @TODO State.Health.Status 정보도 추가하기.
   */
  const containerList = await Docker.getInstance().getContainerInfosByLabel(
    `${constants.LABEL_FOR_AIN_CONNECT}=container`
  );
  const containerInfos = {};
  for (const container of containerList) {
    const containerId = container.Names[0].replace("/", "");
    const ports = container.Ports.map((Port) => Port.PublicPort);
    containerInfos[containerId] = {
      status: container.State,
      imagePath: container.Image,
      ports,
    };
    if (container.State === "exited") {
      /**
       * @TODO job 인지 deployment 인지 구분하고,
       * job 인 경우는 그냥 response 를 업데이트?
       * deployment 인 경우는 exit + exit Time 을 저장하고, exit 이 이미 있으면 한시간된 경우에 클리어 로직 추가?
       */
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
  type: string
) {
  /**
   * @TODO Port 를 number[] 에서 {[serviceName: string]: number} 로 수정하고,
   * containerInfo 에 해당 정보를 extenal port 로 변경해서 처리하기
   * endpoint 가 필요한 경우만 port 열기.
   */
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
      [constants.LABEL_FOR_AIN_CONNECT]: "container",
      [constants.LABEL_FOR_JOB_TYPE]: type,
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

async function deleteContainer(
  params: types.DeleteContainer,
  userAinAddress: string
) {
  await Docker.getInstance().kill(params.containerId, {
    [constants.LABEL_FOR_OWNER]: userAinAddress,
  });

  return {
    containerId: params.containerId,
    result: true,
  };
}

export default async function handler(
  type: string,
  method: string,
  params: any,
  userAinAddress: string
) {
  if (method === "createContainer") {
    return createContainer(params, userAinAddress, type);
  }
  if (method === "deleteContainer") {
    return deleteContainer(params, userAinAddress);
  }
  throw new Error(ErrorDetailCode.FUNCTION_NOT_EXIST);
}
