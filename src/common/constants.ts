import * as fs from 'fs';

export const ENV_PATH = './env.json';

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

export const FIREBASE_CONFIG = (NODE_ENV === 'staging') ? {
  apiKey: 'AIzaSyDa6-Muw27_oczpCHOe8kVAZzuQ5BgCkS4',
  authDomain: 'ain-connect-api-server-dev.firebaseapp.com',
  databaseURL: 'https://ain-connect-api-server-dev.firebaseio.com',
  projectId: 'ain-connect-api-server-dev',
  storageBucket: 'ain-connect-api-server-dev.appspot.com',
  messagingSenderId: '799118803554',
  appId: '1:799118803554:web:508677f48e6bdf5e5b473b',
  measurementId: 'G-9DZCTCN5FH',
} : {
  apiKey: 'AIzaSyDsYGMurjKosgDisnXN5PkPDB8hb34qXDc',
  authDomain: 'ain-connect-api-server.firebaseapp.com',
  databaseURL: 'https://ain-connect-api-server.firebaseio.com',
  projectId: 'ain-connect-api-server',
  storageBucket: 'ain-connect-api-server.appspot.com',
  messagingSenderId: '992952534673',
  appId: '1:992952534673:web:82d9f7b070d70506066130',
  measurementId: 'G-ZZWBE57SGE',
};

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
  return true;
};
