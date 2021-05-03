
if [ "prod" = "$NODE_ENV" ]; then
  echo "prod Build + Push"
  docker build -t ainblockchain/ain-worker-base:$VERSION .
  docker push ainblockchain/ain-worker-base:$VERSION
  docker build -t ainblockchain/ain-worker-base:latest .
  docker push ainblockchain/ain-worker-base:latest
elif [ "staging" = "$NODE_ENV" ]; then
  echo "staging Build + Push"
  docker build -t ainblockchain/ain-worker-base-staging:$VERSION .
  docker push ainblockchain/ain-worker-base-staging:$VERSION
  docker build -t ainblockchain/ain-worker-base-staging:latest .
  docker push ainblockchain/ain-worker-base-staging:latest
fi