import program from 'commander';
import { generateMnemonic } from 'bip39';
import * as fs from 'fs';
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
  try {
    let dockerAuth;
    if (constants.REGISTRY_SERVER && constants.REGISTRY_USERNAME && constants.REGISTRY_PASSWORD) {
      dockerAuth = {
        server: constants.REGISTRY_SERVER,
        password: constants.REGISTRY_PASSWORD,
        username: constants.REGISTRY_USERNAME,
      };
    }

    let mnemonic;
    if (!constants.MNEMONIC) {
      // Update Env File (Add AIN_PRIVATE_KEY and AIN_ADDRESS).
      mnemonic = generateMnemonic();
      const newEnv = {
        ...constants.envFileData,
        MNEMONIC: mnemonic,
      };
      fs.truncateSync(constants.ENV_PATH, 0);
      fs.appendFileSync(constants.ENV_PATH, JSON.stringify(newEnv, null, 2));
    }

    const worker = Worker.getInstance({
      clusterName: constants.CLUSTER_NAME as string,
      mnemonic: constants.MNEMONIC || mnemonic,
      dockerAuth,
    }, constants.NODE_ENV as Types.NODE_ENV);
    if (constants.IS_DOCKER && constants.IS_DOCKER.toLowerCase() === 'true') {
      await worker.startForDocker();
    } else {
      await worker.startForK8s();
    }
  } catch (err) {
    log.error(`[-] Failed to start Worker - ${JSON.stringify(err)}`);
  }
});

program.parse(process.argv);
