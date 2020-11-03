export const {
  NODE_ENV,
} = process.env;

export const validateConstants = () => {
  if (!NODE_ENV) {
    return false;
  }
  return true;
};
