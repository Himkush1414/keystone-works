package app.lamplight.engine

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Foreground media service (type mediaPlayback). Media3 promotes it to the foreground with a media
 * notification while narration plays, and lets it stop when playback is paused and the app is swiped away.
 */
@UnstableApi
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        EngineLog.i("LamplightService", "media session service started")
        val controller = PlaybackController.get(this)
        val player = LamplightPlayer(mainLooper, controller)
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        session = MediaSession.Builder(this, player)
            .setId("lamplight")
            .apply { launch?.let { setSessionActivity(it) } }
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        running = false
        EngineLog.i("LamplightService", "media session service stopped")
        super.onDestroy()
    }

    companion object {
        @Volatile var running = false
            private set
    }
}
