import { spawn, type ChildProcess } from "node:child_process";
import { connect, createServer as createTcpServer, type Socket } from "node:net";
import { loadEnv } from "../lib/env";
import { startMailDaemon, type DaemonHandle } from "../lib/mail/engine/daemon";

loadEnv();

// Single entry point for a production install: the Next.js server and the mail
// engine run together under one parent. If either dies the whole process exits
// non-zero so systemd/Docker restarts the unit as a whole instead of leaving a
// half-running site (web up, mail silently dead).
//
// `npm run serve` is the intended invocation. For development keep using
// `next dev`; the mail daemon can be started separately with `npm run mail`.

const PORT = Number(process.env.PORT || 3131);
const ALIAS_PORT = Number(process.env.WEB_ALIAS_PORT || 0);

// Some reverse proxies (Coolify/Traefik with a Compose stack) assume container
// port 80 when the domain has no explicit port, while others use the app port.
// WEB_ALIAS_PORT opens a second listener that forwards TCP to the real port so
// either assumption reaches the same Next.js process. It is opt-in because it
// needs permission to bind a privileged port.
function startAliasListener(): void {
    if (!ALIAS_PORT || ALIAS_PORT === PORT)
        return;
    const server = createTcpServer((incoming: Socket) => {
        const upstream = connect({ host: "127.0.0.1", port: PORT });
        incoming.pipe(upstream).pipe(incoming);
        const close = () => { incoming.destroy(); upstream.destroy(); };
        incoming.on("error", close);
        upstream.on("error", close);
    });
    // Connections that arrive before Next.js finishes binding are closed by
    // the proxy and retried, so no special backoff is needed here.
    server.on("error", (error) => console.error(`[serve] alias listener on :${ALIAS_PORT} failed: ${error.message}`));
    server.listen(ALIAS_PORT, "0.0.0.0", () => console.log(`[serve] also accepting on :${ALIAS_PORT} -> :${PORT}`));
}

function runNext(): ChildProcess {
    const child = spawn(
        process.execPath,
        ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
        { stdio: "inherit", env: process.env },
    );
    return child;
}

async function main(): Promise<void> {
    const web = runNext();
    startAliasListener();
    let mail: DaemonHandle | null = null;
    try {
        mail = await startMailDaemon();
        console.log(`[serve] web on :${PORT}, mail daemon running`);
    }
    catch (error) {
        // A failed mail daemon must not take the website down in a way that
        // hides the reason: log loudly, keep serving HTTP, and let the operator
        // see the failure in Studio → Mail. Port 25 being closed is the usual
        // cause and is reported by the preflight check.
        console.error("[serve] mail daemon failed to start:", (error as Error).message);
    }

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping)
            return;
        stopping = true;
        console.log(`[serve] ${signal} received, shutting down`);
        try { web.kill("SIGTERM"); } catch { /* ignore */ }
        try { await mail?.stop(); } catch { /* ignore */ }
        setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGINT", () => { void shutdown("SIGINT"); });
    process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

    web.on("exit", async (code) => {
        console.error(`[serve] web process exited (${code ?? "signal"}); stopping mail`);
        try { await mail?.stop(); } catch { /* ignore */ }
        process.exit(code ?? 1);
    });
}

main().catch((error) => {
    console.error("[serve] failed to start:", error);
    process.exit(1);
});
