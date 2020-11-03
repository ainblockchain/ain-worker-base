import * as types from '../../common/types';

export default class Template {
  /**
   * Get Namespace Template.
   * @params name: Namespace Name.
   * @params labels.
  */
  static getNamespace(name: string, labels: {[key: string]: string}) {
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

    if (config.storageSpecs) {
      for (const [storageId, storageSpec] of Object.entries(config.storageSpecs)) {
        templateJson.spec.template.spec.volumes.push({
          name: storageId,
          persistentVolumeClaim: { claimName: storageId },
        });
        templateJson.spec.template.spec.containers[0].volumeMounts.push({
          name: storageId,
          mountPath: storageSpec.mountPath,
        });
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
   * @params name: Service Name.
   * @params namespace: Namespace Name.
   * @params ports: Port List that is internal Port and exteral Port.
   * @params labels: labels.
  */
  static getService(name: string, namespace: string,
    ports: number[], labels?: {[key: string]: string }) {
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

    for (const port of ports) {
      templateJson.spec.ports.push({ name: `http${port}`, port, targetPort: port });
    }

    return templateJson;
  }

  /**
   * Get VirtualService Template.
   * @params name: VirtualService Name.
   * @params namespace: Namespace Name.
   * @params endpoint: full Domain Name for Pod.
   * @params serviceName: k8s Service Name.
   * @params gateway: istio gateway Name.
   * @params port: It is Service extenal Port.
   * @params labels: labels.
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
          ...labels, app: name, templateVersion: '3',
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
              allowHeaders: ['x-access-token'],
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
   * @params name: Storage Name.
   * @params capacity: Storage capacity (x GB).
   * @params config: Storage Config (Storage capacity ...).
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
   * @params name: Storage Name.
   * @params namespace: Namespace Name.
   * @params config: Storage Config (accessModes ...).
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
        storageClassName: config.storageClassName,
      },
    };

    return templateJson;
  }
}
