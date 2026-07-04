// src/logger.js
import winston from "winston";

function createLogger(context) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(
        ({ timestamp, level, message }) =>
          `${timestamp} [${level.toUpperCase()}] [${context}]: ${message}`
      )
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        filename: "logs/app.log",
        level: process.env.FILE_LOG_LEVEL || "info",
      }),
    ],
    exceptionHandlers: [
      new winston.transports.File({ filename: "logs/exceptions.log" }),
    ],
    rejectionHandlers: [
      new winston.transports.File({ filename: "logs/rejections.log" }),
    ],
  });
}

// Export a factory so each module can get its own logger
export default createLogger;
