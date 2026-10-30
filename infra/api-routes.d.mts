export interface ApiRoute {
  /** CloudFormation logical ID; absent for local-only routes. */
  id?: string;
  /** API Gateway route key, e.g. "POST /store/{id}/cart". */
  route: string;
  auth: "jwt" | "none";
  /** Per-route throttle for public routes. */
  throttle?: { burst: number; rate: number };
  /** Why the route is served by the local server only. */
  localOnly?: string;
  /** Answered by backend/local.ts itself, before it calls api(). */
  outsideApi?: boolean;
}
export declare const apiRoutes: ApiRoute[];
export declare function matchRoute(
  method: string,
  path: string,
): ApiRoute | undefined;
