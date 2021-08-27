FROM node:12.16.1-alpine AS build

# Copy Worker Code.
RUN mkdir /worker
WORKDIR /worker
ADD yarn.lock /worker
ADD package.json /worker
ADD ./tsconfig.json /worker/tsconfig.json
RUN npm install 
RUN npm install -g typescript@3.9
ADD ./src /worker/src

WORKDIR /worker
RUN tsc

FROM node:12.16.1-slim

# install kubectl
RUN apt-get update
RUN apt-get install -y apt-transport-https ca-certificates curl
RUN curl -fsSLo /usr/share/keyrings/kubernetes-archive-keyring.gpg https://packages.cloud.google.com/apt/doc/apt-key.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://apt.kubernetes.io/ kubernetes-xenial main" | tee /etc/apt/sources.list.d/kubernetes.list
RUN apt-get update
RUN apt-get install -y kubectl
ENV PATH $PWD/bin:$PATH
RUN mkdir /root/.kube

# Install jq
RUN apt install -y jq

RUN mkdir /worker
WORKDIR /worker

ADD package.json /worker
ADD yarn.lock /worker
RUN npm install --only=prod
COPY --from=build /worker/dist /worker/dist

 
CMD ["node", "dist/index.js", "serve"]
