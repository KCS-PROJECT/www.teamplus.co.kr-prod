import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  private startTime = Date.now();

  getHello() {
    return {
      message: "Welcome to TEAMPLUS API",
      version: "1.0.0",
      docs: "/api/docs",
      environment: process.env.NODE_ENV || "development",
    };
  }

  getHealth() {
    const uptime = (Date.now() - this.startTime) / 1000;
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Number(uptime.toFixed(2)),
      environment: process.env.NODE_ENV || "development",
    };
  }
}
