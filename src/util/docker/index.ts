import { Queue } from 'queue-typescript';
import Dockerode from 'dockerode';
import * as constants from '../../common/constants';

export default class Docker {
  private static instance: Docker;

  private containersDict: {[containerName: string]: {
    container?: Dockerode.Container, image?: string, status: boolean}};

  private streamDict: {[containerName: string]: {stream: any}};

  private imagesDict: {[imageName: string]: number};

  private removeImageQueue: Queue<string>;

  private dockerode: Dockerode;

  private authInfo: Object;

  private constructor(dockerode: Dockerode) {
    this.containersDict = {};
    this.streamDict = {};
    this.imagesDict = {};
    this.removeImageQueue = new Queue<string>();
    this.dockerode = dockerode;

    if (constants.REGISTRY_USERNAME && constants.REGISTRY_PASSWORD && constants.REGISTRY_SERVER) {
      this.authInfo = {
        username: constants.REGISTRY_USERNAME,
        password: constants.REGISTRY_PASSWORD,
        serveraddress: constants.REGISTRY_SERVER,
      };
    }
  }

  static getInstance(): Docker {
    if (!Docker.instance) {
      const dockerode = new Dockerode({ socketPath: '/var/run/docker.sock' });
      Docker.instance = new Docker(dockerode);
    }
    return Docker.instance;
  }

