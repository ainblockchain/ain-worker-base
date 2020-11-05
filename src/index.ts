import * as program from 'commander';
import * as Types from './common/types';
import * as constants from './common/constants';
import Logger from './common/logger';
import Worker from './manager/worker';
import * as K8sUtil from './util/k8s';
import * as DockerUtil from './util/docker';

export {
  Types, Worker, K8sUtil, DockerUtil,
};

const log = Logger.createLogger('index');

program.command('serve').action(async () => {
  if (!constants.validateConstants()) {
    log.error('[-] Invalid Constants');
    return;
  }
  log.info('[+] Start Worker.');
  try {
    let dockerAuth;
    if (constants.DOCKER_SERVER && constants.DOCKER_USERNAME && constants.DOCKER_PASSWORD) {
      dockerAuth = {
        server: constants.DOCKER_SERVER,
        password: constants.DOCKER_PASSWORD,
        username: constants.DOCKER_USERNAME,
      };
    }
    await Worker.getInstance({
      clusterName: constants.CLUSTER_NAME as string,
      mnemonic: constants.MNEMONIC as string,
      dockerAuth,
    }, constants.NODE_ENV as Types.NODE_ENV,
    constants.CONFIG_PATH as string, !!constants.TEST).start();
  } catch (err) {
    log.error(err);
  }
});

program.parse(process.argv);
