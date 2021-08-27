import * as ConnectSdk from '@aindev/connect-sdk';
import { FIREBASE_CONFIG, NODE_ENV } from '../common/constants';

const { mnemonic, targetAddress, clusterName } = process.env;

// Example.
async function main() {
  const client = new ConnectSdk.Client(mnemonic!, NODE_ENV as 'staging' | 'prod', FIREBASE_CONFIG);
  try {
    const res = await client.runCommand({
      targetAddress: targetAddress!,
      clusterName: clusterName!,
      cmd: 'get pod -A',
    });
    // eslint-disable-next-line no-console
    console.log(res.result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
  }
  process.exit(0);
}
main();