  /**
   * runs docker container.
   * @param name - container unique name.
   * @param image - docker image
   * @param device - GPU Device Number
   * @param externalPort - external Port
   * @param internalPost - internal Post
   * @returns Promise<number>
   */
  async run(name: string, image: string, env?: {[key: string]: string},
    command?: string[], netHost: boolean = false,
    publishPorts?: { [externalPort: string]: string }) {
    // Assemble the create option
    this.containersDict[name] = { status: true };
    const Env = [];
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        Env.push(`${key}=${value}`);
      }
    }
    try {
      const createOption = {
        name,
        ExposedPorts: {},
        Env,
        Cmd: command,
        Image: image,
        HostConfig: {
          PortBindings: {},
          Binds: [],
          NetworkMode: (netHost) ? 'host' : undefined,
        },
      };

      if (publishPorts) {
        for (const [externalPort, internalPort] of Object.entries(publishPorts)) {
          createOption.ExposedPorts[`${internalPort}/tcp`] = {};
          createOption.HostConfig.PortBindings[`${internalPort}/tcp`] = [{ HostPort: externalPort }];
        }
      }

      const status = await this.autoPull(name, image)
        .catch(() => 500);
      if (status !== 0) throw new Error('Failed to pull image.');

      const container = await this.dockerode.createContainer(
        JSON.parse(JSON.stringify(createOption)),
      )
        .catch((err) => {
          throw new Error(`Failed to create container. ${err.message}`);
        });
      await container.start()
        .catch(async (err) => {
          await container.remove({ force: true });
          throw new Error(`Failed to create container.  ${err.message}`);
        });

      /*
        If It call kill method while run docker container
        then remove conainer that was made now.
      */
      if (!this.containersDict[name].status) {
        await container.remove({ force: true });
        delete this.containersDict[name];
        throw new Error('Terminate Request');
      }

      this.containersDict[name].container = container;
      this.containersDict[name].image = image;
      if (this.imagesDict[image]) {
        this.imagesDict[image] += 1;
      }
    } catch (err) {
      delete this.containersDict[name];
      throw new Error(err.message);
    }
  }

  /**
   * kills docker container.
   * @param name - container unique name.
   * @returns Promise<number>
   */
  async kill(name: string) {
    this.containersDict[name].status = false;
    // when pull image.
    if (this.streamDict[name]) {
      await this.streamDict[name].stream.destroy();
      delete this.streamDict[name];
    } else {
      const { container } = this.containersDict[name];
      const img = this.containersDict[name].image;
      if (container instanceof Dockerode.Container) {
        await container.remove({ force: true });
      }

      if (img && this.imagesDict[img]) {
        this.imagesDict[img] -= 1;
        if (this.imagesDict[img] === 0) {
          this.removeImageQueue.enqueue(img);
        }
      }
      delete this.containersDict[name];
    }
  }

  setContainerInfo = async (name: string) => {
    const containerHandler = this.dockerode.getContainer(name);
    const result = await containerHandler.inspect();
    this.containersDict[name] = {
      status: true,
      image: result.Image,
      container: containerHandler,
    };
  }

  getContainerInfo = async (name: string) => {
    const containerHandler = this.dockerode.getContainer(name);
    const result = await containerHandler.inspect();
    return {
      image: result.Config.Image,
      status: result.State.Status,
    };
  }

  getAllContainerInfo = async () => {
    const containerInfoList = {};
    for (const name of Object.keys(this.containersDict)) {
      try {
        const containerHandler = this.dockerode.getContainer(name);
        const result = await containerHandler.inspect();
        containerInfoList[name] = {
          image: result.Config.Image,
          status: result.State.Status,
        };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err);
      }
    }
    return containerInfoList;
  }

  /**
   * pulls docker image after check image.
   * @param name - container unique name.
   * @param image - docker image
   * @returns Promise<number>
   */
  async autoPull(name: string, image: string): Promise<number> {
    const resultCheck = await this.dockerode.getImage(image).inspect()
      .catch((error) => error);
    if (!resultCheck.statusCode) return 0;

    let status = await this.autoRemoveImage();
    if (status !== 0) return status;
    status = await this.pullImage(name, image);
    if (status === 0) this.imagesDict[image] = 0;
    delete this.streamDict[name];
    return (this.containersDict[name].status) ? status : -1;
  }

  /**
   * pulls image.
   * @param name - container unique name.
   * @param image - docker image
   * @returns Promise<number>
   */
  async pullImage(name: string, image: string): Promise<number> {
    if (image.split(':').length === 1) {
      image += ':latest';
    }
    return new Promise<number>((resolve, reject) => {
      this.dockerode.pull(image, { authconfig: this.authInfo }, async (err: any, stream: any) => {
        if (!this.containersDict[name].status) {
          await stream.destroy();
          resolve(-1);
        }
        this.streamDict[name] = { stream };
        function onFinished() {
          if (err) {
            resolve(103);
          } else {
            resolve(0);
          }
        }
        if (err) {
          resolve(103);
        } else {
          await this.dockerode.modem.followProgress(stream, onFinished);
        }
      });
    });
  }

  /**
   * removes image after check image.
   * @returns Promise<number>
   */
  async autoRemoveImage(): Promise<number> {
    if (Object.keys(this.imagesDict).length <= constants.MAX_IMAGE_COUNT) {
      return 0;
    }

    let status = 500;
    while (this.removeImageQueue.length) {
      if (status !== 0) {
        const image = this.removeImageQueue.dequeue();
        if (this.imagesDict[image] === 0) {
          const imageController = this.dockerode.getImage(image);
          status = await imageController.remove()
            .then(() => 0)
            .catch((_) => 102);
          delete this.imagesDict[image];
        }
      } else {
        break;
      }
    }
    return status;
  }

  /**
   * cleans all docker containers.
   */
  async imageClean(): Promise<number> {
    try {
      const imageRemovePromise: Array<Promise<number>> = [];

      // remove all docker images
      const images = Object.keys(this.imagesDict);
      images.forEach((image) => {
        const imageController = this.dockerode.getImage(image);
        imageRemovePromise.push(imageController.remove());
      });
      await Promise.all(imageRemovePromise);
      return 0;
    } catch (e) {
      return e.statusCode;
    }
  }

  getContainersDict() {
    return { ...this.containersDict };
  }

  getContainerCnt() {
    return Object.keys(this.containersDict).length;
  }

  getImagesDict() {
    return { ...this.imagesDict };
  }

  getRemoveImageQueue() {
    return this.removeImageQueue;
  }

  getDockerode() {
    return this.dockerode;
  }
}
