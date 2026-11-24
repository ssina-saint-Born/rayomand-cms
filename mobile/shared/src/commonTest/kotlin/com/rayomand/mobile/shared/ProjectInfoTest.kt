package com.rayomand.mobile.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProjectInfoTest {
    private val host = "203.0.113.10"

    @Test
    fun repoUrlIsTheOfficialRepository() {
        assertEquals("https://github.com/ssina-saint-Born/rayomand-cms", ProjectInfo.REPO_WEB)
        assertEquals("https://github.com/ssina-saint-Born/rayomand-cms.git", ProjectInfo.REPO_HTTPS)
    }

    @Test
    fun dockerCommandUsesOneUrlAndNeverSplitsDatabaseCredentials() {
        val cmd = ProjectInfo.dockerCommand("/opt/rayomand", "3131", "root", host)
        assertTrue(cmd.contains("ssh 'root@$host'"), cmd)
        assertTrue(cmd.contains("git clone"), cmd)
        assertTrue(cmd.contains("configure-docker.sh --web-port '3131'"), cmd)
        assertTrue(cmd.contains("docker compose up -d --build"), cmd)
        assertFalse(cmd.contains("POSTGRES_PASSWORD"), cmd)
        assertFalse(cmd.contains("sed -i"), cmd)
    }

    @Test
    fun bareMetalCommandProvisionPostgresAndRunsInstaller() {
        val cmd = ProjectInfo.bareMetalCommand("/opt/rayomand", "3131", "root", host)
        assertTrue(cmd.contains("provision-postgres.sh"), cmd)
        assertTrue(cmd.contains("WEB_PORT='3131'"), cmd)
        assertTrue(cmd.contains("install.sh --yes"), cmd)
        assertFalse(cmd.contains("POSTGRES_PASSWORD"), cmd)
    }

    @Test
    fun repeatedRunsPullInsteadOfCloningIntoAnExistingDirectory() {
        val cmd = ProjectInfo.dockerCommand("/opt/rayomand", "", "", "")
        assertTrue(cmd.contains(".git'"), cmd)
        assertTrue(cmd.contains("pull --ff-only"), cmd)
        assertTrue(cmd.contains("'root@<your-server-ip>'"), cmd)
        assertTrue(cmd.contains("/opt/rayomand"), cmd)
        assertTrue(cmd.contains("3131"), cmd)
    }

    @Test
    fun invalidPortFallsBackAndIsRejectedByValidation() {
        val cmd = ProjectInfo.dockerCommand("/opt/rayomand", "99999", "deploy", host)
        assertTrue(cmd.contains("--web-port '3131'"), cmd)
        assertFalse(ProjectInfo.isValidPort("0"), "zero must be rejected")
        assertFalse(ProjectInfo.isValidPort("65536"), "65536 must be rejected")
        assertFalse(ProjectInfo.isValidPort("abc"), "text must be rejected")
        assertTrue(ProjectInfo.isValidPort("8080"), "8080 must be accepted")
    }

    @Test
    fun userControlledValuesAreShellQuoted() {
        val hostileDir = "/opt/rayomand'; touch /tmp/pwned; echo '"
        val cmd = ProjectInfo.dockerCommand(hostileDir, "8080", "deploy", "203.0.113.10'; touch /tmp/pwned; echo '")
        assertTrue(cmd.contains("'/opt/rayomand'\"'\"'; touch /tmp/pwned; echo '\"'\"'"), cmd)
        assertTrue(cmd.contains("--web-port '8080'"), cmd)
        assertFalse(cmd.contains("sed -i"), cmd)
    }
}
