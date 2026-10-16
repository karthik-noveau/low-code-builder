import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { startTheme } from "./design/theme";

// Before the first render, so the page never flashes the other theme.
startTheme();
import App from "./App.tsx";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
