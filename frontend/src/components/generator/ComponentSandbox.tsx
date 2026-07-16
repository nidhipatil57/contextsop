import React, { useEffect, useRef, useState } from "react";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";

interface ComponentSandboxProps {
  code: string;
  onCompileError?: (msg: string | null) => void;
}

export default function ComponentSandbox({ code, onCompileError }: ComponentSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HTML template loaded inside the sandboxed iframe
  const srcDoc = `
    <!DOCTYPE html>
    <html class="dark">
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'self' https: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; object-src 'none'; font-src https: data:;">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
      <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      <script src="https://unpkg.com/lucide@latest"></script>
      <script>
        tailwind.config = {
          darkMode: 'class',
          theme: {
            extend: {
              colors: {
                border: '#1e293b',
                background: '#070f19',
                foreground: '#edf6ff',
              }
            }
          }
        }
      </script>
      <style>
        body {
          margin: 0;
          padding: 16px;
          background-color: transparent;
          color: #edf6ff;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
      </style>
    </head>
    <body class="dark bg-transparent">
      <div id="root"></div>
      <script type="text/babel">
        // Setup Error Boundary inside the sandboxed environment
        class ErrorBoundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
          }
          static getDerivedStateFromError(error) {
            return { hasError: true, error };
          }
          componentDidCatch(error) {
            window.parent.postMessage({ type: 'error', message: error.message }, '*');
          }
          render() {
            if (this.state.hasError) {
              return (
                <div style={{
                  padding: '16px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  color: '#f87171',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontFamily: 'monospace'
                }}>
                  <h3 style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>Runtime Execution Error</h3>
                  <p style={{ margin: 0 }}>{this.state.error ? this.state.error.message : 'Unknown exception'}</p>
                </div>
              );
            }
            return this.props.children;
          }
        }

        // Compile and run the code
        const renderCode = (rawCode) => {
          try {
            // Strip import statements since UMD dependencies are loaded globally
            const stripped = rawCode
              .replace(/import\\s+.*?\\s+from\\s+['"].*?['"];?/g, '')
              .replace(/export\\s+default\\s+/, 'const ComponentToRender = ')
              .trim();
            
            // Compile TSX to JS
            const compiled = Babel.transform(
              \`\${stripped}\\nReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><ComponentToRender /></ErrorBoundary>);\`,
              { presets: ['react'] }
            ).code;

            // Clear previous contents
            document.getElementById('root').innerHTML = '';
            
            // Execute the code
            eval(compiled);
            
            // Notify parent of success
            window.parent.postMessage({ type: 'success' }, '*');
          } catch (err) {
            window.parent.postMessage({ type: 'error', message: err.message }, '*');
          }
        };

        // Listen for incoming code render events
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'render') {
            renderCode(event.data.code);
          }
        });

        // Signal ready to parent
        window.parent.postMessage({ type: 'ready' }, '*');
      </script>
    </body>
    </html>
  `;

  const handleReset = () => {
    setError(null);
    setIframeReady(false);
    if (onCompileError) onCompileError(null);
    if (iframeRef.current) {
      iframeRef.current.srcdoc = srcDoc;
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      const msg = event.data;

      if (msg.type === "ready") {
        setIframeReady(true);
        setError(null);
        if (onCompileError) onCompileError(null);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "render", code },
          "*"
        );
      } else if (msg.type === "error") {
        setError(msg.message);
        if (onCompileError) onCompileError(msg.message);
      } else if (msg.type === "success") {
        setError(null);
        if (onCompileError) onCompileError(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [code, onCompileError]);

  useEffect(() => {
    if (iframeReady && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        { type: "render", code },
        "*"
      );
    }
  }, [code, iframeReady]);

  return (
    <div className="w-full flex flex-col h-full rounded-xl border border-box-border bg-box-bg overflow-hidden shadow-sm dark:shadow-lg">
      {/* Sandbox Header */}
      <div className="flex items-center justify-between border-b border-box-border bg-box-line-numbers-bg px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground font-mono">Isolated Runtime Sandbox</span>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-foreground hover:bg-box-border py-1 px-2.5 rounded transition-all duration-150 border border-box-border cursor-pointer"
          title="Reload sandbox context to reset script runtime"
        >
          <RefreshCw className="w-3 h-3" />
          Reset Sandbox
        </button>
      </div>

      {/* Iframe Preview Container */}
      <div className="flex-1 relative bg-[#03080f] min-h-[300px]">
        {error && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-10 p-6 flex flex-col justify-center items-center text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2 animate-bounce" />
            <h4 className="text-sm font-bold text-red-400 mb-1">Execution Crash Detected</h4>
            <p className="text-xs text-slate-300 font-mono max-w-md bg-red-950/50 p-3 rounded border border-red-900/50 overflow-x-auto whitespace-pre-wrap select-text">
              {error}
            </p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="w-full h-full border-none min-h-[300px] bg-transparent"
          title="SOP UI Component Sandbox"
        />
      </div>
    </div>
  );
}
