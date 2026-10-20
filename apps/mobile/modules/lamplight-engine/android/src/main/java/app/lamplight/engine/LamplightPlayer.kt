package app.lamplight.engine

import android.net.Uri
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Adapts the narration engine to Media3 so the system gets a real media session: lock screen and notification
 * controls, Bluetooth and headset buttons, Android Auto-ready metadata. "Next/previous" move by sentence;
 * the seek bar maps to the whole document using estimated durations.
 */
@UnstableApi
class LamplightPlayer(looper: Looper, private val controller: PlaybackController) : SimpleBasePlayer(looper) {
    private val listener = object : PlaybackController.Listener {
        override fun onState(state: Map<String, Any?>) = invalidateState()
        override fun onSentence(index: Int, durationMs: Long) = invalidateState()
    }

    init {
        controller.addListener(listener)
    }

    override fun getState(): State {
        val spec = controller.queueSpec
        val commands = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_PREPARE,
                Player.COMMAND_STOP,
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                Player.COMMAND_SEEK_BACK,
                Player.COMMAND_SEEK_FORWARD,
                Player.COMMAND_SET_SPEED_AND_PITCH,
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_TIMELINE,
                Player.COMMAND_GET_METADATA,
            )
            .build()
        val builder = State.Builder()
            .setAvailableCommands(commands)
            .setPlayWhenReady(controller.playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackParameters(PlaybackParameters(controller.speed))
            .setSeekBackIncrementMs(SEEK_STEP_MS)
            .setSeekForwardIncrementMs(SEEK_STEP_MS)
        if (spec == null) {
            return builder.setPlaybackState(Player.STATE_IDLE).build()
        }
        val total = controller.mediaPositionMs().second
        val chapter = spec.chapterTitles.getOrNull(spec.chapterOf(controller.snapshot()["index"] as Int)).orEmpty()
        val metadata = MediaMetadata.Builder()
            .setTitle(spec.title)
            .setArtist(spec.author ?: chapter.ifBlank { null })
            .setAlbumTitle(chapter.ifBlank { null })
            .setDisplayTitle(spec.title)
            .setSubtitle(chapter.ifBlank { spec.author })
            .apply { spec.artworkUri?.let { setArtworkUri(Uri.parse(it)) } }
            .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK)
            .build()
        val item = MediaItemData.Builder(spec.docId)
            .setMediaItem(MediaItem.Builder().setMediaId(spec.docId).setMediaMetadata(metadata).build())
            .setMediaMetadata(metadata)
            .setDurationUs(total * 1000)
            .setIsSeekable(true)
            .build()
        return builder
            .setPlaybackState(if (controller.buffering) Player.STATE_BUFFERING else Player.STATE_READY)
            .setPlaylist(listOf(item))
            .setCurrentMediaItemIndex(0)
            .setContentPositionMs { controller.mediaPositionMs().let { (p, t) -> minOf(p, t) } }
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        if (playWhenReady) controller.play() else controller.pause()
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()

    override fun handleStop(): ListenableFuture<*> {
        controller.pause()
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> controller.skip(1)
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> controller.skip(-1)
            else -> controller.seekToMediaPosition(positionMs)
        }
        return Futures.immediateVoidFuture()
    }

    override fun handleSetPlaybackParameters(playbackParameters: PlaybackParameters): ListenableFuture<*> {
        controller.setPlaybackSpeed(playbackParameters.speed)
        return Futures.immediateVoidFuture()
    }

    override fun handleRelease(): ListenableFuture<*> {
        controller.removeListener(listener)
        return Futures.immediateVoidFuture()
    }

    companion object {
        private const val SEEK_STEP_MS = 15_000L
    }
}
