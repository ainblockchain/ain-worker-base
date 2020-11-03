import * as program from 'commander';
import * as Types from './common/types';
import * as constants from './common/constants';
import Logger from './common/logger';
import Error from './common/error';
import Worker from './manager/worker';
import * as K8sUtil from './util/k8s';
import * as DockerUtil from './util/docker';

export {
  Types, Error, Worker, K8sUtil, DockerUtil,
};

const log = Logger.createLogger('index');

program.command('serve').action(async () => {
  if (!constants.validateConstants()) {
    log.error('[-] Invalid Constants');
    return;
  }
  log.info('[+] Start Worker.');
});

program.parse(process.argv);
