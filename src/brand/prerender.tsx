import { renderToString } from "react-dom/server";
import { PublicSite } from "./PublicSite";
export {
  metadataFor,
  publicPaths,
  privatePaths,
  previewPaths,
} from "./navigation";
export const renderPage = (path: string) =>
  renderToString(<PublicSite path={path} />);
