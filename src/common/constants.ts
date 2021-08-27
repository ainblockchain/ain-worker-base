import * as fs from 'fs';

export const ENV_PATH = './env.json';
export const FIREBASE_CONFIG_PATH = './firebase.json';

export const envFileData = fs.existsSync(ENV_PATH)
  ? JSON.parse(String(fs.readFileSync(ENV_PATH))) : {};

const env = {
  ...envFileData,
  ...process.env,
};

export const {
  CLUSTER_NAME,
  MNEMONIC,
  REGISTRY_USERNAME,
  REGISTRY_PASSWORD,
  REGISTRY_SERVER,
  IS_DOCKER,
  SLACK_WEBHOOK_URL,
  NODE_PORT_IP,
  GATEWAY_NAME,
  STORAGE_CLASS,
} = env;

export const NODE_ENV = process.env.NODE_ENV || 'prod';

export const FIREBASE_CONFIG = fs.existsSync(FIREBASE_CONFIG_PATH)
  ? JSON.parse(String(fs.readFileSync(FIREBASE_CONFIG_PATH))) : {};

export const error = {
  unauthorized: '2',
  invalidParams: '1',
  failed: '-1',
};

export const MAX_IMAGE_COUNT = 3;

export const validateConstants = () => {
  if (!CLUSTER_NAME
    || (!['prod', 'staging'].includes(NODE_ENV || '') && CLUSTER_NAME !== '')) {
    return false;
  }
  if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
    return false;
  }
  return true;
};
