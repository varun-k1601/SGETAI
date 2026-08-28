import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { apiFormRequest } from "../services/api";

function AgentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5 13.7 7l4.8 1.7-4.8 1.7L12 15l-1.7-4.6-4.8-1.7L10.3 7 12 2.5Z" />
      <path d="M18.5 13.5 19.4 16l2.6.9-2.6.9-.9 2.7-.9-2.7-2.6-.9 2.6-.9.9-2.5Z" />
      <path d="M5.2 13.2 6 15.4l2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  );
}

// A user message that never reached the agent MUST NOT look identical to one that did. Before
// this, a failed send left the bubble sitting in the transcript looking perfectly delivered, so
// the only signal that anything was wrong was a single error line under the composer - which is
// how two unanswered "hello" bubbles ended up looking like the agent had simply ignored them.
function MessageBubble({ item, onRetry, isRetrying }) {
  const isUser = item.role === "user";
  const hasFailed = item.status === "failed";
  const className = [
    "career-widget-message",
    isUser ? "user" : "assistant",
    hasFailed ? "failed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      <strong>{isUser ? "You" : "Career Agent"}</strong>
      <p>{item.content}</p>
      {hasFailed ? (
        <p className="career-widget-message__status">
          <span>Not sent &mdash; {item.failureMessage || "the agent did not receive this."}</span>
          <button type="button" onClick={() => onRetry(item.id)} disabled={isRetrying}>
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : null}
    </article>
  );
}

function TypingDots() {
  return (
    <div className="career-widget-typing" aria-label="Career Agent is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V5Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 19V5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      <path d="M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.2 4.2L19 6.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    </svg>
  );
}

function VoiceWaveform() {
  return (
    <div className="career-agent-voice-waveform" aria-hidden="true">
      {Array.from({ length: 42 }).map((_, index) => (
        <span key={index} style={{ "--wave-index": index }} />
      ))}
    </div>
  );
}

// The agent's own empty-state copy, hoisted to constants so the panel has one place that says
// what it can do.
export const CAREER_AGENT_GREETING = "Ask anything career-related.";
export const CAREER_AGENT_GREETING_DETAIL =
  "Attach a resume, screenshot, JD, or project file and I'll use it in the answer.";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Short, bubble-sized versions of the transport failures api.js classifies. The full sentence
// still appears once under the composer; this is the bit that sits next to the dead message so it
// is obvious WHICH message did not go through.
const FAILURE_HINTS = {
  unreachable: "the server could not be reached.",
  timeout: "the assistant took too long to answer.",
  aborted: "the request was cancelled.",
  http: "the server rejected it.",
};

export function CareerAgentWidget() {
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentFiles, setAgentFiles] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState("");
  // Keyed by message id so a failed turn can be resent with the exact files and history it
  // originally carried.
  const pendingPayloadsRef = useRef(new Map());
  const messageIdRef = useRef(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [panelSize, setPanelSize] = useState({ width: 380, height: 520 });
  const resizeStartRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const accumulatedTranscriptRef = useRef("");
  const voiceErrorTimeoutRef = useRef(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, [agentMessage]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    setSpeechSupported(true);

    function clearVoiceErrorLater(message) {
      setVoiceError(message);
      if (voiceErrorTimeoutRef.current) {
        clearTimeout(voiceErrorTimeoutRef.current);
      }
      voiceErrorTimeoutRef.current = window.setTimeout(() => {
        setVoiceError("");
        voiceErrorTimeoutRef.current = null;
      }, 3000);
    }

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      const best = (finalText || interimText).trim();
      accumulatedTranscriptRef.current = best;
      setInterimTranscript(best);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setInterimTranscript("");

      if (event.error === "not-allowed") {
        clearVoiceErrorLater("Microphone access denied.");
      } else if (event.error === "no-speech") {
        clearVoiceErrorLater("No speech detected. Try again.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    return () => {
      try {
        recognition.abort();
      } catch (speechError) {
        // Already stopped - safe to ignore.
      }
      recognitionRef.current = null;
      if (voiceErrorTimeoutRef.current) {
        clearTimeout(voiceErrorTimeoutRef.current);
        voiceErrorTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handlePointerMove(event) {
      const resizeStart = resizeStartRef.current;

      if (!resizeStart) {
        return;
      }

      const maxWidth = Math.min(720, window.innerWidth - 48);
      const nextWidth = resizeStart.width + resizeStart.x - event.clientX;

      setPanelSize({
        width: clamp(nextWidth, 340, maxWidth),
        height: resizeStart.height,
      });
    }

    function handlePointerUp() {
      resizeStartRef.current = null;
      document.body.classList.remove("career-agent-resizing");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("career-agent-resizing");
    };
  }, []);

  const chatMutation = useMutation({
    mutationFn: ({ message, files, history }) => {
      const formData = new FormData();
      formData.append("message", message);
      formData.append("history", JSON.stringify(history));
      files.forEach((file) => formData.append("files", file));

      return apiFormRequest("/pro/agent/chat", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response, variables) => {
      const result = response.result || {};
      // The turn landed, so clear any failed marking left over from an earlier attempt at the
      // SAME message before appending the reply.
      setChatHistory((current) => [
        ...current.map((item) =>
          item.id === variables.messageId
            ? { ...item, status: "sent", failureMessage: "" }
            : item
        ),
        {
          role: "assistant",
          id: `assistant-${variables.messageId}`,
          content: result.reply || "No reply received.",
        },
      ]);
      // The retry payload holds File objects; nothing needs them once the turn has landed.
      pendingPayloadsRef.current.delete(variables.messageId);
      setError("");
    },
    onError: (requestError, variables) => {
      // The underlying error is kept intact in the console for debugging; the user sees the
      // translated sentence that api.js produced.
      console.error("[CareerAgent] chat request failed:", requestError.kind || "http", requestError);

      setChatHistory((current) =>
        current.map((item) =>
          item.id === variables.messageId
            ? { ...item, status: "failed", failureMessage: FAILURE_HINTS[requestError.kind] || "" }
            : item
        )
      );
      setError(requestError.message);
    },
  });

  // Retrying needs the exact payload that was sent, including the File objects and the history as
  // it stood at the time - re-deriving it from the transcript would resend the wrong turn order.
  function sendTurn({ messageId, message, files, history }) {
    pendingPayloadsRef.current.set(messageId, { messageId, message, files, history });
    chatMutation.mutate({ messageId, message, files, history });
  }

  function handleRetry(messageId) {
    const payload = pendingPayloadsRef.current.get(messageId);

    if (!payload || chatMutation.isPending) {
      return;
    }

    setChatHistory((current) =>
      current.map((item) =>
        item.id === messageId ? { ...item, status: "sending", failureMessage: "" } : item
      )
    );
    setError("");
    chatMutation.mutate(payload);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const message = agentMessage.trim() || (agentFiles.length ? "Please review the attached file(s)." : "");

    if (!message || chatMutation.isPending || isListening) {
      return;
    }

    // Capture history BEFORE the optimistic update below so the request sends prior turns only,
    // not the message we're about to add. Messages that never reached the agent are stripped:
    // they sit in the transcript so the user can retry them, but replaying them as prior context
    // would tell the model it had already seen and answered a turn it never received.
    const historyBeforeThisTurn = chatHistory.filter((item) => item.status !== "failed");
    const attachmentNote = agentFiles.length
      ? `Attachments: ${agentFiles.map((file) => file.name).join(", ")}`
      : "";

    // Show the user's message immediately instead of waiting for the AI reply to come back —
    // otherwise the input just sits there with no feedback while Ollama/Gemini responds. The id
    // is what lets onError find this exact bubble again and mark it as never delivered.
    messageIdRef.current += 1;
    const messageId = `user-${messageIdRef.current}`;

    setChatHistory((current) => [
      ...current,
      {
        role: "user",
        id: messageId,
        status: "sending",
        content: [message, attachmentNote].filter(Boolean).join("\n"),
      },
    ]);
    setError("");
    setAgentMessage("");
    setAgentFiles([]);
    sendTurn({ messageId, message, files: agentFiles, history: historyBeforeThisTurn });
  }

  function removeFile(file) {
    setAgentFiles((current) =>
      current.filter((item) => item.name !== file.name || item.size !== file.size)
    );
  }

  function handleResizeStart(event) {
    if (window.innerWidth < 480) {
      return;
    }

    event.preventDefault();
    resizeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: panelSize.width,
      height: panelSize.height,
    };
    document.body.classList.add("career-agent-resizing");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleMicClick() {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    if (isListening) {
      try {
        recognition.stop();
      } catch (speechError) {
        // Already stopped - safe to ignore.
      }
      return;
    }

    setVoiceError("");
    accumulatedTranscriptRef.current = "";
    setInterimTranscript("");

    try {
      recognition.start();
    } catch (speechError) {
      setIsListening(false);
    }
  }

  function handleVoiceCancel() {
    accumulatedTranscriptRef.current = "";
    setInterimTranscript("");
    setIsListening(false);
    setPanelSize((current) => ({ ...current }));

    try {
      recognitionRef.current?.abort();
    } catch (speechError) {
      // Already stopped - safe to ignore.
    }
  }

  function handleVoiceConfirm() {
    const transcript = accumulatedTranscriptRef.current.trim();

    if (transcript) {
      setAgentMessage((current) =>
        current.trim() ? `${current.trim()} ${transcript}` : transcript
      );
    }

    accumulatedTranscriptRef.current = "";
    setInterimTranscript("");
    setIsListening(false);
    setPanelSize((current) => ({ ...current }));

    try {
      recognitionRef.current?.stop();
    } catch (speechError) {
      // Already stopped - safe to ignore.
    }
  }

  const isRecordingMode = isListening || Boolean(accumulatedTranscriptRef.current);

  return (
    <>
      <button
        type="button"
        className="career-agent-fab"
        aria-label={isOpen ? "Close Career Agent" : "Open Career Agent"}
        onClick={() => setIsOpen((current) => !current)}
      >
        <AgentIcon />
      </button>

      {isOpen ? (
        <section
          className="career-agent-panel"
          aria-label="Career Agent chat panel"
          style={{
            "--career-agent-panel-width": `${panelSize.width}px`,
            "--career-agent-panel-height": `${panelSize.height}px`,
          }}
        >
          <button
            type="button"
            className="career-agent-resize-rail"
            aria-label="Drag left edge to resize Career Agent"
            tabIndex={-1}
            onPointerDown={handleResizeStart}
          />
          <header className="career-agent-panel__header">
            <div>
              <h3>Career Agent</h3>
              <p>Pro AI Assistant</p>
            </div>
            <button
              type="button"
              aria-label="Close Career Agent"
              onClick={() => setIsOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>

          <div className="career-agent-panel__messages">
            {chatHistory.length ? (
              chatHistory.map((item, index) => (
                <MessageBubble
                  key={item.id || `${item.role}-${index}`}
                  item={item}
                  onRetry={handleRetry}
                  isRetrying={chatMutation.isPending && chatMutation.variables?.messageId === item.id}
                />
              ))
            ) : (
              <article className="career-widget-empty">
                <strong>{CAREER_AGENT_GREETING}</strong>
                <p>{CAREER_AGENT_GREETING_DETAIL}</p>
              </article>
            )}
            {chatMutation.isPending ? <TypingDots /> : null}
          </div>

          <form className="career-agent-panel__form" onSubmit={handleSubmit}>
            {error ? <p className="career-widget-error">{error}</p> : null}

            {agentFiles.length ? (
              <div className="career-widget-files">
                {agentFiles.map((file) => (
                  <button
                    key={`${file.name}-${file.size}`}
                    type="button"
                    title={`Remove ${file.name}`}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(file)}
                  >
                    <span className="career-widget-files__name">{file.name}</span>
                    <span className="career-widget-files__remove" aria-hidden="true">&times;</span>
                  </button>
                ))}
              </div>
            ) : null}

            {((isRecordingMode && interimTranscript) || voiceError) ? (
              <div
                className={[
                  "career-agent-interim",
                  (isRecordingMode && interimTranscript) || voiceError ? "visible" : ""
                ].filter(Boolean).join(" ")}
                style={voiceError ? { color: "var(--color-text-danger, #b91c1c)" } : undefined}
              >
                {voiceError || interimTranscript}
              </div>
            ) : null}

            <div className={isRecordingMode ? "career-agent-composer recording" : "career-agent-composer"}>
              <label
                className="career-agent-composer__attach"
                aria-disabled={isListening}
                aria-label="Attach files"
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,image/*,video/*"
                  disabled={isListening}
                  onChange={(event) => {
                    const selectedFiles = Array.from(event.target.files || []).slice(0, 5);
                    setAgentFiles(selectedFiles);
                    event.target.value = "";
                  }}
                />
                +
              </label>

              {isRecordingMode ? (
                <>
                  <VoiceWaveform />
                  <button
                    type="button"
                    className="career-agent-recording-btn cancel"
                    aria-label="Cancel recording"
                    onClick={handleVoiceCancel}
                  >
                    <CloseIcon />
                  </button>
                  <button
                    type="button"
                    className="career-agent-recording-btn confirm"
                    aria-label="Finish recording"
                    onClick={handleVoiceConfirm}
                  >
                    <CheckIcon />
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={agentMessage}
                    onChange={(event) => setAgentMessage(event.target.value)}
                    placeholder="Ask the agent..."
                  />

                  {speechSupported ? (
                    <button
                      type="button"
                      className="career-agent-mic-btn"
                      aria-label="Start voice input"
                      onClick={handleMicClick}
                    >
                      <MicIcon />
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    className="career-agent-send-btn"
                    aria-label="Send message"
                    disabled={chatMutation.isPending}
                  >
                    {chatMutation.isPending ? "..." : <SendIcon />}
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
