import { useEffect, useRef, useState } from "react";
import {
  agentStart,
  agentSend,
  agentResolveEdit,
  agentStop,
  agentStatus,
  listenAgentEvent,
  writeFile,
  type CommandError,
} from "./ipc";
import { useStore } from "./store";

export function ChatPane() {
  const store = useStore();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore agent lifecycle mirror and subscribe to the event stream on mount.
  useEffect(() => {
    void agentStatus()
      .then((s) => store.setAgentStatus(s))
      .catch(() => {});

    const unlistenP = listenAgentEvent((evt) => {
      switch (evt.event) {
        case "delta":
          store.appendChatDelta(evt.run_id, evt.text);
          break;
        case "message":
          store.finalizeChatMessage(evt.run_id, evt.role, evt.text);
          break;
        case "tool":
          store.addChatActivity(
            evt.run_id,
            `${evt.name}(${JSON.stringify(evt.input)})`,
          );
          break;
        case "result":
          // result marks end of turn; nothing to render beyond what's accumulated.
          break;
        case "error":
          store.addChatError(evt.run_id, evt.message);
          break;
        case "status":
          store.setAgentStatus({ state: evt.state, project_id: null });
          break;
        case "propose_edit":
          store.setPendingEdit({
            run_id: evt.run_id,
            edit_id: evt.edit_id,
            path: evt.path,
            new_content: evt.new_content,
          });
          store.addChatActivity(
            evt.run_id,
            `Proposed edit to ${evt.path.split("/").at(-1)}`,
          );
          break;
      }
    });

    return () => {
      void unlistenP.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- store methods are stable

  // Auto-scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.chatMessages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setInput("");

    try {
      // Start lazily on first send or when the agent is stopped.
      if (store.agentStatus.state !== "running") {
        const status = await agentStart().catch((e: CommandError) => {
          store.addChatError(-1, `Agent failed to start: ${e.message}`);
          throw e;
        });
        store.setAgentStatus(status);
      }

      await agentSend(text, store.editorContext()).catch((e: CommandError) => {
        store.addChatError(-1, `Send failed: ${e.message}`);
        throw e;
      });
    } catch {
      // Errors already pushed into chat.
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const handleStop = () => {
    void agentStop()
      .then((s) => store.setAgentStatus(s))
      .catch((e: CommandError) => {
        store.addChatError(-1, `Stop failed: ${e.message}`);
      });
  };

  const handleAcceptEdit = async () => {
    const edit = store.pendingEdit;
    if (!edit) return;
    try {
      const entry = await writeFile(edit.path, edit.new_content);
      store.reconcileBuffer(edit.path, entry.content_hash);
      await agentResolveEdit(edit.edit_id, "accepted");
    } catch (e) {
      store.addChatError(-1, `Accept failed: ${(e as CommandError).message}`);
    } finally {
      store.clearPendingEdit();
    }
  };

  const handleRejectEdit = async () => {
    const edit = store.pendingEdit;
    if (!edit) return;
    try {
      await agentResolveEdit(edit.edit_id, "rejected");
    } catch (e) {
      store.addChatError(-1, `Reject failed: ${(e as CommandError).message}`);
    } finally {
      store.clearPendingEdit();
    }
  };

  return (
    <div className="chat-pane">
      <div className="chat-pane__header">
        <span className="chat-pane__title">Claude</span>
        {store.agentStatus.state === "running" && (
          <button className="chat-pane__stop" onClick={handleStop}>
            Stop
          </button>
        )}
      </div>

      <div className="chat-pane__messages">
        {store.chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`chat-msg chat-msg--${msg.kind}${msg.streaming ? " chat-msg--streaming" : ""}`}
          >
            {msg.kind === "activity" ? (
              <span className="chat-msg__activity">{msg.text}</span>
            ) : (
              <span className="chat-msg__text">{msg.text}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {store.pendingEdit && (
        <div className="chat-pane__pending-edit">
          <span className="chat-pane__pending-edit-path">
            Edit proposed: {store.pendingEdit.path}
          </span>
          <div className="chat-pane__pending-edit-actions">
            <button onClick={() => void handleAcceptEdit()}>Accept</button>
            <button onClick={() => void handleRejectEdit()}>Reject</button>
          </div>
        </div>
      )}

      <div className="chat-pane__input-row">
        <textarea
          ref={textareaRef}
          className="chat-pane__textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Claude… (Enter to send, Shift+Enter for newline)"
          rows={3}
          disabled={sending}
        />
        <button
          className="chat-pane__send"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
