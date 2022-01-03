import * as fs from "fs";

export const SHARED_PARH = `${process.env.HOME}/ain-worker/${process.env.NAME}`;
export const ENV_PATH = `${SHARED_PARH}/env.json`;

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
  CONTAINER_VCPU,
  CONTAINER_MEMORY_GB,
  CONTAINER_GPU_CNT,
  CONTAINER_STORAGE_GB,
  CONTAINER_ALLOW_PORT,
  GPU_DEVICE_NUMBER,
  REGISTRY_USERNAME,
  REGISTRY_PASSWORD,
  REGISTRY_SERVER,
  ROOT_DOMAIN,
  NODE_PORT_IP,
  GATEWAY_NAME,
  SLACK_WEBHOOK_URL,
  USE_FIREBASE,
} = env;

export const NETWORK_TYPE = process.env.NETWORK_TYPE || "MAINNET";

export const K8S_CONFIG_PATH =
  process.env.K8S_CONFIG_PATH || "/root/.kube/config";

export const LABEL_FOR_OWNER = "AinConnect.ownerAddress";
export const LABEL_FOR_AIN_CONNECT = "AinConnect.container";
export const LABEL_FOR_REQUEST_ID = "AinConnect.requestId";

export const CONTAINER_MAX_CNT = process.env.CONTAINER_MAX_CNT || 1;

export const validateConstants = () => {
  let checkData = {
    APP_NAME,
    NAME,
    ETH_ADDRESS,
    CONTAINER_VCPU,
    CONTAINER_MEMORY_GB,
    CONTAINER_STORAGE_GB,
  } as any;

  if (!NODE_PORT_IP) {
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
