import * as util from 'util';
import * as fs from 'fs';
import childProcess from 'child_process';
import * as si from 'systeminformation';
import { generateMnemonic } from 'bip39';
import * as types from '../common/types';

export function createMnemonic() {
  return generateMnemonic();
}

export const exec = util.promisify(childProcess.exec);

export const fileExists = (filePath: string) => fs.existsSync(filePath);

export function replaceFileSync(filePath: string, value: any) {
  if (!fileExists(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    return;
  }
  fs.truncateSync(filePath, 0);
  fs.appendFileSync(filePath, JSON.stringify(value, null, 2));
}

export async function getGpuInfo(): Promise<types.GPUInfo> {
  try {
    const command = 'nvidia-smi --query-gpu=name,driver_version,memory.used,memory.total --format=csv,noheader';
    const { stdout } = await exec(command);
    const infoList = stdout.split('\n');
    infoList.pop();
    const result = {};
    let idx = 0;
    for (const info of infoList) {
      const dataList = info.split(',').map((item: string) => item.replace(' ', ''));
      result[String(idx)] = {
        gpuName: dataList[0],
        driverVersion: dataList[1],
        memoryUsed: Number(dataList[2]),
        memoryTotal: Number(dataList[3]),
      };
      idx += 1;
    }
    return result;
  } catch (_) {
    return {};
  }
}

export async function getCpuInfo() {
  const cpuInfo = await si.cpu();
  return cpuInfo;
}

export async function delay(ms: number) {
  const result = await new Promise((resolve) => setTimeout(resolve, ms));
  return result;
}
