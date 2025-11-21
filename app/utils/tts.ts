import { useEffect, useRef } from "react";

export function useStreamTTS(
  text: string,
  streaming: boolean,
  enabled: boolean,
) {
  const spokenLengthRef = useRef(0);
  const lastTextRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // If disabled, stop speaking and reset
    if (!enabled) {
      window.speechSynthesis.cancel();
      spokenLengthRef.current = 0;
      lastTextRef.current = "";
      return;
    }

    // If text is shorter than before, it means a new message started or clear occurred
    if (text.length < lastTextRef.current.length) {
      window.speechSynthesis.cancel();
      spokenLengthRef.current = 0;
    }

    const startIndex = spokenLengthRef.current;
    const fullUnspoken = text.slice(startIndex);

    if (fullUnspoken.length === 0) {
      lastTextRef.current = text;
      return;
    }

    if (streaming) {
      let tempUnspoken = fullUnspoken;
      let processedLength = 0;

      while (true) {
        // Match sentence delimiters
        const match = tempUnspoken.match(/([:;.?!。？！\n]+)/);
        if (match && match.index !== undefined) {
          const delimiterIndex = match.index + match[0].length;
          const chunk = tempUnspoken.slice(0, delimiterIndex);

          const u = new SpeechSynthesisUtterance(chunk);
          // Optional: Detect language or set voice here
          window.speechSynthesis.speak(u);

          processedLength += delimiterIndex;
          tempUnspoken = tempUnspoken.slice(delimiterIndex);
        } else {
          break;
        }
      }
      spokenLengthRef.current += processedLength;
    } else {
      // Not streaming (finished), speak the rest
      const u = new SpeechSynthesisUtterance(fullUnspoken);
      window.speechSynthesis.speak(u);
      spokenLengthRef.current = text.length;
    }

    lastTextRef.current = text;
  }, [text, streaming, enabled]);
}
