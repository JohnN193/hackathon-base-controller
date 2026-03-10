import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { RobotProvider } from "./context/RobotContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RobotProvider>
      <App />
    </RobotProvider>
  </StrictMode>
);
