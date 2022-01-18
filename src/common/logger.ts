import * as winston from "winston";
import moment from "moment-timezone";
import SlackHook from "winston-slack-webhook-transport";
import * as constants from "./constants";

const myFormat = winston.format.printf(
  ({ level, message, label, _timestamp }) =>
    `${moment().tz("Asia/Seoul").format()} [${label}] ${level}: ${message}`
);

const transports = constants.SLACK_WEBHOOK_URL
  ? [
      new winston.transports.Console({ level: "debug" }),
      new SlackHook({
        webhookUrl: constants.SLACK_WEBHOOK_URL,
        level: "info",
        formatter: (info) => ({
          attachments: [
            {
              pretext: "*Worker Monitoring*",
              color: info.level === "error" ? "#D00000" : "#2ad979",
              fields: [
                {
                  title: `${info.level} Message`,
                  value: `${moment().tz("Asia/Seoul").format()} [${
                    info.label
                  }] ${info.message}`,
                  short: false,
                },
              ],
            },
          ],
        }),
      }),
    ]
  : [new winston.transports.Console({ level: "debug" })];

export default class Logger {
  static createLogger(label: string): winston.Logger {
    return winston.createLogger({
      format: winston.format.combine(
        winston.format.label({ label }),
        winston.format.timestamp(),
        myFormat
      ),
      transports,
    });
  }
}
