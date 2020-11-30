export const {
  NODE_ENV,
  CLUSTER_NAME,
  MNEMONIC,
  DOCKER_USERNAME,
  DOCKER_PASSWORD,
  DOCKER_SERVER,
  CONFIG_PATH,
  TEST,
  IS_DOCKER,
  FIREBASE_CONFIG_PATH,
} = process.env;

export const STORAGE_CLASS = process.env.STORAGE_CLASS || '';

export const error = {
  unauthorized: '2',
  invalidParams: '1',
  failed: '-1',
};

export const MAX_IMAGE_COUNT = 3;

export const validateConstants = () => {
  if (!['prod', 'staging'].includes(NODE_ENV || '') && CLUSTER_NAME !== ''
  && !MNEMONIC && (!CONFIG_PATH && IS_DOCKER !== 'true')) {
    return false;
  }
  return true;
};
