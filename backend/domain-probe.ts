import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import type { DomainRecord } from "./domains";

export function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function probeDomain(
  domain: Pick<DomainRecord, "hostname" | "siteId" | "id">,
) {
  try {
    const addresses = await new Resolver({ timeout: 2000, tries: 1 }).resolve4(
      domain.hostname,
    );
    if (!addresses.length || addresses.some((address) => !publicIpv4(address)))
      return false;
    // Pin a validated public IP for the request. No redirects, DNS rebinding, credentials, or user-supplied paths.
    return await new Promise<boolean>((resolve) => {
      const req = request(
        {
          hostname: addresses[0],
          servername: domain.hostname,
          port: 443,
          path: "/.well-known/forma-domain",
          method: "GET",
          headers: {
            Host: domain.hostname,
            "User-Agent": "Forma-Domain-Check/1.0",
          },
          timeout: 5000,
          rejectUnauthorized: true,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            resolve(false);
            return;
          }
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
            if (body.length > 2048) {
              res.destroy();
              resolve(false);
            }
          });
          res.on("error", () => resolve(false));
          res.on("end", () => {
            try {
              const proof = JSON.parse(body);
              resolve(
                proof.siteId === domain.siteId &&
                  proof.connectionId === domain.id &&
                  proof.hostname === domain.hostname,
              );
            } catch {
              resolve(false);
            }
          });
        },
      );
      const deadline = setTimeout(() => {
        req.destroy();
        resolve(false);
      }, 5500);
      req.on("close", () => clearTimeout(deadline));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
      req.end();
    });
  } catch {
    return false;
  }
}
