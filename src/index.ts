import program from "commander";
import * as constants from "./common/constants";
import Logger from "./common/logger";
import Worker from "./worker";
import { replaceFileSync, createMnemonic } from "./util/utils";

const log = Logger.createLogger("/index");

program.command("serve").action(async () => {
  try {
    constants.validateConstants();
    let mnemonic = constants.MNEMONIC;
    if (!mnemonic) {
      // If the mnemonic does not exist, it is created and saved in the env file.
      mnemonic = createMnemonic();
      const newEnv = {
        ...constants.envFileData,
        MNEMONIC: mnemonic,
      };
      replaceFileSync(constants.ENV_PATH, newEnv);
    }
    const worker = Worker.getInstance(mnemonic);
    await worker.init();
    await worker.start();
  } catch (err) {
    log.error(`[-] Failed to Start - ${err.message}`);
    process.exit(1);
  }
});

program.parse(process.argv);
