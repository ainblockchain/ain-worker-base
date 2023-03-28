#!/bin/bash

echo "
apiVersion: v1
kind: ServiceAccount
metadata:
  name: worker-account
  namespace: default
---
apiVersion: v1
kind: Secret
metadata:
  name: worker-account-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: worker-account
type: kubernetes.io/service-account-token
" > service_account.yaml
kubectl create -f service_account.yaml
rm service_account.yaml

#secrets=$(kubectl get ServiceAccount worker-account  -o jsonpath='{.secrets[0].name}')
token=$(kubectl get secrets worker-account-token -o jsonpath='{.data.token}' -n default | base64 --decode)
cluster_name=$(kubectl config current-context)
echo $cluster_name
certificate=$(kubectl config view --flatten -o jsonpath="{.clusters[?(@.name == '$cluster_name')].cluster.certificate-authority-data}")
server_ip=$(kubectl config view --flatten -o jsonpath="{.clusters[?(@.name == '$cluster_name')].cluster.server}")

echo "
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: worker-role
rules:
- apiGroups:
  - '*'
  resources:
  - '*'
  verbs:
  - '*'
- nonResourceURLs:
  - '*'
  verbs:
  - '*'
" > role.yaml
kubectl apply -f role.yaml
rm role.yaml

echo "
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: worker-role-binding
subjects:
- kind: ServiceAccount
  name: worker-account
  namespace: default
  apiGroup: ""
roleRef:
  kind: ClusterRole
  name: worker-role
  apiGroup: rbac.authorization.k8s.io
" > role_binding.yaml
kubectl apply -f role_binding.yaml
rm role_binding.yaml

echo "
apiVersion: v1
kind: Config
users:
- name: worker-account
  user:
    token: ${token}
clusters:
- cluster:
    certificate-authority-data: $certificate
    server: ${server_ip}
  name: ${cluster_name}
contexts:
- context:
    cluster: ${cluster_name}
    user: worker-account
  name: worker-account-context
current-context: worker-account-context
" > config.yaml