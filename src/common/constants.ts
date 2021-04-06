import * as fs from 'fs';

export const ENV_PATH = './env.json';

const env = fs.existsSync(ENV_PATH) ? JSON.parse(String(fs.readFileSync(ENV_PATH))) : {};

export const {
  CLUSTER_NAME,
  MNEMONIC,
  DOCKER_USERNAME,
  DOCKER_PASSWORD,
  DOCKER_SERVER,
  IS_DOCKER,
  SLACK_WEBHOOK_URL,
} = env;
export const ENV = env;

export const CONFIG_PATH = './config.yaml';

export const FIREBASE_CONFIG_PATH = './firebase.json';

export const STORAGE_CLASS = env.STORAGE_CLASS || '';

export const NODE_ENV = env.NODE_ENV || 'prod';

export const error = {
  unauthorized: '2',
  invalidParams: '1',
  failed: '-1',
};

export const MAX_IMAGE_COUNT = 3;

export const validateConstants = () => {
  if (!['prod', 'staging'].includes(NODE_ENV || '') && CLUSTER_NAME !== '') {
    return false;
  }
  return true;
};
