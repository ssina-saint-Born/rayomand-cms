package com.rayomand.mobile.shared

// Single source of truth for where the CMS source lives. The in-app installer
// builds commands from these values so the app always pulls the official repo.

object ProjectInfo {
    const val REPO_WEB = "https://github.com/ssina-saint-Born/rayomand-cms"
    const val REPO_HTTPS = "https://github.com/ssina-saint-Born/rayomand-cms.git"
    const val APP_VERSION = "1.2.0"

    private fun shellQuote(value: String): String = "'" + value.replace("'", "'\"'\"'") + "'"

    private fun normalizedPort(value: String): String =
        value.toIntOrNull()?.takeIf { it in 1..65535 }?.toString() ?: "3131"

    fun isValidPort(value: String): Boolean = value.toIntOrNull() in 1..65535

    private fun sshTarget(sshUser: String, host: String): String =
        "${sshUser.ifBlank { "root" }}@${host.ifBlank { "<your-server-ip>" }}"

    private fun cloneOrUpdate(dir: String): String = buildString {
        appendLine("if [ -d ${shellQuote("$dir/.git")} ]; then")
        appendLine("  sudo git -C ${shellQuote(dir)} pull --ff-only")
        appendLine("else")
        appendLine("  sudo git clone ${shellQuote(REPO_HTTPS)} ${shellQuote(dir)}")
        appendLine("fi")
        append("cd ${shellQuote(dir)}")
    }

    // Bare metal: clone/update, provision PostgreSQL from the official package
    // manager, write one DATABASE_URL, build, and install the systemd service.
    fun bareMetalCommand(installDir: String, webPort: String, sshUser: String, host: String): String {
        val dir = installDir.ifBlank { "/opt/rayomand" }
        val port = normalizedPort(webPort)
        return buildString {
            appendLine("# 1) Connect to your server")
            appendLine("ssh ${shellQuote(sshTarget(sshUser, host))}")
            appendLine()
            appendLine("# 2) Install the CMS; PostgreSQL is created automatically")
            appendLine(cloneOrUpdate(dir))
            appendLine("sudo bash scripts/provision-postgres.sh")
            append("sudo env WEB_PORT=${shellQuote(port)} bash ./install.sh --yes")
        }
    }

    // Docker: clone/update, generate the single DATABASE_URL and two secrets,
    // then build the bundled app + PostgreSQL stack. The web port comes from
    // .env, so no tracked Compose file is edited.
    fun dockerCommand(installDir: String, webPort: String, sshUser: String, host: String): String {
        val dir = installDir.ifBlank { "/opt/rayomand" }
        val port = normalizedPort(webPort)
        return buildString {
            appendLine("# 1) Connect to your server")
            appendLine("ssh ${shellQuote(sshTarget(sshUser, host))}")
            appendLine()
            appendLine("# 2) Clone and start Docker; PostgreSQL is initialized from DATABASE_URL")
            appendLine(cloneOrUpdate(dir))
            appendLine("sudo bash scripts/configure-docker.sh --web-port ${shellQuote(port)}")
            appendLine("sudo docker compose up -d --build")
            appendLine()
            append("Site: http://<server>:$port")
        }
    }
}
