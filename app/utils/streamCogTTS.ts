import { useEffect, useRef } from "react";

// Streaming TTS for agent responses - plays audio as text arrives
export function useStreamCogTTS(
  text: string,
  streaming: boolean,
  enabled: boolean,
  messageId?: string,
) {
  const spokenLengthRef = useRef(0);
  const lastTextRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageIdRef = useRef<string | undefined>(undefined);
  const pendingChunksRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);
  const pendingBinaryRef = useRef("");
  const pendingSampleRateRef = useRef(24000);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    // If text is shorter than before, or messageId changed, it means a new message started
    if (
      text.length < lastTextRef.current.length ||
      messageId !== currentMessageIdRef.current
    ) {
      cleanup();
      spokenLengthRef.current = 0;
      currentMessageIdRef.current = messageId;
      pendingChunksRef.current = [];
    }

    const unspoken = text.slice(spokenLengthRef.current);
    if (unspoken.length === 0) {
      lastTextRef.current = text;
      return;
    }

    // Chunk text by sentence boundaries for streaming
    // Look for complete sentences (ending with punctuation)
    const sentenceMatch = unspoken.match(/^\s*[^.!?。？！\n]+[.!?。？！\n]+/);

    // fallback chunk when no punctuation for a while
    const MIN_STREAMING_CHARS = 140;
    let chunkToSpeak: string | null = null;

    if (sentenceMatch) {
      chunkToSpeak = sentenceMatch[0];
    } else if (!streaming) {
      chunkToSpeak = unspoken;
    } else {
      const trimmed = unspoken.trimStart();
      const trimmedOffset = unspoken.length - trimmed.length;
      if (trimmed.length >= MIN_STREAMING_CHARS) {
        const rawSlice = trimmed.slice(0, MIN_STREAMING_CHARS);
        let breakIndex = rawSlice.lastIndexOf(" ");
        if (breakIndex < MIN_STREAMING_CHARS * 0.5) {
          breakIndex = MIN_STREAMING_CHARS;
        }
        chunkToSpeak = unspoken.slice(0, trimmedOffset + breakIndex);
      }
    }

    if (chunkToSpeak) {
      if (chunkToSpeak.trim().length > 0) {
        // Add to queue instead of speaking directly
        pendingChunksRef.current.push(chunkToSpeak);
        spokenLengthRef.current += chunkToSpeak.length;

        // Process queue if not already processing
        if (!isProcessingQueueRef.current) {
          processQueue();
        }
      }
    }

    lastTextRef.current = text;
  }, [text, streaming, enabled, messageId]);

  const processQueue = async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (pendingChunksRef.current.length > 0) {
        const chunk = pendingChunksRef.current.shift();
        if (!chunk || !enabled) break;

        await speakChunk(chunk);
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  const speakChunk = async (chunk: string) => {
    try {
      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        nextStartTimeRef.current = audioContextRef.current.currentTime;
      }

      const ctx = audioContextRef.current;

      // Split long text into smaller chunks (max ~500 chars to avoid 400 error)
      const maxChunkSize = 500;
      const chunks = splitTextIntoChunks(chunk, maxChunkSize);

      for (const textChunk of chunks) {
        if (!enabled || !audioContextRef.current) break;

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const response = await fetch("/api/cogtts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textChunk }),
          signal,
        });

        if (!response.ok || !response.body) continue;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || signal.aborted) break;

          const streamChunk = decoder.decode(value, { stream: true });
          buffer += streamChunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                if (jsonStr.trim() === "[DONE]") continue;

                const data = JSON.parse(jsonStr);
                if (data.choices?.[0]?.delta?.content) {
                  const audioContent = data.choices[0].delta.content;
                  const sampleRate =
                    data.choices[0].delta.return_sample_rate || 24000;
                  const binaryAudio = window.atob(audioContent);

                  pendingBinaryRef.current += binaryAudio;
                  pendingSampleRateRef.current = sampleRate;

                  const thresholdBytes = Math.floor(sampleRate * 0.12 * 2); // ~120ms
                  if (pendingBinaryRef.current.length >= thresholdBytes) {
                    scheduleBinaryChunk(
                      ctx,
                      pendingBinaryRef.current,
                      sampleRate,
                    );
                    pendingBinaryRef.current = "";
                  }
                }
              } catch (e) {
                console.warn("Failed to parse TTS chunk", e);
              }
            }
          }
        }
      }

      // flush any remaining audio for this chunk
      if (pendingBinaryRef.current.length > 0 && audioContextRef.current) {
        scheduleBinaryChunk(
          audioContextRef.current,
          pendingBinaryRef.current,
          pendingSampleRateRef.current,
        );
        pendingBinaryRef.current = "";
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream TTS Error:", err);
      }
    }
  };

  const scheduleBinaryChunk = (
    ctx: AudioContext,
    binaryAudio: string,
    sampleRate: number,
  ) => {
    try {
      const len = binaryAudio.length;
      const int16Array = new Int16Array(len / 2);

      for (let i = 0; i < len; i += 2) {
        const byte1 = binaryAudio.charCodeAt(i);
        const byte2 = binaryAudio.charCodeAt(i + 1);
        let s = byte1 | (byte2 << 8);
        if (s >= 0x8000) s -= 0x10000;
        int16Array[i / 2] = s;
      }

      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      applyFade(float32Array, sampleRate);

      const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      activeSourceNodesRef.current.push(source);

      source.onended = () => {
        const idx = activeSourceNodesRef.current.indexOf(source);
        if (idx > -1) activeSourceNodesRef.current.splice(idx, 1);
      };
    } catch (e) {
      console.error("Error decoding audio chunk", e);
    }
  };

  const cleanup = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    activeSourceNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    activeSourceNodesRef.current = [];

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    nextStartTimeRef.current = 0;
    isProcessingQueueRef.current = false;
    pendingChunksRef.current = [];
    pendingBinaryRef.current = "";
  };

  // Cleanup on unmount or when disabled
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);
}

function applyFade(buffer: Float32Array, sampleRate: number) {
  const fadeSamples = Math.min(
    Math.floor(sampleRate * 0.005),
    Math.floor(buffer.length / 2),
  );
  if (fadeSamples <= 0) return;

  for (let i = 0; i < fadeSamples; i++) {
    const fadeInGain = i / fadeSamples;
    buffer[i] *= fadeInGain;

    const fadeOutGain = (fadeSamples - i) / fadeSamples;
    const idx = buffer.length - 1 - i;
    buffer[idx] *= fadeOutGain;
  }
}

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentence endings
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
