import React from "react";
import ReactDOM from "react-dom/client";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { ThemeProvider } from "next-themes";
import { listen } from "@tauri-apps/api/event";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import App from "./App";
import "./App.css";
import { perfLog } from "@/lib/perf";

const diffWorkerPoolSize = 4;

// ---- perf instrumentation boot ------------------------------------------
// One-time environment facts: lets us correlate logs across reopens.
perfLog("boot", "env", {
  userAgent: navigator.userAgent,
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: (navigator as unknown as { deviceMemory?: number })
    .deviceMemory,
  viewport: { w: window.innerWidth, h: window.innerHeight },
  mode: import.meta.env.MODE,
});

// Mirror backend perf:log events into the web console so a single copy/paste
// captures both layers.
void listen<Record<string, unknown>>("perf:log", (event) => {
  const payload = event.payload ?? {};
  const { op, ...rest } = payload as { op?: string } & Record<string, unknown>;
  perfLog("rust", op ?? "event", rest);
});
// -------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        poolSize: diffWorkerPoolSize,
      }}
      highlighterOptions={{}}
    >
      <ThemeProvider attribute="class" defaultTheme="system">
        <App />
      </ThemeProvider>
    </WorkerPoolContextProvider>
  </React.StrictMode>,
);
