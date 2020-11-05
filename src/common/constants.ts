export const {
  NODE_ENV,
  CLUSTER_NAME,
  MNEMONIC,
  DOCKER_USERNAME,
  DOCKER_PASSWORD,
  DOCKER_SERVER,
  CONFIG_PATH,
  TEST,
} = process.env;

export const error = {
  unauthorized: '2',
  invalidParams: '1',
  failed: '-1',
};

export const validateConstants = () => {
  if (!['prod', 'staging'].includes(NODE_ENV || '') && CLUSTER_NAME !== ''
  && !MNEMONIC && !CONFIG_PATH) {
    return false;
  }
  return true;
};
