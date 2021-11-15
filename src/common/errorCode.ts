/**
 * @TODO statusCode 와 errMessage 정리 및 적용.
 */
enum ErrorDetailCode {
  FUNCTION_NOT_EXIST = "Function Not Exist",
  FAILED_IMAGE_PULL = "Failed to Pull Docker Image",
  EXCEED_CONTAINER_LIMIT = "exceed Container Limit",
  EXCEED_CONTAINER_PORT = "exceed Container Port",
  CONTAINER_ALREADY_EXISTS = "Container Already Exist",
  CONTAINER_NOT_EXIST = "Container Not Exist",
  CONTAINER_NOT_STARTED = "Container Not Started",
  GPU_NOT_SUPPORTED = "GPU Not Supported",
  NOT_ENOUGH_VCPU = "Not Enough CPU Core",
  INVALID_GPU_DEVICE = "Invalid GPU Device",
  INVALID_PARAMS = "Invalid Params",
  FAILED_GET_WORKSPACE = "Failed to Get Workspace",
  CAN_NOT_ALLOW = "Can Not Allow",
}

export default ErrorDetailCode;
