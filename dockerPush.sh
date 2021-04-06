
if [ "prod" = "$NODE_ENV" ]; then
  echo "prod Build + Push"
  sudo docker build -t ainblockchain/ain-worker-base:$VERSION .
  sudo docker push ainblockchain/ain-worker-base:$VERSION
  sudo docker build -t ainblockchain/ain-worker-base:latest .
  sudo docker push ainblockchain/ain-worker-base:latest
elif [ "staging" = "$NODE_ENV" ]; then
  echo "staging Build + Push"
  sudo docker build -t ainblockchain/ain-worker-base-staging:$VERSION .
  sudo docker push ainblockchain/ain-worker-base-staging:$VERSION
  sudo docker build -t ainblockchain/ain-worker-base-staging:latest .
  sudo docker push ainblockchain/ain-worker-base-staging:latest
fi