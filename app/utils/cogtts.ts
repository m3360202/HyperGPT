import { useState, useEffect, useRef, useCallback } from "react";
import { showToast } from "../components/ui-lib";

interface CogTTSHook {
  isPlaying: boolean;
  playingMessageId: string | null;
  play: (text: string, messageId?: string) => Promise<void>;
  stop: () => void;
}

// PCM Audio Player using AudioWorklet or ScriptProcessor
// Since AudioWorklet requires a separate file, we'll use a simple approach for now
// by decoding base64 and scheduling buffer playback.
// Note: CogTTS returns raw PCM (int16?), need to check details.
// The example says "return_sample_rate": 24000.
// If it's raw PCM, we need to convert it to float32 for Web Audio API.

export function useCogTTS(): CogTTSHook {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop all scheduled sources
    activeSourceNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    });
    activeSourceNodesRef.current = [];

    setIsPlaying(false);
    setPlayingMessageId(null);

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const play = useCallback(
    async (text: string, messageId: string = "temp") => {
      // Stop previous playback if any
      stop();

      if (!text) return;

      setIsPlaying(true);
      setPlayingMessageId(messageId);
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Declare ctx at function scope so it's accessible in finally block
      let ctx: AudioContext | null = null;

      try {
        // Initialize AudioContext
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        nextStartTimeRef.current = ctx.currentTime;

        // Split long text into chunks to avoid 400 error (max ~1000 chars per request)
        const maxChunkSize = 1000;
        const chunks = splitTextIntoChunks(text, maxChunkSize);

        for (const chunk of chunks) {
          if (signal.aborted) break;

          const response = await fetch("/api/cogtts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: chunk }),
            signal,
          });

          if (!response.ok) {
            throw new Error(`TTS API Error: ${response.status}`);
          }

          if (!response.body) continue;

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done || signal.aborted) break;

            const streamChunk = decoder.decode(value, { stream: true });
            buffer += streamChunk;

            // Process lines
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const jsonStr = line.slice(6);
                  // Skip [DONE] or empty
                  if (jsonStr.trim() === "[DONE]") continue;

                  const data = JSON.parse(jsonStr);
                  if (
                    data.choices &&
                    data.choices[0] &&
                    data.choices[0].delta &&
                    data.choices[0].delta.content
                  ) {
                    const audioContent = data.choices[0].delta.content;
                    const sampleRate =
                      data.choices[0].delta.return_sample_rate || 24000;
                    scheduleAudioChunk(ctx, audioContent, sampleRate);
                  }
                } catch (e) {
                  console.warn("Failed to parse TTS data chunk", e);
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("TTS playback aborted");
        } else {
          console.error("TTS Error:", err);
          showToast("语音播放失败");
        }
        // Ensure stop is called to clean up
        stop();
      } finally {
        // Check if we were aborted, if so, stop has already been called or will be called in catch
        if (abortControllerRef.current?.signal.aborted) {
          // Already handled
        } else {
          // Stream reading finished successfully.
          // We need to wait for the audio to finish playing.
          // Check if context is still valid
          if (audioContextRef.current) {
            const remainingTime =
              nextStartTimeRef.current - audioContextRef.current.currentTime;
            if (remainingTime > 0) {
              setTimeout(() => {
                // Only reset if we haven't started playing something else
                if (playingMessageId === messageId) {
                  // This check is tricky inside timeout due to closure capture, but logic ref logic helps?
                  // Actually, if we start playing something else, 'stop' would be called, which clears audioContextRef.
                  // So checking audioContextRef.current again inside timeout is safer, or rely on cleanup.
                  // But simple setIsPlaying(false) is fine, as new play would have reset it to true.
                  // However, better to use a ref to track current play ID?
                  // For simplicity, we just reset. If new play started, it would have called stop() which clears everything and starts new.
                  // But we need to be careful not to stop the NEW playback.

                  // If the component unmounted or stop() was called, playingMessageId would be null.
                  // But here we are in a closure.
                  // Let's just set isPlaying to false. If a new track started, `stop` was called before `play`,
                  // so this timeout from the OLD execution might fire.
                  // We should use a ref to track the "current active playback ID" to cancel this timeout action?
                  // Or simply: `stop` cancels all timeouts? We didn't store the timeout ID.

                  // Safest: Just setIsPlaying(false). If new one started, it's a different state cycle?
                  // No, react state updates.
                  // If user clicked play(B) while A is finishing:
                  // 1. play(B) calls stop() -> isPlaying=false
                  // 2. play(B) sets isPlaying=true
                  // 3. A's timeout fires -> sets isPlaying=false (WRONG!)

                  // Fix: Use a ref to track active ID for timeout validity
                  // or just don't worry about accurate "end state" for now?
                  // Let's simply check if audioContext matches?
                  // If play(B) happened, audioContextRef.current would be a NEW context.
                  // So checking if (audioContextRef.current === ctx) is enough!

                  // Wait, we need to access the closure's ctx.
                  if (audioContextRef.current === ctx) {
                    setIsPlaying(false);
                    setPlayingMessageId(null);
                  }
                }
              }, remainingTime * 1000);
            } else {
              if (audioContextRef.current === ctx) {
                setIsPlaying(false);
                setPlayingMessageId(null);
              }
            }
          } else {
            // Context is null, meaning we stopped.
            setIsPlaying(false);
            setPlayingMessageId(null);
          }
        }
      }
    },
    [stop],
  );

  // Helper to schedule audio
  const scheduleAudioChunk = (
    ctx: AudioContext,
    base64Audio: string,
    sampleRate: number,
  ) => {
    try {
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      // 16-bit PCM (2 bytes per sample)
      const int16Array = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        // Little endian
        const byte1 = binaryString.charCodeAt(i);
        const byte2 = binaryString.charCodeAt(i + 1);
        // int16 = byte1 | (byte2 << 8)
        // Handling signed integer manually if needed, but DataView is safer
        // Actually TypedArray from buffer is easiest if we had buffer.
        // Manual construction:
        let s = byte1 | (byte2 << 8);
        if (s >= 0x8000) s -= 0x10000;
        int16Array[i / 2] = s;
      }

      // Convert to Float32 for Web Audio API
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Schedule
      // Ensure we don't schedule in the past
      const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      activeSourceNodesRef.current.push(source);

      // Cleanup finished nodes from tracking array to avoid leak?
      // Not strictly necessary for short clips but good practice.
      source.onended = () => {
        const idx = activeSourceNodesRef.current.indexOf(source);
        if (idx > -1) activeSourceNodesRef.current.splice(idx, 1);
      };
    } catch (e) {
      console.error("Error decoding audio chunk", e);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    playingMessageId,
    play,
    stop,
  };
}

// Helper function to split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentence endings to keep natural pauses
  const sentences = text.split(/([.!?。？！\n]+)/);

  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if (currentChunk.length + part.length <= maxSize) {
      currentChunk += part;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = part;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}
