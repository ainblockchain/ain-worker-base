import * as types from '../../common/types';

export default class Template {
  /**
   * Get Namespace Template.
   * @param name: Namespace Name.
   * @param labels.
  */
  static getNamespace(name: string, labels?: {[key: string]: string}) {
    const templateJson = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name,
        labels,
      },
    };
    return templateJson;
  }

  /**
   * Only One Container.
  */
  static getDeployment(name: string, namespace: string,
    containerSpec: types.ContainerSpec, config: types.DeploymentCreateConfig) {
    const templateJson = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        namespace,
        labels: {
          ...config.labels, app: name, templateVersion: '1',
        },
        name,
      },
      spec: {
        replicas: config.replicas || 1,
        selector: { matchLabels: { ...config.labels, app: name } },
        template: {
          metadata: { labels: { ...config.labels, app: name } },
          spec: {
            nodeSelector: config.nodePoolLabel || {},
            containers: [
              {
                image: containerSpec.imagePath,
                imagePullPolicy: 'Always',
                name,
                ports: [] as Object[],
                volumeMounts: [] as Object[],
                env: [] as Object[],
                securityContext: {
                  privileged: !!(config.privileged),
                },
                resources: {
                  requests: containerSpec.resourceLimits,
                  limits: containerSpec.resourceLimits,
                },
              },
            ],
            imagePullSecrets: [] as Object[],
            volumes: [] as Object[],
          },
        },
      },
    };

    if (containerSpec.env) {
      for (const [envName, value] of Object.entries(containerSpec.env)) {
        templateJson.spec.template.spec.containers[0].env.push({
          name: envName,
          value,
        });
      }
    }

    if (containerSpec.ports) {
      for (const port of containerSpec.ports) {
        templateJson.spec.template.spec.containers[0].ports.push({
          containerPort: port,
        });
      }
    }

    if (config.imagePullSecretName) {
      templateJson.spec.template.spec.imagePullSecrets.push({
        name: config.imagePullSecretName,
      });
    }

    if (config.storageSpec) {
      for (const [storageId, storageSpec] of Object.entries(config.storageSpec)) {
        templateJson.spec.template.spec.volumes.push({
          name: storageId,
          persistentVolumeClaim: { claimName: storageId },
        });

        templateJson.spec.template.spec.containers[0].volumeMounts.push(JSON.parse(JSON.stringify({
          name: storageId,
          mountPath: storageSpec.mountPath,
          readOnly: !!(storageSpec.readOnly),
          subPath: storageSpec.subPath,
        })));
      }
    }

    if (config.secretSpec) {
      for (const [secretId, secretSpec] of Object.entries(config.secretSpec)) {
        templateJson.spec.template.spec.volumes.push({
          name: secretId,
          secret: {
            secretName: secretId,
          },
        });
        templateJson.spec.template.spec.containers[0].volumeMounts.push({
          name: secretId,
          mountPath: secretSpec.mountPath,
          defaultMode: '256',
        });
      }
    }
    return templateJson;
  }

  /**
   * Get Service Template.
   * @param name: Service Name.
   * @param namespace: Namespace Name.
   * @param ports: Port List that is internal Port and exteral Port.
   * @param labels: labels.
  */
  static getService(name: string, namespace: string,
    ports: number[], labels?: {[key: string]: string }, isNodePort?: boolean) {
    const templateJson = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        namespace,
        labels: {
          ...labels, app: name, templateVersion: '3',
        },
        name,
      },
      spec: {
        ports: [] as Object[],
        selector: { app: name },
      },
    };

    if (isNodePort) {
      templateJson.spec['type'] = 'NodePort';
    }

    for (const port of ports) {
      templateJson.spec.ports.push({ name: `http-tcp${port}`, port, targetPort: port });
    }

    return templateJson;
  }

  /**
   * Get VirtualService Template.
   * @param name: VirtualService Name.
   * @param namespace: Namespace Name.
   * @param endpoint: full Domain Name for Pod.
   * @param serviceName: k8s Service Name.
   * @param gateway: istio gateway Name.
   * @param port: It is Service extenal Port.
   * @param labels: labels.
  */
  static getVirtualService(
    name: string, namespace: string, serviceName: string,
    endpoint: string, gateway: string, port: number, labels?: {[key: string]: string },
  ) {
    const templateJson = {
      apiVersion: 'networking.istio.io/v1alpha3',
      kind: 'VirtualService',
      metadata: {
        name,
        namespace,
        labels: {
          ...labels, app: serviceName, templateVersion: '3',
        },
      },
      spec: {
        hosts: [endpoint],
        gateways: [gateway],
        http: [
          {
            route: [
              {
                destination: { host: serviceName, port: { number: port } },
              },
            ],
            headers: {
              request: {
                add: { 'x-forwarded-proto': 'https', 'x-forwarded-port': '443' },
              },
            },
            corsPolicy: {
              allowHeaders: ['x-access-token', 'authorization', 'content-type', 'Accept', 'Origin'],
              allowOrigin: ['*'],
              allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            },
          },
        ],
      },
    };

    return templateJson;
  }

  /**
   * Get PersistentVolume Template.
   * @param name: Storage Name.
   * @param capacity: Storage capacity (x GB).
   * @param config: Storage Config (Storage capacity ...).
  */
  static getPersistentVolume(
    name: string, config: types.StorageConfig,
  ) {
    const templateJson = JSON.parse(JSON.stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: {
        name,
        labels: { ...config.labels, app: name },
      },
      spec: {
        capacity: { storage: `${config.capacity}Gi` },
        accessModes: [config.accessModes],
        storageClassName: config.storageClassName,
        nfs: (config.nfsInfo) ? { ...config.nfsInfo } : undefined,
      },
    }));

    return templateJson;
  }

  /**
   * Get PersistentVolumeClaim Template.
   * @param name: Storage Name.
   * @param namespace: Namespace Name.
   * @param config: Storage Config (accessModes ...).
  */
  static getPersistentVolumeClaim(
    name: string, namespace: string, config: types.StorageConfig,
  ) {
    const templateJson = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        namespace,
        name,
        labels: { ...config.labels, app: name },
      },
      spec: {
        accessModes: [config.accessModes],
        resources: { requests: { storage: `${config.capacity}Gi` } },
      },
    };

    if (config.storageClassName !== '') {
      templateJson.spec['storageClassName'] = config.storageClassName;
    }

    return templateJson;
  }
}
