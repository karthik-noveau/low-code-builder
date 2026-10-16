import { useEffect, useState } from "react";
import {
  initializeCloud,
  type Account,
  type CloudConfig,
} from "../cloud/client";

export function useSession() {
  const [session, setSession] = useState<{
    loading: boolean;
    config: CloudConfig;
    account?: Account;
    error: string;
  }>({ loading: true, config: { enabled: false }, error: "" });
  useEffect(() => {
    let active = true;
    initializeCloud()
      .then((result) => {
        if (active) setSession({ ...result, loading: false, error: "" });
      })
      .catch((error) => {
        if (active)
          setSession({
            loading: false,
            config: { enabled: false },
            error:
              error instanceof Error
                ? error.message
                : "Your workspace could not be reached.",
          });
      });
    return () => {
      active = false;
    };
  }, []);
  return session;
}
