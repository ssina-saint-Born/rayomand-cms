package com.rayomand.mobile.shared

// Single source of truth for where the CMS source lives. The in-app installer
// builds its one-line commands from these values so the app always pulls the
// CMS from the official repository.

object ProjectInfo {
    const val REPO_WEB = "https://github.com/ssina-saint-Born/rayomand-cms"
    const val REPO_HTTPS = "https://github.com/ssina-saint-Born/rayomand-cms.git"
    const val APP_VERSION = "1.1.0"

    // Bare-metal install: clone the repo, then run the bundled installer, which
    // checks the system, writes .env, builds, and installs a systemd service.
    fun bareMetalCommand(installDir: String, webPort: String, sshUser: String, host: String): String {
        val dir = installDir.ifBlank { "/opt/rayomand" }
        val ssh = "ssh ${sshUser.ifBlank { "root" }}@${host.ifBlank { "<your-server-ip>" }}"
        return buildString {
            appendLine("# 1) SSH into your server")
            appendLine(ssh)
            appendLine()
            appendLine("# 2) Install the CMS from the official repository")
            appendLine("sudo git clone $REPO_HTTPS $dir || git -C $dir pull")
            append("cd $dir && sudo ./install.sh")
            if (webPort.isNotBlank() && webPort != "3131") append("   # choose web port $webPort when asked")
        }
    }

    // Docker install: clone, seed .env with random secrets, then start the stack.
    fun dockerCommand(installDir: String, webPort: String, sshUser: String, host: String): String {
        val dir = installDir.ifBlank { "/opt/rayomand" }
        val ssh = "ssh ${sshUser.ifBlank { "root" }}@${host.ifBlank { "<your-server-ip>" }}"
        val port = webPort.ifBlank { "3131" }
        return buildString {
            appendLine("# 1) SSH into your server")
            appendLine(ssh)
            appendLine()
            appendLine("# 2) Clone and start with Docker (PostgreSQL included)")
            appendLine("sudo git clone $REPO_HTTPS $dir && cd $dir")
            appendLine("cp -n .env.example .env")
            appendLine("sed -i \"s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=\$(openssl rand -hex 32)|\" .env")
            appendLine("sed -i \"s|^SETUP_TOKEN=.*|SETUP_TOKEN=\$(openssl rand -hex 32)|\" .env")
            if (port != "3131") {
                // compose.yaml maps `3131:3131`; switch the host-side port only.
                appendLine("sed -i \"s|3131:3131|$port:3131|\" compose.yaml")
            }
            append("sudo docker compose up -d --build")
            appendLine()
            append("# Site: http://<server>:$port")
        }
    }
}
