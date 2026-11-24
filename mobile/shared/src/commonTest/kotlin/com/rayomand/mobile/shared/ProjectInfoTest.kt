package com.rayomand.mobile.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProjectInfoTest {
    private val host = "203.0.113.10"

    @Test
    fun repoUrlIsTheOfficialRepository() {
        assertEquals("https://github.com/ssina-saint-Born/rayomand-cms", ProjectInfo.REPO_WEB)
        assertEquals("https://github.com/ssina-saint-Born/rayomand-cms.git", ProjectInfo.REPO_HTTPS)
    }

    @Test
    fun dockerCommandClonesOfficialRepo() {
        val cmd = ProjectInfo.dockerCommand("/opt/rayomand", "3131", "root", host)
        assertTrue(cmd.contains("ssh root@$host"), cmd)
        assertTrue(cmd.contains("git clone ${ProjectInfo.REPO_HTTPS} /opt/rayomand"), cmd)
        assertTrue(cmd.contains("docker compose up -d --build"), cmd)
        assertTrue(cmd.contains("POSTGRES_PASSWORD="), cmd)
        assertTrue(cmd.contains("SETUP_TOKEN="), cmd)
    }

    @Test
    fun bareMetalCommandRunsInstaller() {
        val cmd = ProjectInfo.bareMetalCommand("/opt/rayomand", "3131", "root", host)
        assertTrue(cmd.contains("git clone ${ProjectInfo.REPO_HTTPS} /opt/rayomand"), cmd)
        assertTrue(cmd.contains("sudo ./install.sh"), cmd)
    }

    @Test
    fun blankHostFallsBackToPlaceholder() {
        val cmd = ProjectInfo.dockerCommand("", "", "", "")
        assertTrue(cmd.contains("<your-server-ip>"), cmd)
        assertTrue(cmd.contains("/opt/rayomand"), cmd)
        assertTrue(cmd.contains("3131"), cmd)
    }

    @Test
    fun customPortIsAppliedToComposeMapping() {
        val cmd = ProjectInfo.dockerCommand("/opt/rayomand", "8080", "deploy", host)
        assertTrue(cmd.contains("ssh deploy@$host"), cmd)
        assertTrue(cmd.contains("3131:3131|8080:3131"), cmd)
        assertTrue(cmd.contains("http://<server>:8080"), cmd)
    }
}
