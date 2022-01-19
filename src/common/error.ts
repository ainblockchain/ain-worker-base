enum ErrorCode {
  UNAUTHORIZED = 401,
  INVALID_PARAMS = 452,
  NOT_EXIST = 453,
  ALREADY_EXIST = 454,
  QUOTA_EXCEED = 457,
  UNEXPECTED = 500,
  NOT_IMPLEMENTED = 501,
  NOT_SUPPORTED = 502,
  FAIL_FOR_DOCKER = 503,
}

const Name = {
  [ErrorCode.UNAUTHORIZED]: "UNAUTHORIZED",
  [ErrorCode.INVALID_PARAMS]: "INVALID_PARAMS",
  [ErrorCode.NOT_EXIST]: "NOT_EXIST",
  [ErrorCode.ALREADY_EXIST]: "ALREADY_EXIST",
  [ErrorCode.NOT_IMPLEMENTED]: "NOT_IMPLEMENTED",
  [ErrorCode.QUOTA_EXCEED]: "QUOTA_EXCEED",
  [ErrorCode.UNEXPECTED]: "UNEXPECTED",
  [ErrorCode.NOT_SUPPORTED]: "NOT_SUPPORTED",
  [ErrorCode.FAIL_FOR_DOCKER]: "FAIL_FOR_DOCKER",
};

class CustomError extends Error {
  private statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }
    this.statusCode = statusCode;
    this.message = message;
    this.name = Name[this.statusCode];
  }
}

export { ErrorCode, CustomError, Name };
