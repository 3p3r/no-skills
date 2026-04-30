import net from "node:net";

import { CliError } from "./errors.js";

export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

export async function isTcpEndpointReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function getFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Unable to determine free port")));
      }
    });
    server.once("error", reject);
  });
}

export async function allocatePorts(host: string, count: number): Promise<number[]> {
  const ports: number[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const port = await getFreePort(host);
      if (ports.includes(port)) {
        throw new CliError(`Duplicate port ${port} allocated — uniqueness guarantee violated`);
      }
      ports.push(port);
    }
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError(`Failed to allocate ${count} free ports on ${host}`);
  }
  return ports;
}
