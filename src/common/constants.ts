import * as fs from "fs";

export const SHARED_PATH = `${process.env.HOME}/ain-worker/${process.env.NAME}`;
export const ENV_PATH = `${SHARED_PATH}/env.json`;

export const envFileData = fs.existsSync(ENV_PATH)
  ? JSON.parse(String(fs.readFileSync(ENV_PATH)))
  : {};

// ENV File < ENV Variable
const env = {
  ...envFileData,
  ...process.env,
};

export const {
  APP_NAME,
  NAME,
  MNEMONIC,
  ETH_ADDRESS,
  MANAGED_BY,
  SERVICE_TYPE,
  SPEC_NAME,
  CONTAINER_GPU_CNT,
  CONTAINER_ALLOW_PORT,
  GPU_DEVICE_NUMBER,
  REGISTRY_USERNAME,
  REGISTRY_PASSWORD,
  REGISTRY_SERVER,
  ROOT_DOMAIN,
  NODE_PORT_IP,
  ENABLE_STORAGE,
  GATEWAY_NAME,
  SLACK_WEBHOOK_URL,
} = env;

export const NETWORK_TYPE = process.env.NETWORK_TYPE || "MAINNET";

export const K8S_CONFIG_PATH =
  process.env.K8S_CONFIG_PATH || "/root/.kube/config";

export const LABEL_FOR_OWNER = "AinConnect.ownerAddress";
export const LABEL_FOR_AIN_CONNECT = "AinConnect.container";
export const LABEL_FOR_REQUEST_ID = "AinConnect.requestId";
export const ENV_KEY_FOR_INPUT_DATA_PATH = "AinConnect.inputDataPath";
export const ENV_KEY_FOR_OUTPUT_DATA_PATH = "AinConnect.outputDataPath";
export const ENV_KEY_FOR_JSON_LOG_FILE_PATH = "AinConnect.jsonLogFilePath";
export const CONTAINER_ROOT_PATH = "/AinConnect";
export const ENV_DEFAULT_VALUE_FOR_INPUT_DATA_PATH = `${CONTAINER_ROOT_PATH}/input`;
export const ENV_DEFAULT_VALUE_FOR_JSON_LOG_FILE_PATH = `${CONTAINER_ROOT_PATH}/log.json`;
export const LABEL_KEY_FOR_UPLOAD_FILE_NAME = "AinConnect.uploadFileName";

export const CONTAINER_MAX_CNT = process.env.CONTAINER_MAX_CNT || 1;
export const CONTAINER_VCPU = process.env.CONTAINER_VCPU || 1;
export const CONTAINER_MEMORY_GB = process.env.CONTAINER_MAX_CNT || 4;
export const DISK_GB = process.env.CONTAINER_MAX_CNT || 50;

export const validateConstants = () => {
  let checkData = {
    APP_NAME,
    NAME,
  } as any;

  if (NODE_PORT_IP) {
    checkData = {
      ...checkData,
      CONTAINER_ALLOW_PORT,
    };
  }

  if (CONTAINER_GPU_CNT) {
    checkData = {
      ...checkData,
      GPU_DEVICE_NUMBER,
    };
  }

  const missingEnv = [];
  for (const [envName, envValue] of Object.entries(checkData)) {
    if (!envValue) {
      missingEnv.push(envName);
    }
  }
  if (missingEnv.length !== 0) {
    throw new Error(`${String(missingEnv)} Not Exists`);
  }

  if (!["MAINNET", "TESTNET", "DEVNET"].includes(NETWORK_TYPE)) {
    throw new Error(
      `Invalid NETWORK_TYPE [${NETWORK_TYPE} ("MAINNET" or "TESTNET" or "DEVNET")]`
    );
  }
};
